# Srcly Agentic Pipeline Proposal

## Goal

Expose Srcly's analysis data as a non-interactive agent step, not only as an interactive treemap UI.

The target workflow is:

```bash
uvx srcly report [path] --out .srcly
```

An agent can run that command, read stable artifact files, and use a companion skill file to decide where to inspect, refactor, test, or split follow-up work. The UI remains useful for humans, but it should no longer be the only practical way to consume the tree and metrics.

## Why This Fits Srcly

Srcly already produces a rich hierarchical model:

- Folders, files, functions, nested scopes, and body fragments.
- Core metrics such as LOC, complexity, file count, file size, comments, TODOs, nesting, parameters, classes, and function counts.
- TypeScript/TSX metrics such as JSX nesting, render branches, `useEffect`, inline handlers, prop counts, `any`, `ts-ignore`, import coupling, hardcoded strings, duplicated strings, type/interface counts, and exports.
- Python import counts.
- Markdown data URL counts.
- Dependency graph and data-flow/scope APIs for deeper TS/TSX inspection.

The missing piece is a headless contract: a command that packages this information into ranked findings, a navigable tree, and explicit guidance for an agent.

## Proposed CLI

Keep the existing behavior:

```bash
uvx srcly [path]
```

This continues to start the FastAPI server and browser UI.

Add these non-interactive subcommands:

```bash
uvx srcly scan [path] --out .srcly/tree.json
uvx srcly report [path] --out .srcly
uvx srcly hotspots [path] --metric complexity --limit 25 --format markdown
uvx srcly explain [path] --file client/src/App.tsx --format markdown
```

Recommended first implementation:

```bash
uvx srcly report [path] --out .srcly
```

That one command can cover most agent use cases and emit multiple artifacts.

### `scan`

Runs the current `analysis.scan_codebase` pipeline and writes the raw `Node` tree without starting a server.

Options:

- `--out <file>`: output path, default `codebase_mri.json`.
- `--refresh`: ignore existing cache.
- `--format json|jsonl`: default `json`.
- `--include-source false|snippets|none`: default `none`; do not dump whole files by default.

### `report`

Runs a scan, derives ranked findings, and writes an artifact directory.

Options:

- `--out <dir>`: default `.srcly`.
- `--refresh`: ignore existing cache.
- `--limit <n>`: default `50` ranked findings.
- `--profile general|frontend|backend|typescript|python|docs`: default `general`.
- `--format markdown|json|both`: default `both`.
- `--fail-on high|medium|none`: optional CI/agent gate.

### `hotspots`

Prints ranked nodes for one or more metrics.

Examples:

```bash
uvx srcly hotspots . --metric complexity --metric ts_any_usage_count --limit 20
uvx srcly hotspots . --metric comment_density --invert --format json
```

This is useful for lightweight agent loops where a full report is too much.

### `explain`

Prints an agent-oriented summary for one file or subtree, including local metrics, child scopes, dependency graph edges where available, and suggested follow-up questions.

Example:

```bash
uvx srcly explain . --file client/src/components/Treemap.tsx
```

## Report Artifacts

`uvx srcly report . --out .srcly` should produce compact artifacts by default:

```text
.srcly/
  manifest.json
  report.md
  findings.json
  tree.summary.json
  hotspots.json
  metrics.schema.json
  agent-skill.md
```

Expensive artifacts are opt-in:

- `uvx srcly scan . --out .srcly/tree.json` or `uvx srcly report . --include-tree`
- `uvx srcly report . --include-dependencies`

### `manifest.json`

Metadata for reproducibility:

```json
{
  "srcly_version": "0.1.x",
  "generated_at": "2026-05-03T00:00:00Z",
  "root_path": "/repo",
  "repo_root_path": "/repo",
  "cache_used": false,
  "profiles": ["general"],
  "artifact_version": 1
}
```

### `tree.json`

The full current `Node` tree. This is the canonical machine-readable model and can be large, so it is generated only by `scan` or `report --include-tree`.

It should preserve:

- `name`
- `type`
- `path`
- `start_line`
- `end_line`
- `metrics`
- `children`

### `tree.summary.json`

A compressed tree for quick agent context. It should keep structure and high-signal metrics while omitting low-value children below configurable thresholds.

Example node:

```json
{
  "path": "client/src/components/Treemap.tsx",
  "type": "file",
  "loc": 612,
  "complexity": 18,
  "function_count": 21,
  "hotspot_score": 0.87,
  "top_metrics": {
    "complexity": 18,
    "tsx_render_branching_count": 12,
    "tsx_prop_count": 44
  },
  "children": [
    {
      "name": "Treemap",
      "type": "function",
      "start_line": 89,
      "end_line": 520,
      "loc": 366,
      "complexity": 15
    }
  ]
}
```

### `hotspots.json`

Metric-ranked nodes, normalized to make cross-metric comparison easier.

```json
{
  "rankings": [
    {
      "rank": 1,
      "path": "client/src/components/Treemap.tsx",
      "node_type": "file",
      "start_line": 0,
      "end_line": 0,
      "score": 0.91,
      "drivers": [
        { "metric": "complexity", "value": 18, "normalized": 0.92 },
        { "metric": "loc", "value": 612, "normalized": 0.89 }
      ],
      "reason": "Large file with high complexity and many nested render paths."
    }
  ]
}
```

### `findings.json`

Opinionated, agent-actionable findings derived from metric rules. Findings should not claim bugs. They should identify maintenance risk and suggest inspection targets.

Finding fields:

- `id`
- `priority`: `high`, `medium`, `low`
- `category`: `complexity`, `size`, `tsx`, `typing`, `coupling`, `docs`, `python`, `style`, `testing-target`
- `path`
- `start_line`
- `end_line`
- `title`
- `evidence`
- `suggested_action`
- `agent_prompt`

Example:

```json
{
  "id": "srcly-001",
  "priority": "high",
  "category": "tsx",
  "path": "client/src/components/Treemap.tsx",
  "start_line": 89,
  "end_line": 520,
  "title": "Large TSX component with several render-branching signals",
  "evidence": {
    "loc": 366,
    "complexity": 15,
    "tsx_render_branching_count": 12,
    "tsx_anonymous_handler_count": 8
  },
  "suggested_action": "Inspect whether state, data preparation, and rendering can be separated without changing behavior.",
  "agent_prompt": "Review this component for safe extraction points. Prioritize behavior-preserving refactors and identify tests needed before editing."
}
```

### `report.md`

A human and agent readable executive summary:

```markdown
# Srcly Code Quality Report

## Summary

- 1,248 files analyzed.
- 27 high-priority hotspots.
- Highest-risk themes: TSX component size, import coupling, low comment density in complex modules.

## Top Targets

| Rank | Path | Why | Suggested next action |
| --- | --- | --- | --- |
| 1 | client/src/components/Treemap.tsx | High LOC + complexity + TSX branching | Review for extraction and focused tests |

## Tree Summary

...
```

### `dependencies.json`

Use the current TypeScript/TSX dependency graph where available. Later versions can support language-specific dependency graph enrichments.

### `metrics.schema.json`

Document every emitted metric:

- Name.
- Type.
- Scope: folder/file/function/scope.
- Applies to all languages or specific extensions.
- Aggregation behavior.
- Whether higher is usually riskier.
- Suggested interpretation.

This file prevents agents from guessing what a metric means.

### `agent-skill.md`

Generate a reusable skill file that teaches an agent how to consume Srcly artifacts.

The generated skill should be stable enough to copy into an agent's skill directory, but it can include the local artifact paths from the report run.

## Agent Skill Contract

The skill should tell an agent:

1. Run `uvx srcly report . --out .srcly --format both` before broad code-quality work.
2. Read `.srcly/report.md` first for summary and top targets.
3. Read `.srcly/findings.json` for machine-readable action items.
4. Read `.srcly/tree.summary.json` to understand repository structure and metric distribution.
5. Use `uvx srcly scan . --out .srcly/tree.json` or `uvx srcly report . --include-tree` only when deeper context is needed.
6. Treat metrics as triage signals, not proof of defects.
7. Before editing, inspect the referenced code and tests directly.
8. Prefer small, behavior-preserving changes unless the user asks for a larger refactor.

Example skill body:

```markdown
# Srcly Code Quality Skill

Use this skill when asked to review, prioritize, or improve a codebase using Srcly artifacts.

## Workflow

1. Run `uvx srcly report . --out .srcly --format both` from the repository root.
2. Read `.srcly/report.md`.
3. Load `.srcly/findings.json` and sort by `priority`, then `score`.
4. For each selected finding, inspect the source file and nearby tests before proposing or making edits.
5. Use `.srcly/tree.summary.json` to understand whether a target is an isolated hotspot or part of a broader subsystem.
6. Generate `.srcly/tree.json` only when the compact summary is insufficient.

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
```

## Finding Heuristics

Initial rule set:

| Category | Signal | Suggested priority |
| --- | --- | --- |
| Complexity | `complexity` above repo p90 or absolute threshold | High/medium |
| Size | `loc` above repo p90 with non-trivial complexity | Medium |
| TSX rendering | High `tsx_render_branching_count`, `tsx_nesting_depth`, or `tsx_prop_count` | High/medium |
| Type safety | `ts_any_usage_count` or `ts_ignore_count` | Medium |
| Coupling | High `ts_import_coupling_count` or many dependency edges | Medium |
| Maintainability | High `todo_count` in complex files | Medium |
| Docs risk | High `md_data_url_count` | Low/medium |
| Python module shape | High `python_import_count` with high LOC or complexity | Medium |

Use percentile-based thresholds by default so reports adapt to small and large repositories. Include absolute minimum thresholds to avoid noisy reports in tiny projects.

## Tree Breakdown Format

Agents need a content breakdown that is easier to scan than the raw UI tree. Add a Markdown tree section in `report.md` and a machine-readable `tree.summary.json`.

Markdown example:

```text
root
  client/                 loc=12,820 complexity_max=31 files=148
    src/components/       loc=5,420 complexity_max=31 files=42
      Treemap.tsx         loc=612 complexity=18 funcs=21 hotspot=0.91
        Treemap()         lines=89-520 loc=366 complexity=15
        getStableNodeKey() lines=48-82 loc=31 complexity=4
  server/                 loc=8,410 complexity_max=24 files=61
    app/services/         loc=4,930 complexity_max=24 files=19
```

Include only the top N children by hotspot score at each level by default, with an option:

```bash
uvx srcly report . --tree-depth 4 --tree-top 12
```

## Implementation Plan

### Phase 1: Headless Report

- Add argparse subcommands in `server/app/run.py`.
- Reuse `analysis.scan_codebase`.
- Serialize the current `Node` tree via Pydantic.
- Add artifact writers for `manifest.json`, `tree.summary.json`, `hotspots.json`, `findings.json`, `metrics.schema.json`, `report.md`, and `agent-skill.md`, with full tree and dependency artifacts behind opt-in flags.
- Keep all code in a new module such as `server/app/services/reporting.py`.
- Add pytest coverage for CLI argument parsing, artifact creation, and ranking stability.

### Phase 2: Better Scoring

- Add percentile normalization for each metric.
- Add profile-specific scoring weights.
- Add clearer finding deduplication so one file does not flood the report.
- Add `--changed-only` later by comparing against Git diff paths.

### Phase 3: Deeper Graph Artifacts

- Add per-file `explain` output.
- Add optional data-flow/scope graph artifacts for the top N TS/TSX findings.
- Add import-boundary and cycle detection findings.

## Proposed Profiles

`general`:

- Balanced complexity, size, TODO, nesting, and language-specific debt.

`frontend`:

- Heavier weights for TSX nesting, render branching, prop count, inline handlers, hardcoded strings, duplicated strings, and dependency coupling.

`typescript`:

- Heavier weights for `any`, TS ignores, exports, types/interfaces, import coupling, and TSX metrics.

`backend`:

- Heavier weights for complexity, LOC, nesting, parameters, class count, TODOs, Python imports, and large service modules.

`docs`:

- Heavier weights for Markdown data URLs and large Markdown files.

## Example Agent Pipeline

```bash
uvx srcly report . --out .srcly --profile general --format both
```

Agent steps:

1. Read `.srcly/report.md`.
2. Select the top finding that matches the user's goal.
3. Read the source file and nearby tests.
4. Use `.srcly/tree.summary.json` to understand neighboring modules and sibling hotspots.
5. Make a small change or produce a targeted review.
6. Run relevant tests.
7. Optionally rerun `uvx srcly report . --out .srcly --refresh` to compare hotspot movement.

## Non-Goals

- Do not make Srcly auto-refactor code.
- Do not present metric findings as confirmed bugs.
- Do not require the UI server for headless usage.
- Do not include full source text in default artifacts.
- Do not block existing `uvx srcly [path]` UI behavior.

## Open Questions

- Should report artifacts be written inside the repo by default (`.srcly`) or to a temp directory unless `--out` is provided?
- Should `report` reuse `codebase_mri.json` by default, or always refresh for agent runs?
- Should the generated skill file be generic, local to the report, or both?
- Should CI mode support SARIF in addition to Markdown and JSON?
- Should finding thresholds be configurable in a checked-in `.srcly.toml`?
