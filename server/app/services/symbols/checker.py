"""
TypeScript references bound by the data-flow engine's checker (``symbolRefs``),
joined to the tree-sitter index's own ids (docs/intent/checker-symbol-index).

Tree-sitter keeps every declaration and id. The checker says, for each
identifier, which declaration TypeScript binds: a file, a name, the line of
the name and a meaning (``value`` or ``type``). The join picks the innermost
tree-sitter symbol of that file and name whose lines hold that line, on the
side the meaning asks for (``file#A`` or ``file#A@type``). A reference's source
is the declaration the checker says it sits in, joined the same way; failing
that, the innermost symbol whose lines hold the reference. An unbound reference
stays out of the graph and is counted by reason.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from app.services.dataflow.models import SymbolRefsResult, SymbolRefTarget
from app.services.symbols.model import Reference, Symbol
from app.services.symbols.typescript import TYPE_ID_SUFFIX


@dataclass
class CheckerRefs:
    """What the checker bound, joined to tree-sitter ids, and how much of it did not join."""

    files: Set[str]
    references: List[Reference]
    unbound: Counter = field(default_factory=Counter)  # reason → count
    # A module-scope declaration the checker binds that no tree-sitter symbol holds: a mapping bug, listed.
    mismatched: List[str] = field(default_factory=list)
    # Every bound name's position, edges or not (an import clause's name, a recursive call):
    # (file, line) → [(column, end column, symbol id)], for Show references.
    positions: Dict[Tuple[str, int], List[Tuple[int, int, str]]] = field(default_factory=lambda: defaultdict(list))
    generation: Optional[int] = None
    program_hash: Optional[str] = None


# Reasons the checker will still be missing on the next request: the index may cache its fallback.
LASTING = frozenset({"python-root", "node-not-found", "engine-missing", "no-tsconfig", "no-ts-files", "typescript-not-found", "engine-protocol-mismatch"})


def still_missing(root: Path, registry=None) -> bool:
    """Whether the engine still cannot run for the root: no Node or engine, or a failure on record."""
    from app.services.dataflow.engine import registry as shared

    reg = registry if registry is not None else shared
    return not reg.probe(root).available or reg.failure(root) is not None


def query(root: Path, registry=None, refresh: bool = False) -> Tuple[Optional[SymbolRefsResult], Optional[str]]:
    """
    The engine's ``symbolRefs`` for the root, from the sources as they are now, or None and
    the reason it has none. The engine keeps its Program until asked to refresh, so a stale
    one is rebuilt first.
    """
    from app.services.dataflow.engine import EngineError
    from app.services.dataflow.engine import registry as shared

    reg = registry if registry is not None else shared
    found = reg.probe(root)
    if not found.available:
        return None, found.reason or "not-analyzed"
    if found.language != "typescript":
        return None, "python-root"
    known = reg.failure(root)
    if known is not None:
        return None, known.code
    try:
        status = reg.query(root, "status", {})
        if refresh or status.get("stale"):
            reg.query(root, "refresh", {}, timeout=180.0)
        # A walk of the whole program: allow more than one ordinary query.
        raw = reg.query(root, "symbolRefs", {}, timeout=180.0)
    except EngineError as exc:
        return None, exc.code
    return SymbolRefsResult.model_validate(raw), None


_HOLDERS = frozenset({"type", "class", "enum", "variable"})


def current_hash(root: Path, registry=None) -> Optional[str]:
    """The program hash of the sources and tsconfigs as they are now (stat calls only), or None when the engine cannot say."""
    from app.services.dataflow.engine import EngineError
    from app.services.dataflow.engine import registry as shared

    reg = registry if registry is not None else shared
    if not reg.probe(root).available or reg.failure(root) is not None:
        return None
    try:
        status = reg.query(root, "status", {})
    except EngineError:
        return None
    return status.get("currentHash") or (status.get("programHash") if status.get("built") and not status.get("stale") else None)


class _Files:
    """Each file's symbols, by name and by line span, for the join."""

    def __init__(self, symbols: Dict[str, Symbol]):
        self.by_name: Dict[Tuple[str, str], List[Symbol]] = defaultdict(list)
        self.by_file: Dict[str, List[Symbol]] = defaultdict(list)
        for s in symbols.values():
            if s.language != "ts" or s.kind == "module":
                continue
            self.by_name[(s.file, s.name)].append(s)
            self.by_file[s.file].append(s)
        self._sources: Dict[Tuple[str, int], str] = {}
        self.modules = {s.file for s in symbols.values() if s.kind == "module"} | {s.id for s in symbols.values() if s.kind == "module"}

    def target(self, t: SymbolRefTarget) -> Optional[str]:
        if t.name == "*":
            return t.file if t.file in self.modules else None
        want_type = t.meaning == "type"
        # The declaration whose name is at that very position: a shadowing parameter or an unindexed
        # local inside a same-named symbol's body never joins it, on any line.
        held = [s for s in self.by_name.get((t.file, t.name), ()) if (t.line, t.column) in s.names]
        if not held and t.scope == "member":
            # A member the index keeps no symbol for (an interface's field, an object type's member):
            # the type, class or variable that declares it, as a typed receiver gives today.
            held = [s for s in self.by_file.get(t.file, ()) if s.kind in _HOLDERS and s.line <= t.line <= s.end_line]
        if not held:
            return None
        # The side the meaning asks for first, then the innermost span.
        best = min(held, key=lambda s: (s.id.endswith(TYPE_ID_SUFFIX) != want_type, s.end_line - s.line, -s.line))
        return best.id

    def source(self, file: str, line: int) -> str:
        key = (file, line)
        hit = self._sources.get(key)
        if hit is None:
            hit = self._sources[key] = self._innermost(file, line)
        return hit

    def _innermost(self, file: str, line: int) -> str:
        held = [s for s in self.by_file.get(file, ()) if s.line <= line <= s.end_line]
        if not held:
            return file
        return min(held, key=lambda s: (s.end_line - s.line, -s.line)).id


def join(result: SymbolRefsResult, symbols: Dict[str, Symbol]) -> CheckerRefs:
    files = _Files(symbols)
    targets = [files.target(t) for t in result.targets]
    mismatched = sorted({f"{t.file}:{t.line} {t.name} ({t.meaning})" for t, sid in zip(result.targets, targets) if sid is None and t.scope == "module" and t.name != "*"})
    out = CheckerRefs(files={f.file for f in result.files}, references=[], mismatched=mismatched, generation=result.generation, program_hash=result.programHash)
    for f in result.files:
        for r in f.refs:
            if r.target is None:
                out.unbound[r.unbound or "unresolved"] += 1
                continue
            # A union's member means each class's own member: one reference to each.
            bound = [t for t in dict.fromkeys(targets[i] for i in [r.target, *(r.also or [])]) if t is not None]
            for target in bound:
                out.positions[(f.file, r.line)].append((r.column, r.endColumn, target))
            if r.clause:
                continue
            # The enclosing declaration's symbol, else the innermost symbol holding the line.
            source = (targets[r.source] if r.source is not None else None) or files.source(f.file, r.line)
            for target in bound:
                if source != target:
                    out.references.append(Reference(source=source, target=target, kind=r.kind, line=r.line, column=r.column, end_column=r.endColumn))
    return out
