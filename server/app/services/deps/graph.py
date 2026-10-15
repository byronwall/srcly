"""Build the language-neutral hierarchical dependency graph for a folder."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.models import DepGraph, DepGraphEdge, DepGraphNode
from app.services.deps.common import DepEdge, is_test_path, unique, walk_source_files
from app.services.deps.typescript_deps import TS_EXTENSIONS, build_ts_edges

EXTERNAL_ROOT_ID = "ext:"

_cache: Dict[Path, Tuple[Tuple[int, int], DepGraph]] = {}
_lock = threading.Lock()


def _language(path: Path) -> str:
    if path.suffix in TS_EXTENSIONS:
        return "ts"
    if path.suffix == ".py":
        return "py"
    return "other"


def _signature(files: List[Path]) -> Tuple[int, int]:
    total = 0
    for f in files:
        try:
            total ^= hash((str(f), f.stat().st_mtime_ns))
        except OSError:
            continue
    return len(files), total


def collect_edges(root: Path) -> Tuple[List[Path], List[DepEdge], Dict[str, list]]:
    """Run every language extractor. Returns files, edges and per-file symbol defs."""
    ts_files = walk_source_files(root, TS_EXTENSIONS)
    edges: List[DepEdge] = []
    symbols: Dict[str, list] = {}
    files: List[Path] = list(ts_files)

    if ts_files:
        ts_edges, ts_infos = build_ts_edges(root, ts_files)
        edges.extend(ts_edges)
        for f, info in ts_infos.items():
            symbols[str(f)] = info.declarations

    try:
        from app.services.deps.python_deps import PY_EXTENSIONS, build_py_edges
    except ImportError:  # pragma: no cover - Python support lands separately
        build_py_edges = None
        PY_EXTENSIONS = set()
    if build_py_edges is not None:
        py_files = walk_source_files(root, PY_EXTENSIONS)
        if py_files:
            py_edges, py_symbols, _infos, _index = build_py_edges(root, py_files)
            edges.extend(py_edges)
            symbols.update(py_symbols)
            files.extend(py_files)
    return files, edges, symbols


def build_dependency_graph(root: Path, use_cache: bool = True) -> DepGraph:
    root = root.resolve()
    if use_cache:
        files_now = walk_source_files(root, TS_EXTENSIONS | {".py"})
        sig = _signature(files_now)
        with _lock:
            hit = _cache.get(root)
        if hit is not None and hit[0] == sig:
            return hit[1]
    files, edges, symbols = collect_edges(root)
    graph = _assemble(root, files, edges, symbols)
    if use_cache:
        with _lock:
            _cache[root] = (sig, graph)
    return graph


def _assemble(root: Path, files: List[Path], edges: List[DepEdge], symbols: Optional[Dict[str, list]] = None) -> DepGraph:
    nodes: Dict[str, DepGraphNode] = {}
    nodes[""] = DepGraphNode(id="", kind="folder", name=root.name or str(root), parent=None, path="", abs_path=str(root))

    def ensure_folder(rel_dir: str) -> str:
        if rel_dir == "" or rel_dir in nodes:
            return rel_dir
        parent, _, name = rel_dir.rpartition("/")
        ensure_folder(parent)
        nodes[rel_dir] = DepGraphNode(
            id=rel_dir, kind="folder", name=name, parent=parent, path=rel_dir, abs_path=str(root / rel_dir)
        )
        return rel_dir

    def rel(p: Path) -> Optional[str]:
        try:
            return p.relative_to(root).as_posix()
        except ValueError:
            return None

    for f in files:
        r = rel(f)
        if r is None:
            continue
        parent, _, name = r.rpartition("/")
        nodes[r] = DepGraphNode(
            id=r,
            kind="file",
            name=name,
            parent=ensure_folder(parent),
            path=r,
            abs_path=str(f),
            language=_language(f),
            is_test=is_test_path(r),
        )

    defs = {path: {d.name: d for d in ds} for path, ds in (symbols or {}).items()}

    def symbol_node(file_path: Path, file_id: str, name: Optional[str]) -> str:
        """Id of a symbol node (created on first use), or the file id."""
        if not name:
            return file_id
        d = defs.get(str(file_path), {}).get(name)
        if d is None:
            return file_id
        sid = f"{file_id}#{name}"
        if sid not in nodes:
            nodes[sid] = DepGraphNode(
                id=sid, kind="symbol", name=name, parent=file_id, symbol_kind=d.kind, line=d.line
            )
        return sid

    merged: Dict[Tuple[str, str], DepGraphEdge] = {}
    for e in edges:
        s = rel(e.source) if isinstance(e.source, Path) else None
        if s is None or s not in nodes:
            continue
        s = symbol_node(e.source, s, e.source_symbol)
        if isinstance(e.target, Path):
            t = rel(e.target)
            if t is None or t not in nodes:
                continue
            t = symbol_node(e.target, t, e.target_symbol)
        else:
            t = f"{EXTERNAL_ROOT_ID}{e.target}"
            if t not in nodes:
                if EXTERNAL_ROOT_ID not in nodes:
                    nodes[EXTERNAL_ROOT_ID] = DepGraphNode(
                        id=EXTERNAL_ROOT_ID, kind="folder", name="external packages", parent=""
                    )
                nodes[t] = DepGraphNode(id=t, kind="external", name=e.target, parent=EXTERNAL_ROOT_ID)
        if s == t:
            continue
        key = (s, t)
        cur = merged.get(key)
        if cur is None:
            merged[key] = DepGraphEdge(
                source=s,
                target=t,
                symbols=unique(e.symbols) or None,
                type_only=e.type_only or None,
                via_barrel=e.via_barrel or None,
            )
        else:
            cur.symbols = unique([*(cur.symbols or []), *e.symbols]) or None
            # An edge is type-only only if every import behind it is.
            cur.type_only = (cur.type_only and e.type_only) or None
            cur.via_barrel = (cur.via_barrel or e.via_barrel) or None

    return DepGraph(root="", nodes=list(nodes.values()), edges=list(merged.values()))
