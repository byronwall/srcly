---
title: "Metric system overhaul — implementation plan"
slug: "metric-system-overhaul"
phase: plan
status: current
last_updated: "2026-10-15"
---

# Metric system overhaul — implementation plan

## Plan at a glance

There are seven stacked PRs, each a Conventional Commit and each squash-mergeable on its own. Trust comes first: a new signal on top of an N/A-as-zero pipeline would just mislead faster. The catalog then moves to one server-owned definition before the list, scatter and findings build on it. Without that, every new metric would need three hand edits (`reporting.py`, `metricsStore.tsx`, `compare/diff.py`). Git activity reuses the Git plumbing that compare mode already uses. Findings arrive last among the features because they add the only new runtime dependency (`ruff`) and external processes. The pilot closes the stack and tunes thresholds and defaults with evidence from local repos.

Pushback against the research: it planned to keep the old catalog during evaluation and gate each initiative on Byron's review. Here, cuts land early (PR 2) and the agent adjudicates the pilot. That's cheaper, and any cut is one revert away.

## Implementation strategy

- **First proof:** a fixture scan whose zero, N/A and witness values match across API, report and explorer.
- **Primary seams:** `analysis_types.py` → `analysis.py` (measurement), a new catalog module (definitions), `activity.py` and `findings/` (external processes behind one function each).
- **Fast local loop:** `cd server && uv run pytest tests/test_complexity_semantics.py tests/test_reporting.py -q`, plus `cd client && pnpm test`.
- **Local dependencies:** fixture directories under `server/tests/fixtures/`, plus temp Git repositories that tests build with `git init`.
- **Live confirmation:** scan srcly and recipes-modern in the browser (API on 8000, Vite on 5173).
- **Rollout and rollback:** one revertable PR per step. Activity and findings degrade to N/A when the tool is missing, slow, or fails.

## Milestone 1: Zero and N/A stay distinct, and maxima name their function (PR `fix(metrics): …`)

- **Change — availability and scope kind**
  - Add the executable kind and per-metric availability to `FunctionMetrics`/`FileMetrics` and to `Metrics` in `models.py`. Unsupported, skipped and failed become `null` with a reason, not `0`.
  - `convert_function` keeps the executable kind. Folder `complexity` carries the witness path and line.
- **Change — ranking math**
  - Fix `reporting.py:rank_nodes` so zero values count toward the denominator. Align the cohort in `Explorer.tsx` (files or functions, never mixed).
- **Verification:** a fixture with nested TS/Python functions, a measured zero, and a skipped large file. Monotonicity test: raising one input never lowers a score.

### Desired end state

- The report, explorer detail and API show N/A for unsupported metrics.
- Folder max complexity opens the right function.

## Milestone 2: The catalog is honest and smaller (PR `feat(metrics)!: …`)

- **Change — cuts:** delete `comment_density` as "Low Comments", `tsx_hardcoded_string_volume`, `tsx_duplicated_string_count`, and the risk weights on class, type, export and import counts in `PROFILE_WEIGHTS`. Demote `todo_count` to neutral detail. Fix README complexity wording.
- **Change — comment noise:** add `comment_noise` with three parts: comment ratio > 0.5 in a scope of at least 10 code lines, a docblock longer than 1.5× its body and at least 8 lines, and runs of at least 3 commented lines that parse as code. These are absolute thresholds; the pilot may tune them.
- **Change — React components:** detect components (a capitalized function or arrow returning JSX). Record per component: LOC, hooks, effects (`useEffect`/`createEffect`), local JSX depth, declared props, inline handlers, and JSX conditionals. The file value is the max, and it names the component.
- **Verification:** React and Solid component fixtures, plus an over-commented fixture and a commented-out code fixture.

### Desired end state

- No metric scores "fewer comments" as risk.
- React fixtures rank the god component first.

## Milestone 3: One catalog drives the list, the report and compare (PR `feat(metrics): …`)

- **Change:** create `server/app/services/metric_catalog.py` for id, label, unit, group, direction, scope, languages and description. Serve it from `GET /api/metrics/catalog`. `reporting.METRIC_DEFINITIONS` and `compare/diff.COMPARE_METRICS` derive from it. The client's `HOTSPOT_METRICS` becomes a fetched store. Update the `AGENTS.md` add-a-metric rule and `docs/CODE_MAP.md`.
- **Change — the single-metric list:** the Hot Spots list ranks by one metric. Each row shows the value with its unit, the witness function, and a cohort label. N/A rows sit in a collapsed group.
- **Verification:** a parity test where the same fixture gives the same top 10 from `srcly report` and from the client ranking function. A compare test confirms comment noise counts as "worse".

### Desired end state

- Adding a metric needs one catalog entry plus its analyzer.

## Milestone 4: Activity explains "why now" (PR `feat(activity): …`)

- **Change:** add `services/activity.py`, which reuses the runner in `compare/git_refs.py`. One `git log --numstat --no-merges --since=<window>` pass gives `commit_count` and `churn_lines` per file. The default window is 90 days. Shallow clones, dirty trees and missing `.git` come back as N/A with a reason. The cache keys on HEAD plus the window.
- **Verification:** a temp repo with a rename, a merge, and a bulk commit. Counts match `git log`.

### Desired end state

- Activity shows in the catalog and the list on any Git repo with no setup.

## Milestone 5: 2x2 presets (PR `feat(scatter): …`)

- **Change:** add a scatter view beside the treemap with four presets: Activity, Blast radius (fan-in from the deps graph), Component weight, and Comment noise. Each preset has named quadrants, draggable cut-offs on absolute defaults, and a file/function toggle. Clicking a point opens its source. The report gets `--quadrant <preset>`.
- **Verification:** a browser check on srcly and recipes-modern, plus a unit test of quadrant assignment.

### Desired end state

- Each preset puts known hot files in the expected quadrant, and a point click opens its source.

## Milestone 6: Findings just work (PR `feat(findings): …`)

- **Change:** add a `services/findings/` runner. It uses project `node_modules/.bin/tsc --noEmit` and eslint when they and their config exist. Otherwise it falls back to `ruff check --output-format json`, added via `uv add ruff`, and to built-in tree-sitter rules (explicit `any`, unexplained `@ts-ignore`, non-null assertion runs). The runner is a separate job with timeouts. The result is a per-file `finding_count` plus a source-linked list labelled with the tool that ran.
- **Verification:** fixtures with and without project tools, and a timeout injection.

### Desired end state

- Any repo shows findings with no setup, labelled by the tool that ran; a tool failure shows N/A, never zero.

## Milestone 7: The pilot tunes defaults (PR `feat(metrics): tune defaults from pilot`)

- **Change:** add `server/scripts/evaluate_metric_portfolio.py`. Per language and scope, it reports missing rates, Spearman correlation and top-10/25 overlap. The agent then reviews the top 10 per lens and preset on srcly, recipes-modern, explorEDA and context-recorder. A row counts as useful only when a cited source line justifies action. Results update the thresholds, quadrant cut-offs and the default metric. The record goes in `docs/research/`.

### Desired end state

- Every default metric has at least two useful cases in two repos, or it is demoted.

## Open decisions and spikes

- **Component detection on Solid.** Decision: whether the capitalized-JSX heuristic is enough. Evidence: the srcly client and recipes-modern. Fallback: label it React-only.
- **Bundled TS rules.** Decision: whether tree-sitter rules give useful findings without tsc. Evidence: pilot hit rate. Fallback: show only project-tool findings for TS.

## Below the cut line

- Clones, coverage, CRAP, mutation, temporal coupling, and trends over snapshots.
- People or ownership metrics, Maintainability Index, and Halstead estimates.
- Persistent triage states.
