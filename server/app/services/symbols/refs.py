"""`srcly refs`: every declaration a name or id matches, and what references each one.

The terminal view of the symbol index (`/api/symbols/*`): an agent uses it to
map callers before it moves or deletes a symbol. A name matches every
declaration with that name, so copies of one type in several files show
side by side.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

from app.services.symbols.index import SymbolIndex, build_symbol_index
from app.services.symbols.model import Symbol


def match(idx: SymbolIndex, query: str) -> List[Symbol]:
    """`file#Qualified`, `file::Qualified`, else every symbol whose name or qualified name equals the query."""
    q = query.strip()
    sym_id = q.replace("::", "#", 1)
    if sym_id in idx.symbols:
        return [idx.symbols[sym_id]]
    hits = [s for s in idx.symbols.values() if s.kind != "module" and q in (s.name, s.qualified)]
    return sorted(hits, key=lambda s: (not s.exported, idx.is_test(s), s.file, s.line))


def _incoming(idx: SymbolIndex, sym: Symbol, tests: bool) -> List[dict]:
    rows = []
    for i in idx.inc.get(sym.id, []):
        r = idx.references[i]
        src = idx.symbols.get(r.source)
        file = src.file if src else r.source.partition("#")[0]
        is_test = bool(src and idx.is_test(src))
        if is_test and not tests:
            continue
        rows.append(
            {
                "source": r.source,
                "file": file,
                "line": r.line,
                "kind": r.kind,
                "resolution": r.resolution,
                "test": is_test,
            }
        )
    return sorted(rows, key=lambda row: (row["test"], row["file"], row["line"], row["kind"]))


def build(idx: SymbolIndex, query: str, tests: bool = True) -> dict:
    found = match(idx, query)
    return {
        "query": query,
        "root": str(idx.root),
        "declarations": [
            {
                "id": s.id,
                "name": s.name,
                "kind": s.kind,
                "file": s.file,
                "line": s.line,
                "exported": s.exported,
                "refs": idx.refs_of(s),
                "references": _incoming(idx, s, tests),
            }
            for s in found
        ],
        "suggestions": [] if found else [h.id for h in idx.search(query, limit=8)],
    }


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def render(payload: dict, limit: int) -> str:
    decls = payload["declarations"]
    if not decls:
        lines = [f"No symbol is named {payload['query']!r}."]
        if payload["suggestions"]:
            lines.append("Did you mean: " + ", ".join(payload["suggestions"]))
        return "\n".join(lines)
    out = [f"{payload['query']}: {_count(len(decls), 'declaration')}"]
    for d in decls:
        flag = "exported" if d["exported"] else "not exported"
        out.append("")
        out.append(f"## {d['file']}:{d['line']} · {d['kind']} {d['id'].partition('#')[2]} ({flag})")
        refs = d["references"]
        if not refs:
            out.append("No references." if d["refs"] == "none" else "No references outside tests.")
            continue
        by_source: Dict[str, List[dict]] = defaultdict(list)
        for r in refs:
            by_source[r["source"]].append(r)
        out.append(f"{_count(len(refs), 'reference')} from {_count(len(by_source), 'symbol')}:")
        for shown, (source, rows) in enumerate(by_source.items()):
            if shown == limit:
                out.append(f"- … {len(by_source) - limit} more symbols")
                break
            first = rows[0]
            kinds = ", ".join(sorted({f"{r['kind']} {r['resolution']}" for r in rows}))
            where = ", ".join(str(r["line"]) for r in rows)
            name = source.partition("#")[2] or "(module)"
            test = " [test]" if first["test"] else ""
            out.append(f"- {first['file']}:{where} {name} · {kinds}{test}")
    return "\n".join(out)


def run(root: Path, query: str, fmt: str = "md", limit: int = 20, tests: bool = True) -> str:
    payload = build(build_symbol_index(root, use_cache=False), query, tests=tests)
    return json.dumps(payload, indent=2) if fmt == "json" else render(payload, limit)
