from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Literal

from app.models import Metrics, Node
from app.services import analysis, metric_catalog

ARTIFACT_VERSION = 1

ProfileName = Literal["general", "frontend", "backend", "typescript", "python", "docs"]
OutputFormat = Literal["markdown", "json", "both"]

DEFAULT_DEPRIORITIZED_PATHS = (".agents/", "docs/idea/", "vendor/", "vendors/", "node_modules/")


# Report profiles weight risk metrics for the composite findings queue. The
# weights live on each metric in the catalog; neutral metrics have none.
PROFILE_WEIGHTS: dict[str, dict[str, float]] = metric_catalog.profile_weights()


def scan_tree(root_path: Path, *, verbose: bool = True) -> Node:
    return analysis.scan_codebase(root_path, verbose=verbose)


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
    metric: str | None = None,
    limit: int = 50,
    refresh: bool = False,
    tree_depth: int = 3,
    tree_top: int = 6,
    include_tree: bool = False,
    include_dependencies: bool = False,
    focus_paths: Iterable[str] | None = None,
    deprioritize_paths: Iterable[str] | None = DEFAULT_DEPRIORITIZED_PATHS,
    agent_compact: bool = False,
    verbose: bool = True,
    output_format: OutputFormat = "both",
) -> dict[str, Any]:
    del refresh  # Cache support is currently a no-op in app.services.cache.
    if profile not in PROFILE_WEIGHTS:
        raise ValueError(f"Unknown profile: {profile}")
    metric = metric or metric_catalog.profile_lead(profile)

    tree = scan_tree(root_path, verbose=verbose)
    rank_options = dict(profile=profile, root_path=root_path, focus_paths=focus_paths, deprioritize_paths=deprioritize_paths)
    ranked = rank_nodes(tree, cohort="file", **rank_options)
    by_metric = {
        cohort: rank_by_metric(tree, metric, cohort=cohort, root_path=root_path) for cohort in ("file", "function")
    }
    findings = build_findings(ranked, limit=limit)
    summary_tree = summarize_tree(tree, ranked, root_path=root_path, max_depth=tree_depth, top_children=tree_top)
    manifest = build_manifest(root_path=root_path, profile=profile)
    metrics_schema = build_metrics_schema()
    top_findings_limit = min(limit, 20 if agent_compact else 10)
    top_findings = {"findings": findings[:top_findings_limit]}
    action_plan_markdown = render_action_plan(findings=findings, profile=profile)
    payload = {
        "manifest": manifest,
        "tree_summary": summary_tree,
        "hotspots": {
            "metric": metric,
            "label": by_metric["file"]["label"],
            "rankings": by_metric["file"]["ranked"][:limit],
            "function_rankings": by_metric["function"]["ranked"][:limit],
            "na_count": {cohort: result["na_count"] for cohort, result in by_metric.items()},
        },
        "findings": {"findings": findings},
        "findings_top": top_findings,
        "metrics_schema": metrics_schema,
        "report_markdown": render_markdown_report(
            manifest=manifest,
            findings=findings,
            by_metric=by_metric,
            summary_tree=summary_tree,
            profile=profile,
            focus_paths=focus_paths,
            deprioritize_paths=deprioritize_paths,
        ),
        "action_plan_markdown": action_plan_markdown,
        "agent_skill_markdown": render_agent_skill(),
    }
    if include_tree:
        payload["tree"] = _node_to_json(tree)
    if include_dependencies:
        payload["dependencies"] = build_dependencies(root_path)
    payload["manifest"] = enrich_manifest_with_artifacts(
        payload,
        output_format=output_format,
        include_tree=include_tree,
        include_dependencies=include_dependencies,
    )
    return payload


def write_report(
    root_path: Path,
    out_dir: Path,
    *,
    profile: str = "general",
    metric: str | None = None,
    limit: int = 50,
    output_format: OutputFormat = "both",
    refresh: bool = False,
    tree_depth: int = 3,
    tree_top: int = 6,
    include_tree: bool = False,
    include_dependencies: bool = False,
    focus_paths: Iterable[str] | None = None,
    deprioritize_paths: Iterable[str] | None = DEFAULT_DEPRIORITIZED_PATHS,
    agent_compact: bool = False,
    verbose: bool = True,
) -> dict[str, Path]:
    payload = build_report_payload(
        root_path,
        profile=profile,
        metric=metric,
        limit=limit,
        refresh=refresh,
        tree_depth=tree_depth,
        tree_top=tree_top,
        include_tree=include_tree,
        include_dependencies=include_dependencies,
        focus_paths=focus_paths,
        deprioritize_paths=deprioritize_paths,
        agent_compact=agent_compact,
        verbose=verbose,
        output_format=output_format,
    )

    out_dir.mkdir(parents=True, exist_ok=True)

    written: dict[str, Path] = {}
    if output_format in ("json", "both"):
        written["manifest"] = _write_json(out_dir / "manifest.json", payload["manifest"])
        written["tree_summary"] = _write_json(out_dir / "tree.summary.json", payload["tree_summary"])
        written["hotspots"] = _write_json(out_dir / "hotspots.json", payload["hotspots"])
        written["findings"] = _write_json(out_dir / "findings.json", payload["findings"])
        written["findings_top"] = _write_json(out_dir / "findings.top.json", payload["findings_top"])
        written["metrics_schema"] = _write_json(out_dir / "metrics.schema.json", payload["metrics_schema"])
        if include_tree:
            written["tree"] = _write_json(out_dir / "tree.json", payload["tree"])
        if include_dependencies:
            written["dependencies"] = _write_json(out_dir / "dependencies.json", payload["dependencies"])

    if output_format in ("markdown", "both"):
        written["report"] = _write_text(out_dir / "report.md", payload["report_markdown"])
        written["action_plan"] = _write_text(out_dir / "action-plan.md", payload["action_plan_markdown"])
        written["agent_skill"] = _write_text(out_dir / "agent-skill.md", payload["agent_skill_markdown"])

    return written


Cohort = Literal["file", "function"]


def cohort_nodes(root: Node, cohort: Cohort) -> list[Node]:
    """Files, or executable functions (no classes, JSX containers or bodies). Never both."""
    if cohort == "file":
        return [node for node in iter_nodes(root) if node.type == "file"]
    return [node for node in iter_nodes(root) if node.type == "function" and node.kind == "function"]


def witness_of(node: Node, metric: str) -> dict[str, Any] | None:
    """The function or component behind a file's or folder's max, for witnessed metrics."""
    if node.type not in ("file", "folder") or not metric_catalog.get(metric).witness:
        return None
    witness = node.metrics.complexity_witness if metric == "complexity" else (node.metrics.witnesses or {}).get(metric)
    return witness.model_dump() if witness else None


def rank_by_metric(
    root: Node,
    metric: str,
    *,
    cohort: Cohort = "file",
    root_path: Path | None = None,
) -> dict[str, Any]:
    """Rank one cohort by one metric: the explorer's Hot Spots list and the report share this.

    Worst first (descending for higher-worse metrics, ascending for
    lower-worse), then by path and start line, so ties are stable. A measured
    0 is ranked; N/A (``None``) nodes are only counted in ``na_count``. The
    client mirror is ``client/src/utils/hotSpotRanking.ts:rankHotSpots``, and
    ``tests/test_ranking_parity.py`` keeps the two in step.
    """
    spec = metric_catalog.get(metric)
    if not spec.rankable:
        raise ValueError(f"{metric} is neutral detail and can't rank")
    measured: list[tuple[float, Node]] = []
    na_count = 0
    for node in cohort_nodes(root, cohort):
        raw = getattr(node.metrics, metric, None)
        if raw is None or not math.isfinite(float(raw)):
            na_count += 1
            continue
        measured.append((float(raw), node))
    sign = -1 if spec.direction == "higher-worse" else 1
    measured.sort(key=lambda item: (sign * item[0], item[1].path, item[1].start_line))
    top = max((value for value, _ in measured), default=0.0)

    ranked = []
    for index, (value, node) in enumerate(measured, start=1):
        share = value / top if top > 0 else 0.0
        ranked.append(
            {
                "rank": index,
                "path": _display_path(node.path, root_path) if root_path is not None else node.path,
                "name": node.name,
                "node_type": node.type,
                "start_line": node.start_line,
                "end_line": node.end_line,
                "value": _compact_number(value),
                "unit": spec.unit_for(value),
                "score": round(share if spec.direction == "higher-worse" else 1 - share, 4),
                "witness": witness_of(node, metric),
            }
        )
    return {"metric": metric, "label": spec.label, "cohort": cohort, "ranked": ranked, "na_count": na_count}


def rank_nodes(
    root: Node,
    *,
    profile: str = "general",
    cohort: Cohort = "file",
    root_path: Path | None = None,
    focus_paths: Iterable[str] | None = None,
    deprioritize_paths: Iterable[str] | None = DEFAULT_DEPRIORITIZED_PATHS,
) -> list[dict[str, Any]]:
    """Rank one cohort by the profile's weighted, max-normalized metrics.

    A measured 0 counts toward the denominator: it is evidence the node is
    fine on that metric. Only N/A (``None``) metrics drop out, so raising any
    one input with the peers fixed never lowers a node's score.
    """
    weights = PROFILE_WEIGHTS.get(profile, PROFILE_WEIGHTS["general"])
    nodes = cohort_nodes(root, cohort)
    maxima = _metric_maxima(nodes, weights.keys())
    focus_prefixes = tuple(_normalize_path_filter(path) for path in (focus_paths or ()) if path)
    deprioritize_prefixes = tuple(_normalize_path_filter(path) for path in (deprioritize_paths or ()) if path)
    ranked: list[dict[str, Any]] = []

    for node in nodes:
        drivers: list[dict[str, Any]] = []
        weighted_sum = 0.0
        weight_sum = 0.0
        for metric, weight in weights.items():
            raw = getattr(node.metrics, metric, None)
            if raw is None:
                continue
            value = float(raw)
            max_value = maxima.get(metric, 0.0)
            normalized = value / max_value if max_value > 0 else 0.0
            weighted_sum += normalized * weight
            weight_sum += weight
            if value > 0:
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
        display_path = _display_path(node.path, root_path) if root_path is not None else node.path
        path_priority = _path_priority(display_path, focus_prefixes=focus_prefixes, deprioritize_prefixes=deprioritize_prefixes)
        adjusted_score = max(0.0, min(1.0, score * path_priority["multiplier"]))
        witness = node.metrics.complexity_witness
        ranked.append(
            {
                "path": node.path,
                "name": node.name,
                "node_type": node.type,
                "cohort": cohort,
                "start_line": node.start_line,
                "end_line": node.end_line,
                "score": round(adjusted_score, 4),
                "raw_score": round(score, 4),
                "path_priority": path_priority["label"],
                "drivers": sorted(drivers, key=lambda d: d["normalized"] * d["weight"], reverse=True)[:5],
                "metrics": _metrics_subset(node.metrics, weights.keys()),
                "complexity_witness": witness.model_dump() if witness else None,
                "witnesses": {k: w.model_dump() for k, w in (node.metrics.witnesses or {}).items() if k in weights},
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
                "raw_score": item.get("raw_score", item["score"]),
                "path_priority": item.get("path_priority", "neutral"),
                "title": title,
                "evidence": metrics,
                "complexity_witness": item.get("complexity_witness"),
                "witnesses": item.get("witnesses") or {},
                "suggested_action": _suggested_action(category, item),
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
    by_metric: dict[str, dict[str, Any]],
    summary_tree: dict[str, Any],
    profile: str,
    focus_paths: Iterable[str] | None = None,
    deprioritize_paths: Iterable[str] | None = DEFAULT_DEPRIORITIZED_PATHS,
) -> str:
    high_count = sum(1 for finding in findings if finding["priority"] == "high")
    medium_count = sum(1 for finding in findings if finding["priority"] == "medium")
    files, functions = by_metric["file"], by_metric["function"]
    metric, label = files["metric"], files["label"]
    lines = [
        "# Srcly Code Quality Report",
        "",
        "## Summary",
        "",
        f"- Root: `{manifest['root_path']}`",
        f"- Ranked by: `{metric}` ({label}). Pick another with `--metric`.",
        f"- Findings profile: `{profile}`",
        f"- Findings: {len(findings)} total, {high_count} high, {medium_count} medium.",
        f"- Focus paths: `{', '.join(focus_paths or []) or 'none'}`",
        f"- Deprioritized paths: `{', '.join(deprioritize_paths or []) or 'none'}`",
        "",
        "Read first: `report.md`, then `findings.top.json`, then `action-plan.md`. Load full JSON artifacts only when you need detail beyond the top findings.",
        "",
    ]
    for result, noun in ((files, "Files"), (functions, "Functions")):
        lines.extend(
            [
                f"## Top {noun} by {label}",
                "",
                f"{noun} ranked by `{metric}` alone, worst first: the same list as the explorer's Hot Spots."
                + (f" {result['na_count']} {noun.lower()} are N/A for it and not ranked." if result["na_count"] else ""),
                "",
                f"| Rank | {noun[:-1]} | {label} | Where |",
                "| --- | --- | --- | --- |",
            ]
        )
        for item in result["ranked"][:10]:
            where = item["witness"]
            named = f"in `{where['name']}` (line {where['start_line']})" if where else f"`{_format_location(item)}`"
            subject = item["path"] if noun == "Files" else item["name"]
            lines.append(f"| {item['rank']} | `{subject}` | {item['value']} {item['unit']} | {named} |")
        if not result["ranked"]:
            lines.append(f"| – | No {noun.lower()} measure `{metric}` | | |")
        lines.append("")

    lines.extend(
        [
            "## Findings",
            "",
            f"The `{profile}` profile's weighted mix of risk metrics, one triage queue across files.",
            "",
            "| Rank | Priority | Path priority | Path | Why | Suggested next action |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for finding in findings[:10]:
        location = _format_location(finding)
        evidence = _format_evidence(finding)
        lines.append(
            f"| {finding['id']} | {finding['priority']} | {finding.get('path_priority', 'neutral')} | `{location}` | {finding['title']} ({evidence}) | {finding['suggested_action']} |"
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
7. Add `--verbose` to `uvx srcly report` only when per-file scan progress is useful; reports are quiet by default.

## Interpretation Rules

- High complexity means "inspect control flow"; it does not automatically mean "refactor".
- High LOC means "look for separable responsibilities"; it does not automatically mean "split file".
- Component hooks, effects, JSX conditionals and inline handlers name the component carrying them; they suggest state and rendering logic worth extracting.
- `any` and TS ignores suggest type-safety debt.
- Comment noise flags narrated code, oversized docblocks and commented-out code; delete or trim, don't add more.
- Counts in `metrics.schema.json` with `direction: neutral` (TODOs, imports, exports) describe code; they are never risk on their own.

## Output Style

When reporting back, include:

- The top 3-5 targets.
- Why each target matters, with metric evidence.
- Recommended next action.
- Tests or verification needed before changes.
"""


def render_action_plan(*, findings: list[dict[str, Any]], profile: str) -> str:
    lines = [
        "# Srcly Action Plan",
        "",
        f"Profile: `{profile}`",
        "",
        "## Suggested Work Queue",
        "",
    ]
    for index, finding in enumerate(findings[:5], start=1):
        location = _format_location(finding)
        evidence = _format_evidence(finding)
        lines.extend(
            [
                f"{index}. {finding['title']}",
                f"   Evidence: `{location}`; {evidence}; priority={finding['priority']}; path_priority={finding.get('path_priority', 'neutral')}.",
                f"   Safe first patch: {finding['suggested_action']}",
                f"   Verify: inspect nearby tests first, then run the narrowest type-check or test command for the touched package.",
                "",
            ]
        )
    if not findings:
        lines.append("No findings were generated for this scan.")
        lines.append("")
    return "\n".join(lines)


def render_tree_lines(summary_tree: dict[str, Any], *, indent: int = 0) -> list[str]:
    prefix = "  " * indent
    name = summary_tree.get("path") or summary_tree.get("name") or "<unknown>"
    metrics = (
        f"loc={summary_tree.get('loc', 0)} "
        f"complexity={_or_na(summary_tree.get('complexity'))} "
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


def enrich_manifest_with_artifacts(
    payload: dict[str, Any],
    *,
    output_format: OutputFormat,
    include_tree: bool,
    include_dependencies: bool,
) -> dict[str, Any]:
    manifest = dict(payload["manifest"])
    artifact_specs: list[tuple[str, str, Any, int, str]] = []
    if output_format in ("json", "both"):
        artifact_specs.extend(
            [
                ("manifest", "manifest.json", manifest, 1, "full"),
                ("tree_summary", "tree.summary.json", payload["tree_summary"], 4, "full"),
                ("findings_top", "findings.top.json", payload["findings_top"], 2, "full"),
                ("findings", "findings.json", payload["findings"], 5, "top_n"),
                ("hotspots", "hotspots.json", payload["hotspots"], 6, "top_n"),
                ("metrics_schema", "metrics.schema.json", payload["metrics_schema"], 7, "reference"),
            ]
        )
        if include_tree:
            artifact_specs.append(("tree", "tree.json", payload["tree"], 9, "avoid_full_load"))
        if include_dependencies:
            artifact_specs.append(("dependencies", "dependencies.json", payload["dependencies"], 8, "top_n"))
    if output_format in ("markdown", "both"):
        artifact_specs.extend(
            [
                ("report", "report.md", payload["report_markdown"], 1, "full"),
                ("action_plan", "action-plan.md", payload["action_plan_markdown"], 3, "full"),
                ("agent_skill", "agent-skill.md", payload["agent_skill_markdown"], 10, "reference"),
            ]
        )
    manifest["artifacts"] = [
        {
            "name": name,
            "path": path,
            "bytes": len(_json_dumps(content).encode("utf-8")) if not isinstance(content, str) else len(content.encode("utf-8")),
            "read_order": read_order,
            "agent_load": agent_load,
        }
        for name, path, content, read_order, agent_load in sorted(artifact_specs, key=lambda item: (item[3], item[1]))
    ]
    return manifest


def build_metrics_schema() -> dict[str, Any]:
    return {"artifact_version": ARTIFACT_VERSION, **metric_catalog.catalog_payload()}


def build_dependencies(root_path: Path) -> dict[str, Any]:
    """Hierarchical dependency graph (same contract as /api/analysis/dependency-graph)."""
    try:
        from app.services.deps.graph import build_dependency_graph

        graph = build_dependency_graph(root_path)
        return graph.model_dump(mode="json", by_alias=True, exclude_none=True)
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
        values = [getattr(node.metrics, metric, None) for node in nodes]
        maxima[metric] = max((float(v) for v in values if v is not None), default=0.0)
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
    for spec in metric_catalog.METRICS:
        value = getattr(metrics, spec.id, 0)
        if value:
            values.append((spec.id, value))
    values.sort(key=lambda item: abs(float(item[1])), reverse=True)
    return {name: _compact_number(float(value)) for name, value in values[:limit]}


def _category_for_metrics(metrics: dict[str, Any]) -> str:
    if any(metrics.get(name) for name in ("component_hook_count", "component_effect_count", "component_jsx_conditional_count")):
        return "tsx"
    if metrics.get("ts_any_usage_count") or metrics.get("ts_ignore_count"):
        return "typing"
    if metrics.get("comment_noise"):
        return "comments"
    if metrics.get("md_data_url_count"):
        return "docs"
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
        "tsx": "Component carrying too much state and rendering logic",
        "typing": "Type-safety debt signal",
        "comments": "Comment noise",
        "docs": "Documentation artifact risk",
        "size": "Large node worth responsibility review",
        "complexity": "Complexity hotspot",
    }
    return labels.get(category, "Code quality hotspot") + f" in {item['name']}"


def _suggested_action(category: str, item: dict[str, Any] | None = None) -> str:
    path = str((item or {}).get("path", ""))
    is_tsx = path.endswith(".tsx") or "::" in path and ".tsx" in path
    actions = {
        "tsx": (
            "Look first for render-only child components, modal/dialog subtrees, action hooks, and derived selectors to extract; "
            "verify with type-check and targeted UI coverage."
            if is_tsx
            else "Inspect rendering branches, state ownership, and extraction points; add focused UI tests before changing behavior."
        ),
        "typing": "Review whether `any` or ignore directives can be replaced with precise types.",
        "comments": "Delete commented-out code, cut docblocks that restate the code, and keep comments that explain why.",
        "docs": "Check whether large embedded data URLs should move to external assets.",
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
    if metrics.comment_noise:
        parts.append(f"{metrics.comment_noise} comment noise flags")
    return "High " + ", ".join(parts) if parts else "Metric hotspot"


def _or_na(value: Any) -> Any:
    return "n/a" if value is None else value


def _format_evidence(finding: dict[str, Any]) -> str:
    """``key=value`` pairs; complexity names the function that sets it."""
    witness = finding.get("complexity_witness")
    parts = []
    for key, value in finding["evidence"].items():
        if not value:
            continue
        named = witness if key == "complexity" else (finding.get("witnesses") or {}).get(key)
        if named:
            parts.append(f"{key}={value} in `{named['name']}` (line {named['start_line']})")
        else:
            parts.append(f"{key}={value}")
    return ", ".join(parts) or "metric signal"


def _format_location(finding: dict[str, Any]) -> str:
    if finding.get("start_line") and finding.get("end_line"):
        return f"{finding['path']}:{finding['start_line']}-{finding['end_line']}"
    return finding["path"]


def _display_path(path: str, root_path: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(root_path.resolve()))
    except Exception:
        return path


def _normalize_path_filter(path: str) -> str:
    normalized = path.strip().replace("\\", "/").strip("/")
    return f"{normalized}/" if normalized and not Path(normalized).suffix else normalized


def _path_priority(
    display_path: str,
    *,
    focus_prefixes: tuple[str, ...],
    deprioritize_prefixes: tuple[str, ...],
) -> dict[str, Any]:
    normalized = display_path.replace("\\", "/").lstrip("/")
    if focus_prefixes and any(normalized == prefix.rstrip("/") or normalized.startswith(prefix) for prefix in focus_prefixes):
        return {"label": "focused", "multiplier": 1.25}
    if any(normalized == prefix.rstrip("/") or normalized.startswith(prefix) for prefix in deprioritize_prefixes):
        return {"label": "deprioritized", "multiplier": 0.55}
    return {"label": "neutral", "multiplier": 1.0}


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
