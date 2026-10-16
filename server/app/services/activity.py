"""
Git activity: how often each file changed recently, and how much.

One ``git log --numstat --no-merges --find-renames --since=<window>`` pass
gives, per file:

- ``commit_count``: commits in the window that touched it;
- ``churn_lines``: lines added plus removed by those commits.

History follows renames to the file's current path. Activity turns on by
itself whenever the scanned folder is inside a Git work tree. When it can't be
trusted (no ``.git``, a shallow clone, no commits, git failing or timing out)
every file gets N/A with the reason; uncommitted edits only add a note, since
they don't change the history.

Activity is laid over a finished tree (``apply_to_tree``) instead of being
computed during the scan, so the analysis cache stays keyed on file contents
and changing the window never re-runs the analyzers. Results are cached by
repo + revision + window (+ day for relative windows, which move with the
clock), in memory and on disk next to the analysis cache.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

from app.services.analysis_types import ACTIVITY_METRICS
from app.services.compare.git_refs import GitError, GitTimeout, run_git

# Window id → ``--since`` value (None = all history).
WINDOWS: dict[str, Optional[str]] = {
    "30d": "30 days ago",
    "90d": "90 days ago",
    "1y": "1 year ago",
    "all": None,
}
WINDOW_LABELS = {"30d": "last 30 days", "90d": "last 90 days", "1y": "last year", "all": "all history"}
DEFAULT_WINDOW = "90d"

# The log pass reads every commit in the window; on a huge repo with
# ``all`` that can take a while, and a stuck git must not stall the result.
GIT_LOG_TIMEOUT_SECONDS = 30.0
GIT_QUICK_TIMEOUT_SECONDS = 10.0
RECENT_COMMITS = 5
MAX_MEMORY_ENTRIES = 16
MAX_DISK_ENTRIES = 40
CACHE_FORMAT = 1

_RECORD = "\x1e"
_FIELD = "\x1f"


@dataclass
class ActivityResult:
    window: str
    status: str
    """``ok``, or ``na`` when activity can't be measured (see ``reason``)."""
    reason: str = ""
    note: str = ""
    """Shown alongside valid results, e.g. uncommitted changes."""
    head: str = ""
    """Short SHA of the revision the history ends at."""
    repo_root: str = ""
    files: dict[str, list[int]] = field(default_factory=dict)
    """Repo-relative path → ``[commit_count, churn_lines]``."""

    @property
    def ok(self) -> bool:
        return self.status == "ok"

    def info(self) -> dict[str, Any]:
        """What the tree root carries (``models.ActivityInfo``)."""
        return {
            "window": self.window,
            "window_label": WINDOW_LABELS[self.window],
            "status": self.status,
            "reason": self.reason,
            "note": self.note,
            "head": self.head,
            "files_touched": len(self.files),
        }


def normalize_window(window: Optional[str]) -> str:
    if not window:
        return DEFAULT_WINDOW
    if window not in WINDOWS:
        raise ValueError(f"Unknown activity window {window!r}; use one of {', '.join(WINDOWS)}")
    return window


# -- git ---------------------------------------------------------------------


def _git(repo: Path, *args: str, timeout: float) -> str:
    return run_git(repo, *args, timeout=timeout)


def _repo_root(path: Path, timeout: float) -> Optional[Path]:
    start = path if path.is_dir() else path.parent
    try:
        inside = _git(start, "rev-parse", "--is-inside-work-tree", timeout=timeout).strip()
    except GitTimeout:
        raise
    except GitError:
        return None
    if inside != "true":
        return None
    return Path(_git(start, "rev-parse", "--show-toplevel", timeout=timeout).strip()).resolve()


def parse_numstat_log(output: str) -> dict[str, list[int]]:
    """
    Parse ``git log -z --numstat --format=%x1e%H`` (newest first) into
    ``{current path: [commits, churn]}``.

    Renames are attributed to the path the file has now: walking newest to
    oldest, each ``old => new`` maps ``old`` to wherever ``new`` ends up.
    Binary files (``-`` counts) add a commit and no churn.
    """
    current: dict[str, str] = {}
    files: dict[str, list[int]] = {}
    for chunk in output.split(_RECORD):
        if not chunk.strip():
            continue
        tokens = chunk.split("\0")
        # tokens[0] is the SHA; numstat records follow.
        touched: dict[str, int] = {}
        i = 1
        while i < len(tokens):
            token = tokens[i].lstrip("\n")
            i += 1
            if not token:
                continue
            parts = token.split("\t", 2)
            if len(parts) != 3:
                continue
            added, removed, path = parts
            if path == "":
                # Rename or copy: the old and new paths are the next two tokens.
                if i + 1 >= len(tokens):
                    break
                old, new = tokens[i], tokens[i + 1]
                i += 2
                target = current.get(new, new)
                current[old] = target
                path = new
            churn = (int(added) if added.isdigit() else 0) + (int(removed) if removed.isdigit() else 0)
            target = current.get(path, path)
            touched[target] = touched.get(target, 0) + churn
        for path, churn in touched.items():
            entry = files.setdefault(path, [0, 0])
            entry[0] += 1
            entry[1] += churn
    return files


def _measure(path: Path, window: str, rev: Optional[str], timeout: float) -> ActivityResult:
    quick = min(timeout, GIT_QUICK_TIMEOUT_SECONDS)
    try:
        root = _repo_root(path, quick)
    except GitTimeout as exc:
        return ActivityResult(window, "na", f"Git timed out: {exc}")
    except GitError as exc:
        return ActivityResult(window, "na", f"Git failed: {exc}")
    if root is None:
        return ActivityResult(window, "na", "Not a Git repository")

    try:
        if _git(root, "rev-parse", "--is-shallow-repository", timeout=quick).strip() == "true":
            return ActivityResult(window, "na", "Shallow clone: history is incomplete", repo_root=str(root))
        try:
            sha = _git(root, "rev-parse", "--verify", "--quiet", f"{rev or 'HEAD'}^{{commit}}", timeout=quick).strip()
        except GitTimeout:
            raise
        except GitError:
            return ActivityResult(window, "na", "No commits yet", repo_root=str(root))
        args = ["log", "-z", "--numstat", "--no-merges", "--find-renames", f"--format={_RECORD}%H"]
        since = WINDOWS[window]
        if since:
            args.append(f"--since={since}")
        args.append(sha)
        files = parse_numstat_log(_git(root, *args, timeout=timeout))
    except GitTimeout as exc:
        return ActivityResult(window, "na", f"Git timed out: {exc}", repo_root=str(root))
    except GitError as exc:
        return ActivityResult(window, "na", f"Git failed: {exc}", repo_root=str(root))
    return ActivityResult(window, "ok", head=sha[:7], repo_root=str(root), files=files)


def _dirty_note(root: Path, timeout: float) -> str:
    try:
        changed = [line for line in _git(root, "status", "--porcelain", "--untracked-files=no", timeout=timeout).splitlines() if line.strip()]
    except GitError:
        return ""
    if not changed:
        return ""
    noun = "file has" if len(changed) == 1 else "files have"
    return f"{len(changed)} {noun} uncommitted changes, not counted"


# -- cache -------------------------------------------------------------------


class ActivityCache:
    def __init__(self, directory: Optional[Path] = None) -> None:
        self._directory = directory
        self._memory: OrderedDict[str, ActivityResult] = OrderedDict()
        self._lock = threading.Lock()

    @property
    def directory(self) -> Path:
        if self._directory is not None:
            return self._directory
        from app.services.cache import cache_dir

        return cache_dir().parent / "activity"

    def get(self, key: str) -> Optional[ActivityResult]:
        with self._lock:
            hit = self._memory.get(key)
            if hit is not None:
                self._memory.move_to_end(key)
                return hit
        try:
            with gzip.open(self.directory / f"{key}.json.gz", "rt", encoding="utf-8") as fh:
                result = ActivityResult(**json.load(fh))
        except Exception:  # noqa: BLE001 - a bad entry is a miss
            return None
        self._remember(key, result)
        return result

    def put(self, key: str, result: ActivityResult) -> None:
        self._remember(key, result)
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            target = self.directory / f"{key}.json.gz"
            tmp = target.with_suffix(f".{os.getpid()}.tmp")
            with gzip.open(tmp, "wt", encoding="utf-8") as fh:
                json.dump(asdict(result), fh)
            os.replace(tmp, target)
            entries = sorted(self.directory.glob("*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
            for stale in entries[MAX_DISK_ENTRIES:]:
                stale.unlink(missing_ok=True)
        except Exception as exc:  # noqa: BLE001 - the cache is best-effort
            print(f"⚠️  Could not cache Git activity: {exc}", flush=True)

    def _remember(self, key: str, result: ActivityResult) -> None:
        with self._lock:
            self._memory[key] = result
            self._memory.move_to_end(key)
            while len(self._memory) > MAX_MEMORY_ENTRIES:
                self._memory.popitem(last=False)

    def clear_memory(self) -> None:
        with self._lock:
            self._memory.clear()


activity_cache = ActivityCache()


def _cache_key(root: str, sha: str, window: str) -> str:
    day = "" if window == "all" else time.strftime("%Y-%m-%d", time.gmtime())
    raw = f"format={CACHE_FORMAT};{root};{sha};{window};{day}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def collect(
    path: Path,
    window: Optional[str] = None,
    *,
    rev: Optional[str] = None,
    timeout: float = GIT_LOG_TIMEOUT_SECONDS,
    cache: Optional[ActivityCache] = None,
) -> ActivityResult:
    """
    Activity for the repo containing ``path``, ending at ``rev`` (HEAD by
    default). Never raises for git problems: they come back as ``status="na"``.
    """
    window = normalize_window(window)
    store = cache or activity_cache
    quick = min(timeout, GIT_QUICK_TIMEOUT_SECONDS)
    key = None
    try:
        root = _repo_root(path, quick)
        if root is not None:
            sha = _git(root, "rev-parse", "--verify", "--quiet", f"{rev or 'HEAD'}^{{commit}}", timeout=quick).strip()
            key = _cache_key(str(root), sha, window)
    except GitError:
        root = None
    hit = store.get(key) if key else None
    result = hit if hit is not None else _measure(path, window, rev, timeout)
    if key and hit is None and result.ok:
        store.put(key, result)
    if result.ok and rev is None:
        # Fresh each time: the working tree changes without HEAD moving.
        result = ActivityResult(**{**asdict(result), "note": _dirty_note(Path(result.repo_root), quick)})
    return result


# -- applying to a tree ------------------------------------------------------


def _na(metrics: dict[str, Any], reason: str) -> None:
    for name in ACTIVITY_METRICS:
        metrics[name] = None
    reasons = dict(metrics.get("na_reasons") or {})
    reasons.update({name: reason for name in ACTIVITY_METRICS})
    metrics["na_reasons"] = reasons


def _measured(metrics: dict[str, Any], commits: int, churn: int) -> None:
    metrics["commit_count"], metrics["churn_lines"] = commits, churn
    reasons = {k: v for k, v in (metrics.get("na_reasons") or {}).items() if k not in ACTIVITY_METRICS}
    metrics["na_reasons"] = reasons or None


def apply_to_tree(tree: dict[str, Any], result: ActivityResult, repo_path_of: Callable[[str], Optional[str]]) -> dict[str, Any]:
    """
    Set ``commit_count`` / ``churn_lines`` on every file in a ``Node`` JSON
    tree and sum them into folders. ``repo_path_of`` maps a node's ``path``
    to its repo-relative path (None when it is outside the repo). Scopes keep
    N/A: Git history is per file. The root also gets ``activity`` (status,
    window, note). Mutates and returns ``tree``.
    """

    def visit(node: dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
        metrics = node.setdefault("metrics", {})
        kind = node.get("type")
        if kind == "file":
            rel = repo_path_of(node.get("path", ""))
            if not result.ok:
                _na(metrics, result.reason)
            elif rel is None:
                _na(metrics, "Outside the Git repository")
            else:
                _measured(metrics, *result.files.get(rel, (0, 0)))
            return metrics.get("commit_count"), metrics.get("churn_lines")
        if kind != "folder":
            return None, None
        commits = churn = None
        for child in node.get("children") or []:
            c, ch = visit(child)
            if c is not None:
                commits = (commits or 0) + c
                churn = (churn or 0) + (ch or 0)
        if commits is None:
            _na(metrics, result.reason if not result.ok else "No file below has Git history")
        else:
            _measured(metrics, commits, churn or 0)
        return commits, churn

    visit(tree)
    tree["activity"] = result.info()
    return tree


def scan_path_mapper(scan_root: Path, result: ActivityResult) -> Callable[[str], Optional[str]]:
    """Map absolute node paths under ``scan_root`` to repo-relative paths."""
    root_str = str(scan_root)
    prefix = ""
    if result.repo_root:
        try:
            rel = scan_root.resolve().relative_to(Path(result.repo_root))
        except ValueError:
            return lambda _path: None
        prefix = "" if str(rel) == "." else rel.as_posix() + "/"

    def repo_path_of(path: str) -> Optional[str]:
        if path.startswith(root_str + os.sep):
            return prefix + path[len(root_str) + 1 :].replace(os.sep, "/")
        if path == root_str and scan_root.is_file():
            return prefix.rstrip("/") or scan_root.name
        return None

    return repo_path_of


def apply_to_scan(tree: dict[str, Any], scan_root: Path, window: Optional[str] = None, **kwargs: Any) -> dict[str, Any]:
    """Collect activity for ``scan_root`` and lay it over its scan tree."""
    result = collect(scan_root, window, **kwargs)
    return apply_to_tree(tree, result, scan_path_mapper(scan_root, result))


# -- evidence ----------------------------------------------------------------


def recent_commits(file_path: Path, limit: int = RECENT_COMMITS, timeout: float = GIT_QUICK_TIMEOUT_SECONDS) -> dict[str, Any]:
    """
    The last ``limit`` non-merge commits touching ``file_path`` (following
    renames): ``{"status", "reason", "commits": [{sha, short, date, author, subject}]}``.
    """
    try:
        root = _repo_root(file_path, timeout)
        if root is None:
            return {"status": "na", "reason": "Not a Git repository", "commits": []}
        rel = file_path.resolve().relative_to(root).as_posix()
        out = _git(
            root,
            "log",
            f"-n{limit}",
            "--no-merges",
            "--follow",
            f"--format={_RECORD}%H{_FIELD}%h{_FIELD}%aI{_FIELD}%an{_FIELD}%s",
            "--",
            rel,
            timeout=timeout,
        )
    except GitTimeout as exc:
        return {"status": "na", "reason": f"Git timed out: {exc}", "commits": []}
    except (GitError, ValueError) as exc:
        return {"status": "na", "reason": f"Git failed: {exc}", "commits": []}
    commits = []
    for record in out.split(_RECORD):
        record = record.strip()
        if not record:
            continue
        sha, short, date, author, subject = (record.split(_FIELD) + [""] * 5)[:5]
        commits.append({"sha": sha, "short": short, "date": date, "author": author, "subject": subject})
    return {"status": "ok", "reason": "", "commits": commits}


def iter_windows() -> Iterable[dict[str, str]]:
    for wid in WINDOWS:
        yield {"id": wid, "label": WINDOW_LABELS[wid]}
