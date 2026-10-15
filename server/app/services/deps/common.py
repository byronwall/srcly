"""Shared types and helpers for the language-neutral dependency graph."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set

from app.config import IGNORE_DIRS

MAX_SOURCE_BYTES = 1_000_000

_TEST_DIRS = {"test", "tests", "__tests__", "__mocks__", "spec", "e2e"}
_TEST_FILE = re.compile(
    r"(\.(test|spec|e2e)\.[cm]?[jt]sx?$)|(^test_.*\.py$)|(_test\.py$)|(^conftest\.py$)"
)


def is_test_path(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").split("/")
    if any(p in _TEST_DIRS for p in parts[:-1]):
        return True
    return bool(_TEST_FILE.search(parts[-1]))


def _gitignore_spec(root: Path):
    """PathSpec for .gitignore files from the repo root down, pruning ignored dirs."""
    from pathspec import PathSpec

    from app.services.analysis import _translate_gitignore_pattern, find_repo_root

    repo_root = find_repo_root(root)
    patterns: List[str] = []
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
        if ".gitignore" not in filenames:
            continue
        base = Path(dirpath)
        base_rel = "" if base == repo_root else base.relative_to(repo_root).as_posix()
        try:
            lines = (base / ".gitignore").read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for raw in lines:
            t = _translate_gitignore_pattern(raw, base_rel)
            if t is not None:
                patterns.append(t)
    return repo_root, (PathSpec.from_lines("gitwildmatch", patterns) if patterns else None)


def walk_source_files(root: Path, extensions: Set[str]) -> List[Path]:
    """Source files under root, skipping ignored, hidden and gitignored paths."""
    root = root.resolve()
    repo_root, spec = _gitignore_spec(root)

    def ignored(p: Path, is_dir: bool) -> bool:
        if spec is None:
            return False
        try:
            rel = p.relative_to(repo_root).as_posix()
        except ValueError:
            return False
        return spec.match_file(rel + "/" if is_dir else rel)

    out: List[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        base = Path(dirpath)
        dirnames[:] = sorted(
            d
            for d in dirnames
            if d not in IGNORE_DIRS and not d.startswith(".") and not ignored(base / d, True)
        )
        for name in sorted(filenames):
            if name.endswith(".d.ts"):
                continue
            p = base / name
            if ignored(p, False):
                continue
            if p.suffix in extensions:
                try:
                    if p.stat().st_size > MAX_SOURCE_BYTES:
                        continue
                except OSError:
                    continue
                out.append(p.resolve())
    return out


@dataclass
class SymbolDef:
    """A top-level declaration in a file."""

    name: str
    kind: str
    line: int
    exported: bool = False


@dataclass
class DepEdge:
    """importer → imported at file granularity (optionally refined to symbols)."""

    source: Path
    # A file path inside the root, or an external package name.
    target: Path | str
    symbols: List[str] = field(default_factory=list)
    type_only: bool = False
    via_barrel: bool = False
    # Symbol-level refinement: (using symbol in source or None, symbol in target or None).
    source_symbol: Optional[str] = None
    target_symbol: Optional[str] = None


def unique(items: Iterable[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for i in items:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


@dataclass
class ImportBinding:
    """A local name bound by an import statement."""

    target_file: Path
    # Declared name in the target file the binding refers to (None = module itself).
    target_symbol: Optional[str]
    display: str
    type_only: bool = False
    via_barrel: bool = False
    # Namespace / module binding: `ns.attr` picks a symbol in target_file.
    namespace: bool = False


def emit_symbol_edges(
    source: Path,
    bindings: dict,
    usages: dict,
    declared: dict,
) -> List[DepEdge]:
    """
    Turn import bindings plus per-declaration usages into the finest edges.

    `usages` maps a top-level declaration name in `source` (None = module level)
    to (local, attr) pairs it references. `declared` maps a file to the set of
    names it declares. Bindings that are never referenced still produce a
    file-level edge so no import disappears.
    """
    out: Dict[tuple, DepEdge] = {}
    used: Set[str] = set()

    def add(user: Optional[str], b: ImportBinding, target_symbol: Optional[str], name: str) -> None:
        if target_symbol is not None and target_symbol not in declared.get(b.target_file, set()):
            target_symbol = None
        key = (user, b.target_file, target_symbol)
        e = out.get(key)
        if e is None:
            out[key] = DepEdge(
                source=source,
                target=b.target_file,
                symbols=[name],
                type_only=b.type_only,
                via_barrel=b.via_barrel,
                source_symbol=user,
                target_symbol=target_symbol,
            )
        else:
            if name not in e.symbols:
                e.symbols.append(name)
            e.type_only = e.type_only and b.type_only
            e.via_barrel = e.via_barrel or b.via_barrel

    for user, refs in usages.items():
        for local, attr in refs:
            b = bindings.get(local)
            if b is None or b.target_file == source:
                continue
            used.add(local)
            if b.namespace:
                add(user, b, attr, attr or b.display)
            else:
                add(user, b, b.target_symbol, b.display)
    for local, b in bindings.items():
        if local not in used and b.target_file != source:
            add(None, b, b.target_symbol, b.display)
    return list(out.values())
