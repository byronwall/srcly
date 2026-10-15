"""
Turn a resolved ref into a scanned side: a metrics tree plus a dependency graph.

A commit is checked out with ``git worktree add --detach`` into srcly's cache
directory (never inside the repo), scanned with the normal pipeline, and
removed again, so the user's checkout, branch, index, and stash are never
touched. A commit never changes, so its result is cached by SHA with no
fingerprint walk. The working tree is scanned in place and uses the regular
path + mtime analysis cache.

Every path in a side is repo-relative (POSIX), so the two sides line up even
though they were scanned from different directories.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator, Optional

from app.models import Node
from app.services import analysis, cache
from app.services.compare.git_refs import GitError, ResolvedRef, run_git
from app.services.deps.graph import build_dependency_graph
from app.services.scan_progress import NULL_OBSERVER, ScanObserver
from app.services.scan_workers import CancelToken

SIDE_FORMAT = 1
MAX_SIDE_ENTRIES = 40
# Snapshot checkouts older than this are leftovers from a killed process.
STALE_SNAPSHOT_SECONDS = 3600


@dataclass
class Side:
    ref: ResolvedRef
    tree: dict[str, Any]
    """Metrics tree (``Node`` JSON) with repo-relative paths."""
    graph: dict[str, Any]
    """Dependency graph JSON (``DepGraph``, by alias) with repo-relative ids."""
    files_total: int
    scan_seconds: float
    cached: bool


def _repo_key(repo: Path) -> str:
    return hashlib.sha256(str(repo.resolve()).encode()).hexdigest()[:16]


class SideCache:
    """Gzipped side JSON keyed by repo + commit SHA + srcly version."""

    def __init__(self, directory: Optional[Path] = None) -> None:
        self._directory = directory
        self._lock = threading.Lock()

    @property
    def directory(self) -> Path:
        return self._directory or cache.cache_dir().parent / "compare"

    def _path(self, repo: Path, sha: str) -> Path:
        version = cache._srcly_version()
        key = hashlib.sha256(f"{repo.resolve()}\0{sha}\0{version}\0{SIDE_FORMAT}".encode()).hexdigest()[:32]
        return self.directory / f"{key}.json.gz"

    def load(self, repo: Path, ref: ResolvedRef) -> Optional[Side]:
        if ref.sha is None:
            return None
        path = self._path(repo, ref.sha)
        try:
            payload = json.loads(gzip.decompress(path.read_bytes()))
            if payload.get("format") != SIDE_FORMAT or payload.get("sha") != ref.sha:
                return None
            os.utime(path)  # keep recently used entries through pruning
        except (OSError, ValueError, EOFError, gzip.BadGzipFile):
            return None
        return Side(
            ref=ref,
            tree=payload["tree"],
            graph=payload["graph"],
            files_total=int(payload.get("files_total", 0)),
            scan_seconds=float(payload.get("scan_seconds", 0.0)),
            cached=True,
        )

    def save(self, repo: Path, side: Side) -> None:
        if side.ref.sha is None:
            return
        path = self._path(repo, side.ref.sha)
        payload = {
            "format": SIDE_FORMAT,
            "sha": side.ref.sha,
            "tree": side.tree,
            "graph": side.graph,
            "files_total": side.files_total,
            "scan_seconds": side.scan_seconds,
        }
        try:
            with self._lock:
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
                tmp.write_bytes(gzip.compress(json.dumps(payload).encode(), compresslevel=1))
                os.replace(tmp, path)
                entries = sorted(path.parent.glob("*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
                for old in entries[MAX_SIDE_ENTRIES:]:
                    old.unlink(missing_ok=True)
        except OSError as exc:
            print(f"⚠️  Could not cache compare side {side.ref.label}: {exc}", flush=True)


side_cache = SideCache()


def snapshots_dir() -> Path:
    return cache.cache_dir().parent / "snapshots"


@contextmanager
def snapshot_checkout(repo: Path, sha: str) -> Iterator[Path]:
    """A detached, temporary checkout of ``sha``; removed on exit, even on error."""
    base = snapshots_dir()
    base.mkdir(parents=True, exist_ok=True)
    _prune_stale_snapshots(repo, base)
    target = base / f"{_repo_key(repo)}-{sha[:12]}-{os.getpid()}-{threading.get_ident()}"
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    # Hooks off: a post-checkout hook (husky, lefthook) must not run for a snapshot.
    run_git(repo, "-c", "core.hooksPath=/dev/null", "worktree", "add", "--detach", "--quiet", str(target), sha)
    try:
        yield target
    finally:
        _remove_checkout(repo, target)


def _remove_checkout(repo: Path, target: Path) -> None:
    try:
        run_git(repo, "worktree", "remove", "--force", str(target))
    except GitError:
        shutil.rmtree(target, ignore_errors=True)
        try:
            run_git(repo, "worktree", "prune")
        except GitError:
            pass


def _prune_stale_snapshots(repo: Path, base: Path) -> None:
    prefix = f"{_repo_key(repo)}-"
    now = time.time()
    stale = False
    for entry in base.iterdir():
        if not entry.name.startswith(prefix):
            continue
        try:
            age = now - entry.stat().st_mtime
        except OSError:
            continue
        if age > STALE_SNAPSHOT_SECONDS:
            _remove_checkout(repo, entry)
            stale = True
    if stale:
        try:
            run_git(repo, "worktree", "prune")
        except GitError:
            pass


def relativize_tree(tree: dict[str, Any], root: Path, name: str) -> dict[str, Any]:
    """Rewrite every ``path`` in a ``Node`` JSON tree to be relative to ``root``."""
    root_str = str(root.resolve())

    def rel(path: str) -> str:
        if path == root_str:
            return ""
        if path.startswith(root_str + os.sep):
            return path[len(root_str) + 1 :].replace(os.sep, "/")
        return path

    def walk(node: dict[str, Any]) -> None:
        node["path"] = rel(node.get("path", ""))
        for child in node.get("children") or []:
            walk(child)

    walk(tree)
    tree["name"] = name
    return tree


def graph_json(root: Path, *, keep_abs_paths: bool, use_cache: bool) -> dict[str, Any]:
    graph = build_dependency_graph(root, use_cache=use_cache).model_dump(
        mode="json", by_alias=True, exclude_none=True
    )
    if not keep_abs_paths:
        for node in graph["nodes"]:
            node.pop("absPath", None)
    return graph


def _tree_json(tree: Node) -> dict[str, Any]:
    return json.loads(tree.model_dump_json(by_alias=True))


def load_side(
    repo: Path,
    ref: ResolvedRef,
    *,
    cancel: Optional[CancelToken] = None,
    observer: ScanObserver = NULL_OBSERVER,
    force: bool = False,
    side_cache_: Optional[SideCache] = None,
    on_step: Callable[[Optional[str]], None] = lambda _step: None,
) -> Side:
    """
    Scan one side, from cache when possible. ``on_step`` hears each step as it
    starts (``cache``, ``checkout``, ``scan``, ``graph``, ``cleanup``) so callers
    can time where a cold side spends its time.
    """
    store = side_cache_ or side_cache
    repo = repo.resolve()
    if ref.is_worktree:
        return _load_worktree(repo, ref, cancel=cancel, observer=observer, force=force, on_step=on_step)

    if not force:
        on_step("cache")
        hit = store.load(repo, ref)
        if hit is not None:
            return hit

    started = time.monotonic()
    on_step("checkout")
    with snapshot_checkout(repo, ref.sha) as checkout:
        on_step("scan")
        tree = analysis.scan_codebase(checkout, verbose=False, cancel=cancel, observer=observer)
        on_step("graph")
        graph = graph_json(checkout, keep_abs_paths=False, use_cache=False)
        tree_json = relativize_tree(_tree_json(tree), checkout, repo.name)
        on_step("cleanup")
    side = Side(
        ref=ref,
        tree=tree_json,
        graph=graph,
        files_total=int(tree.metrics.file_count),
        scan_seconds=round(time.monotonic() - started, 3),
        cached=False,
    )
    store.save(repo, side)
    return side


def _load_worktree(
    repo: Path,
    ref: ResolvedRef,
    *,
    cancel: Optional[CancelToken],
    observer: ScanObserver,
    force: bool,
    on_step: Callable[[Optional[str]], None] = lambda _step: None,
) -> Side:
    started = time.monotonic()
    on_step("cache")
    entry = None if force else cache.analysis_cache.load(repo)
    if entry is not None:
        tree_json = json.loads(entry.data)
        files_total, cached = entry.files_total, True
    else:
        fingerprint = cache.fingerprint(repo)
        on_step("scan")
        tree = analysis.scan_codebase(repo, verbose=False, cancel=cancel, observer=observer)
        data = tree.model_dump_json(by_alias=True).encode()
        files_total = int(tree.metrics.file_count)
        cache.analysis_cache.save(
            repo, fingerprint, data, files_total=files_total, scan_seconds=time.monotonic() - started
        )
        tree_json, cached = json.loads(data), False
    on_step("graph")
    graph = graph_json(repo, keep_abs_paths=True, use_cache=True)
    return Side(
        ref=ref,
        tree=relativize_tree(tree_json, repo, repo.name),
        graph=graph,
        files_total=files_total,
        scan_seconds=round(time.monotonic() - started, 3),
        cached=cached,
    )
