---
title: "Metric system overhaul — shape brief"
slug: "metric-system-overhaul"
phase: shape
status: current
last_updated: "2026-10-15"
---

# Metric system overhaul — what we are adding

**Outcome:** Trustworthy metrics, one shared catalog, and new signals (activity, comment noise, React components, findings) that point at code worth refactoring.

**Primary flow:** Scan with no setup → pick one metric or a 2x2 preset → open the responsible source → the same story appears in `srcly report` and PR compare.

## Feature scope

```text
Metric system
├── PLANNED ADDITIONS
│   ├── Trust
│   │   ├── Measured zero vs N/A (unsupported, skipped, failed) end to end
│   │   ├── Real functions separate from display scopes; max carries its function
│   │   └── Fixed ranking denominator; report and explorer rank the same cohort
│   ├── One catalog
│   │   ├── Server-owned definitions: label, group, direction, scope, languages
│   │   └── Served to the client and reused by PR compare
│   ├── Catalog cuts and new signals
│   │   ├── Delete: Low Comments, hardcoded/duplicated text, raw class/type/export penalties
│   │   ├── Comment noise: ratio, oversized docblocks, commented-out code
│   │   └── React components: size, hooks, effects, JSX depth, props, inline handlers
│   ├── Single-metric hot-spot list
│   │   └── Value, unit, witness function, cohort label, N/A rows apart
│   ├── Git activity (on when .git exists)
│   │   └── Commits in window per file; churn shown separately
│   ├── 2x2 scatter presets
│   │   └── Activity · Blast radius · Component weight · Comment noise
│   └── Findings
│       └── Project tsc/eslint if present, otherwise bundled ruff + tree-sitter rules
├── EVALUATE BEFORE COMMITTING
│   └── Local-repo pilot tunes defaults, thresholds and quadrant cut-offs
└── LATER POSSIBILITIES
    └── Clones, coverage, CRAP, temporal coupling, trends
```

## Behavior

| Situation | Expected result |
| --- | --- |
| Metric doesn't apply to a file | N/A, excluded from ranking and color |
| No `.git` or shallow clone | Activity is N/A with the reason; source metrics are unaffected |
| No project tsc/eslint | Bundled rules run, labelled "srcly defaults" |
| Function is 60% comments | Flagged by comment noise whatever the repo norm |
| Folder shows max complexity | Clicking it opens the responsible function |

## Examples

Proposed 2x2 presets, with names to be tuned by the pilot:

| Preset | X × Y | High/high | High X only | High Y only |
| --- | --- | --- | --- | --- |
| Activity | complexity × commits | Hot mess | Sleeping giant | Busy, fine |
| Blast radius | complexity × fan-in | Load-bearing tangle | Isolated mess | Hub |
| Component weight | component LOC × hooks | God component | Long markup | Hook soup |
| Comment noise | comment ratio × complexity | Documented complexity | Narrated trivia | Bare complexity |

## Decisions and boundaries

**Appetite:** Seven stacked PRs, landing now. Each one leaves Srcly working.

**Key decision — React set (consider-contrast):** I scored three options on refactor targeting, soundness across React and Solid, and cost. Keeping every TSX field scored 4/3/9. The research's demote-all scored 3/8/8. A component-scoped set scored 9/7/5. Chosen: **component-scoped**. Detect components (functions returning JSX). Measure size, hooks, effects (`useEffect` or Solid `createEffect`), local JSX depth, declared props and inline handlers per component. Delete hardcoded/duplicated text. Redefine render branching as JSX conditionals per component.

**Key decision — pilot (consider-contrast):** Options were a full statistical study (rigor 9, speed 2), case review only (rigor 4, speed 8), or a hybrid (rigor 7, speed 7). Chosen: **hybrid**. A script reports redundancy, missing rates and top-k overlap. The agent then reviews the top 10 per lens on four repos against a written rubric. A row counts only when a cited source line justifies action. The pilot runs last, after activity and findings exist, so it evaluates them too.

**Key decision — one catalog:** The server serves the catalog at runtime. That avoids codegen, which the research rejected, and avoids hand-mirrored tables.

**Boundary:** No compatibility layer. No per-repo config is required. External tools run with timeouts, and a failure shows as N/A. Each PR reverts as one commit.

**First proof:** **Try:** Scan a TS/Python fixture with nested functions, a measured zero, a skipped file, and an over-commented function. **Observe:** The API, report and explorer show the same values, N/A rows, and witness functions. **Decide:** Continue to the catalog cuts only when zero and N/A stay distinct through all three surfaces.

See the [intent](intent-brief.md) and the [implementation plan](implementation-plan.md).
