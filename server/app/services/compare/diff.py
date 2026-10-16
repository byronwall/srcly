"""
Pure diff of two scanned sides: no git, no filesystem.

Inputs are two metrics trees and two dependency graphs (repo-relative JSON)
plus the change list from git. The output is the compare payload's core:
per-file before/after metrics with a better / worse / neutral verdict per
metric, per-metric totals over the changed files, and the file-level
dependency edges gained and lost.

"Better" and "worse" come from one table, ``COMPARE_METRICS``, shared by the
CLI and the UI. Direction comes from ``reporting.METRIC_DEFINITIONS``: risk
metrics are better lower, neutral detail (counts of functions, exports,
TODOs...) is neutral, and so is LOC here: a PR that adds a feature is
expected to add lines.
"""

from __future__ import annotations

import posixpath
from dataclasses import dataclass
from typing import Any, Iterable, Literal, Optional

from app.services.compare.git_refs import FileChange
from app.services.reporting import METRIC_DEFINITIONS

Direction = Literal["lower", "higher", "neutral"]
Verdict = Literal["better", "worse", "neutral", "same"]
Aggregation = Literal["sum", "max", "mean"]


@dataclass(frozen=True)
class CompareMetric:
    name: str
    direction: Direction
    """Which way is better: ``lower`` (risk) or ``neutral`` (size and inventory). ``higher`` is unused today."""
    aggregation: Aggregation
    """How file values combine into a total over the changed files."""
    source: Literal["tree", "graph"] = "tree"


# Size: growth is expected, not a regression. Inventory counts are neutral
# in the definitions already.
NEUTRAL_METRICS = frozenset({"loc"})
SKIPPED_METRICS = frozenset({"file_count"})


def _aggregation(definition_aggregation: str) -> Aggregation:
    if definition_aggregation.startswith("sum"):
        return "sum"
    if definition_aggregation.startswith("max"):
        return "max"
    return "mean"


def _build_metrics() -> tuple[CompareMetric, ...]:
    metrics: list[CompareMetric] = []
    for d in METRIC_DEFINITIONS:
        if d.name in SKIPPED_METRICS:
            continue
        direction: Direction = "neutral" if d.name in NEUTRAL_METRICS or d.direction == "neutral" else "lower"
        metrics.append(CompareMetric(d.name, direction, _aggregation(d.aggregation)))
    # Coupling from the dependency graph. Depending on more things is riskier;
    # being depended on is a fact about the file, not a regression.
    metrics.append(CompareMetric("fan_out", "lower", "sum", "graph"))
    metrics.append(CompareMetric("fan_in", "neutral", "sum", "graph"))
    return tuple(metrics)


COMPARE_METRICS: tuple[CompareMetric, ...] = _build_metrics()
METRICS_BY_NAME = {m.name: m for m in COMPARE_METRICS}


def verdict(direction: Direction, before: Optional[float], after: Optional[float]) -> Verdict:
    if before is None or after is None:
        return "neutral"
    if _round(after - before) == 0:
        return "same"
    if direction == "neutral":
        return "neutral"
    went_up = after > before
    return "worse" if went_up == (direction == "lower") else "better"


def _round(value: float) -> float:
    return round(float(value), 4)


# -- indexing -----------------------------------------------------------------


def file_metrics(tree: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Repo-relative file path → that file node's metrics."""
    out: dict[str, dict[str, Any]] = {}
    stack = [tree]
    while stack:
        node = stack.pop()
        if node.get("type") == "file":
            out[node["path"]] = node.get("metrics") or {}
            continue  # functions below a file are not files
        stack.extend(node.get("children") or [])
    return out


def file_edges(graph: dict[str, Any]) -> set[tuple[str, str]]:
    """File-level ``(importer, imported)`` pairs; symbol endpoints fold into their file."""
    nodes = {n["id"]: n for n in graph.get("nodes", [])}

    def owner(node_id: str) -> str:
        node = nodes.get(node_id)
        while node is not None and node.get("kind") == "symbol" and node.get("parent") is not None:
            node_id = node["parent"]
            node = nodes.get(node_id)
        return node_id

    edges: set[tuple[str, str]] = set()
    for e in graph.get("edges", []):
        s, t = owner(e["source"]), owner(e["target"])
        if s != t:
            edges.add((s, t))
    return edges


def _fan(edges: Iterable[tuple[str, str]]) -> tuple[dict[str, int], dict[str, int]]:
    fan_out: dict[str, set[str]] = {}
    fan_in: dict[str, set[str]] = {}
    for s, t in edges:
        fan_out.setdefault(s, set()).add(t)
        fan_in.setdefault(t, set()).add(s)
    return {k: len(v) for k, v in fan_in.items()}, {k: len(v) for k, v in fan_out.items()}


def is_external(node_id: str) -> bool:
    return node_id.startswith("ext:")


def crosses_folder(source: str, target: str) -> bool:
    if is_external(source) or is_external(target):
        return False
    return posixpath.dirname(source) != posixpath.dirname(target)


# -- the diff -----------------------------------------------------------------


def _side_values(
    path: Optional[str],
    metrics_by_file: dict[str, dict[str, Any]],
    fan_in: dict[str, int],
    fan_out: dict[str, int],
    present_in_graph: set[str],
) -> Optional[dict[str, float]]:
    if path is None:
        return None
    raw = metrics_by_file.get(path)
    if raw is None and path not in present_in_graph:
        return None
    raw = raw or {}
    values: dict[str, float] = {}
    for m in COMPARE_METRICS:
        if m.source == "graph":
            values[m.name] = (fan_in if m.name == "fan_in" else fan_out).get(path, 0)
        else:
            # None is N/A (doesn't apply, skipped or failed), not 0.
            value = raw.get(m.name)
            values[m.name] = _round(value) if isinstance(value, float) else value
    return values


def _total(values: list[float], aggregation: Aggregation) -> Optional[float]:
    if not values:
        return None
    if aggregation == "sum":
        return _round(sum(values))
    if aggregation == "max":
        return _round(max(values))
    return _round(sum(values) / len(values))


def diff_sides(
    base_tree: dict[str, Any],
    head_tree: dict[str, Any],
    base_graph: dict[str, Any],
    head_graph: dict[str, Any],
    changes: list[FileChange],
) -> dict[str, Any]:
    base_metrics = file_metrics(base_tree)
    head_metrics = file_metrics(head_tree)

    renames = {c.old_path: c.path for c in changes if c.status == "renamed" and c.old_path}
    base_edges_raw = file_edges(base_graph)
    head_edges = file_edges(head_graph)
    base_fan_in, base_fan_out = _fan(base_edges_raw)
    head_fan_in, head_fan_out = _fan(head_edges)
    base_graph_files = {n["id"] for n in base_graph.get("nodes", []) if n.get("kind") == "file"}
    head_graph_files = {n["id"] for n in head_graph.get("nodes", []) if n.get("kind") == "file"}

    files: list[dict[str, Any]] = []
    for change in changes:
        before = _side_values(change.base_path, base_metrics, base_fan_in, base_fan_out, base_graph_files)
        after = _side_values(change.head_path, head_metrics, head_fan_in, head_fan_out, head_graph_files)
        deltas: dict[str, dict[str, Any]] = {}
        for m in COMPARE_METRICS:
            b = before.get(m.name) if before else None
            a = after.get(m.name) if after else None
            if (b or 0) == 0 and (a or 0) == 0:
                continue
            if before is not None and after is not None and (a is None or b is None):
                continue  # N/A on one side: there's no like-for-like change to judge
            deltas[m.name] = {
                "before": b,
                "after": a,
                "delta": _round((a or 0) - (b or 0)),
                "verdict": verdict(m.direction, b, a),
            }
        entry: dict[str, Any] = {
            "path": change.path,
            "status": change.status,
            "additions": change.additions,
            "deletions": change.deletions,
            "analyzed": before is not None or after is not None,
            "before": before,
            "after": after,
            "deltas": deltas,
        }
        if change.old_path:
            entry["oldPath"] = change.old_path
        files.append(entry)

    # Edges: rename base endpoints first so a moved file isn't a delete + add.
    base_edges = {(renames.get(s, s), renames.get(t, t)) for s, t in base_edges_raw}
    added = sorted(head_edges - base_edges)
    removed = sorted(base_edges - head_edges)

    def edge_json(s: str, t: str) -> dict[str, Any]:
        return {"source": s, "target": t, "external": is_external(t), "crossFolder": crosses_folder(s, t)}

    return {
        "metrics": [
            {"name": m.name, "direction": m.direction, "aggregation": m.aggregation, "source": m.source}
            for m in COMPARE_METRICS
        ],
        "files": files,
        "edges": {
            "added": [edge_json(s, t) for s, t in added],
            "removed": [edge_json(s, t) for s, t in removed],
        },
        "summary": _summary(files, changes, added, removed),
    }


def _summary(
    files: list[dict[str, Any]],
    changes: list[FileChange],
    added_edges: list[tuple[str, str]],
    removed_edges: list[tuple[str, str]],
) -> dict[str, Any]:
    counts = {"added": 0, "removed": 0, "modified": 0, "renamed": 0}
    for c in changes:
        counts[c.status] += 1

    metric_totals: dict[str, dict[str, Any]] = {}
    for m in COMPARE_METRICS:
        befores = [f["before"][m.name] for f in files if f["before"] is not None and f["before"][m.name] is not None]
        afters = [f["after"][m.name] for f in files if f["after"] is not None and f["after"][m.name] is not None]
        b, a = _total(befores, m.aggregation), _total(afters, m.aggregation)
        file_verdicts = [f["deltas"][m.name]["verdict"] for f in files if m.name in f["deltas"]]
        if (b or 0) == 0 and (a or 0) == 0 and not file_verdicts:
            continue
        better, worse = file_verdicts.count("better"), file_verdicts.count("worse")
        if m.aggregation == "sum" and m.direction != "neutral":
            # A sum grows with every added file, so judge like for like:
            # files present on both sides that moved one way or the other.
            total_verdict: Verdict = "same" if better == worse == 0 else (
                "better" if better > worse else "worse" if worse > better else "neutral"
            )
        else:
            # Max and mean already normalize for file count; a new file with
            # a complexity of 40 should raise the max.
            total_verdict = verdict(m.direction, b if b is not None else 0, a if a is not None else 0)
        metric_totals[m.name] = {
            "before": b,
            "after": a,
            "delta": _round((a or 0) - (b or 0)),
            "verdict": total_verdict,
            "filesBetter": better,
            "filesWorse": worse,
        }

    net = {"better": 0, "worse": 0, "same": 0, "neutral": 0}
    for total in metric_totals.values():
        net[total["verdict"]] += 1

    return {
        "files": {**counts, "total": len(changes)},
        "lines": {
            "additions": sum(c.additions for c in changes),
            "deletions": sum(c.deletions for c in changes),
        },
        "metrics": metric_totals,
        "net": net,
        "edges": {
            "added": len(added_edges),
            "removed": len(removed_edges),
            "crossFolderAdded": sum(1 for s, t in added_edges if crosses_folder(s, t)),
            "crossFolderRemoved": sum(1 for s, t in removed_edges if crosses_folder(s, t)),
        },
    }
