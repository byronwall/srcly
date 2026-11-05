"""
Evidence ``explain`` reads from source on demand, for one file or symbol.

- ``branches``: what a symbol's CCN is made of (statements vs short-circuit and
  ternary operators) and where it nests deepest, from the analyzer's markers.
  A route table of ``a || b`` checks and a tangle of nested ``if``s can share a
  CCN; this tells them apart without a new ranked metric.
- ``tests_naming``: test files that import a module or name a symbol. A name
  match is a lead, not proof that the test exercises the code.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from app.services import markers

# Decision points that are expressions, not control flow statements.
OPERATORS = frozenset({"&&", "||", "??", "and", "or", "?:"})
TESTS_LISTED = 5


def branches(file_path: str, start: int, end: int) -> dict[str, Any] | None:
    """Decision points and nesting markers in ``start..end``; None when the analyzer marks none."""
    found = markers.collect_markers(file_path)
    points = [m for m in found.get("complexity", []) if start <= m["line"] <= end]
    if not points:
        return None
    kinds = Counter(m["note"] for m in points)
    operators = sum(n for kind, n in kinds.items() if kind in OPERATORS)
    nests = [
        (int(m["note"].split()[-1]), m["line"])
        for m in found.get("max_nesting_depth", [])
        if start <= m["line"] <= end and m["note"].startswith("depth ")
    ]
    nests.sort(key=lambda d: (-d[0], d[1]))
    return {
        "decision_points": len(points),
        "operators": operators,
        "kinds": dict(kinds.most_common()),
        "deepest": [{"line": line, "depth": depth} for depth, line in nests[:3]],
        "by_depth": dict(sorted(Counter(depth for depth, _ in nests).items())),
    }


# Below this many decision points, a share of operators says nothing about shape.
SHAPE_MIN_POINTS = 10


def branches_line(b: dict[str, Any]) -> str:
    if "na" in b:
        return f"Branches: N/A ({b['na']})."
    total, ops = b["decision_points"], b["operators"]
    statements = ", ".join(f"{n} {kind}" for kind, n in b["kinds"].items() if kind not in OPERATORS)
    operators = ", ".join(f"{n} `{kind}`" for kind, n in b["kinds"].items() if kind in OPERATORS)
    parts = [p for p in (statements, operators) if p]
    noun = "decision point" if total == 1 else "decision points"
    nested = b.get("nested_symbols") or 0
    within = f", including {nested} nested {'function' if nested == 1 else 'functions'}" if nested else ""
    line = f"Branches: {total} {noun} ({'; '.join(parts)}{within})."
    if b["deepest"]:
        deepest = ", ".join(f"line {d['line']} (depth {d['depth']})" for d in b["deepest"])
        line += f" Deepest: {deepest}."
    if total >= SHAPE_MIN_POINTS and ops * 2 > total:
        line += " Most of the CCN is short-circuit and ternary operators, not nested control flow."
    return line


def tests_naming(root: Path, test_files: Iterable[str], *, module: str, symbol: str | None = None) -> dict[str, Any]:
    """Test files (root-relative) that import ``module`` by name, or name ``symbol`` as a word."""
    stem = PurePosixPath(module).stem
    if stem in ("index", "__init__"):
        stem = PurePosixPath(module).parent.name
    imports = re.compile(rf"(?:\bimport\b|\bfrom\b|\brequire\().*\b{re.escape(stem)}\b")
    word = re.compile(rf"\b{re.escape(symbol)}\b") if symbol else None
    hits, importers, name_only = [], 0, 0
    for rel in sorted(test_files):
        try:
            lines = (root / rel).read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        imported = [i for i, line in enumerate(lines, 1) if imports.search(line)]
        importers += bool(imported)
        # A symbol counts only in a test that imports its module: a short name such as ``rel``
        # is also every other module's local variable.
        found = [i for i, line in enumerate(lines, 1) if word.search(line)] if word else imported
        if found and (imported or not word):
            hits.append({"path": rel, "line": found[0], "lines": len(found)})
        elif found:
            name_only += 1
    # Most mentions first: the likeliest test for it.
    hits.sort(key=lambda h: (-h["lines"], h["path"]))
    return {
        "by": "symbol" if symbol else "import",
        "module": stem,
        "name": symbol or stem,
        "files": hits,
        "importers": importers,
        "name_only": name_only,
    }


def tests_line(t: dict[str, Any]) -> str:
    module = f"`{t['module']}`"
    if t["by"] == "symbol":
        what = f"import {module}" + (f" and name `{t['name']}`" if t["name"] != t["module"] else "")
    else:
        what = f"import {module}"
    if not t["files"]:
        if t["by"] == "import" or not t["importers"]:
            others = f"; {_tests(t['name_only'], 'names')} `{t['name']}` without importing it" if t["name_only"] else ""
            return f"Tests: no test file imports {module}{others}."
        return f"Tests: {_tests(t['importers'], 'imports')} {module}; none names `{t['name']}`."
    listed = ", ".join(f"`{h['path']}:{h['line']}` ({h['lines']})" for h in t["files"][:TESTS_LISTED])
    more = f" and {len(t['files']) - TESTS_LISTED} more" if len(t["files"]) > TESTS_LISTED else ""
    return f"Tests that {what} (matching lines): {listed}{more}. A name match, not proof the test runs it."


def _tests(n: int, verb: str) -> str:
    """``1 test file imports`` / ``3 test files import``."""
    return f"{n} test file {verb}" if n == 1 else f"{n} test files {verb.removesuffix('s')}"
