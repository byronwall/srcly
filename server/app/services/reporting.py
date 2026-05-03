from __future__ import annotations

import json
import math
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Literal

from app.models import Metrics, Node
from app.services import analysis

ARTIFACT_VERSION = 1

ProfileName = Literal["general", "frontend", "backend", "typescript", "python", "docs"]
OutputFormat = Literal["markdown", "json", "both"]


@dataclass(frozen=True)
class MetricDefinition:
    name: str
    description: str
    scope: str
    aggregation: str
    higher_is_riskier: bool = True
    languages: str = "all"


METRIC_DEFINITIONS: tuple[MetricDefinition, ...] = (
    MetricDefinition("loc", "Lines of code excluding comments/blanks where available.", "folder/file/function/scope", "sum"),
    MetricDefinition("complexity", "Cyclomatic complexity.", "folder/file/function/scope", "max for folders, average for files, exact for functions"),
    MetricDefinition("function_count", "Detected function count.", "folder/file", "sum"),
    MetricDefinition("file_size", "File size in bytes.", "folder/file", "sum"),
    MetricDefinition("file_count", "Number of files represented by a node.", "folder/file", "sum"),
    MetricDefinition("comment_lines", "Comment lines.", "folder/file/function", "sum", higher_is_riskier=False),
    MetricDefinition("comment_density", "Comment lines divided by LOC.", "folder/file/function", "derived", higher_is_riskier=False),
    MetricDefinition("max_nesting_depth", "Maximum control-flow or syntax nesting depth.", "folder/file/function", "max"),
    MetricDefinition("average_function_length", "Average function length in LOC.", "folder/file", "weighted average"),
    MetricDefinition("parameter_count", "Function parameter count.", "folder/file/function", "sum"),
    MetricDefinition("todo_count", "TODO/FIXME-style comment count.", "folder/file/function", "sum"),
    MetricDefinition("classes_count", "Detected class count.", "folder/file", "sum"),
    MetricDefinition("tsx_nesting_depth", "Maximum JSX/TSX nesting depth.", "folder/file/function", "max", languages="TypeScript/TSX"),
    MetricDefinition("tsx_render_branching_count", "Render-time branch count in TSX.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("tsx_react_use_effect_count", "React useEffect call count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("tsx_anonymous_handler_count", "Inline/anonymous TSX handler count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("tsx_prop_count", "TSX prop count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("ts_any_usage_count", "`any` usage count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("ts_ignore_count", "TypeScript ignore directive count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("ts_import_coupling_count", "TypeScript import coupling count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("tsx_hardcoded_string_volume", "Hardcoded TSX string volume.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("tsx_duplicated_string_count", "Duplicated TSX string count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("ts_type_interface_count", "Type/interface declaration count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("ts_export_count", "Export declaration count.", "folder/file/function", "sum", languages="TypeScript/TSX"),
    MetricDefinition("python_import_count", "Python import count.", "folder/file", "sum", languages="Python"),
    MetricDefinition("md_data_url_count", "Markdown data URL count.", "folder/file/function", "sum", languages="Markdown"),
)

PROFILE_WEIGHTS: dict[str, dict[str, float]] = {
    "general": {
        "complexity": 1.5,
        "loc": 1.1,
        "todo_count": 0.9,
        "max_nesting_depth": 1.0,
        "parameter_count": 0.6,
        "ts_any_usage_count": 0.8,
        "ts_ignore_count": 0.9,
        "ts_import_coupling_count": 0.8,
        "tsx_render_branching_count": 0.9,
        "python_import_count": 0.5,
        "md_data_url_count": 0.4,
    },
    "frontend": {
        "complexity": 1.0,
        "loc": 0.8,
        "tsx_nesting_depth": 1.2,
        "tsx_render_branching_count": 1.5,
        "tsx_anonymous_handler_count": 1.0,
        "tsx_prop_count": 1.0,
        "tsx_hardcoded_string_volume": 0.8,
        "tsx_duplicated_string_count": 0.9,
        "ts_import_coupling_count": 0.9,
    },
    "backend": {
        "complexity": 1.6,
        "loc": 1.0,
        "max_nesting_depth": 1.2,
        "parameter_count": 0.9,
        "classes_count": 0.6,
        "todo_count": 0.8,
        "python_import_count": 0.9,
    },
    "typescript": {
        "complexity": 1.0,
        "ts_any_usage_count": 1.4,
        "ts_ignore_count": 1.4,
        "ts_import_coupling_count": 1.1,
        "ts_export_count": 0.7,
        "ts_type_interface_count": 0.5,
        "tsx_render_branching_count": 1.0,
    },
    "python": {
        "complexity": 1.4,
        "loc": 1.0,
        "max_nesting_depth": 1.0,
        "parameter_count": 0.8,
        "python_import_count": 1.2,
    },
    "docs": {
        "loc": 0.8,
        "md_data_url_count": 1.6,
        "todo_count": 0.6,
    },
}


def scan_tree(root_path: Path) -> Node:
    return analysis.scan_codebase(root_path)


def write_scan(root_path: Path, out_path: Path, *, refresh: bool = False) -> Path:
    del refresh  # Cache support is currently a no-op in app.services.cache.
    tree = scan_tree(root_path)
    if str(out_path) == "-":
        print(_json_dumps(_node_to_json(tree)), end="")
        return out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(_json_dumps(_node_to_json(tree)), encoding="utf-8")
    return out_path


def build_report_payload(
    root_path: Path,
    *,
    profile: str = "general",
    limit: int = 50,
    refresh: bool = False,
    tree_depth: int = 3,
    tree_top: int = 6,
    include_tree: bool = False,
    include_dependencies: bool = False,
) -> dict[str, Any]:
    del refresh  # Cache support is currently a no-op in app.services.cache.
    if profile not in PROFILE_WEIGHTS:
        raise ValueError(f"Unknown profile: {profile}")

    tree = scan_tree(root_path)
    ranked = rank_nodes(tree, profile=profile)
    findings = build_findings(ranked, limit=limit)
    summary_tree = summarize_tree(tree, ranked, root_path=root_path, max_depth=tree_depth, top_children=tree_top)
    manifest = build_manifest(root_path=root_path, profile=profile)
    metrics_schema = build_metrics_schema()
    payload = {
        "manifest": manifest,
        "tree_summary": summary_tree,
        "hotspots": {"rankings": [r for r in ranked[:limit]]},
        "findings": {"findings": findings},
        "metrics_schema": metrics_schema,
        "report_markdown": render_markdown_report(
            manifest=manifest,
            findings=findings,
            ranked=ranked[:limit],
            summary_tree=summary_tree,
            profile=profile,
        ),
        "agent_skill_markdown": render_agent_skill(),
    }
    if include_tree:
        payload["tree"] = _node_to_json(tree)
    if include_dependencies:
        payload["dependencies"] = build_dependencies(root_path)
    return payload


def write_report(
    root_path: Path,
    out_dir: Path,
    *,
    profile: str = "general",
    limit: int = 50,
    output_format: OutputFormat = "both",
    refresh: bool = False,
    tree_depth: int = 3,
    tree_top: int = 6,
    include_tree: bool = False,
    include_dependencies: bool = False,
) -> dict[str, Path]:
    payload = build_report_payload(
        root_path,
        profile=profile,
        limit=limit,
        refresh=refresh,
        tree_depth=tree_depth,
        tree_top=tree_top,
        include_tree=include_tree,
        include_dependencies=include_dependencies,
    )

    out_dir.mkdir(parents=True, exist_ok=True)

    written: dict[str, Path] = {}
    if output_format in ("json", "both"):
        written["manifest"] = _write_json(out_dir / "manifest.json", payload["manifest"])
        written["tree_summary"] = _write_json(out_dir / "tree.summary.json", payload["tree_summary"])
        written["hotspots"] = _write_json(out_dir / "hotspots.json", payload["hotspots"])
        written["findings"] = _write_json(out_dir / "findings.json", payload["findings"])
        written["metrics_schema"] = _write_json(out_dir / "metrics.schema.json", payload["metrics_schema"])
        if include_tree:
            written["tree"] = _write_json(out_dir / "tree.json", payload["tree"])
        if include_dependencies:
            written["dependencies"] = _write_json(out_dir / "dependencies.json", payload["dependencies"])

    if output_format in ("markdown", "both"):
        written["report"] = _write_text(out_dir / "report.md", payload["report_markdown"])
        written["agent_skill"] = _write_text(out_dir / "agent-skill.md", payload["agent_skill_markdown"])

    return written


def rank_nodes(root: Node, *, profile: str = "general") -> list[dict[str, Any]]:
    weights = PROFILE_WEIGHTS.get(profile, PROFILE_WEIGHTS["general"])
    nodes = [node for node in iter_nodes(root) if node.type != "folder" and node.metrics is not None]
    maxima = _metric_maxima(nodes, weights.keys())
    ranked: list[dict[str, Any]] = []

    for node in nodes:
        drivers: list[dict[str, Any]] = []
        weighted_sum = 0.0
        weight_sum = 0.0
        for metric, weight in weights.items():
            value = float(getattr(node.metrics, metric, 0) or 0)
            if value <= 0:
                continue
            max_value = maxima.get(metric, 0.0)
            normalized = value / max_value if max_value > 0 else 0.0
            weighted_sum += normalized * weight
            weight_sum += weight
            drivers.append(
                {
                    "metric": metric,
                    "value": _compact_number(value),
                    "normalized": round(normalized, 4),
                    "weight": weight,
                }
            )

        if weight_sum == 0:
            continue

        score = weighted_sum / weight_sum
        ranked.append(
            {
                "path": node.path,
                "name": node.name,
                "node_type": node.type,
                "start_line": node.start_line,
                "end_line": node.end_line,
                "score": round(score, 4),
                "drivers": sorted(drivers, key=lambda d: d["normalized"] * d["weight"], reverse=True)[:5],
                "metrics": _metrics_subset(node.metrics, weights.keys()),
                "reason": _reason_for_node(node),
            }
        )

    ranked.sort(key=lambda item: item["score"], reverse=True)
    for index, item in enumerate(ranked, start=1):
        item["rank"] = index
    return ranked


def build_findings(ranked: list[dict[str, Any]], *, limit: int = 50) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for item in ranked:
        if len(findings) >= limit:
            break
        metrics = item.get("metrics", {})
        category = _category_for_metrics(metrics)
        key = (item["path"], category)
        if key in seen:
            continue
        seen.add(key)
        priority = _priority_for_score(float(item["score"]))
        title = _title_for_category(category, item)

        findings.append(
            {
                "id": f"srcly-{len(findings) + 1:03d}",
                "priority": priority,
                "category": category,
                "path": item["path"],
                "node_type": item["node_type"],
                "start_line": item["start_line"],
                "end_line": item["end_line"],
                "score": item["score"],
                "title": title,
                "evidence": metrics,
                "suggested_action": _suggested_action(category),
                "agent_prompt": _agent_prompt(category),
            }
        )

    return findings


def summarize_tree(
    root: Node,
    ranked: list[dict[str, Any]],
    *,
    root_path: Path,
    max_depth: int = 4,
    top_children: int = 12,
) -> dict[str, Any]:
    score_by_identity = {
        _node_identity(item["path"], item["start_line"], item["end_line"], item["node_type"]): item["score"]
        for item in ranked
    }

    def convert(node: Node, depth: int) -> dict[str, Any]:
        metrics = node.metrics or Metrics()
        summary = {
            "name": node.name,
            "path": _display_path(node.path, root_path),
            "type": node.type,
            "start_line": node.start_line,
            "end_line": node.end_line,
            "loc": metrics.loc,
            "complexity": metrics.complexity,
            "function_count": metrics.function_count,
            "file_count": metrics.file_count,
            "hotspot_score": score_by_identity.get(_node_identity(node.path, node.start_line, node.end_line, node.type), 0.0),
            "top_metrics": _top_nonzero_metrics(metrics),
            "children": [],
        }
        if depth >= max_depth:
            return summary

        children = sorted(
            node.children,
            key=lambda child: (
                score_by_identity.get(_node_identity(child.path, child.start_line, child.end_line, child.type), 0.0),
                child.metrics.loc if child.metrics else 0,
            ),
            reverse=True,
        )
        summary["children"] = [convert(child, depth + 1) for child in children[:top_children]]
        return summary

    return convert(root, 0)


def render_markdown_report(
    *,
    manifest: dict[str, Any],
    findings: list[dict[str, Any]],
    ranked: list[dict[str, Any]],
    summary_tree: dict[str, Any],
    profile: str,
) -> str:
    high_count = sum(1 for finding in findings if finding["priority"] == "high")
    medium_count = sum(1 for finding in findings if finding["priority"] == "medium")
    lines = [
        "# Srcly Code Quality Report",
        "",
        "## Summary",
        "",
        f"- Root: `{manifest['root_path']}`",
        f"- Profile: `{profile}`",
        f"- Ranked hotspots: {len(ranked)}",
        f"- Findings: {len(findings)} total, {high_count} high, {medium_count} medium.",
        "",
        "## Top Targets",
        "",
        "| Rank | Priority | Path | Why | Suggested next action |",
        "| --- | --- | --- | --- | --- |",
    ]

    for finding in findings[:10]:
        location = _format_location(finding)
        evidence = ", ".join(f"{key}={value}" for key, value in finding["evidence"].items() if value) or "metric signal"
        lines.append(
            f"| {finding['id']} | {finding['priority']} | `{location}` | {finding['title']} ({evidence}) | {finding['suggested_action']} |"
        )

    lines.extend(
        [
            "",
            "## Tree Summary",
            "",
            "```text",
            *render_tree_lines(summary_tree),
            "```",
            "",
            "## Agent Notes",
            "",
            "- Treat findings as triage signals, not confirmed bugs.",
            "- Inspect the referenced source and tests before editing.",
            "- Prefer small, behavior-preserving changes unless the requested task calls for a larger refactor.",
        ]
    )

    return "\n".join(lines) + "\n"


def render_agent_skill() -> str:
    return """# Srcly Code Quality Skill

Use this skill when asked to review, prioritize, or improve a codebase using Srcly artifacts.

## Workflow

1. Run `uvx srcly report . --out .srcly --format both` from the repository root.
2. Read `.srcly/report.md`.
3. Load `.srcly/findings.json` and sort by `priority`, then `score`.
4. For each selected finding, inspect the source file and nearby tests before proposing or making edits.
5. Use `.srcly/tree.summary.json` to understand whether a target is an isolated hotspot or part of a broader subsystem.
6. Use `uvx srcly scan . --out .srcly/tree.json` or `uvx srcly report . --include-tree` only when the compact summary is insufficient.

## Interpretation Rules

- High complexity means "inspect control flow"; it does not automatically mean "refactor".
- High LOC means "look for separable responsibilities"; it does not automatically mean "split file".
- TSX render branching, inline handlers, and prop count suggest UI complexity and test-surface risk.
- `any` and TS ignores suggest type-safety debt.
- Import coupling suggests dependency-boundary review.
- Low comments are only concerning when paired with complexity, public API behavior, or non-obvious domain logic.

## Output Style

When reporting back, include:

- The top 3-5 targets.
- Why each target matters, with metric evidence.
- Recommended next action.
- Tests or verification needed before changes.
"""


def render_tree_lines(summary_tree: dict[str, Any], *, indent: int = 0) -> list[str]:
    prefix = "  " * indent
    name = summary_tree.get("path") or summary_tree.get("name") or "<unknown>"
    metrics = (
        f"loc={summary_tree.get('loc', 0)} "
        f"complexity={summary_tree.get('complexity', 0)} "
        f"files={summary_tree.get('file_count', 0)} "
        f"hotspot={summary_tree.get('hotspot_score', 0)}"
    )
    lines = [f"{prefix}{name}  {metrics}"]
    for child in summary_tree.get("children", []):
        lines.extend(render_tree_lines(child, indent=indent + 1))
    return lines


def build_manifest(*, root_path: Path, profile: str) -> dict[str, Any]:
    repo_root = analysis.find_repo_root(root_path)
    return {
        "srcly_version": _srcly_version(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root_path": str(root_path.resolve()),
        "repo_root_path": str(repo_root),
        "cache_used": False,
        "profiles": [profile],
        "artifact_version": ARTIFACT_VERSION,
    }


def build_metrics_schema() -> dict[str, Any]:
    return {
        "artifact_version": ARTIFACT_VERSION,
        "metrics": [
            {
                "name": item.name,
                "description": item.description,
                "scope": item.scope,
                "aggregation": item.aggregation,
                "higher_is_riskier": item.higher_is_riskier,
                "languages": item.languages,
            }
            for item in METRIC_DEFINITIONS
        ],
    }


def build_dependencies(root_path: Path) -> dict[str, Any]:
    try:
        from app.routers import analysis as analysis_router

        graph = asyncio.run(analysis_router.get_dependencies(str(root_path)))
        return graph.model_dump(mode="json")
    except Exception as exc:
        return {
            "nodes": [],
            "edges": [],
            "error": f"Failed to build dependency graph: {exc}",
        }


def iter_nodes(root: Node) -> Iterable[Node]:
    yield root
    for child in root.children:
        yield from iter_nodes(child)


def _node_to_json(node: Node) -> dict[str, Any]:
    return node.model_dump(mode="json")


def _metric_maxima(nodes: list[Node], metrics: Iterable[str]) -> dict[str, float]:
    maxima: dict[str, float] = {}
    for metric in metrics:
        maxima[metric] = max((float(getattr(node.metrics, metric, 0) or 0) for node in nodes), default=0.0)
    return maxima


def _metrics_subset(metrics: Metrics, names: Iterable[str]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name in names:
        value = getattr(metrics, name, 0)
        if value:
            result[name] = _compact_number(float(value))
    return result


def _top_nonzero_metrics(metrics: Metrics, *, limit: int = 6) -> dict[str, Any]:
    values = []
    for definition in METRIC_DEFINITIONS:
        value = getattr(metrics, definition.name, 0)
        if value:
            values.append((definition.name, value))
    values.sort(key=lambda item: abs(float(item[1])), reverse=True)
    return {name: _compact_number(float(value)) for name, value in values[:limit]}


def _category_for_metrics(metrics: dict[str, Any]) -> str:
    if metrics.get("tsx_render_branching_count") or metrics.get("tsx_nesting_depth") or metrics.get("tsx_prop_count"):
        return "tsx"
    if metrics.get("ts_any_usage_count") or metrics.get("ts_ignore_count"):
        return "typing"
    if metrics.get("ts_import_coupling_count"):
        return "coupling"
    if metrics.get("md_data_url_count"):
        return "docs"
    if metrics.get("python_import_count"):
        return "python"
    if metrics.get("todo_count"):
        return "maintainability"
    if metrics.get("loc", 0) >= metrics.get("complexity", 0) * 20:
        return "size"
    return "complexity"


def _priority_for_score(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


def _title_for_category(category: str, item: dict[str, Any]) -> str:
    labels = {
        "tsx": "TSX surface with concentrated rendering complexity",
        "typing": "Type-safety debt signal",
        "coupling": "Import coupling hotspot",
        "docs": "Documentation artifact risk",
        "python": "Python module shape hotspot",
        "maintainability": "Maintainability marker in a hotspot",
        "size": "Large node worth responsibility review",
        "complexity": "Complexity hotspot",
    }
    return labels.get(category, "Code quality hotspot") + f" in {item['name']}"


def _suggested_action(category: str) -> str:
    actions = {
        "tsx": "Inspect rendering branches, state ownership, and extraction points; add focused UI tests before changing behavior.",
        "typing": "Review whether `any` or ignore directives can be replaced with precise types.",
        "coupling": "Inspect dependency boundaries and look for imports that can be inverted, localized, or simplified.",
        "docs": "Check whether large embedded data URLs should move to external assets.",
        "python": "Inspect module responsibilities and import boundaries before refactoring.",
        "maintainability": "Review TODOs in context and either resolve, ticket, or remove stale comments.",
        "size": "Look for separable responsibilities and tests that protect behavior.",
        "complexity": "Trace the control flow and identify behavior-preserving simplification points.",
    }
    return actions.get(category, "Inspect the code and nearby tests before making a small targeted change.")


def _agent_prompt(category: str) -> str:
    return (
        f"Investigate this {category} finding. Use the metrics as triage evidence, "
        "then inspect the source and tests directly. Recommend or make the smallest behavior-preserving improvement."
    )


def _reason_for_node(node: Node) -> str:
    metrics = node.metrics or Metrics()
    parts = []
    if metrics.complexity:
        parts.append(f"complexity {metrics.complexity:g}")
    if metrics.loc:
        parts.append(f"{metrics.loc} LOC")
    if metrics.max_nesting_depth:
        parts.append(f"nesting depth {metrics.max_nesting_depth}")
    if metrics.todo_count:
        parts.append(f"{metrics.todo_count} TODOs")
    return "High " + ", ".join(parts) if parts else "Metric hotspot"


def _format_location(finding: dict[str, Any]) -> str:
    if finding.get("start_line") and finding.get("end_line"):
        return f"{finding['path']}:{finding['start_line']}-{finding['end_line']}"
    return finding["path"]


def _display_path(path: str, root_path: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(root_path.resolve()))
    except Exception:
        return path


def _node_identity(path: str, start_line: int, end_line: int, node_type: str) -> str:
    return f"{path}|{node_type}|{start_line}|{end_line}"


def _compact_number(value: float) -> int | float:
    if math.isfinite(value) and value.is_integer():
        return int(value)
    return round(value, 4)


def _srcly_version() -> str:
    try:
        from importlib.metadata import version

        return version("srcly")
    except Exception:
        return "unknown"


def _write_json(path: Path, payload: Any) -> Path:
    path.write_text(_json_dumps(payload), encoding="utf-8")
    return path


def _write_text(path: Path, payload: str) -> Path:
    path.write_text(payload, encoding="utf-8")
    return path


def _json_dumps(payload: Any) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"
