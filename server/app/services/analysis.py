import os
import subprocess
import lizard
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.models import Node, Metrics
from app.config import (
    BINARY_EXTENSIONS,
    BINARY_SNIFF_BYTES,
    IGNORE_DIRS,
    IGNORE_EXTENSIONS,
    IGNORE_FILES,
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

def attach_file_metrics(node: Node, file_info) -> None:
    total_loc = file_info.nloc
    node.metrics.loc = total_loc
    node.metrics.complexity_avg = file_info.average_cyclomatic_complexity
    node.metrics.function_count = len(file_info.function_list)
    node.metrics.function_count = len(file_info.function_list)
    node.metrics.file_count = 1
    # TS/TSX-specific metrics are only available for TypeScript/TSX files analyzed
    # by the TreeSitterAnalyzer. Plain lizard FileInformation objects (e.g. for
    # Python or other languages) won't have these attributes, so guard them.
    if hasattr(file_info, "tsx_nesting_depth"):
        node.metrics.tsx_nesting_depth = file_info.tsx_nesting_depth
        node.metrics.tsx_render_branching_count = file_info.tsx_render_branching_count
        node.metrics.tsx_react_use_effect_count = file_info.tsx_react_use_effect_count
        node.metrics.tsx_anonymous_handler_count = file_info.tsx_anonymous_handler_count
        node.metrics.tsx_prop_count = file_info.tsx_prop_count
        node.metrics.ts_any_usage_count = file_info.ts_any_usage_count
        node.metrics.ts_ignore_count = file_info.ts_ignore_count
        node.metrics.ts_import_coupling_count = file_info.ts_import_coupling_count
        node.metrics.tsx_hardcoded_string_volume = file_info.tsx_hardcoded_string_volume
        node.metrics.tsx_duplicated_string_count = file_info.tsx_duplicated_string_count
        node.metrics.ts_type_interface_count = file_info.ts_type_interface_count
        node.metrics.ts_export_count = file_info.ts_export_count
    # Markdown-specific metrics
    if hasattr(file_info, "md_data_url_count"):
        node.metrics.md_data_url_count = file_info.md_data_url_count
    
    # New metrics
    if hasattr(file_info, 'comment_lines'):
        node.metrics.comment_lines = file_info.comment_lines
        node.metrics.comment_density = file_info.comment_density
        node.metrics.max_nesting_depth = file_info.max_nesting_depth
        node.metrics.average_function_length = file_info.average_function_length
        node.metrics.parameter_count = file_info.parameter_count
        node.metrics.todo_count = file_info.todo_count
        node.metrics.classes_count = file_info.classes_count
    
    if hasattr(file_info, 'python_import_count'):
        node.metrics.python_import_count = file_info.python_import_count
    
    # Set start/end line for the file (approximate, 1 to total lines)
    # We don't strictly have this from lizard always, but we can infer or leave 0.
    # For now, let's leave file start/end as 0 unless we want to read the file.
    
    # Calculate sum of function LOCs
    func_sum_loc = 0

    def _compute_function_body_loc(func_node: Node) -> int:
        """
        Compute the LOC that belongs to the *body* of a function node,
        excluding any lines that are already covered by child scopes.

        Conceptually:
            body_loc = lines_in_parent_scope
                       - union_of(lines_of_all_child_scopes)

        This ensures we only count leftover lines in the parent scope that
        are not associated with a nested child block, avoiding double
        counting in visuals like the treemap.
        """
        # We need valid line information and at least one child scope to
        # compute a meaningful body range.
        if func_node.start_line <= 0 or func_node.end_line <= 0:
            return 0
        if not func_node.children:
            return 0

        parent_start = func_node.start_line
        parent_end = func_node.end_line
        if parent_end < parent_start:
            return 0

        covered_lines: set[int] = set()
        for child in func_node.children:
            # Only consider children that have a valid, overlapping range.
            if child.start_line <= 0 or child.end_line <= 0:
                continue
            start = max(parent_start, child.start_line)
            end = min(parent_end, child.end_line)
            if end < start:
                continue
            for line in range(start, end + 1):
                covered_lines.add(line)

        total_lines = parent_end - parent_start + 1
        body_lines = total_lines - len(covered_lines)
        return max(0, body_lines)

    def convert_function(func, parent_path: str) -> Node:
        func_node = create_node(func.name, "function", f"{parent_path}::{func.name}")
        func_node.metrics.loc = func.nloc
        func_node.metrics.loc = func.nloc
        func_node.metrics.complexity = func.cyclomatic_complexity
        
        # Safely get new metrics (Lizard functions won't have these)
        func_node.metrics.parameter_count = getattr(func, 'parameter_count', 0)
        func_node.metrics.max_nesting_depth = getattr(func, 'max_nesting_depth', 0)
        func_node.metrics.comment_lines = getattr(func, 'comment_lines', 0)
        func_node.metrics.todo_count = getattr(func, 'todo_count', 0)
        func_node.metrics.ts_type_interface_count = getattr(func, 'ts_type_interface_count', 0)
        func_node.metrics.md_data_url_count = getattr(func, 'md_data_url_count', 0)
        
        # Density for function
        comment_lines = getattr(func, 'comment_lines', 0)
        func_node.metrics.comment_density = comment_lines / func.nloc if func.nloc > 0 else 0.0
        
        if hasattr(func, 'start_line'):
            func_node.start_line = func.start_line
        if hasattr(func, 'end_line'):
            func_node.end_line = func.end_line
            
        # Process children if they exist (for TS/TSX)
        if hasattr(func, 'children') and func.children:
            for child in func.children:
                child_node = convert_function(child, func_node.path)
                func_node.children.append(child_node)

        # After all child scopes are attached, compute a synthetic "(body)"
        # fragment that represents only the leftover lines in this function
        # that are not part of any child scope. This keeps treemap areas
        # from double-counting lines that already belong to nested children.
        body_loc = _compute_function_body_loc(func_node)
        if body_loc > 0 and func_node.children:
            body_node = create_node("(body)", "function_body", f"{func_node.path}::(body)")
            body_node.metrics.loc = body_loc
            # Any additional cyclomatic complexity should already be counted
            # on the nested child scopes; keep the glue code at 0.
            body_node.metrics.complexity = 0.0
            body_node.start_line = func_node.start_line
            body_node.end_line = func_node.end_line
            func_node.children.append(body_node)

        return func_node

    for func in file_info.function_list:
        func_node = convert_function(func, node.path)
        node.children.append(func_node)
        func_sum_loc += func.nloc

    node.metrics.complexity = _max_scope_complexity(node)

    # NOTE: We no longer create a synthetic child node for module-level "glue".
    # Any top-level/module lines should be represented as the (body) of the
    # file/module scope (handled by the newer scope-body attribution logic).


def _max_scope_complexity(node: Node) -> float:
    """Highest CCN among the function scopes (at any depth) below ``node``."""
    best = 0.0
    for child in node.children:
        best = max(best, child.metrics.complexity, _max_scope_complexity(child))
    return best


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


def _discover_with_git(
    root_path: Path,
    result: DiscoveryResult,
    cancel: Optional[CancelToken],
    observer: ScanObserver,
) -> bool:
    """
    List files with ``git ls-files --cached --others --exclude-standard``.

    Returns False (leaving ``result`` untouched) if git cannot list the tree,
    so the caller can fall back to the pathspec walk. Nested repositories and
    submodules show up as directories; they are listed with their own git.
    """
    listed = _git_ls_files(root_path, "--cached", "--others", "--exclude-standard")
    if listed is None:
        return False
    # --directory collapses wholly ignored trees (node_modules, build output)
    # into one "dir/" entry; listing every file in them costs seconds on big
    # repos. (--no-empty-directory is avoided: some git versions then list nothing.)
    ignored = _git_ls_files(root_path, "--others", "--ignored", "--exclude-standard", "--directory")

    files: list[str] = []
    nested: list[Path] = []
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
        if full.is_dir() and not full.is_symlink():
            # Submodule (gitlink) or untracked nested repository. Only descend
            # into ones that are checked out; an uninitialized submodule is an
            # empty directory that git would resolve back to this repo.
            if not _is_pruned_dir_name(rel_path.name) and (full / ".git").exists():
                nested.append(full)
            continue
        if not full.is_file():
            # Tracked but deleted in the working tree, or a dangling symlink.
            continue
        files.append(str(full))

    for full_str in files:
        verdict = classify_candidate(Path(full_str))
        if verdict == "ok":
            result.files.append(full_str)
        elif verdict == "binary":
            result.skipped_binary += 1
        elif verdict == "minified":
            result.skipped_minified += 1
    observer.discovering(len(result.files), str(root_path))

    for rel in dict.fromkeys(ignored or []):
        if rel.endswith("/"):
            # A wholly ignored directory; like the walk, count only files
            # sitting in directories the scan actually enters.
            continue
        rel_path = Path(rel)
        if _has_pruned_component(rel_path.parts[:-1]):
            continue
        parent = str((root_path / rel_path).parent)
        result.ignored_counts[parent] = result.ignored_counts.get(parent, 0) + 1

    for nested_root in nested:
        _discover_into(nested_root, result, cancel, observer)
    return True


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

def aggregate_metrics(node: Node) -> Metrics:
    if not node.children: return node.metrics

    total_loc = 0
    max_complexity = 0
    total_funcs = 0
    
    # New metrics aggregation
    total_comment_lines = 0
    max_nesting_depth = 0
    total_parameter_count = 0
    total_todo_count = 0
    total_classes_count = 0
    total_type_interface_count = 0
    total_export_count = 0
    total_md_data_url_count = 0
    total_python_import_count = 0
    
    # For average function length, we need total function loc and total functions (already have total_funcs)
    # But we need to sum function locs from children.
    # Let's track total function loc separately if we want to be precise, 
    # OR we can just use the child's average * child's function count.
    total_function_loc = 0

    for child in node.children:
        child_metrics = aggregate_metrics(child)
        total_loc += child_metrics.loc
        max_complexity = max(max_complexity, child_metrics.complexity)
        total_funcs += child_metrics.function_count
        
        total_comment_lines += child_metrics.comment_lines
        max_nesting_depth = max(max_nesting_depth, child_metrics.max_nesting_depth)
        total_parameter_count += child_metrics.parameter_count
        total_todo_count += child_metrics.todo_count
        total_classes_count += child_metrics.classes_count
        total_type_interface_count += child_metrics.ts_type_interface_count
        total_export_count += child_metrics.ts_export_count
        total_md_data_url_count += child_metrics.md_data_url_count
        total_python_import_count += child_metrics.python_import_count
        
        
        # Reconstruct total function loc from average * count
        total_function_loc += (child_metrics.average_function_length * child_metrics.function_count)

    # For Folders: Sum of children
    # For Files: We trust the attach_file_metrics logic.
    if node.type == "folder":
        node.metrics.loc = total_loc
        node.metrics.complexity = max_complexity
        node.metrics.complexity_avg = (
            sum(c.metrics.complexity_avg * c.metrics.function_count for c in node.children) / total_funcs
            if total_funcs > 0
            else 0.0
        )
        node.metrics.function_count = total_funcs
        
        # last_modified is the max of children; gitignored_count is assigned
        # after aggregation from discovery (see _assign_gitignored_counts).
        node.metrics.last_modified = max((child.metrics.last_modified for child in node.children), default=0.0)
        node.metrics.file_size = sum(child.metrics.file_size for child in node.children)
        node.metrics.file_count = sum(child.metrics.file_count for child in node.children)
        node.metrics.analysis_failed_count = sum(
            child.metrics.analysis_failed_count for child in node.children
        )
        
        node.metrics.comment_lines = total_comment_lines
        node.metrics.comment_density = total_comment_lines / total_loc if total_loc > 0 else 0.0
        node.metrics.max_nesting_depth = max_nesting_depth
        node.metrics.parameter_count = total_parameter_count
        node.metrics.todo_count = total_todo_count
        node.metrics.classes_count = total_classes_count
        node.metrics.average_function_length = total_function_loc / total_funcs if total_funcs > 0 else 0.0
        node.metrics.ts_type_interface_count = total_type_interface_count
        node.metrics.ts_type_interface_count = total_type_interface_count
        node.metrics.ts_export_count = total_export_count
        node.metrics.md_data_url_count = total_md_data_url_count
        node.metrics.python_import_count = total_python_import_count
    
    return node.metrics

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
    try:
        with open(path, "rb") as f:
            data = f.read(FALLBACK_LOC_MAX_BYTES)
    except OSError:
        return 0
    for line in data.splitlines():
        if line.strip():
            count += 1
    return count


def attach_fallback_metrics(node: Node, failure: dict) -> None:
    """Fill in what we can for a file whose analysis failed."""
    node.metrics.loc = count_fallback_loc(Path(node.path))
    node.metrics.file_count = 1
    node.metrics.analysis_status = str(failure.get("reason") or "error")
    node.metrics.analysis_error = str(failure.get("error") or "")
    node.metrics.analysis_failed_count = 1


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
    files_to_scan = discovery.files
    if verbose and (discovery.skipped_binary or discovery.skipped_minified):
        print(
            f"⏭️ Skipped {discovery.skipped_binary} binary and {discovery.skipped_minified} minified files",
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
    observer.building()

    tree_root = create_node("root", "folder", str(root_path))
    node_map = {str(root_path): tree_root}

    for file_info in analysis_results:
        # Failed files come back as dicts with an "error" key; they stay in the
        # tree with fallback metrics. Anything else unexpected (e.g. an object
        # without a ``filename``) is skipped instead of crashing the scan.
        failure = file_info if isinstance(file_info, dict) and "error" in file_info else None
        if failure is not None:
            filename = failure.get("filename")
        else:
            filename = getattr(file_info, "filename", None)
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
            stat = os.stat(path_obj)
            file_node.metrics.last_modified = stat.st_mtime
            file_node.metrics.file_size = stat.st_size
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
