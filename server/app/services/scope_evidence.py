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


def branches_line(b: dict[str, Any]) -> str:
    total, ops = b["decision_points"], b["operators"]
    statements = ", ".join(f"{n} {kind}" for kind, n in b["kinds"].items() if kind not in OPERATORS)
    operators = ", ".join(f"{n} `{kind}`" for kind, n in b["kinds"].items() if kind in OPERATORS)
    parts = [p for p in (statements, operators) if p]
    line = f"Branches: {total} decision points ({'; '.join(parts)})."
    if b["deepest"]:
        deepest = ", ".join(f"line {d['line']} (depth {d['depth']})" for d in b["deepest"])
        line += f" Deepest: {deepest}."
    if ops * 2 >= total:
        line += " Most of the CCN is short-circuit and ternary operators, not nested control flow."
    return line


def tests_naming(root: Path, test_files: Iterable[str], *, module: str, symbol: str | None = None) -> dict[str, Any]:
    """Test files (root-relative) that import ``module`` by name, or name ``symbol`` as a word."""
    stem = PurePosixPath(module).stem
    if stem in ("index", "__init__"):
        stem = PurePosixPath(module).parent.name
    imports = re.compile(rf"(?:\bimport\b|\bfrom\b|\brequire\().*\b{re.escape(stem)}\b")
    word = re.compile(rf"\b{re.escape(symbol)}\b") if symbol else None
    hits = []
    for rel in sorted(test_files):
        try:
            text = (root / rel).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        lines = text.splitlines()
        if word is not None:
            found = [i for i, line in enumerate(lines, 1) if word.search(line)]
        else:
            found = [i for i, line in enumerate(lines, 1) if imports.search(line)]
        if found:
            hits.append({"path": rel, "line": found[0], "lines": len(found)})
    # Most mentions first: the likeliest test for it.
    hits.sort(key=lambda h: (-h["lines"], h["path"]))
    return {"by": "symbol" if symbol else "import", "name": symbol or stem, "files": hits}


def tests_line(t: dict[str, Any]) -> str:
    what = f"name `{t['name']}`" if t["by"] == "symbol" else f"import `{t['name']}`"
    if not t["files"]:
        return f"Tests: no test file {'names' if t['by'] == 'symbol' else 'imports'} `{t['name']}`."
    listed = ", ".join(f"`{h['path']}:{h['line']}` ({h['lines']})" for h in t["files"][:TESTS_LISTED])
    more = f" and {len(t['files']) - TESTS_LISTED} more" if len(t["files"]) > TESTS_LISTED else ""
    return f"Tests that {what} (matching lines): {listed}{more}. A name match, not proof the test runs it."
