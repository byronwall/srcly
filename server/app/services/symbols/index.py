"""
The symbol index of a root: every language's symbols and references merged,
member references settled, built once and cached by the files' mtimes (like
the dependency graph), and queried for a symbol's neighbourhood.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

from app.models import SymbolGraph, SymbolGraphEdge, SymbolGraphNode, SymbolIndexInfo, SymbolPath, SymbolSearchHit
from app.services.deps.common import is_test_path, walk_source_files
from app.services.deps.typescript_deps import TS_EXTENSIONS
from app.services.symbols.model import BUILTIN_MEMBERS, REF_KINDS, FileSymbols, PendingMember, RefKind, Reference, Symbol

# Lines kept per merged edge in a response.
MAX_EDGE_LINES = 12
# Nodes a neighbourhood answers with before it reports itself truncated.
MAX_NEIGHBOURHOOD = 400
# Steps a path search gives up after.
MAX_PATH_STEPS = 16


@dataclass
class SymbolIndex:
    root: Path
    symbols: Dict[str, Symbol]
    references: List[Reference]
    out: Dict[str, List[int]] = field(default_factory=lambda: defaultdict(list))
    inc: Dict[str, List[int]] = field(default_factory=lambda: defaultdict(list))
    files: int = 0
    unresolved_members: int = 0
    built_ms: int = 0
    # member name → ids of every method / field with that name, for name-only resolution
    members_by_name: Dict[str, List[str]] = field(default_factory=lambda: defaultdict(list))

    def __post_init__(self) -> None:
        for i, r in enumerate(self.references):
            self.out[r.source].append(i)
            self.inc[r.target].append(i)

    def is_test(self, sym: Symbol) -> bool:
        return is_test_path(sym.file)

    # ---- queries ----

    def members_of(self, focus: str) -> List[str]:
        """A class's or variable's members, or a module's top-level symbols: drawn with the focus, as its frame."""
        sym = self.symbols.get(focus)
        if sym is None:
            return []
        if sym.kind == "module":
            return [s.id for s in self.symbols.values() if s.file == sym.file and s.kind != "module" and s.container is None]
        return list(sym.members.values())

    def neighbourhood(
        self,
        focus: str,
        hops: int = 1,
        kinds: Optional[Iterable[RefKind]] = None,
        include_tests: bool = True,
        direction: str = "both",
        members: bool = True,
        more: Iterable[str] = (),
    ) -> Optional[SymbolGraph]:
        """
        The focus (with its members at hop 0 when `members`), every symbol within `hops`
        references of them, the one-hop neighbourhoods of the `more` symbols (hops opened
        in place), and the references among them all.
        """
        if focus not in self.symbols:
            return None
        allowed: Set[str] = set(kinds) if kinds else set(REF_KINDS)
        seen: Dict[str, int] = {focus: 0}
        if members:
            for m in self.members_of(focus):
                seen.setdefault(m, 0)
        queue = deque(seen)
        # An opened hop: its own neighbourhood, one hop deep, whatever the focus's hops.
        limit: Dict[str, int] = {}
        truncated = False
        while queue:
            cur = queue.popleft()
            depth = seen[cur]
            if depth >= limit.get(cur, hops):
                if cur in more and cur not in limit:
                    limit[cur] = depth + 1
                else:
                    continue
            nexts: List[str] = []
            if direction in ("both", "out"):
                nexts += [self.references[i].target for i in self.out[cur] if self.references[i].kind in allowed]
            if direction in ("both", "in"):
                nexts += [self.references[i].source for i in self.inc[cur] if self.references[i].kind in allowed]
            for n in nexts:
                if n in seen:
                    continue
                sym = self.symbols.get(n)
                if sym is None or (not include_tests and self.is_test(sym)):
                    continue
                if len(seen) >= MAX_NEIGHBOURHOOD:
                    truncated = True
                    break
                seen[n] = depth + 1
                queue.append(n)
            if truncated:
                break
        for opened in more:
            if opened in seen and opened not in limit and seen[opened] >= hops:
                limit[opened] = seen[opened] + 1
                queue.append(opened)
        while queue:
            cur = queue.popleft()
            depth = seen[cur]
            if depth >= limit.get(cur, hops):
                continue
            nexts = [self.references[i].target for i in self.out[cur] if self.references[i].kind in allowed] + [
                self.references[i].source for i in self.inc[cur] if self.references[i].kind in allowed
            ]
            for n in nexts:
                if n in seen:
                    continue
                sym = self.symbols.get(n)
                if sym is None or (not include_tests and self.is_test(sym)):
                    continue
                if len(seen) >= MAX_NEIGHBOURHOOD:
                    truncated = True
                    break
                seen[n] = depth + 1
            if truncated:
                break
        return self._graph(focus, seen, allowed, truncated)

    def path(self, start: str, end: str, kinds: Optional[Iterable[RefKind]] = None, include_tests: bool = True, max_steps: int = MAX_PATH_STEPS) -> Optional[SymbolPath]:
        """
        The shortest chain of references from `start` to `end`: forward first (start
        references … references end), else backward, else none. Each step's merged
        edge carries its lines; the nodes' `hop` is their position on the chain.
        """
        if start not in self.symbols or end not in self.symbols:
            return None
        allowed: Set[str] = set(kinds) if kinds else set(REF_KINDS)
        for direction in ("forward", "backward"):
            chain = self._shortest(start, end, allowed, include_tests, max_steps, direction)
            if chain is not None:
                nodes = [self._node(self.symbols[sid], i) for i, sid in enumerate(chain)]
                edges: List[SymbolGraphEdge] = []
                for a, b in zip(chain, chain[1:]):
                    source, target = (a, b) if direction == "forward" else (b, a)
                    edges.extend(self._merged_edges(source, target, allowed))
                return SymbolPath(root=str(self.root), start=start, end=end, found=True, direction=direction, steps=len(chain) - 1, nodes=nodes, edges=edges, index=self.info())
        return SymbolPath(root=str(self.root), start=start, end=end, found=False, direction=None, steps=0, nodes=[self._node(self.symbols[start], 0), self._node(self.symbols[end], 0)], edges=[], index=self.info())

    def _shortest(self, start: str, end: str, allowed: Set[str], include_tests: bool, max_steps: int, direction: str) -> Optional[List[str]]:
        """Breadth-first over references in one direction; the chain of ids, or None within `max_steps`."""
        if start == end:
            return [start]
        parent: Dict[str, Optional[str]] = {start: None}
        queue = deque([(start, 0)])
        while queue:
            cur, depth = queue.popleft()
            if depth >= max_steps:
                continue
            refs = self.out[cur] if direction == "forward" else self.inc[cur]
            for i in refs:
                r = self.references[i]
                if r.kind not in allowed:
                    continue
                n = r.target if direction == "forward" else r.source
                if n in parent:
                    continue
                sym = self.symbols.get(n)
                if sym is None or (not include_tests and self.is_test(sym) and n != end):
                    continue
                parent[n] = cur
                if n == end:
                    chain = [n]
                    while parent[chain[-1]] is not None:
                        chain.append(parent[chain[-1]])  # type: ignore[arg-type]
                    return list(reversed(chain))
                queue.append((n, depth + 1))
        return None

    def _merged_edges(self, source: str, target: str, allowed: Set[str]) -> List[SymbolGraphEdge]:
        """Every kind of reference from source to target as one merged edge each."""
        merged: Dict[str, SymbolGraphEdge] = {}
        for i in self.out[source]:
            r = self.references[i]
            if r.target != target or r.kind not in allowed:
                continue
            e = merged.get(r.kind)
            if e is None:
                merged[r.kind] = SymbolGraphEdge(source=source, target=target, kind=r.kind, lines=[r.line], count=1, resolution=r.resolution)
            else:
                e.count += 1
                if r.line not in e.lines and len(e.lines) < MAX_EDGE_LINES:
                    e.lines.append(r.line)
                e.resolution = _weaker(e.resolution, r.resolution)
        for e in merged.values():
            e.lines.sort()
        return list(merged.values())

    def _graph(self, focus: str, chosen: Dict[str, int], allowed: Set[str], truncated: bool) -> SymbolGraph:
        nodes = [self._node(self.symbols[sid], hop) for sid, hop in chosen.items()]
        merged: Dict[Tuple[str, str, str], SymbolGraphEdge] = {}
        for sid in chosen:
            for i in self.out[sid]:
                r = self.references[i]
                if r.target not in chosen or r.kind not in allowed:
                    continue
                key = (r.source, r.target, r.kind)
                e = merged.get(key)
                if e is None:
                    merged[key] = SymbolGraphEdge(source=r.source, target=r.target, kind=r.kind, lines=[r.line], count=1, resolution=r.resolution)
                else:
                    e.count += 1
                    if r.line not in e.lines and len(e.lines) < MAX_EDGE_LINES:
                        e.lines.append(r.line)
                    # One name-only reference makes the merged edge name-only: say the weakest.
                    e.resolution = _weaker(e.resolution, r.resolution)
        for e in merged.values():
            e.lines.sort()
        return SymbolGraph(root=str(self.root), focus=focus, nodes=nodes, edges=list(merged.values()), truncated=truncated or None, index=self.info())

    def _node(self, sym: Symbol, hop: Optional[int] = None) -> SymbolGraphNode:
        in_refs = self.inc.get(sym.id, [])
        out_refs = self.out.get(sym.id, [])
        return SymbolGraphNode(
            id=sym.id,
            name=sym.name,
            kind=sym.kind,
            file=sym.file,
            line=sym.line,
            end_line=sym.end_line,
            container=sym.container,
            exported=sym.exported or None,
            is_test=self.is_test(sym) or None,
            language=sym.language,
            in_count=len({self.references[i].source for i in in_refs}),
            out_count=len({self.references[i].target for i in out_refs}),
            hop=hop,
        )

    def search(self, query: str, limit: int = 30, include_tests: bool = True) -> List[SymbolSearchHit]:
        """Symbols whose name or qualified name contains the query, best match first."""
        q = query.strip().lower()
        if not q:
            return []
        scored: List[Tuple[int, int, str, Symbol]] = []
        for sym in self.symbols.values():
            if sym.kind == "module" or (not include_tests and self.is_test(sym)):
                continue
            name = sym.name.lower()
            qualified = sym.qualified.lower()
            if name == q:
                rank = 0
            elif name.startswith(q):
                rank = 1
            elif qualified.startswith(q) or f".{q}" in f".{qualified}":
                rank = 2
            elif q in name:
                rank = 3
            elif q in qualified or q in sym.file.lower():
                rank = 4
            else:
                continue
            refs = len(self.inc.get(sym.id, ())) + len(self.out.get(sym.id, ()))
            scored.append((rank, -refs, sym.id, sym))
        scored.sort()
        return [
            SymbolSearchHit(id=s.id, name=s.name, kind=s.kind, file=s.file, line=s.line, container=s.container, in_count=len(self.inc.get(s.id, ())), out_count=len(self.out.get(s.id, ())))
            for _r, _n, _i, s in scored[:limit]
        ]

    def info(self) -> SymbolIndexInfo:
        return SymbolIndexInfo(
            symbols=sum(1 for s in self.symbols.values() if s.kind != "module"),
            references=len(self.references),
            files=self.files,
            unresolved_members=self.unresolved_members,
            built_ms=self.built_ms,
        )


_ORDER = {"exact": 0, "typed": 1, "name": 2}


def _weaker(a: str, b: str) -> str:
    return a if _ORDER.get(a, 0) >= _ORDER.get(b, 0) else b


# ---- building ----


def assemble(root: Path, parts: List[FileSymbols]) -> SymbolIndex:
    """Merge every file's symbols, settle member references, drop references to nothing."""
    started = time.monotonic()
    symbols: Dict[str, Symbol] = {}
    for part in parts:
        for sym in part.symbols:
            symbols.setdefault(sym.id, sym)
    for part in parts:
        for cls, bases in part.bases.items():
            if cls in symbols:
                symbols[cls].bases = [b for b in bases if b in symbols]
    members_by_name: Dict[str, List[str]] = defaultdict(list)
    for sym in symbols.values():
        if sym.kind in ("method", "field"):
            members_by_name[sym.name].append(sym.id)

    references: List[Reference] = []
    unresolved = 0
    for part in parts:
        for r in part.references:
            if r.target in symbols and r.source in symbols:
                if r.kind == "call" and symbols[r.target].kind == "class":
                    r.kind = "instantiate"  # Python: a class called is a class instantiated
                references.append(r)
                _note_base(r, symbols)
    # Bases written as members (`class Sub(models.Node)`) settle before anything that walks bases.
    for part in parts:
        for p in part.pending:
            if p.kind == "extends":
                settled = _settle(p, symbols, members_by_name)
                if settled is not None:
                    _note_base(settled, symbols)
    for part in parts:
        for p in part.pending:
            settled = _settle(p, symbols, members_by_name)
            if settled is None:
                # Only a member some symbol of the index has is "unresolved"; `console.log` is a library.
                if p.member in members_by_name:
                    unresolved += 1
            elif settled.source in symbols and settled.source != settled.target:
                references.append(settled)

    index = SymbolIndex(root=root, symbols=symbols, references=references, files=len(parts), unresolved_members=unresolved)
    index.members_by_name = members_by_name
    index.built_ms = int((time.monotonic() - started) * 1000)
    return index


def _note_base(r: Reference, symbols: Dict[str, Symbol]) -> None:
    if r.kind == "extends":
        cls = symbols.get(r.source)
        if cls is not None and cls.kind == "class" and r.target not in cls.bases:
            cls.bases.append(r.target)


def _member_of(cls: Symbol, name: str, symbols: Dict[str, Symbol], skip_self: bool = False, depth: int = 0) -> Optional[str]:
    """A member by name on a class or on the classes it extends."""
    if depth > 12:
        return None
    if not skip_self and name in cls.members:
        return cls.members[name]
    for base in cls.bases:
        b = symbols.get(base)
        if b is not None:
            hit = _member_of(b, name, symbols, False, depth + 1)
            if hit:
                return hit
    return None


def _settle(p: PendingMember, symbols: Dict[str, Symbol], members_by_name: Dict[str, List[str]]) -> Optional[Reference]:
    receiver = symbols.get(p.receiver) if p.receiver else None
    if receiver is not None:
        resolution = "typed" if p.receiver_note == "typed" else "exact"
        if receiver.kind == "module":
            hit = symbols.get(f"{receiver.id}#{p.member}")
            if hit is not None:
                return Reference(p.source, hit.id, p.kind, p.line, resolution)
            return None
        if receiver.kind == "class":
            hit = _member_of(receiver, p.member, symbols, skip_self=p.receiver_note == "super")
            if hit:
                return Reference(p.source, hit, p.kind, p.line, resolution)
            if p.receiver_note in ("this", "super"):
                return None  # an inherited member from outside the index, or a library base
        elif receiver.kind in ("variable", "field"):
            if p.member in receiver.members:
                return Reference(p.source, receiver.members[p.member], p.kind, p.line, resolution)
            cls = symbols.get(receiver.typed_as or "")
            if cls is not None and cls.kind == "class":
                hit = _member_of(cls, p.member, symbols)
                if hit:
                    return Reference(p.source, hit, p.kind, p.line, "typed")
            elif receiver.typed_as is None and p.receiver_note == "":
                # An untyped import or module variable: reading a property is a read of it.
                return Reference(p.source, receiver.id, _demote(p.kind), p.line, resolution)
        elif receiver.kind == "enum":
            return Reference(p.source, receiver.id, "read", p.line, resolution)
        elif receiver.kind in ("function", "type"):
            return Reference(p.source, receiver.id, _demote(p.kind), p.line, resolution)
    # By name alone: a call (not a property read, which `.id` or `.name` would match everywhere) of a
    # member no builtin has, when exactly one symbol of the index has it.
    if p.kind in ("call", "instantiate") and p.member not in BUILTIN_MEMBERS:
        candidates = members_by_name.get(p.member, [])
        if len(candidates) == 1:
            return Reference(p.source, candidates[0], p.kind, p.line, "name")
    return None


def _demote(kind: RefKind) -> RefKind:
    """A property of a non-class symbol: `helper.calls = 2` writes helper; `helper.calls()` reads it."""
    return "write" if kind == "write" else "read"


_cache: Dict[Path, Tuple[Tuple[int, int], SymbolIndex]] = {}
_lock = threading.Lock()

SOURCE_EXTENSIONS = TS_EXTENSIONS | {".py"}


def _signature(files: List[Path]) -> Tuple[int, int]:
    total = 0
    for f in files:
        try:
            total ^= hash((str(f), f.stat().st_mtime_ns))
        except OSError:
            continue
    return len(files), total


def build_symbol_index(root: Path, use_cache: bool = True) -> SymbolIndex:
    root = root.resolve()
    files = walk_source_files(root, SOURCE_EXTENSIONS)
    sig = _signature(files)
    if use_cache:
        with _lock:
            hit = _cache.get(root)
        if hit is not None and hit[0] == sig:
            return hit[1]
    parts: List[FileSymbols] = []
    ts_files = [f for f in files if f.suffix in TS_EXTENSIONS]
    if ts_files:
        from app.services.symbols.typescript import extract_ts

        ts_parts, _program = extract_ts(root, ts_files)
        parts.extend(ts_parts)
    py_files = [f for f in files if f.suffix == ".py"]
    if py_files:
        from app.services.symbols.python import extract_py

        py_parts, _py_program = extract_py(root, py_files)
        parts.extend(py_parts)
    index = assemble(root, parts)
    if use_cache:
        with _lock:
            _cache[root] = (sig, index)
    return index
