import os
import stat
import subprocess
import sys

# Importing lizard puts the directory of sys.argv[0] at the front of sys.path.
# Under ``python -m uvicorn`` that is uvicorn's package directory, and spawned
# scan workers inherit sys.path, so its logging.py shadows the stdlib in every
# worker. lizard has finished its own imports by then, so drop what it added.
_sys_path_before_lizard = list(sys.path)
import lizard  # noqa: E402
from lizard_languages import get_reader_for  # noqa: E402

sys.path[:] = [p for p in sys.path if p in _sys_path_before_lizard]
del _sys_path_before_lizard
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.models import OPTIONAL_METRIC_FIELDS, Metrics, Node, Witness
from app.services.analysis_types import (
    OVERLAY_METRICS,
    COMPONENT_METRICS,
    LANGUAGE_LABELS,
    MEASURED_FILE_METRICS,
    MEASURED_SCOPE_METRICS,
    MEAN_OVER_FUNCTIONS,
    iter_executable_scopes,
    scope_kind,
)
from app.config import (
    BINARY_EXTENSIONS,
    BINARY_SNIFF_BYTES,
    IGNORE_DIRS,
    IGNORE_EXTENSIONS,
    IGNORE_FILES,
    MAX_ANALYZED_FILE_BYTES,
    MINIFIED_CHECK_EXTENSIONS,
    MINIFIED_MIN_AVG_LINE_LENGTH,
    MINIFIED_SNIFF_BYTES,
)
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer
from app.services.markdown.markdown_analysis import MarkdownTreeSitterAnalyzer
from app.services.ipynb.ipynb_analysis import NotebookAnalyzer
from app.services.css.css_analysis import CssTreeSitterAnalyzer
from app.services.scan_progress import NULL_OBSERVER, ScanObserver
from app.services.scan_workers import CancelToken, FileFailure, run_file_analyses, track_scan
from pathspec import PathSpec

# Report discovery progress every N directories walked.
DISCOVERY_REPORT_EVERY_DIRS = 50

# Maximum time allowed for analyzing a single file in a worker process.
PER_FILE_ANALYSIS_TIMEOUT_SECONDS: float = 10.0

# Max parallel workers for per-file analysis. Each file is analyzed in its own
# subprocess so we can enforce a *hard* timeout and terminate hung analysis.
def _default_max_workers() -> int:
    """
    Pick a reasonable default worker count close to available CPU cores.

    We keep 1 core of headroom so the main process / OS remains responsive.
    """
    cpu = os.cpu_count() or 4
    return max(1, cpu - 1)


MAX_ANALYSIS_WORKERS: int = _default_max_workers()

_ts_analyzer = None
_md_analyzer = None
_ipynb_analyzer = None
_css_analyzer = None


def get_ts_analyzer():
    global _ts_analyzer
    if _ts_analyzer is None:
        _ts_analyzer = TreeSitterAnalyzer()
    return _ts_analyzer


def get_md_analyzer():
    global _md_analyzer
    if _md_analyzer is None:
        _md_analyzer = MarkdownTreeSitterAnalyzer()
    return _md_analyzer


def get_ipynb_analyzer():
    global _ipynb_analyzer
    if _ipynb_analyzer is None:
        _ipynb_analyzer = NotebookAnalyzer()
    return _ipynb_analyzer


def get_css_analyzer():
    global _css_analyzer
    if _css_analyzer is None:
        _css_analyzer = CssTreeSitterAnalyzer()
    return _css_analyzer

_python_analyzer = None
def get_python_analyzer():
    global _python_analyzer
    if _python_analyzer is None:
        from app.services.python.python_analysis import PythonTreeSitterAnalyzer
        _python_analyzer = PythonTreeSitterAnalyzer()
    return _python_analyzer

def find_repo_root(start_path: Path) -> Path:
    current = start_path.resolve()
    for parent in [current, *current.parents]:
        if (parent / ".git").exists(): return parent
    return current

def create_node(name: str, node_type: str, path: str) -> Node:
    return Node(
        name=name,
        type=node_type,
        path=path,
        metrics=Metrics(),
        children=[]
    )

def language_for_path(path: str) -> str:
    """Which analyzer handles ``path``; mirrors ``analyze_single_file``."""
    lower = path.lower()
    if lower.endswith(".tsx"):
        return "tsx"
    if lower.endswith(".ts"):
        return "ts"
    if lower.endswith(".py"):
        return "python"
    if lower.endswith(".ipynb"):
        return "notebook"
    if lower.endswith((".md", ".markdown")):
        return "markdown"
    if lower.endswith((".css", ".scss")):
        return "css"
    return "code" if get_reader_for(path) is not None else "text"


# Computed here from the executable scopes, not taken from the analyzer, so
# every language counts functions the same way.
_FROM_SCOPES = frozenset({"complexity", "complexity_avg", "function_count", "average_function_length", "parameter_count"})


def _scope_value(func, name: str):
    if name == "complexity":
        return func.cyclomatic_complexity
    if name in COMPONENT_METRICS:
        return getattr(func, name, None)  # None unless the scope is a component
    return getattr(func, name, 0) or 0


def _compute_function_body_loc(func_node: Node) -> int:
    """
    LOC in a scope that no child scope covers:
        body_loc = lines_in_parent_scope - union_of(lines_of_all_child_scopes)
    so visuals like the treemap don't count nested lines twice.
    """
    if func_node.start_line <= 0 or func_node.end_line <= 0 or not func_node.children:
        return 0
    parent_start = func_node.start_line
    parent_end = func_node.end_line
    if parent_end < parent_start:
        return 0

    covered_lines: set[int] = set()
    for child in func_node.children:
        if child.start_line <= 0 or child.end_line <= 0:
            continue
        start = max(parent_start, child.start_line)
        end = min(parent_end, child.end_line)
        if end < start:
            continue
        covered_lines.update(range(start, end + 1))

    return max(0, parent_end - parent_start + 1 - len(covered_lines))


def attach_file_metrics(node: Node, file_info) -> None:
    language = language_for_path(node.path)
    label = LANGUAGE_LABELS[language]
    file_measured = MEASURED_FILE_METRICS[language]
    scope_measured = MEASURED_SCOPE_METRICS[language]

    m = node.metrics
    m.loc = file_info.nloc
    m.file_count = 1

    for name in file_measured - _FROM_SCOPES - COMPONENT_METRICS:
        setattr(m, name, getattr(file_info, name, 0) or 0)

    functions = list(iter_executable_scopes(file_info.function_list))
    if "function_count" in file_measured:
        m.function_count = len(functions)
        m.parameter_count = sum(getattr(f, "parameter_count", 0) or 0 for f in functions)
        if functions:
            m.complexity_avg = sum(f.cyclomatic_complexity for f in functions) / len(functions)
            m.average_function_length = sum(f.nloc for f in functions) / len(functions)

    def convert_function(func, parent_path: str) -> Node:
        func_node = create_node(func.name, "function", f"{parent_path}::{func.name}")
        func_node.kind = scope_kind(func)
        func_node.metrics.loc = func.nloc
        for name in scope_measured:
            setattr(func_node.metrics, name, _scope_value(func, name))
        func_node.metrics.na_reason = f"Not measured per scope in {label} files"
        if COMPONENT_METRICS & scope_measured and func_node.metrics.component_loc is None:
            func_node.metrics.na_reason += "; component metrics apply to React/Solid components only"
        func_node.start_line = getattr(func, "start_line", 0)
        func_node.end_line = getattr(func, "end_line", 0)

        for child in getattr(func, "children", None) or []:
            func_node.children.append(convert_function(child, func_node.path))

        # A "(body)" fragment holds the lines no child scope covers, so treemap
        # areas don't count nested lines twice. Its branches already count
        # toward the enclosing scope, so it has no metrics of its own.
        body_loc = _compute_function_body_loc(func_node)
        if body_loc > 0 and func_node.children:
            body_node = create_node("(body)", "function_body", f"{func_node.path}::(body)")
            body_node.metrics.loc = body_loc
            body_node.metrics.na_reason = "Lines outside nested scopes; their metrics count toward the enclosing scope"
            body_node.start_line = func_node.start_line
            body_node.end_line = func_node.end_line
            func_node.children.append(body_node)

        return func_node

    for func in file_info.function_list:
        node.children.append(convert_function(func, node.path))

    if "complexity" in file_measured:
        witness = _most_complex_function(node)
        m.complexity = witness.metrics.complexity if witness else 0
        m.complexity_witness = _witness_for(witness) if witness else None

    # Component metrics: the max over the file's components, each naming its
    # component. N/A when the file has none.
    components = _components(node) if COMPONENT_METRICS & file_measured else []
    if components:
        m.witnesses = {}
        for name in sorted(COMPONENT_METRICS):
            top = max(components, key=lambda c: getattr(c.metrics, name))  # first in source order on ties
            setattr(m, name, getattr(top.metrics, name))
            m.witnesses[name] = _witness_for(top)

    reasons = []
    if any(getattr(m, name) is None for name in OPTIONAL_METRIC_FIELDS if name not in file_measured | OVERLAY_METRICS):
        reasons.append(f"Not measured for {label} files")
    if any(getattr(m, name) is None for name in MEAN_OVER_FUNCTIONS & file_measured):
        reasons.append("No functions to average")
    if COMPONENT_METRICS & file_measured and not components:
        reasons.append("No React/Solid components in this file")
    m.na_reason = "; ".join(reasons)


def _most_complex_function(node: Node) -> Node | None:
    """The executable function with the highest CCN below ``node`` (first in source order on ties)."""
    best: Node | None = None
    stack = list(reversed(node.children))
    while stack:
        child = stack.pop()
        if child.kind == "function" and child.metrics.complexity is not None:
            if best is None or child.metrics.complexity > best.metrics.complexity:
                best = child
        stack.extend(reversed(child.children))
    return best


def _components(node: Node) -> list[Node]:
    """Component scopes below ``node``, in source order."""
    found: list[Node] = []
    stack = list(reversed(node.children))
    while stack:
        child = stack.pop()
        if child.type == "function" and child.metrics.component_loc is not None:
            found.append(child)
        stack.extend(reversed(child.children))
    return found


def _witness_for(func_node: Node) -> Witness:
    return Witness(
        path=func_node.path,
        name=func_node.name,
        start_line=func_node.start_line,
        end_line=func_node.end_line,
    )


def _translate_gitignore_pattern(raw_line: str, base_rel: str) -> str | None:
    """
    Translate a single .gitignore pattern that lives in a directory `base_rel`
    (relative to the repo root) into a repo-root-relative gitwildmatch pattern.

    This approximates Git's semantics including:
    - patterns starting with '!' (negation)
    - patterns starting with '/' (anchored to the .gitignore directory)
    - patterns without '/' applying within the directory subtree
    """
    line = raw_line.rstrip("\n")
    if not line or line.lstrip().startswith("#"):
        return None

    negated = line.startswith("!")
    body = line[1:] if negated else line

    # Strip leading slash: anchored to the directory containing the .gitignore
    if body.startswith("/"):
        body = body[1:]

    # Compute prefix for this .gitignore directory
    prefix = f"{base_rel}/" if base_rel else ""

    # If the pattern contains a slash, it's relative to the directory root.
    # Otherwise, it should match that name anywhere under the directory.
    if "/" in body:
        pat = prefix + body
    else:
        if base_rel:
            pat = f"{base_rel}/**/{body}"
        else:
            pat = f"**/{body}"

    return f"!{pat}" if negated else pat


def _read_gitignore_patterns(gitignore_file: Path, base_rel: str) -> list[str]:
    try:
        with open(gitignore_file, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except OSError:
        return []
    patterns: list[str] = []
    for raw in lines:
        translated = _translate_gitignore_pattern(raw, base_rel)
        if translated is not None:
            patterns.append(translated)
    return patterns


def _is_pruned_dir_name(name: str) -> bool:
    return name in IGNORE_DIRS or name.startswith(".srcly")


def _load_gitignore_spec(
    root_path: Path, cancel: Optional[CancelToken] = None
) -> tuple[Path, PathSpec | None]:
    """
    Load a PathSpec representing .gitignore rules visible from the given
    root path, honoring nested .gitignore files similarly to Git.

    We treat the *repository root* (where .git lives) as the base for all
    ignore patterns, so that scanning a subdirectory still respects repo-level
    .gitignore files and nested ones.

    Only .gitignore files that can affect the scan are read: those in the
    ancestors between the repo root and ``root_path``, and those inside the
    ``root_path`` subtree. Directories the scan will never enter (built-in
    ignore dirs such as ``node_modules``, or directories already gitignored by
    a parent rule) are pruned, matching Git, which never re-includes files
    beneath an excluded directory.
    """
    repo_root = find_repo_root(root_path)
    root_path = root_path.resolve()

    all_patterns: list[str] = []

    def rel_of(path: Path) -> str:
        return "" if path == repo_root else path.relative_to(repo_root).as_posix()

    # Ancestors from the repo root down to (but excluding) root_path.
    try:
        ancestors = list(reversed(root_path.relative_to(repo_root).parents))
    except ValueError:
        ancestors = []
    for rel in ancestors:
        directory = repo_root / rel
        if directory == root_path:
            continue
        all_patterns.extend(_read_gitignore_patterns(directory / ".gitignore", rel_of(directory)))

    spec = PathSpec.from_lines("gitwildmatch", all_patterns) if all_patterns else None

    for dirpath, dirnames, filenames in os.walk(root_path):
        if cancel is not None:
            cancel.raise_if_cancelled()
        current = Path(dirpath)

        if ".gitignore" in filenames:
            added = _read_gitignore_patterns(current / ".gitignore", rel_of(current))
            if added:
                all_patterns.extend(added)
                spec = PathSpec.from_lines("gitwildmatch", all_patterns)

        dirnames[:] = [
            d
            for d in dirnames
            if not _is_pruned_dir_name(d)
            and not _is_gitignored(current / d, repo_root, spec, is_dir=True)
        ]

    return repo_root, spec


def _is_gitignored(
    path: Path, ignore_root: Path, spec: PathSpec | None, *, is_dir: bool = False
) -> bool:
    """
    Return True if the given path should be ignored according to the
    provided PathSpec and root_path.

    Pass ``is_dir=True`` for directories: directory-only patterns such as
    ``build/`` only match when the path carries a trailing slash.
    """
    if spec is None:
        return False

    try:
        rel = path.relative_to(ignore_root)
    except ValueError:
        rel = path

    rel_str = rel.as_posix()
    if is_dir:
        rel_str += "/"
    return spec.match_file(rel_str)


@dataclass
class DiscoveryResult:
    """Files a scan should analyze, plus what discovery left out."""

    files: list[str] = field(default_factory=list)
    # Directory path -> number of gitignored files directly inside it.
    ignored_counts: dict[str, int] = field(default_factory=dict)
    skipped_binary: int = 0
    skipped_minified: int = 0
    # True when the listing came from ``git ls-files`` (honoring
    # .git/info/exclude and global excludes), False for the pathspec walk.
    used_git: bool = False

    root: str = ""

    @property
    def folder_count(self) -> int:
        """Folders the scan tree will have below the root (ancestors of listed files)."""
        folders: set[str] = set()
        for f in self.files:
            parent = os.path.dirname(f)
            while parent != self.root and parent not in folders and len(parent) > len(self.root):
                folders.add(parent)
                parent = os.path.dirname(parent)
        return len(folders)


def _has_ignored_extension(name: str) -> bool:
    lower = name.lower()
    # endswith rather than Path.suffix so multi-part entries like ".min.js" match.
    return any(lower.endswith(ext) for ext in IGNORE_EXTENSIONS)


def _looks_minified(chunk: bytes) -> bool:
    if len(chunk) < 2048:
        return False
    lines = chunk.count(b"\n") + 1
    return len(chunk) / lines >= MINIFIED_MIN_AVG_LINE_LENGTH


def classify_candidate(path: Path) -> str:
    """
    Decide whether a discovered file should be analyzed.

    Returns "ok", "ignored" (built-in ignore lists), "binary", or "minified".
    Only "binary" and "minified" need to read the file, and only its head.
    """
    name = path.name
    if name in IGNORE_FILES or _has_ignored_extension(name):
        return "ignored"
    suffix = path.suffix.lower()
    if suffix in BINARY_EXTENSIONS:
        return "binary"
    check_minified = suffix in MINIFIED_CHECK_EXTENSIONS
    try:
        with open(path, "rb") as f:
            chunk = f.read(MINIFIED_SNIFF_BYTES if check_minified else BINARY_SNIFF_BYTES)
    except OSError:
        # Unreadable now; let the analyzer report it so it shows up flagged.
        return "ok"
    if b"\0" in chunk[:BINARY_SNIFF_BYTES]:
        return "binary"
    if check_minified and _looks_minified(chunk):
        return "minified"
    return "ok"


def _has_pruned_component(rel_parts: tuple[str, ...]) -> bool:
    return any(_is_pruned_dir_name(part) for part in rel_parts)


def _git_ls_files(root_path: Path, *args: str) -> list[str] | None:
    """Run ``git ls-files -z`` in ``root_path``; None if git is unavailable or fails."""
    try:
        proc = subprocess.run(
            ["git", "-c", "core.quotepath=off", "ls-files", "-z", *args],
            cwd=root_path,
            capture_output=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return [p for p in proc.stdout.decode("utf-8", "surrogateescape").split("\0") if p]


def _is_inside_git_work_tree(root_path: Path) -> bool:
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=root_path,
            capture_output=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return proc.returncode == 0 and proc.stdout.strip() == b"true"


@dataclass
class _GitListing:
    """One repository's ``git ls-files`` view, before classification."""

    files: list[str]
    """Existing candidate files (absolute), outside pruned directories."""
    stats: list[os.stat_result]
    """``os.stat`` of each entry in ``files``, in the same order."""
    nested: list[Path]
    """Checked-out submodules and nested repositories, listed with their own git."""
    ignored: list[str]
    """Ignored entries relative to the root; wholly ignored trees end in "/"."""


def _list_with_git(root_path: Path, cancel: CancelToken | None = None) -> _GitListing | None:
    """
    List ``root_path`` with ``git ls-files --cached --others --exclude-standard``.

    Returns None if git cannot list the tree. Nested repositories and
    submodules show up as directories and are returned in ``nested``.
    """
    with ThreadPoolExecutor(max_workers=1) as pool:
        # --directory collapses wholly ignored trees (node_modules, build output)
        # into one "dir/" entry; listing every file in them costs seconds on big
        # repos. (--no-empty-directory is avoided: some git versions then list nothing.)
        ignored_future = pool.submit(
            _git_ls_files, root_path, "--others", "--ignored", "--exclude-standard", "--directory"
        )
        listed = _git_ls_files(root_path, "--cached", "--others", "--exclude-standard")
        ignored = ignored_future.result()
    if listed is None:
        return None

    listing = _GitListing(files=[], stats=[], nested=[], ignored=list(dict.fromkeys(ignored or [])))
    seen: set[str] = set()
    for rel in listed:
        if cancel is not None:
            cancel.raise_if_cancelled()
        rel = rel.rstrip("/")
        # A path can appear twice (e.g. tracked but with merge stages).
        if rel in seen:
            continue
        seen.add(rel)
        rel_path = Path(rel)
        if not rel or _has_pruned_component(rel_path.parts[:-1]):
            continue
        full = root_path / rel_path
        # One stat per file: the fingerprint reuses it, and repos list thousands.
        try:
            st = os.stat(full)
        except OSError:
            # Tracked but deleted in the working tree, or a dangling symlink.
            continue
        if stat.S_ISDIR(st.st_mode):
            # Submodule (gitlink) or untracked nested repository. Only descend
            # into ones that are checked out; an uninitialized submodule is an
            # empty directory that git would resolve back to this repo.
            if (
                not full.is_symlink()
                and not _is_pruned_dir_name(rel_path.name)
                and (full / ".git").exists()
            ):
                listing.nested.append(full)
            continue
        if not stat.S_ISREG(st.st_mode):
            continue
        listing.files.append(str(full))
        listing.stats.append(st)
    return listing


def _discover_with_git(
    root_path: Path,
    result: DiscoveryResult,
    cancel: Optional[CancelToken],
    observer: ScanObserver,
) -> bool:
    """
    Discover files with ``_list_with_git``.

    Returns False (leaving ``result`` untouched) if git cannot list the tree,
    so the caller can fall back to the pathspec walk.
    """
    listing = _list_with_git(root_path, cancel)
    if listing is None:
        return False

    for full_str in listing.files:
        verdict = classify_candidate(Path(full_str))
        if verdict == "ok":
            result.files.append(full_str)
        elif verdict == "binary":
            result.skipped_binary += 1
        elif verdict == "minified":
            result.skipped_minified += 1
    observer.discovering(len(result.files), str(root_path))

    for rel in listing.ignored:
        if rel.endswith("/"):
            # A wholly ignored directory; like the walk, count only files
            # sitting in directories the scan actually enters.
            continue
        rel_path = Path(rel)
        if _has_pruned_component(rel_path.parts[:-1]):
            continue
        parent = str((root_path / rel_path).parent)
        result.ignored_counts[parent] = result.ignored_counts.get(parent, 0) + 1

    for nested_root in listing.nested:
        _discover_into(nested_root, result, cancel, observer)
    return True


def _git_info_exclude(root_path: Path) -> Path | None:
    """The repo's .git/info/exclude (shared by worktrees), or None if ``root_path`` isn't in a work tree."""
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree", "--git-path", "info/exclude"],
            cwd=root_path,
            capture_output=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    lines = proc.stdout.decode("utf-8", "surrogateescape").splitlines()
    if proc.returncode != 0 or len(lines) != 2 or lines[0] != "true":
        return None
    # Printed relative to the cwd unless it lives outside it (worktrees).
    return root_path / lines[1]


def _git_global_excludes_file(root_path: Path) -> Path:
    try:
        proc = subprocess.run(
            ["git", "config", "--path", "core.excludesFile"],
            cwd=root_path,
            capture_output=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        proc = None
    if proc is not None and proc.returncode == 0 and proc.stdout.strip():
        return Path(proc.stdout.decode("utf-8", "surrogateescape").strip()).expanduser()
    config_home = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(config_home) / "git" / "ignore"


@dataclass
class FingerprintInputs:
    """What a git-based scan of a root depends on, for the analysis cache."""

    stats: dict[str, os.stat_result] = field(default_factory=dict)
    """Files whose path, mtime and size matter: candidates plus ignore-rule files."""
    names: list[str] = field(default_factory=list)
    """Entries whose presence alone matters: gitignored files (shown as counts)."""


def git_fingerprint_inputs(root_path: Path) -> FingerprintInputs | None:
    """
    The files a scan of ``root_path`` reads, from the same git listing as discovery.

    Includes every candidate (before binary/minified checks), each tracked or
    untracked .gitignore, .git/info/exclude and the global excludes file, so a
    file that becomes un-ignored still changes the result. Returns None when
    ``root_path`` (or a nested repository) can't be listed with git; callers
    then fall back to walking the tree.
    """
    root_path = root_path.resolve()
    inputs = FingerprintInputs()
    rule_files: list[Path] = []
    pending = [root_path]
    while pending:
        repo = pending.pop()
        info_exclude = _git_info_exclude(repo)
        if info_exclude is None:
            return None
        if not rule_files:
            rule_files.append(_git_global_excludes_file(repo))
        listing = _list_with_git(repo)
        if listing is None:
            return None
        rule_files.append(info_exclude)
        inputs.stats.update(zip(listing.files, listing.stats))
        inputs.names.extend(str(repo / rel) for rel in listing.ignored)
        pending.extend(listing.nested)
    for path in rule_files:
        try:
            inputs.stats[str(path)] = os.stat(path)
        except OSError:
            continue
    return inputs


def _discover_with_walk(
    root_path: Path,
    result: DiscoveryResult,
    cancel: Optional[CancelToken],
    observer: ScanObserver,
) -> None:
    """Fallback discovery: os.walk plus translated nested .gitignore files."""
    ignore_root, gitignore_spec = _load_gitignore_spec(root_path, cancel)

    for dirs_walked, (root_dir, dirs, files) in enumerate(os.walk(root_path)):
        if cancel is not None:
            cancel.raise_if_cancelled()
        root_dir_path = Path(root_dir)
        if dirs_walked % DISCOVERY_REPORT_EVERY_DIRS == 0:
            observer.discovering(len(result.files), root_dir)

        # Prune ignored directories in place so os.walk skips them.
        dirs[:] = [
            d
            for d in dirs
            if not _is_pruned_dir_name(d)
            and not _is_gitignored(root_dir_path / d, ignore_root, gitignore_spec, is_dir=True)
        ]

        current_ignored_count = 0
        for file in files:
            file_path = root_dir_path / file
            if file in IGNORE_FILES or _has_ignored_extension(file):
                continue
            if _is_gitignored(file_path, ignore_root, gitignore_spec):
                current_ignored_count += 1
                continue
            verdict = classify_candidate(file_path)
            if verdict == "ok":
                result.files.append(str(file_path))
            elif verdict == "binary":
                result.skipped_binary += 1
            elif verdict == "minified":
                result.skipped_minified += 1

        if current_ignored_count > 0:
            result.ignored_counts[str(root_dir_path)] = current_ignored_count


def _discover_into(
    root_path: Path,
    result: DiscoveryResult,
    cancel: Optional[CancelToken],
    observer: ScanObserver,
) -> None:
    if _is_inside_git_work_tree(root_path) and _discover_with_git(root_path, result, cancel, observer):
        result.used_git = True
        return
    _discover_with_walk(root_path, result, cancel, observer)


def discover_files(
    root_path: Path,
    *,
    cancel: Optional[CancelToken] = None,
    observer: ScanObserver = NULL_OBSERVER,
) -> DiscoveryResult:
    """
    Find the files a scan of ``root_path`` will analyze.

    Inside a git work tree this asks git (``ls-files --cached --others
    --exclude-standard``), so .gitignore, .git/info/exclude, and the global
    excludes file all apply. Elsewhere, or if git fails, it walks the tree and
    applies translated .gitignore patterns. Either way the built-in ignore
    lists in ``config`` apply, and binary and minified files are skipped.

    Shared by the scan and the landing-page estimate so the two agree.
    """
    root_path = root_path.resolve()
    result = DiscoveryResult(root=str(root_path))
    _discover_into(root_path, result, cancel, observer)
    return result


def _should_log_file_progress(completed_count: int, total_count: int) -> bool:
    """
    Decide whether to emit a per-file progress log.

    Rules:
    - If there are fewer than 10 files, log every file.
    - Otherwise:
      - Log the first 10 files.
      - Log at 15 and 20.
      - Log every 25th file after that (25, 50, 75, ...).
      - Always log the final file when done.
    """
    if total_count < 10:
        return True

    if completed_count <= 10:
        return True

    if completed_count in (15, 20):
        return True

    if completed_count % 25 == 0:
        return True

    if completed_count == total_count:
        return True

    return False

# How folders roll up each N/A-able metric. N/A children are skipped, so a
# folder of Markdown and Python files gets the Python files' complexity, and a
# folder is N/A only when no child measured the metric.
_MAX_ROLLUP = frozenset({"complexity", "max_nesting_depth"}) | COMPONENT_METRICS
_MEAN_ROLLUP = frozenset({"complexity_avg", "average_function_length"})  # weighted by function_count


def aggregate_metrics(node: Node) -> Metrics:
    if not node.children:
        return node.metrics

    child_metrics = [aggregate_metrics(child) for child in node.children]
    if node.type != "folder":
        return node.metrics

    m = node.metrics
    m.loc = sum(c.loc for c in child_metrics)
    # last_modified is the max of children; gitignored_count is assigned
    # after aggregation from discovery (see _assign_gitignored_counts).
    m.last_modified = max((c.last_modified for c in child_metrics), default=0.0)
    m.file_size = sum(c.file_size for c in child_metrics)
    m.file_count = sum(c.file_count for c in child_metrics)
    m.analysis_failed_count = sum(c.analysis_failed_count for c in child_metrics)

    for name in OPTIONAL_METRIC_FIELDS:
        measured = [c for c in child_metrics if getattr(c, name) is not None]
        if not measured:
            setattr(m, name, None)
        elif name in _MAX_ROLLUP:
            setattr(m, name, max(getattr(c, name) for c in measured))
        elif name in _MEAN_ROLLUP:
            weight = sum(c.function_count or 0 for c in measured)
            setattr(m, name, sum(getattr(c, name) * (c.function_count or 0) for c in measured) / weight if weight else None)
        else:
            setattr(m, name, sum(getattr(c, name) for c in measured))

    witness_source = None
    for c in child_metrics:
        if c.complexity is not None and c.complexity_witness is not None and c.complexity == m.complexity:
            witness_source = c
            break
    m.complexity_witness = witness_source.complexity_witness if witness_source else None

    witnesses = {}
    for name in COMPONENT_METRICS:
        value = getattr(m, name)
        source = next((c for c in child_metrics if c.witnesses and name in c.witnesses and getattr(c, name) == value), None)
        if source is not None:
            witnesses[name] = source.witnesses[name]
    m.witnesses = witnesses or None

    m.na_reason = "No file below measures this" if any(getattr(m, n) is None for n in OPTIONAL_METRIC_FIELDS if n not in OVERLAY_METRICS) else ""
    return m


def analyze_single_file(file_path: str):
    """
    Wrapper to analyze a single file safely.
    Must be top-level for multiprocessing pickling.
    """
    try:
        if file_path.endswith(".ts") or file_path.endswith(".tsx"):
            analyzer = get_ts_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".css") or file_path.endswith(".scss"):
            analyzer = get_css_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".md") or file_path.endswith(".markdown"):
            analyzer = get_md_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".ipynb"):
            analyzer = get_ipynb_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".py"):
             # We can cache it similarly if we want, or just instantiate. 
             # For consistency let's add a getter or just instantiate for now to avoid circular imports / global clutter
             # actually lets follow pattern
             return get_python_analyzer().analyze_file(file_path)

        # lizard has no reader for .yaml, .mdx, .sh, .html, dotfiles, etc. It
        # would run its C tokenizer anyway, which finds no functions and can
        # take gigabytes on one long line. A line count gives the same nloc.
        if get_reader_for(file_path) is None:
            return lizard.FileInformation(file_path, count_lizard_style_nloc(Path(file_path)), [])
        return lizard.analyze_file(file_path)
    except Exception as e:
        # Return error info instead of crashing
        return {"error": str(e), "filename": file_path}


def _run_file_analyses_with_hard_timeouts(
    files_to_scan: list[str],
    timeout_seconds: float,
    max_workers: int,
    *,
    verbose: bool = True,
    cancel: Optional[CancelToken] = None,
    observer: ScanObserver = NULL_OBSERVER,
) -> list:
    """
    Analyze files in a pool of worker processes with a *hard* per-file timeout.

    Returns the successful results followed by one failure dict
    (``{"filename", "error", "reason"}``) per file that timed out, crashed, or
    raised, so the tree builder can keep those files as fallback nodes. See
    ``scan_workers`` for the pool mechanics. Raises ``ScanCancelled`` if
    ``cancel`` fires.
    """

    def on_file_start(index: int, total: int, path: str) -> None:
        observer.file_started(path)
        # Log every file *before* it is processed so we can identify the
        # last-started file if analysis hangs or crashes.
        if verbose:
            print(f"➡️ [{index}/{total}] Starting analysis: {path}", file=sys.stderr, flush=True)

    def on_file_done(completed: int, total: int, path: str, failure: FileFailure | None) -> None:
        observer.file_done(
            completed,
            total,
            path,
            failure.reason if failure else None,
            failure.detail if failure else "",
        )
        if not verbose:
            return
        if failure is None:
            if _should_log_file_progress(completed, total):
                print(f"✅ [{completed}/{total}] Analyzed {path}", file=sys.stderr, flush=True)
        elif failure.reason == "timeout":
            print(f"❌ [{completed}/{total}] Timeout analyzing {path} after {failure.detail} (terminated)", file=sys.stderr, flush=True)
        else:
            print(f"❌ [{completed}/{total}] Error analyzing {path}: {failure.detail}", file=sys.stderr, flush=True)

    outcome = run_file_analyses(
        files_to_scan,
        timeout_seconds=timeout_seconds,
        max_workers=max_workers,
        cancel=cancel,
        on_file_start=on_file_start,
        on_file_done=on_file_done,
    )
    failures = [
        {"filename": f.path, "error": f.detail, "reason": f.reason}
        for f in outcome.failures
    ]
    return [*outcome.results, *failures]


# Fallback LOC for files the analyzer could not finish: read at most this many
# bytes so a pathological file cannot stall tree building.
FALLBACK_LOC_MAX_BYTES = 32 * 1024 * 1024


def count_fallback_loc(path: Path) -> int:
    """Count non-blank lines, as a cheap stand-in for lizard's ``nloc``."""
    count = 0
    read = 0
    try:
        with open(path, "rb") as f:
            for line in f:
                read += len(line)
                if read > FALLBACK_LOC_MAX_BYTES:
                    break
                if line.strip():
                    count += 1
    except OSError:
        return 0
    return count


# lizard's C tokenizer, used for files with no reader, drops ``//`` comments and
# ``#word`` lines (it parses them as preprocessor directives). That covers YAML
# and shell comments and Markdown headings.
_LIZARD_MACRO_LINE = re.compile(rb"#\s*\w")


def count_lizard_style_nloc(path: Path) -> int:
    """Approximate lizard's ``nloc`` for a file lizard has no reader for.

    Counts non-blank lines, skipping lines that start with ``//`` or ``#word``.
    This matches lizard exactly on most such files; the rest differ where
    lizard reads an apostrophe in prose as the start of a multi-line string.
    Streams the file, so memory stays flat regardless of size.
    """
    count = 0
    try:
        with open(path, "rb") as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith(b"//") or _LIZARD_MACRO_LINE.match(stripped):
                    continue
                count += 1
    except OSError:
        return 0
    return count


def attach_fallback_metrics(node: Node, failure: dict) -> None:
    """Fill in what we can for a file whose analysis failed."""
    node.metrics.loc = count_fallback_loc(Path(node.path))
    node.metrics.file_count = 1
    node.metrics.analysis_status = str(failure.get("reason") or "error")
    node.metrics.analysis_error = str(failure.get("error") or "")
    # A file over the size cap was skipped on purpose, not a failure.
    skipped = node.metrics.analysis_status == "too_large"
    node.metrics.analysis_failed_count = 0 if skipped else 1
    # Every other metric stays None: nothing was measured, so nothing is 0.
    detail = f": {node.metrics.analysis_error}" if node.metrics.analysis_error else ""
    node.metrics.na_reason = (
        f"Skipped{detail}" if skipped else f"Analysis failed ({node.metrics.analysis_status}){detail}"
    )


def split_oversized_files(files: list[str], max_bytes: Optional[int] = None) -> tuple[list[str], list[dict]]:
    """Split ``files`` into those to analyze and failure dicts for files over ``max_bytes``.

    Oversized files keep their place in the tree with fallback metrics and
    status ``too_large``; they never reach a worker.
    """
    if max_bytes is None:
        max_bytes = MAX_ANALYZED_FILE_BYTES
    to_analyze: list[str] = []
    too_large: list[dict] = []
    for path in files:
        try:
            size = os.path.getsize(path)
        except OSError:
            size = 0
        if size > max_bytes:
            too_large.append({
                "filename": path,
                "error": f"{size / 1e6:.1f} MB is over the {max_bytes / 1e6:.1f} MB analysis limit",
                "reason": "too_large",
            })
        else:
            to_analyze.append(path)
    return to_analyze, too_large


def _result_filename(file_info) -> str | None:
    if isinstance(file_info, dict):
        # Only failure dicts are usable; any other dict is skipped.
        return file_info.get("filename") if "error" in file_info else None
    return getattr(file_info, "filename", None)


def scan_codebase(
    root_path: Path,
    *,
    verbose: bool = True,
    cancel: Optional[CancelToken] = None,
    observer: Optional[ScanObserver] = None,
) -> Node:
    """
    Scan ``root_path`` and return the analysis tree.

    Raises ``ScanCancelled`` if ``cancel`` fires (or ``cancel_all_scans`` is
    called) before the scan finishes; worker processes are always cleaned up.
    ``observer`` receives progress callbacks (see ``scan_progress``).
    """
    token = cancel or CancelToken()
    with track_scan(token):
        return _scan_codebase(
            root_path, verbose=verbose, cancel=token, observer=observer or NULL_OBSERVER
        )


def _scan_codebase(
    root_path: Path, *, verbose: bool, cancel: CancelToken, observer: ScanObserver
) -> Node:
    if verbose:
        print(f"🔍 Scanning: {root_path}", file=sys.stderr, flush=True)

    observer.discovering(0, str(root_path))

    discovery = discover_files(root_path, cancel=cancel, observer=observer)
    files_to_scan, oversized = split_oversized_files(discovery.files)
    if verbose and (discovery.skipped_binary or discovery.skipped_minified):
        print(
            f"⏭️ Skipped {discovery.skipped_binary} binary and {discovery.skipped_minified} minified files",
            file=sys.stderr,
            flush=True,
        )
    if verbose and oversized:
        print(
            f"⏭️ {len(oversized)} files over {MAX_ANALYZED_FILE_BYTES / 1e6:.1f} MB keep a line count only",
            file=sys.stderr,
            flush=True,
        )

    if verbose:
        print(
            f"📂 Analyzing {len(files_to_scan)} source files... (workers={MAX_ANALYSIS_WORKERS}, timeout={PER_FILE_ANALYSIS_TIMEOUT_SECONDS}s)",
            file=sys.stderr,
            flush=True,
        )

    observer.analyzing(len(files_to_scan))
    analysis_results = _run_file_analyses_with_hard_timeouts(
        files_to_scan=files_to_scan,
        timeout_seconds=PER_FILE_ANALYSIS_TIMEOUT_SECONDS,
        max_workers=MAX_ANALYSIS_WORKERS,
        verbose=verbose,
        cancel=cancel,
        observer=observer,
    )
    cancel.raise_if_cancelled()
    analysis_results.extend(oversized)
    observer.building()

    tree_root = create_node("root", "folder", str(root_path))
    node_map = {str(root_path): tree_root}

    # Workers finish in any order and failures come back last; build the tree
    # in path order so an unchanged repo always serializes to the same bytes.
    for file_info in sorted(analysis_results, key=lambda r: str(_result_filename(r) or "")):
        # Failed files come back as dicts with an "error" key; they stay in the
        # tree with fallback metrics. Anything else unexpected (e.g. an object
        # without a ``filename``) is skipped instead of crashing the scan.
        failure = file_info if isinstance(file_info, dict) and "error" in file_info else None
        filename = _result_filename(file_info)
        if not filename:
            print(f"⚠️ Skipping unexpected analysis result without filename: {file_info!r}", file=sys.stderr, flush=True)
            continue

        path_obj = Path(filename)
        try: rel_path = path_obj.relative_to(root_path)
        except ValueError: continue

        parts = rel_path.parts
        current_node = tree_root
        current_path = root_path

        # Build Folder Tree
        for part in parts[:-1]:
            next_path = current_path / part
            next_path_str = str(next_path)
            if next_path_str not in node_map:
                new_folder = create_node(part, "folder", next_path_str)
                current_node.children.append(new_folder)
                node_map[next_path_str] = new_folder
            current_node = node_map[next_path_str]
            current_path = next_path

        # Add File
        file_node = create_node(parts[-1], "file", str(path_obj))
        if failure is not None:
            attach_fallback_metrics(file_node, failure)
        else:
            attach_file_metrics(file_node, file_info)
        # Set last_modified
        try:
            st = os.stat(path_obj)
            file_node.metrics.last_modified = st.st_mtime
            file_node.metrics.file_size = st.st_size
        except OSError:
            file_node.metrics.last_modified = 0.0
            file_node.metrics.file_size = 0
            
        current_node.children.append(file_node)

    aggregate_metrics(tree_root)
    _assign_gitignored_counts(tree_root, root_path, discovery.ignored_counts)
    return tree_root


def _assign_gitignored_counts(tree_root: Node, root_path: Path, ignored_counts: dict[str, int]) -> None:
    """
    Set each folder's ``gitignored_count`` to the ignored files anywhere below
    it. Counts are rolled up from every directory that had ignored files, even
    ones with no analyzed files (and so no node of their own).
    """
    totals: dict[str, int] = {}
    root_str = str(root_path)
    for dir_path, count in ignored_counts.items():
        current = Path(dir_path)
        while True:
            key = str(current)
            totals[key] = totals.get(key, 0) + count
            if key == root_str or current.parent == current:
                break
            current = current.parent

    def visit(node: Node) -> None:
        if node.type != "folder":
            return
        node.metrics.gitignored_count = totals.get(node.path, 0)
        for child in node.children:
            visit(child)

    visit(tree_root)
