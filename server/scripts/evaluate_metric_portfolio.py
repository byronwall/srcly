"""Evaluate srcly's metric portfolio on real repositories (the M7 pilot).

For each repo this scans the tree headlessly (activity and lint/type findings
included), then, per language and scope stratum, reports:

- support: nodes in the stratum, how many measure each metric, the N/A rate,
  and the zero rate among measured values;
- redundancy: Spearman rank correlation for every metric pair, on the nodes
  that measure both;
- queue overlap: how many of one metric's top 10 / top 25 another metric also
  puts in its top 10 / top 25.

A metric that is constant in a stratum (all zeros, say) has no ranking, so its
correlations and overlaps are reported as undefined (``None``), never as 0.
Low correlation with a constant would read as "independent", which it is not.

It also writes the case sheet for adjudication: the top 10 per Hot Spots lens
(file cohort) and per 2x2 preset's action quadrant, each with the source lines
behind it. The verdicts themselves are recorded by hand in
``docs/research/metric-pilot-2026-10/``.

Usage (from ``server/``)::

    uv run python scripts/evaluate_metric_portfolio.py \\
        --repo srcly=.. --repo recipes=~/Projects/recipes-modern --out ../tmp/pilot

Repos are only read. Everything is written under ``--out``.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

# Fewer paired observations than this and a correlation means nothing.
MIN_PAIRS = 5
TOP_KS = (10, 25)
CASES_PER_LENS = 10
DERIVED = ("fan_in", "comment_ratio")

Value = float | None


# --- Statistics ---------------------------------------------------------------


def average_ranks(values: Sequence[float]) -> list[float]:
    """1-based ranks, ties sharing their mean rank."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        mean_rank = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = mean_rank
        i = j + 1
    return ranks


def is_constant(values: Iterable[float]) -> bool:
    return len(set(values)) <= 1


def spearman(xs: Sequence[float], ys: Sequence[float], *, min_pairs: int = MIN_PAIRS) -> float | None:
    """Spearman's rho with tie-averaged ranks.

    ``None`` when there are too few pairs or either side is constant: a
    constant has no order, so "uncorrelated" would be a false claim.
    """
    if len(xs) != len(ys):
        raise ValueError("xs and ys differ in length")
    if len(xs) < min_pairs or is_constant(xs) or is_constant(ys):
        return None
    rx, ry = average_ranks(xs), average_ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx)
    vy = sum((b - my) ** 2 for b in ry)
    return cov / math.sqrt(vx * vy)


def top_k(values: Mapping[str, Value], k: int) -> list[str] | None:
    """The k worst ids (highest values), ties broken by id.

    Only values above the stratum minimum count: the rest are tied at the
    floor, and any cut through them is arbitrary. ``None`` when nothing is
    above the floor (a constant metric has no queue).
    """
    measured = {key: v for key, v in values.items() if v is not None}
    if not measured or is_constant(measured.values()):
        return None
    floor = min(measured.values())
    ranked = sorted((key for key, v in measured.items() if v > floor), key=lambda key: (-measured[key], key))
    return ranked[:k]


def overlap(a: Sequence[str] | None, b: Sequence[str] | None) -> dict[str, Any] | None:
    """Shared ids between two top-k lists; ``None`` if either is undefined."""
    if a is None or b is None:
        return None
    shared = len(set(a) & set(b))
    union = len(set(a) | set(b))
    return {"shared": shared, "of": min(len(a), len(b)), "jaccard": round(shared / union, 3) if union else None}


@dataclass
class Stratum:
    language: str
    scope: str
    rows: dict[str, dict[str, Value]] = field(default_factory=dict)
    """node id → metric → value (``None`` = N/A)."""

    def column(self, metric: str) -> dict[str, Value]:
        return {key: row.get(metric) for key, row in self.rows.items()}


def support(stratum: Stratum, metric: str) -> dict[str, Any]:
    column = stratum.column(metric)
    measured = [v for v in column.values() if v is not None]
    total = len(column)
    return {
        "n": total,
        "measured": len(measured),
        "na_rate": round(1 - len(measured) / total, 3) if total else None,
        "zero_rate": round(sum(1 for v in measured if v == 0) / len(measured), 3) if measured else None,
        "distinct": len(set(measured)),
        "constant": is_constant(measured) if measured else True,
        "max": max(measured) if measured else None,
    }


def evaluate_stratum(stratum: Stratum, metrics: Sequence[str]) -> dict[str, Any]:
    supports = {m: support(stratum, m) for m in metrics}
    live = [m for m in metrics if supports[m]["measured"]]
    tops = {m: {k: top_k(stratum.column(m), k) for k in TOP_KS} for m in live}
    pairs = []
    for a, b in combinations(live, 2):
        both = [(row[a], row[b]) for row in stratum.rows.values() if row.get(a) is not None and row.get(b) is not None]
        rho = spearman([x for x, _ in both], [y for _, y in both]) if both else None
        pairs.append(
            {
                "a": a,
                "b": b,
                "n": len(both),
                "spearman": None if rho is None else round(rho, 3),
                **{f"top{k}": overlap(tops[a][k], tops[b][k]) for k in TOP_KS},
            }
        )
    return {"language": stratum.language, "scope": stratum.scope, "n": len(stratum.rows), "support": supports, "pairs": pairs}


# --- Collecting rows from a scan ------------------------------------------------


def file_path_of(node) -> str:
    """Scope paths read ``<file>::<scope>``; the file part decides the language."""
    return node.path.split("::", 1)[0]


def node_id(node, root: Path) -> str:
    rel = _rel(file_path_of(node), root)
    return rel if node.type == "file" else f"{rel}:{node.start_line}"


def _rel(path: str, root: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(root.resolve()))
    except ValueError:
        return path


def build_strata(tree, root: Path, metrics: Sequence[str], fan_in: Mapping[str, int] | None) -> list[Stratum]:
    """Files, executable functions and components, split by language."""
    from app.services.analysis import language_for_path
    from app.services.quadrants import comment_ratio
    from app.services.reporting import iter_nodes

    strata: dict[tuple[str, str], Stratum] = {}
    for node in iter_nodes(tree):
        if node.type == "file":
            scope = "file"
        elif node.type == "function" and node.metrics.component_loc is not None:
            scope = "component"
        elif node.type == "function" and node.kind == "function":
            scope = "function"
        else:
            continue
        lang = language_for_path(file_path_of(node))
        stratum = strata.setdefault((lang, scope), Stratum(lang, scope))
        row: dict[str, Value] = {m: _num(getattr(node.metrics, m, None)) for m in metrics if m not in DERIVED}
        if "comment_ratio" in metrics:
            row["comment_ratio"] = comment_ratio(node)
        if "fan_in" in metrics:
            row["fan_in"] = float(fan_in[node.path]) if scope == "file" and fan_in and node.path in fan_in else None
        stratum.rows[node_id(node, root)] = row
    return sorted(strata.values(), key=lambda s: (s.language, s.scope))


def _num(value: Any) -> Value:
    if value is None or isinstance(value, bool):
        return None
    value = float(value)
    return value if math.isfinite(value) else None


# --- Case sheet -----------------------------------------------------------------


def lens_cases(tree, root: Path, metric: str, k: int = CASES_PER_LENS) -> list[dict[str, Any]]:
    """The Hot Spots list for one metric (file cohort), top k, with the line to read."""
    from app.services.reporting import rank_by_metric

    ranked = rank_by_metric(tree, metric, cohort="file", root_path=root)["ranked"]
    cases = []
    for item in ranked[:k]:
        if item["value"] == 0:
            break  # a measured zero is not a case to review
        witness = item.get("witness")
        line = witness["start_line"] if witness else 1
        cases.append({"path": item["path"], "line": line, "value": item["value"], "witness": witness["name"] if witness else None})
    return cases


def preset_cases(tree, root: Path, preset_id: str, fan_in, k: int = CASES_PER_LENS) -> dict[str, Any]:
    """The preset's high/high quadrant, plus its single-axis quadrants, top k each."""
    from app.services import quadrants

    preset = quadrants.get(preset_id)
    out: dict[str, Any] = {"cohorts": {}}
    for cohort in preset.cohorts:
        result = quadrants.build_quadrants(
            tree, preset_id, cohort=cohort, root_path=root, fan_in=fan_in, display_path=lambda p: _rel(p.split("::", 1)[0], root)
        )
        out["cohorts"][cohort] = {
            "na": result["na_count"],
            "unavailable": result["unavailable"],
            "counts": {q["id"]: q["count"] for q in result["quadrants"]},
            "members": {q["id"]: q["members"][:k] for q in result["quadrants"] if q["id"] != "low_both"},
        }
    return out


def snippet(root: Path, rel_path: str, line: int, before: int = 1, after: int = 6) -> str:
    try:
        lines = (root / rel_path).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    lo, hi = max(1, line - before), min(len(lines), line + after)
    return "\n".join(f"{n:>5}  {lines[n - 1][:140]}" for n in range(lo, hi + 1))


# --- Driver ---------------------------------------------------------------------


def evaluated_metrics() -> list[str]:
    from app.services import metric_catalog

    return [m.id for m in metric_catalog.METRICS if m.rankable] + list(DERIVED)


def evaluate_repo(name: str, root: Path) -> dict[str, Any]:
    from app.services import metric_catalog, quadrants, reporting

    tree = reporting.scan_tree(root, verbose=False)
    fan_in = quadrants.fan_in_by_path(root)
    metrics = evaluated_metrics()
    strata = build_strata(tree, root, metrics, fan_in)
    lenses = {m.id: lens_cases(tree, root, m.id) for m in metric_catalog.METRICS if m.rankable}
    presets = {p.id: preset_cases(tree, root, p.id, fan_in) for p in quadrants.PRESETS}
    return {
        "repo": name,
        "root": str(root),
        "head": _git_head(root),
        "activity": tree.activity.model_dump() if tree.activity else None,
        "checks": tree.findings.model_dump() if tree.findings else None,
        "strata": [evaluate_stratum(s, metrics) for s in strata],
        "lenses": lenses,
        "presets": presets,
    }


def _git_head(root: Path) -> str | None:
    import subprocess

    try:
        return subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip() or None
    except Exception:
        return None


def render_markdown(result: dict[str, Any], *, min_n: int = 10) -> str:
    """Support table per stratum, plus the strongest and the undefined pairs."""
    lines = [f"# {result['repo']} @ {(result['head'] or '?')[:10]}", ""]
    for stratum in result["strata"]:
        if stratum["n"] < min_n:
            continue
        lines += [f"## {stratum['language']} · {stratum['scope']} (n={stratum['n']})", ""]
        lines += ["| Metric | measured | N/A | zero | distinct | max |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
        for metric, s in stratum["support"].items():
            if not s["measured"]:
                continue
            lines.append(
                f"| {metric} | {s['measured']} | {_pct(s['na_rate'])} | {_pct(s['zero_rate'])} | {s['distinct']} | {_fmt(s['max'])} |"
            )
        defined = [p for p in stratum["pairs"] if p["spearman"] is not None]
        defined.sort(key=lambda p: -abs(p["spearman"]))
        if defined:
            lines += ["", "| Pair | n | ρ | top-10 shared | top-25 shared |", "| --- | ---: | ---: | ---: | ---: |"]
            for p in defined[:12]:
                lines.append(f"| {p['a']} × {p['b']} | {p['n']} | {p['spearman']} | {_ov(p['top10'])} | {_ov(p['top25'])} |")
        undefined = sorted({m for p in stratum["pairs"] if p["spearman"] is None for m in (p["a"], p["b"]) if stratum["support"][m]["constant"]})
        if undefined:
            lines += ["", f"Constant here (correlations undefined): {', '.join(undefined)}"]
        lines.append("")
    return "\n".join(lines)


def render_cases(result: dict[str, Any], root: Path) -> str:
    lines = [f"# Cases: {result['repo']}", ""]
    for metric, cases in result["lenses"].items():
        lines += [f"## Lens {metric}", ""]
        if not cases:
            lines += ["(no nonzero cases)", ""]
        for i, c in enumerate(cases, 1):
            who = f" in {c['witness']}" if c["witness"] else ""
            lines += [f"### {metric} #{i}: {c['path']}:{c['line']} = {c['value']}{who}", "```", snippet(root, c["path"], c["line"]), "```"]
        lines.append("")
    for preset_id, preset in result["presets"].items():
        for cohort, data in preset["cohorts"].items():
            lines += [f"## Preset {preset_id} ({cohort}) counts={data['counts']} na={data['na']} {data['unavailable']}", ""]
            for qid, members in data["members"].items():
                for i, m in enumerate(members, 1):
                    line = m["start_line"] or 1
                    lines.append(f"- {qid} #{i}: {m['path']}:{line} x={m['x']} y={m['y']}")
            lines.append("")
    return "\n".join(lines)


def _pct(v: float | None) -> str:
    return "–" if v is None else f"{round(v * 100)}%"


def _fmt(v: float | None) -> str:
    if v is None:
        return "–"
    return str(int(v)) if float(v).is_integer() else f"{v:.2f}"


def _ov(o: dict[str, Any] | None) -> str:
    return "undef" if o is None else f"{o['shared']}/{o['of']}"


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--repo", action="append", required=True, help="name=path; repeatable")
    parser.add_argument("--out", required=True, help="Output directory (repos are never written)")
    args = parser.parse_args(argv)
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    for spec in args.repo:
        name, _, raw = spec.partition("=")
        root = Path(raw).expanduser().resolve()
        print(f"scanning {name} ({root})", file=sys.stderr, flush=True)
        result = evaluate_repo(name, root)
        (out / f"{name}.json").write_text(json.dumps(result, indent=1, default=str), encoding="utf-8")
        (out / f"{name}.md").write_text(render_markdown(result), encoding="utf-8")
        (out / f"{name}.cases.md").write_text(render_cases(result, root), encoding="utf-8")
        print(f"wrote {out / name}.{{json,md,cases.md}}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
