"""Compare the checker-bound and the tree-sitter symbol index on every TypeScript reference of a root.

    cd server && uv run python scripts/compare_binders.py <root> [--samples 20] [--json out.json]

A reference is keyed by (source file, line, target id), counted as a multiset. A key in
both indexes agrees; the rest are bucketed by how tree-sitter resolved it (``exact``,
``typed``, ``name``) or by the checker reference's kind and target kind. See
docs/dataflow-engine.md ("Symbol binding").
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.dataflow.engine import EngineRegistry  # noqa: E402
from app.services.symbols.index import SymbolIndex, build_symbol_index  # noqa: E402


def _ts_refs(idx: SymbolIndex):
    for r in idx.references:
        src = idx.symbols.get(r.source)
        if src is None or src.language != "ts" or r.kind == "http":
            continue
        yield (src.file, r.line, r.target), r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--samples", type=int, default=20)
    ap.add_argument("--json")
    args = ap.parse_args()
    root = Path(args.root).resolve()

    t = time.monotonic()
    tree = build_symbol_index(root, use_cache=False, binder="tree-sitter")
    tree_s = time.monotonic() - t
    registry = EngineRegistry()
    try:
        t = time.monotonic()
        checked = build_symbol_index(root, use_cache=False, binder="checker", registry=registry)
        checked_s = time.monotonic() - t
    finally:
        registry.close_all()
    if checked.binder != "checker":
        print(f"checker unavailable: {checked.binder_reason}", file=sys.stderr)
        return 2

    tree_refs = defaultdict(list)
    for key, r in _ts_refs(tree):
        tree_refs[key].append(r)
    checked_refs = defaultdict(list)
    for key, r in _ts_refs(checked):
        checked_refs[key].append(r)

    agree = 0
    kind_differs = Counter()
    buckets = defaultdict(list)
    for key in set(tree_refs) | set(checked_refs):
        a, b = tree_refs.get(key, []), checked_refs.get(key, [])
        both = min(len(a), len(b))
        agree += both
        for ra, rb in zip(a, b):
            if ra.kind != rb.kind:
                kind_differs[f"{ra.kind} -> {rb.kind}"] += 1
        target = checked.symbols.get(key[2]) or tree.symbols.get(key[2])
        tkind = target.kind if target else "?"
        for r in a[both:]:
            buckets[f"tree-sitter-only · {r.resolution} · {r.kind} -> {tkind}"].append((key, r))
        for r in b[both:]:
            buckets[f"checker-only · {r.kind} -> {tkind}"].append((key, r))

    total_tree = sum(len(v) for v in tree_refs.values())
    total_checked = sum(len(v) for v in checked_refs.values())
    rng = random.Random(0)
    report = {
        "root": str(root),
        "seconds": {"tree-sitter": round(tree_s, 1), "checker": round(checked_s, 1)},
        "references": {"tree-sitter": total_tree, "checker": total_checked, "agree": agree},
        "symbols": len([s for s in tree.symbols.values() if s.language == "ts" and s.kind != "module"]),
        "unbound": checked.unbound,
        "mismatched": len(checked.mismatched),
        "mismatchedSample": checked.mismatched[: args.samples],
        "outsideProgram": checked.outside_program,
        "kindDiffers": dict(kind_differs.most_common()),
        "buckets": {
            name: {
                "count": len(rows),
                "sample": [f"{k[0]}:{k[1]} {r.source} -> {k[2]}" for k, r in rng.sample(rows, min(args.samples, len(rows)))],
            }
            for name, rows in sorted(buckets.items(), key=lambda kv: -len(kv[1]))
        },
    }
    text = json.dumps(report, indent=2)
    if args.json:
        Path(args.json).write_text(text)
    else:
        print(text)
    print(
        f"{root.name}: tree-sitter {total_tree}, checker {total_checked}, agree {agree}, "
        f"mismatched {len(checked.mismatched)}, outside program {checked.outside_program}, unbound {dict(checked.unbound)}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
