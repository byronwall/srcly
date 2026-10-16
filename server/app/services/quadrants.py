"""Named 2x2 presets: two metrics, absolute cut-offs, four named quadrants.

The catalog serves the presets (``metric_catalog.catalog_payload``) so the
client's scatter view and ``srcly report --quadrant`` share axes, cut-offs
and names. Most axes are catalog metrics; two are derived per node:

- ``fan_in``: distinct files that import the file, from the dependency graph
  (TS/TSX and Python). Files only.
- ``comment_ratio``: comment lines as a share of the node's lines
  (``comment_lines / loc``; LOC counts comment lines). At 0.5 comments match
  code, the line comment noise flags.

A point is "high" on an axis when its value is at or above the cut-off. A
node without a value on either axis is N/A and is counted, never plotted.
The client mirror is ``client/src/viz/scatter/quadrants.ts``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, Mapping

from app.models import Node
from app.services import metric_catalog

Cohort = Literal["file", "function", "component"]
Scale = Literal["log", "linear"]
QuadrantId = Literal["high_both", "high_x", "high_y", "low_both"]
QUADRANT_IDS: tuple[QuadrantId, ...] = ("high_both", "high_x", "high_y", "low_both")

DERIVED_AXES: dict[str, dict[str, str]] = {
    "fan_in": {
        "label": "Fan-in",
        "unit": "importers",
        "unit_one": "importer",
        "description": "Distinct files that import this file (any of its symbols), from the dependency graph.",
    },
    "comment_ratio": {
        "label": "Comment ratio",
        "unit": "comments/line",
        "unit_one": "comments/line",
        "description": "Comment lines as a share of the lines counted in LOC (which include comments). At 0.5 there are as many comment lines as code lines, where comment noise flags a function.",
    },
}


@dataclass(frozen=True)
class Axis:
    id: str
    """A catalog metric id, or a ``DERIVED_AXES`` key."""
    cutoff: float
    scale: Scale = "log"

    @property
    def derived(self) -> bool:
        return self.id in DERIVED_AXES

    def to_json(self) -> dict[str, Any]:
        if self.derived:
            meta = DERIVED_AXES[self.id]
        else:
            spec = metric_catalog.get(self.id)
            meta = {"label": spec.label, "unit": spec.unit, "unit_one": spec.unit_one, "description": spec.description}
        return {"id": self.id, "derived": self.derived, "cutoff": self.cutoff, "scale": self.scale, **meta}


@dataclass(frozen=True)
class Quadrant:
    id: QuadrantId
    name: str
    description: str


@dataclass(frozen=True)
class Preset:
    id: str
    label: str
    description: str
    x: Axis
    y: Axis
    cohorts: tuple[Cohort, ...]
    quadrants: tuple[Quadrant, Quadrant, Quadrant, Quadrant]
    """In ``QUADRANT_IDS`` order: both high, high x only, high y only, both low."""
    cohort_note: str = ""
    """Why other cohorts are off, shown on the disabled toggle."""

    def quadrant(self, qid: str) -> Quadrant:
        return next(q for q in self.quadrants if q.id == qid)

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "x": self.x.to_json(),
            "y": self.y.to_json(),
            "cohorts": list(self.cohorts),
            "cohort_note": self.cohort_note,
            "quadrants": [{"id": q.id, "name": q.name, "description": q.description} for q in self.quadrants],
        }


# Cut-offs are absolute, not percentiles, so a quadrant means the same thing in
# every repo. The M7 pilot (docs/research/metric-pilot-2026-10) kept the
# activity, blast radius, component weight and findings cut-offs and moved the
# comment ratio from 0.15 to 0.5.
PRESETS: tuple[Preset, ...] = (
    Preset(
        "activity",
        "Activity",
        "Complex files that keep changing are where a refactor pays off first.",
        Axis("complexity", 10),
        Axis("commit_count", 5),
        ("file",),
        (
            Quadrant("high_both", "Hot mess", "Complex and changing often: refactor first."),
            Quadrant("high_x", "Sleeping giant", "Complex but rarely touched: leave it until it wakes."),
            Quadrant("high_y", "Busy, fine", "Changes often and stays simple."),
            Quadrant("low_both", "Quiet", "Simple and stable."),
        ),
        cohort_note="Commits are counted per file",
    ),
    Preset(
        "blast_radius",
        "Blast radius",
        "Complex files that many others import break the most when they change.",
        Axis("complexity", 10),
        Axis("fan_in", 5),
        ("file",),
        (
            Quadrant("high_both", "Load-bearing tangle", "Complex and widely imported: change with tests."),
            Quadrant("high_x", "Isolated mess", "Complex, few importers: safe to rework."),
            Quadrant("high_y", "Hub", "Widely imported and simple: keep it that way."),
            Quadrant("low_both", "Leaf", "Simple, few importers."),
        ),
        cohort_note="Fan-in is counted per file",
    ),
    Preset(
        "component_weight",
        "Component weight",
        "React/Solid components that are long, hook-heavy, or both.",
        Axis("component_loc", 150),
        Axis("component_hook_count", 5),
        ("component",),
        (
            Quadrant("high_both", "God component", "Long and hook-heavy: split state from markup."),
            Quadrant("high_x", "Long markup", "Long with few hooks: extract subcomponents."),
            Quadrant("high_y", "Hook soup", "Short but hook-heavy: pull logic into a custom hook."),
            Quadrant("low_both", "Lean", "Short with few hooks."),
        ),
        cohort_note="Each point is one component",
    ),
    Preset(
        "comment_noise",
        "Comment noise",
        "Whether comments sit on the complex code that needs them.",
        Axis("comment_ratio", 0.5, "linear"),
        Axis("complexity", 10),
        ("file", "function"),
        (
            Quadrant("high_both", "Narrated complexity", "Complex, with as many comment lines as code: check the comments still match it."),
            Quadrant("high_x", "Narrated trivia", "Simple code with as many comment lines as code: trim the comments."),
            Quadrant("high_y", "Complex code", "Complex, with more code than comments: simplify before explaining."),
            Quadrant("low_both", "Clean", "Simple, with more code than comments."),
        ),
    ),
    Preset(
        "findings",
        "Findings",
        "Whether the lint and type checkers flag the complex files or the simple ones.",
        Axis("complexity", 10),
        Axis("finding_count", 3),
        ("file",),
        (
            Quadrant("high_both", "Flagged tangle", "Complex and flagged by the checkers: fix the findings before refactoring."),
            Quadrant("high_x", "Clean but complex", "Complex with quiet checkers: a refactor starts from solid ground."),
            Quadrant("high_y", "Quick cleanup", "Simple code with findings: cheap fixes."),
            Quadrant("low_both", "Clean", "Simple and clean."),
        ),
        cohort_note="Findings are counted per file",
    ),
)

PRESETS_BY_ID: dict[str, Preset] = {p.id: p for p in PRESETS}
PRESET_IDS: tuple[str, ...] = tuple(PRESETS_BY_ID)


def get(preset_id: str) -> Preset:
    try:
        return PRESETS_BY_ID[preset_id]
    except KeyError:
        raise ValueError(f"Unknown quadrant preset: {preset_id}") from None


def presets_payload() -> list[dict[str, Any]]:
    return [p.to_json() for p in PRESETS]


def assign_quadrant(x: float, y: float, cut_x: float, cut_y: float) -> QuadrantId:
    """At or above a cut-off counts as high."""
    high_x, high_y = x >= cut_x, y >= cut_y
    if high_x and high_y:
        return "high_both"
    if high_x:
        return "high_x"
    if high_y:
        return "high_y"
    return "low_both"


# --- Values -----------------------------------------------------------------


def _finite(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if value == value and value not in (float("inf"), float("-inf")) else None


def comment_ratio(node: Node) -> float | None:
    comments = _finite(node.metrics.comment_lines)
    loc = _finite(node.metrics.loc)
    if comments is None or not loc:
        return None
    return comments / loc


def fan_in_by_path(root: Path) -> dict[str, int]:
    """Absolute file path → distinct other files importing it (externals ignored)."""
    from app.services.deps.graph import build_dependency_graph

    graph = build_dependency_graph(root)
    files = {n.id: n.abs_path for n in graph.nodes if n.kind == "file" and n.abs_path}
    importers: dict[str, set[str]] = {}
    for edge in graph.edges:
        source = edge.source.split("#", 1)[0]
        target = edge.target.split("#", 1)[0]
        if target not in files or source == target:
            continue
        importers.setdefault(target, set()).add(source)
    return {abs_path: len(importers.get(fid, ())) for fid, abs_path in files.items()}


def axis_value(axis: Axis, node: Node, fan_in: Mapping[str, int] | None) -> float | None:
    if axis.id == "comment_ratio":
        return comment_ratio(node)
    if axis.id == "fan_in":
        if fan_in is None or node.type != "file":
            return None
        count = fan_in.get(node.path)
        return float(count) if count is not None else None
    return _finite(getattr(node.metrics, axis.id, None))


def cohort_nodes(root: Node, cohort: Cohort) -> list[Node]:
    out: list[Node] = []
    stack = [root]
    while stack:
        node = stack.pop()
        if cohort == "file" and node.type == "file":
            out.append(node)
        elif cohort == "function" and node.type == "function" and node.kind == "function":
            out.append(node)
        elif cohort == "component" and node.type == "function" and node.metrics.component_loc is not None:
            out.append(node)
        stack.extend(node.children)
    return out


def unavailable_reason(preset: Preset, root: Node, plotted: int, fan_in: Mapping[str, int] | None) -> str:
    """Why a preset has no points: the data source is missing, not just N/A here and there."""
    if plotted:
        return ""
    if "commit_count" in (preset.x.id, preset.y.id) and root.activity and root.activity.status == "na":
        return f"No Git history: {root.activity.reason}"
    if "finding_count" in (preset.x.id, preset.y.id) and root.findings and root.findings.status != "ok":
        return f"No checks: {root.findings.reason or 'still running'}"
    if "fan_in" in (preset.x.id, preset.y.id) and not fan_in:
        return "No import graph: needs TS/TSX or Python files"
    if preset.cohorts == ("component",):
        return "No TSX components: needs React/Solid function components"
    return "No files have both values"


def build_quadrants(
    root: Node,
    preset_id: str,
    *,
    cohort: Cohort | None = None,
    root_path: Path | None = None,
    fan_in: Mapping[str, int] | None = None,
    display_path: Callable[[str], str] | None = None,
    cutoffs: tuple[float, float] | None = None,
) -> dict[str, Any]:
    """Every measured node placed in one of the preset's quadrants, worst first in each."""
    preset = get(preset_id)
    cohort = cohort or preset.cohorts[0]
    if cohort not in preset.cohorts:
        raise ValueError(f"{preset.label} plots {', '.join(preset.cohorts)}, not {cohort}")
    if fan_in is None and "fan_in" in (preset.x.id, preset.y.id) and root_path is not None:
        fan_in = fan_in_by_path(root_path)
    cut_x, cut_y = cutoffs or (preset.x.cutoff, preset.y.cutoff)
    show = display_path or (lambda p: p)

    members: dict[str, list[dict[str, Any]]] = {qid: [] for qid in QUADRANT_IDS}
    na = 0
    for node in cohort_nodes(root, cohort):
        x, y = axis_value(preset.x, node, fan_in), axis_value(preset.y, node, fan_in)
        if x is None or y is None:
            na += 1
            continue
        members[assign_quadrant(x, y, cut_x, cut_y)].append(
            {
                "path": show(node.path),
                "name": node.name,
                "node_type": node.type,
                "start_line": node.start_line,
                "end_line": node.end_line,
                "x": _compact(x),
                "y": _compact(y),
            }
        )
    for rows in members.values():
        # Furthest past both cut-offs first; ties by path so the order is stable.
        rows.sort(key=lambda r: (-(_ratio(r["x"], cut_x) + _ratio(r["y"], cut_y)), r["path"], r["start_line"]))

    plotted = sum(len(rows) for rows in members.values())
    return {
        "preset": preset.to_json(),
        "cohort": cohort,
        "cutoffs": {"x": cut_x, "y": cut_y},
        "na_count": na,
        "unavailable": unavailable_reason(preset, root, plotted, fan_in),
        "quadrants": [
            {**{"id": q.id, "name": q.name, "description": q.description}, "count": len(members[q.id]), "members": members[q.id]}
            for q in preset.quadrants
        ],
    }


def render_markdown(result: dict[str, Any], *, limit: int = 20) -> str:
    preset = result["preset"]
    x, y = preset["x"], preset["y"]
    lines = [
        f"## Quadrants: {preset['label']}",
        "",
        f"{preset['description']} X: {x['label']} (cut-off {_fmt(result['cutoffs']['x'])}), "
        f"Y: {y['label']} (cut-off {_fmt(result['cutoffs']['y'])}). One point per {result['cohort']}.",
        "",
    ]
    if result["unavailable"]:
        lines += [f"Not available: {result['unavailable']}.", ""]
        return "\n".join(lines)
    counts = " · ".join(f"{q['name']} {q['count']}" for q in result["quadrants"])
    lines += [f"{counts} · N/A {result['na_count']} (not plotted)", ""]
    for q in result["quadrants"]:
        lines += [f"### {q['name']} ({q['count']})", "", q["description"], ""]
        if not q["members"]:
            lines += ["None.", ""]
            continue
        lines += [f"| Location | {x['label']} | {y['label']} |", "| --- | ---: | ---: |"]
        for row in q["members"][:limit]:
            where = row["path"] if row["node_type"] == "file" else f"{row['path']}:{row['start_line']}"
            lines.append(f"| `{where}` | {_fmt(row['x'])} | {_fmt(row['y'])} |")
        if q["count"] > limit:
            lines.append(f"| … {q['count'] - limit} more | | |")
        lines.append("")
    return "\n".join(lines)


def _ratio(value: float, cutoff: float) -> float:
    return value / cutoff if cutoff > 0 else value


def _compact(value: float) -> int | float:
    return int(value) if float(value).is_integer() else round(value, 3)


def _fmt(value: float) -> str:
    return str(_compact(value))
