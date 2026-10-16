---
title: "Metric system overhaul"
slug: "metric-system-overhaul"
phase: intent
status: current
last_updated: "2026-10-15"
---

# Metric system overhaul

## My read

Srcly's metrics should point at code that is worth refactoring. Today some of them mislead. Zero and "not measured" look the same. Reports and the explorer rank different populations with different math. Some fields score the wrong direction, such as treating low comment density as risky. The research on `codex/metrics-research` found these problems and proposed four gated initiatives: metric trust, portfolio evaluation, Git activity, and imported evidence.

Byron wants all of it now, as a stack of PRs that first fixes and then improves. The research gated each step on his review. That changes here: the agent runs the evaluation on local repositories and makes the calls, and Byron stays mostly out of the loop. The result should "just work", with no per-repo configuration.

## What matters most

- One metric definition drives the explorer, `srcly report`, and PR compare equally.
- An excellent single-metric hot-spot list, where every value leads to its source.
- Named 2x2 scatter presets that show how code ranks on two axes at once.
- Signals that matter now: excessive comments, useful React/TSX refactor targets, Git activity, and lint/type findings.

## The experience or behavior you appear to want

Open a repo with no setup. Pick a metric and get a ranked list you can trust, where each row opens the responsible function. Switch to a 2x2 preset such as "Activity" and see which complex files are also churning. Agents get the same ranking from `srcly report`. PR compare uses the same better/worse directions.

## Boundaries

### Must be true

- A measured zero and N/A differ everywhere.
- Excessive-comment checks use absolute thresholds, never the repo's own norm.
- Lint/type findings use the project's tools when present. Otherwise Srcly uses bundled defaults and labels which ones ran.
- Git activity turns on automatically when `.git` exists.

### Must be avoided

- Compatibility layers for removed or renamed fields.
- Bespoke configuration as a precondition for useful results.
- Combined scores that hide their inputs.

## What seems settled

- Cut boldly. Misleading directions and noisy fields go away.
- Keep a curated React/TSX set that targets component refactors; the agent picks it.
- TODOs are low priority.
- Stack order: trust fixes → catalog cuts and the comment flip → single-metric list with shared definitions → Git activity → 2x2 presets → findings → local-repo pilot.
- Clones and coverage come later.

## Possibilities, not decisions

- Quadrant names and cut-off values.
- Exact comment thresholds. The pilot tunes them.

## Current reality that matters

- PR compare (`server/app/services/compare/`) landed after the research baseline. It has its own direction table that inherits the report's risk directions, so changes to the catalog affect it.
- `metricsStore.tsx` already records `scope` and `languages`, which covers part of the research's TS-support fix.
- Python dependencies have no lint tool yet. `ruff` would be new.

## Next step after confirmation

Shape and plan (done: see [shape](shape-brief.md) and [plan](implementation-plan.md)).
