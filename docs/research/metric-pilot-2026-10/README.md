---
title: "Metric pilot: tuning srcly's defaults on four local repos"
date: "2026-10-16"
initiative: "metric-system-overhaul (Milestone 7)"
status: decided
---

# Metric pilot, October 2026

Milestone 7 of the [metric system overhaul](../../intent/metric-system-overhaul/implementation-plan.md). It is the hybrid pilot chosen in the [shape brief](../../intent/metric-system-overhaul/shape-brief.md). A script measured redundancy, missing rates and top-k overlap. Then every case in the top 10 of each Hot Spots lens and each 2x2 preset was read in source and given a verdict. The defaults were tuned from those verdicts.

Byron was away and asked the agent to make these calls. One reviewer (Claude) adjudicated every case. The review was not blind: the reviewer knew which metric surfaced each case.

## Decisions

| Item | Before | After | Why (evidence below) |
| --- | --- | --- | --- |
| Default metric | Complexity (max) | **Complexity (max), kept** | Useful cases in all four repos: 32 useful, 8 noise in 40 cases |
| Comment noise: narrated-code threshold | over 0.5 comment lines per code line | **over 1.0** (`comment_noise.RATIO_LIMIT`) | Of 30 real-repo flags between 0.5 and 1.0, 29 were doc comments stating intent or a contract, or scaffold boilerplate. The brief's "60% comments" function (ratio 1.5) is still flagged |
| Comment noise: docblock and commented-out code | 8+ lines over 1.5x body; 3+ line run | **unchanged** | No real-repo docblock flags (fixtures only). The one commented-out flag was useful |
| Comment noise in report profiles | general 0.7, backend 0.6, typescript 0.6, python 0.8 | **no weight (optional lens)** | After tuning, a useful case in one repo of four |
| Commits (`commit_count`) | no weight | **0.8 in every code profile** | Useful in 3 repos alone, and the Activity preset was useful in 3 |
| Findings (`finding_count`) | no weight | **general 0.8, frontend 0.6, backend 0.8, typescript 1.0, python 1.0** | Useful in 3 repos (ruff B905/B904/F401, eslint unused imports, react-refresh) |
| Complexity weight, typescript profile | 1.0 | **1.2** | Keeps complexity, not findings, the profile's lead metric |
| Params (`parameter_count`) | weighted general 0.6, backend 0.9, python 0.8 | **no weight (optional; rank the Functions cohort)** | 0 useful file cases in 4 repos. The file value is a sum, and it tracks size (ρ 0.69–0.90 with LOC on TS/TSX/Python files). Function arity is still useful: `write_report` takes 18 params |
| Function Length (avg) | rankable, General | **Detail (neutral, never ranked)** | 0 useful in 4 repos: tests, markup and one-function files |
| any Usage | general 0.8, typescript 1.4 | **no weight (optional)** | Useful in srcly only. Findings carry `no-explicit-any` with the tool named |
| TS Ignores | general 0.9, typescript 1.4 | **no weight (optional)** | 2 cases in 4 repos, both deliberate `@ts-expect-error` in negative type tests |
| Markdown Data URLs | general 0.4, docs 1.6 | **docs 1.6 only** | Useful in one repo (an archived PRD with 18 inline images). It no longer ranks Markdown in the general queue |
| Inline Handlers, JSX Conditionals | frontend 0.7; frontend 1.0, typescript 0.8 | **no weight (optional)** | Useful only in explorEDA. In srcly and recipes-modern, component LOC had already surfaced their cases |
| Component LOC, hooks, effects, JSX depth, props | frontend profile | **unchanged** | Useful in 2–3 of the 3 TSX repos |
| LOC, nesting | general | **unchanged** | Useful in 4 and 3 repos |
| Complexity (avg), churn, errors | optional (no weight) | **unchanged, optional** | 2 / 0 / 0 repos (errors: no nonzero case anywhere) |
| Comment-noise 2x2: ratio cut-off | 0.15 | **0.5**; quadrants renamed to Narrated complexity / Narrated trivia / Complex code / Clean | None of the 23 non-fixture "Narrated trivia" cases was narration: they were doc comments, scaffold boilerplate and `/// <reference>` lines. The axis is a share of LOC (LOC counts comments), so 0.5 = as many comment lines as code, the flag's line |
| Activity, Blast radius, Component weight, Findings cut-offs | 10×5, 10×5, 150×5, 10×3 | **unchanged** | Action quadrants were useful in 3, 2, 3 and 1 repos; no evidence for other cut-offs (see dispositions) |
| Component detection on Solid | capitalized function returning JSX | **unchanged; enough for Solid** | 61 of 62 srcly TSX files have components (`index.tsx` is the entry); `createSignal`/`createMemo` count as hooks, `createEffect` as effects |

A metric stays in the report profiles only with useful cases in at least two repos. Demoted metrics stay in the Hot Spots picker and the treemap color list, except Function Length (avg), which moves to Detail. "Optional" means a lens you pick on purpose: it carries no profile weight, so it doesn't feed the default `srcly report` queue.

## Method

### Repos

All four were read in place and never modified. Their `git status` was clean before and after. Outputs went to `./tmp/pilot/` (git-ignored).

| Repo | Commit | Files | Functions | Components | Languages (files) | Activity (90d) | Checkers that ran |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| srcly (this branch, step 6) | `284876d` | 341 | 3,698 | 128 (Solid) | Python 111, TS 106, TSX 62, Markdown 44 | 335 files touched | tsc ×2, ruff (srcly defaults), srcly TS rules |
| recipes-modern | `7a798f2` | 218 | 826 | 277 (React) | TSX 128, TS 38, JS 31, Markdown 10 | 41 files touched | tsc, eslint, ruff, srcly TS rules |
| explorEDA | `db1875b` | 1,737 | 18,227 | 802 (React) | TS 611, Markdown 464, TSX 431, other 216 | 3,212 file-changes | tsc ×3, eslint ×3, ruff, srcly TS rules |
| context-recorder | `76afc4f` | 110 | 867 | 0 | Swift/JS 62, Markdown 35, Python 5 | 135 files touched | ruff, srcly TS rules |

### Script

`server/scripts/evaluate_metric_portfolio.py` (tests: `server/tests/test_evaluate_metric_portfolio.py`) runs the same headless scan as `srcly report`, with activity and checkers. It splits the nodes into strata by language and scope (file, executable function, component). For each stratum it reports:

- **Support:** node count, measured count, N/A rate, zero rate among measured values, distinct values and max.
- **Redundancy:** Spearman's ρ with tie-averaged ranks, for every metric pair, on the nodes that measure both.
- **Queue overlap:** shared members between each pair's top 10 and top 25. Only values above the stratum's minimum count, since a cut through a block of tied zeros is arbitrary.
- A constant metric (all zeros, say), or one with fewer than 5 paired values, gets **undefined** (`None`) for ρ and overlap, never 0. A constant has no order, so calling it "uncorrelated" would be false.
- A case sheet listing the top 10 per Hot Spots lens and per preset quadrant, with the source lines behind each.

```bash
cd server
uv run python scripts/evaluate_metric_portfolio.py --repo srcly=.. \
  --repo recipes-modern=~/Projects/recipes-modern --repo explorEDA=~/Projects/explorEDA \
  --repo context-recorder=~/Projects/context-recorder --out ../tmp/pilot/after
```

### Case review

- **Lenses:** the top 10 of each rankable metric's Hot Spots list (file cohort, the default), as the UI ranks it. Measured zeros end a list early.
- **Presets:** the top 10 of each preset's action quadrant, worst first. That is high/high everywhere except Comment noise, where the action quadrant is "Narrated trivia" (high X).
- **Verdicts:** each case was opened at its witness line and given one:
  - **useful:** a cited source line justifies a refactor or a look;
  - **noise:** nothing to act on;
  - **duplicate:** an earlier lens's top 10 in the same repo already had the file. Lenses were taken in catalog order (complexity, complexity avg, LOC, comment noise, nesting, params, function length, components, TS, Markdown, activity, findings). Presets were deduplicated only against earlier presets, since "complex and busy" is a claim no single lens makes.
- **Fixtures:** srcly's `tests/fixtures/` files are written to trip metrics. They are marked *excluded* and left out of the counts.
- **The bar:** a metric stays in the default profiles only with a useful case in at least two repos.

### Limitations

- **Lens order:** catalog order favors early lenses. A file that complexity surfaced first counts as a duplicate for every later lens. That understates the later lenses, especially activity and findings, so those were also judged through their presets.
- **One reviewer**, not blind, with no inter-rater check.
- **Small sample:** three of the four repos are the same author's. Only three have TSX and only two have Python. context-recorder's Swift has no import graph, so Blast radius is N/A there.
- **Moving window:** activity used a 90-day window ending on 2026-10-15.
- **Precision only:** the pilot judges whether a queue's top 10 is worth reading, not whether a metric predicts defects.

## Per-repo tables

The full support and correlation tables per stratum are in [`strata/`](strata/) ([srcly](strata/srcly.md), [recipes-modern](strata/recipes-modern.md), [explorEDA](strata/explorEDA.md), [context-recorder](strata/context-recorder.md)). These are the pairs that drove decisions: ρ, then shared members of the two top 10s.

| Pair | srcly | recipes-modern | explorEDA | context-recorder | Reading |
| --- | --- | --- | --- | --- | --- |
| LOC × params (TSX files) | 0.90 · 8/10 | 0.82 · 8/10 | 0.85 · 7/10 | – | The file sum of params is a size measure |
| LOC × params (TS functions) | −0.15 · 1/10 | 0.02 · 0/10 | −0.04 · 0/10 | – | Function arity is independent of size |
| complexity × complexity avg (TS files) | 0.91 · 4/10 | 0.88 · 8/10 | 0.92 · 3/10 | – | Same ranking; avg surfaces one-function files |
| complexity × nesting (Python functions) | 0.88 · 5/10 | – | 0.98 · 9/10 (n=31) | 0.81 · 5/10 | Strong but not identical; nesting found new cases |
| LOC × component LOC (TSX files) | 0.92 · 8/10 | 0.72 · 8/10 | 0.75 · 5/10 | – | A component file is mostly its biggest component |
| commits × churn (TS files) | 0.84 · 7/10 | 0.98 · 8/10 | 0.51 · 6/10 | 0.45 · 6/10 (Swift/JS) | Close in quiet repos; apart once bulk rewrites happen |
| complexity × commits (TSX files) | 0.59 · 6/10 | 0.49 · 7/10 | 0.45 · 4/10 | – | Related, not redundant: what the Activity preset uses |
| complexity × fan-in (TS files) | 0.65 · 2/10 | −0.02 · 3/10 | 0.47 · 0/10 | undefined | Different queues: what Blast radius uses |
| any × findings (TS files) | undefined (findings constant) | 0.87 · 3/3 | 0.07 · 0/3 | – | Where eslint runs, findings already carry `any` |

Undefined because constant: `error_count` everywhere (no checker reported an error in any repo). Comment noise was constant on every TSX stratum. `ts_ignore_count` was constant except in explorEDA.

## Verdict tally

Each cell is useful / noise / duplicate in that repo's top 10. "–" means the lens had no nonzero case there. 729 cases in all: 175 useful, 229 noise, 317 duplicate and 8 excluded fixtures.

| Lens | srcly | recipes-modern | explorEDA | context-recorder | Repos with a useful case |
| --- | --- | --- | --- | --- | ---: |
| `average_function_length` | 0 / 9 / 1 | 0 / 5 / 5 | 0 / 7 / 3 | 0 / 3 / 7 | 0 |
| `churn_lines` | 0 / 0 / 10 | 0 / 1 / 9 | 0 / 0 / 10 | 0 / 0 / 10 | 0 |
| `comment_noise` | 1 / 7 / 0 (+2 fixture) | 0 / 2 / 0 | 1 / 10 / 0 | – | 2 |
| `commit_count` | 2 / 1 / 7 | 0 / 4 / 6 | 1 / 3 / 6 | 1 / 2 / 7 | 3 |
| `complexity` | 10 / 0 / 0 | 8 / 2 / 0 | 9 / 1 / 0 | 5 / 5 / 0 | 4 |
| `complexity_avg` | 1 / 4 / 5 | 0 / 7 / 3 | 1 / 7 / 2 | 0 / 5 / 5 | 2 |
| `component_effect_count` | 1 / 2 / 6 (+1 fixture) | 0 / 5 / 5 | 2 / 4 / 4 | – | 2 |
| `component_hook_count` | 2 / 0 / 7 (+1 fixture) | 2 / 1 / 7 | 3 / 0 / 7 | – | 3 |
| `component_inline_handler_count` | 0 / 1 / 8 (+1 fixture) | 0 / 0 / 10 | 3 / 2 / 5 | – | 1 |
| `component_jsx_conditional_count` | 0 / 2 / 8 | 0 / 1 / 9 | 3 / 1 / 6 | – | 1 |
| `component_jsx_depth` | 1 / 3 / 6 | 1 / 0 / 9 | 3 / 6 / 1 | – | 3 |
| `component_loc` | 5 / 0 / 5 | 3 / 0 / 7 | 9 / 0 / 1 | – | 3 |
| `component_prop_count` | 2 / 5 / 3 | 0 / 4 / 6 | 3 / 4 / 3 | – | 2 |
| `finding_count` | 6 / 0 / 4 | 2 / 1 / 7 | 1 / 1 / 8 | – | 3 |
| `loc` | 6 / 1 / 3 | 3 / 5 / 2 | 2 / 5 / 3 | 4 / 5 / 1 | 4 |
| `max_nesting_depth` | 2 / 1 / 7 | 1 / 2 / 7 | 2 / 4 / 4 | 0 / 3 / 2 | 3 |
| `md_data_url_count` | 0 / 2 / 1 | 0 / 1 / 3 | 1 / 7 / 2 | – | 1 |
| `parameter_count` | 0 / 4 / 6 | 0 / 4 / 6 | 0 / 4 / 6 | 0 / 7 / 3 | 0 |
| `ts_any_usage_count` | 3 / 1 / 6 | 0 / 2 / 1 | 0 / 4 / 0 | – | 1 |
| `ts_ignore_count` | – | – | 0 / 2 / 0 | – | 0 |
| `preset:activity:high_both` | 10 / 0 / 0 | – | 9 / 1 / 0 | 5 / 3 / 0 | 3 |
| `preset:blast_radius:high_both` | 5 / 0 / 5 | – | 6 / 0 / 4 | – | 2 |
| `preset:comment_noise:high_x` | 0 / 7 / 0 (+3 fixture) | 0 / 6 / 0 | 0 / 10 / 0 | – | 0 |
| `preset:component_weight:high_both` | 6 / 0 / 4 | 10 / 0 / 0 | 7 / 0 / 3 | – | 3 |
| `preset:findings:high_both` | – | 1 / 0 / 0 | 0 / 10 / 0 | – | 1 |
## Dispositions

**Complexity (max): default metric, kept.** It was the most precise lens: 32 useful and 8 noise across 40 cases, with useful cases in every repo. Examples: `buildViewModel` runs numbered stages with 44 ifs (srcly `client/src/viz/deps/viewModel.ts:95`); `isChart` hand-validates every chart type in one switch (explorEDA `packages/explorEDA/src/utils/saveDataUtils.ts:394`); `exchangeToken` folds two OAuth grants into ternaries (recipes-modern `src/server/krogerAuth.ts:25`). Its noise was flat dispatch: keycode switches (context-recorder `AnnotationEditor.swift:418`), guard ladders (`harness.py:96`) and command interpreters. The client already starts on `complexity` and the general profile leads with it, so nothing changes. The typescript profile weight rises from 1.0 to 1.2 so findings (1.0) don't become its lead.

**LOC: kept.** Useful in all four repos (15 useful). Its noise is non-code: design docs, generated research packets, a Tailwind theme and demo data literals. In docs-heavy repos (explorEDA, context-recorder) Markdown takes half the top 10. See the follow-ups.

**Nesting: kept.** Useful in three repos, with cases complexity missed: four nested loops over segment pairs (`client/src/viz/deps/geometry.ts:137`), five guards nested in a file walk (`server/app/services/deps/common.py:75`) and an inline async `onClick` with business logic (recipes-modern `GlobalAddTagDialog.tsx:70`).

**Comment noise: threshold raised, demoted to optional.**
- **Ratio rule.** At 0.5 comment lines per code line, 30 real-repo functions or files were flagged between 0.5 and 1.0. Only one was narration: `_should_log_file_progress`, whose docstring "Rules:" restates its five ifs (`server/app/services/analysis.py:814`). The rest explained something the code can't show, like the memo contract in `GridChartPanel.tsx:7-11` or why Ctrl+C must cancel scans first (`server/app/main.py:19-24`), or were create-t3-app scaffold comments.
- **New limit.** `RATIO_LIMIT` is now 1.0: more comment lines than code lines. It stays absolute, never relative to a repo's norm. The shape brief's "function is 60% comments" case is still flagged.
- **Other rules.** The commented-out-code rule produced one real flag, and it was useful: a commented `console.log` block in explorEDA `DataLayerCalculations.test.tsx:79-82`. The docblock rule produced no real-repo flags, so it is unchanged.
- **Disposition.** After tuning, comment noise has a useful case in one repo, so it loses its profile weights. It stays a Hot Spots lens.
- **Fixtures.** `tests/fixtures/comment_noise` gained three narration lines in `narrated.ts` and one in `narrated.py`, so they still demonstrate the rule.

**Comment-noise 2x2: cut-off 0.15 → 0.5, quadrants renamed.**
- **The axis.** `comment_ratio` is `comment_lines / loc`, and LOC counts comment lines for TS and Python: 4 comments and 5 code lines give 0.44. So the axis is a share, and 0.5 means as many comment lines as code, the same line the tuned flag uses.
- **At 0.15.** "Narrated trivia" held 35 srcly files, 97 srcly functions and 89 explorEDA functions. The top 10s held no narration (`hubs.ts:1-6` design rationale, `writeBack.ts:46-47` explaining a skip rule).
- **At 0.5.** The quadrant holds the fixtures, two narrated tests, one scaffold file and explorEDA's `vite-env.d.ts` (a `/// <reference>` line counted as a comment).
- **Names.** At 0.5 the old names overclaimed: "Bare complexity" would include files that are 40% comments. The quadrants are now Narrated complexity / Narrated trivia / Complex code / Clean.

**Activity (commits): promoted to the profiles at 0.8; churn stays optional.**
- **Commits alone** were useful in three repos. Each was a file every feature touches: srcly `metricsStore.tsx` (10 commits in 90 days), explorEDA `compositionTypes.ts` (41 commits, 53 importers), context-recorder `SessionModel.swift`. The noise was docs, migrations and append-only registries.
- **The Activity preset's Hot mess** was useful in three repos: 24 of 28 non-empty cases. recipes-modern had no file with 5+ commits in 90 days, which is correct for a quiet repo.
- **Churn** produced no useful new case. Its one novel case was a single 111-line commit (recipes-modern `shoppingListRouter.ts`, `900c46f`): the bulk-change caveat in action. Churn and commits agree in quiet repos (ρ 0.98–0.998) and part in busy ones (0.45–0.70).
- **Cut-offs (10 CCN × 5 commits)** are unchanged. Lowering commits to 3 would only move recipes-modern's krogerRouter (3 commits) into Hot mess. Its complexity lens already leads with it.

**Findings: promoted to the profiles; error count stays optional.**
- **Useful in three repos:**
  - ruff `B905` `zip()` without `strict=` (srcly `server/app/routers/compare.py:70`);
  - `B904` (`routers/files.py:60`);
  - unused imports in srcly tests and in recipes-modern pages (`src/app/kroger/page.tsx:3`);
  - explorEDA's library API re-exported from a component file (react-refresh, `ExplorEda.tsx:270`).
- **The noise is one project rule.** explorEDA's eslint `curly` accounts for 2,174 of its ~2,350 findings. It fills the Findings preset's "Flagged tangle" with brace-style counts, so that preset was useful only in recipes-modern (`aiRecipe.ts`: 15 `any` around `parseAndValidate`). Its cut-off (3) is unchanged, because the problem is rule mix, not the threshold. See the follow-ups.
- **Error count** was 0 in every repo: no case, undefined correlations.
- **Weights.** Findings take over the type-safety weight from `any` usage and TS ignores: eslint's `no-explicit-any` and srcly's TS rules report the same thing, with the rule and tool named.

**any Usage, TS Ignores: weights removed.**
- **any Usage** was useful only in srcly: 31 explicit anys in `structureTree.ts`, typing the analysis tree.
- **TS Ignores** had two cases, both deliberate `@ts-expect-error` in negative type tests. The research warned against penalizing exactly that.

**Params: weight removed; rank functions for arity.**
- **The file value is a sum** over functions. It ranked test files and providers with many small callbacks: `activity.py` holds 56 params over 25 functions. That makes it a size proxy (ρ 0.69–0.90 with LOC). 0 useful file cases in 4 repos.
- **Function arity is different.** `write_report` (18 params) and `build_report_payload` (17) in srcly, and `paintSquares` (9) in explorEDA, all want an options object. Arity is uncorrelated with function size (ρ −0.15 to 0.02 on TS functions).
- **So params stay rankable, without weight.** The description now says to rank the Functions cohort. Making the file value a max with a witness is a follow-up.

**Function Length (avg): moved to Detail.** 0 useful in 40 cases. The queue was test files, landing-page markup, a 421-line fixture literal and one-function files whose mean is just their length.

**Complexity (avg): optional, unchanged.** Useful twice. In explorEDA it found `findDocsErrors` in `apps/demo/src/docs/gate.ts:45`, a 63-CCN function just below the complexity top 10. The rest were one-function files and vendored shadcn.

**Markdown Data URLs: general weight removed, docs profile kept.** The one useful case was an archived PRD with 18 inline images (explorEDA `packages/explorEDA/docs/archive/prd/funcs.md`). The rest were archives nobody edits. In the general queue, it only lifted Markdown over code.

**Component metrics: LOC, hooks, effects, JSX depth and props kept; inline handlers and JSX conditionals demoted.**
- **Component LOC** was useful in all three TSX repos (17 new useful).
- **Hooks** were useful in all three: four boolean `createSignal`s for modes (srcly `Treemap.tsx:60-62`), four tRPC mutations wired inline (`RecipeEditDialog.tsx:27-38`), and one zustand selector per field (explorEDA `BarChart.tsx:115-118`).
- **Effects** were useful in two repos (`Popover.tsx` 3, `ChartPlacementLayer.tsx` 6). One or two effects were idiomatic every time.
- **JSX depth** was useful in all three. recipes-modern's `CookingModeOverlay.tsx:95-115` nests group→step maps inline and puts an `<li>` inside a `<label>`.
- **Props** were useful in two (`TreemapHeader` 16, `ScatterSvg` 25). Eight props never was.
- **Inline handlers and JSX conditionals** were useful only in explorEDA. In srcly and recipes-modern, component LOC had surfaced the same components first. Menus with one `onSelect` per item and progress panels with one `<Show>` per state were noise.
- **Component weight preset (150 LOC × 5 hooks): unchanged.** Its God component quadrant was useful in all three TSX repos (23 of 23 non-duplicate cases) and holds 5–13% of components.

**Component detection on Solid: the heuristic is enough.**
- **srcly (Solid).** 128 components; 61 of 62 TSX files have one, and the exception is `index.tsx`. Solid primitives read correctly as hooks and effects (`Treemap.tsx` 14, `Popover.tsx` 3 `createEffect`).
- **React repos.** The TSX files without components were hooks, tests, entry points and a `return null` panel.
- **One real miss:** explorEDA's `DslCode.tsx` returns `lines.map(...)` of JSX rather than JSX itself. It is noted as a follow-up; no "React-only" label is needed.

**Blast radius preset (10 CCN × 5 importers): unchanged.**
- **Useful in two repos:** explorEDA's `DataLayerProvider.tsx` (204 importers, 22 CCN) and `valueParsing.ts` (77 importers), and srcly's `git_refs.py` (15 importers).
- **No cases elsewhere.** recipes-modern had no complex file with 5+ importers (krogerAuth.ts has 4). context-recorder's Swift has no import graph.

**Bundled TS rules (open decision): kept, evidence thin.**
- **Three hits in four repos.** srcly's TS rules found three things, all in explorEDA data-prep scripts outside any tsconfig: two non-null chains and one `any`. None was worth acting on.
- **They never ran where a project checker did,** and their N/A behavior is right.
- **Not enough to apply the plan's fallback** of showing only project-tool findings for TS. The next pilot should include a TS repo without tsc or eslint.

## Effect on the default report queue

The `srcly report` general profile's top 10 files, under the old weights and the new ones:

| Repo | Shared | Left the top 10 | Entered |
| --- | ---: | --- | --- |
| srcly | 7 | `DESIGN.md`, `client/src/index.css`, a docs plan | `TreemapCanvas.tsx`, `server/app/run.py`, `docs/CODE_MAP.md` |
| recipes-modern | 8 | `docs/02-images-for-recipes.md`, `docs/done/04-ai-recipe-gen.md` | `PurchasesList.tsx`, `src/hooks/use-url-state.ts` |
| explorEDA | 8 | vendored `live-browser.js`, a research `source-packet.md` | `PlotChartPanel.tsx`, `PlotManager.tsx` |
| context-recorder | 7 | `Edits.swift` (fixture runner), `AnnotationEditor.swift` (keycode switch), `AnnotationLayer.swift` (param sum) | `main.swift`, `LibraryWindow.swift`, `README.md` |

Ten entries left: all ten were noise. Ten entered: seven useful and three noise. The noise was `CODE_MAP.md` and `README.md`, lifted by commit count, and `use-url-state.ts`.

## Follow-ups (not done here)

- **Size of non-code.** LOC (and now commits) rank Markdown, HTML and CSS alongside code. Scope LOC's higher-worse reading to code languages, or keep docs out of the general profile.
- **Params at file scope.** Make the file and folder value the max arity with a witness, like complexity, instead of a sum.
- **LOC description.** The catalog says LOC excludes comments, but TS and Python LOC count them (the toy case above). Fix the description or the count, then revisit `comment_ratio`.
- **Findings rule mix.** Weight findings by severity, or set stylistic rules (`curly`) apart, so one project rule can't fill the Findings preset.
- **Components.** Detect a component that returns `.map(...)` of JSX (`DslCode.tsx`).
- **The next pilot** should cover a TS repo without tsc or eslint (bundled rules) and a non-author repo, with a second reviewer.

## Adjudicated cases

Every case is below, by lens, with repo, rank, location, verdict and the cited evidence. Duplicates are listed after each table. The same rows are in [`cases.tsv`](cases.tsv). A location ending in `:1` is a file-level case; its evidence cites the lines read.

#### `average_function_length`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `server/tests/test_treemap_scopes.py:1` | noise | test file: long arrange/assert tests |
| srcly | 2 | `server/tests/test_function_body_loc.py:1` | noise | test file |
| srcly | 3 | `client/src/utils/lineRange.ts:1` | noise | one 51-line function in its own file |
| srcly | 4 | `server/tests/test_tsx_scopes.py:1` | noise | test file |
| srcly | 5 | `server/tests/test_anonymous_naming.py:1` | noise | test file |
| srcly | 6 | `client/src/markdown/rehypeWrapSelection.ts:1` | noise | single plugin function |
| srcly | 7 | `client/src/markdown/remarkHighlightSelection.ts:1` | noise | single plugin function |
| srcly | 8 | `server/app/services/ipynb/ipynb_analysis.py:1` | noise | mean 35 over 3 functions |
| srcly | 9 | `client/src/hooks/useHighlightedCode.ts:1` | noise | one hook |
| recipes-modern | 3 | `src/components/ui/calendar.tsx:1` | noise | vendored shadcn calendar |
| recipes-modern | 4 | `src/components/ingredients/IngredientPurchaseHistory.tsx:1` | noise | JSX markup length |
| recipes-modern | 6 | `src/app/recipes/[id]/IngredientList.tsx:1` | noise | JSX markup length |
| recipes-modern | 8 | `src/app/global-error.tsx:1` | noise | Next.js error boundary markup |
| recipes-modern | 9 | `src/app/recipes/[id]/RecipeActions.tsx:1` | noise | markup length |
| explorEDA | 1 | `packages/explorEDA/src/test/fixtures/shopProject.ts:1` | noise | test fixture data (421-line literal) |
| explorEDA | 4 | `apps/demo/src/landing/ClosingBand.tsx:1` | noise | landing-page markup |
| explorEDA | 6 | `apps/demo/src/landing/Hero.tsx:1` | noise | landing-page markup |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/MetricCard/MetricCardTraceBody.tsx:1` | noise | tooltip markup |
| explorEDA | 8 | `apps/demo/src/landing/SiteNav.tsx:1` | noise | landing-page markup |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/Timeline/TimelineTraceBody.tsx:1` | noise | tooltip markup |
| explorEDA | 10 | `packages/explorEDA/src/hooks/useFilterExtent.ts:1` | noise | one hook |
| context-recorder | 1 | `scripts/make-icon.swift:1` | noise | one-shot icon script |
| context-recorder | 4 | `scripts/ui-test/region-selector-check.swift:1` | noise | test script |
| context-recorder | 9 | `Sources/ContextRecorder/Recorder.swift:1` | noise | mean 16 |

Duplicates: srcly #10 `server/app/services/typescript/typescript_analysis.py:1` (complexity); recipes-modern #1 `src/server/api/routers/krogerRouter.ts:1` (complexity); recipes-modern #2 `src/components/MainPageWithNav.tsx:1` (complexity_avg); recipes-modern #5 `src/app/list/ShoppingListCard.tsx:1` (complexity); recipes-modern #7 `src/app/AddToMealPlanPopover.tsx:1` (max_nesting_depth); recipes-modern #10 `src/server/api/routers/imagesRouter.ts:1` (complexity_avg); explorEDA #2 `apps/demo/src/docs/gate.ts:1` (complexity_avg); explorEDA #3 `packages/explorEDA/src/components/charts/ScatterPlot/ScatterTraceBody.tsx:1` (complexity_avg); explorEDA #5 `apps/demo/src/demos/multiSourceShop.ts:1` (complexity_avg); context-recorder #2 `Sources/CanvasTool/Bakeoff.swift:1` (complexity_avg); context-recorder #3 `Sources/CanvasTool/Geometry.swift:1` (complexity); context-recorder #5 `Sources/ContextRecorder/ContextProbe.swift:1` (complexity_avg); context-recorder #6 `Sources/CanvasKit/Segmenter.swift:1` (complexity); context-recorder #7 `Sources/CanvasTool/Fixtures.swift:1` (parameter_count); context-recorder #8 `scripts/ui-test/harness.py:1` (complexity); context-recorder #10 `Sources/ContextRecorder/BrowserBridge.swift:1` (complexity_avg).

#### `churn_lines`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| recipes-modern | 7 | `src/server/api/routers/shoppingListRouter.ts:1` | noise | 111 lines from one commit (900c46f, 72+/39-): a bulk change, not a hot spot |

Duplicates: srcly #1 `server/app/services/analysis.py:1` (loc); srcly #2 `client/src/viz/deps/layout.ts:1` (complexity); srcly #3 `client/src/viz/deps/DependencyCanvas.tsx:1` (loc); srcly #4 `client/src/components/Explorer.tsx:1` (loc); srcly #5 `client/src/components/Treemap.tsx:1` (component_hook_count); srcly #6 `client/src/App.tsx:1` (loc); srcly #7 `server/app/routers/analysis.py:1` (comment_noise); srcly #8 `client/src/viz/treemap/hooks/useTreemapTooltip.ts:1` (complexity); srcly #9 `client/src/viz/deps/viewModel.ts:1` (complexity); srcly #10 `client/src/compare/ComparePicker.tsx:1` (loc); recipes-modern #1 `scripts/test-kroger.cjs:1` (loc); recipes-modern #2 `src/server/api/routers/recipe.ts:1` (loc); recipes-modern #3 `src/server/krogerAuth.ts:1` (complexity); recipes-modern #4 `scripts/test-regressions.cjs:1` (commit_count); recipes-modern #5 `src/server/api/routers/krogerRouter.ts:1` (complexity); recipes-modern #6 `src/server/kroger.ts:1` (complexity_avg); recipes-modern #8 `src/components/ingredients/PurchaseQuickAddButton.tsx:1` (complexity_avg); recipes-modern #9 `src/app/list/KrogerItemDisplay.tsx:1` (complexity); recipes-modern #10 `src/app/auth/LoginForm.tsx:1` (component_jsx_conditional_count); explorEDA #1 `docs/research/dense-chart-interactions-2026-10-12/pro/source-packet.md:1` (loc); explorEDA #2 `.claude/skills/impeccable/scripts/live-browser.js:1` (complexity); explorEDA #3 `docs/research/data-file-inputs-2026-10-12/pro/source-packet.md:1` (loc); explorEDA #4 `packages/explorEDA/src/index.css:1` (loc); explorEDA #5 `apps/demo/src/demos/dashboardSettings.ts:1` (loc); explorEDA #6 `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` (complexity); explorEDA #7 `packages/explorEDA/src/components/charts/Composition/UnitInspector.tsx:1` (loc); explorEDA #8 `packages/explorEDA/src/components/charts/BarChart/BarChart.tsx:1` (component_hook_count); explorEDA #9 `packages/explorEDA/src/providers/DataLayerProvider.tsx:1` (parameter_count); explorEDA #10 `packages/explorEDA/src/lib/dsl/compile.ts:1` (complexity); context-recorder #1 `docs/research/recording-tools/pro-output/recording-tools-sources.md:1` (loc); context-recorder #2 `docs/research/recording-tools/pro-output/recording-tools-report.md:1` (loc); context-recorder #3 `Sources/ContextRecorder/main.swift:1` (loc); context-recorder #4 `docs/research/recording-tools/pro-output/recording-tools-gap-analysis.md:1` (loc); context-recorder #5 `scripts/viewer.html:1` (loc); context-recorder #6 `scripts/process_session.py:1` (complexity); context-recorder #7 `docs/intent/video-to-canvas/sources/pro-output/video-to-canvas-report.md:1` (loc); context-recorder #8 `Sources/ContextRecorder/Library/SessionTimeline.swift:1` (parameter_count); context-recorder #9 `Sources/ContextRecorder/Library/MarkDetail.swift:1` (loc); context-recorder #10 `Sources/ContextRecorder/Library/SessionView.swift:1` (loc).

#### `comment_noise`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `server/app/services/analysis.py:810` | useful | 4 ratio flags; _should_log_file_progress docstring "Rules:" (l.814-820) restates the five ifs below it line by line (ratio 0.83). The other three (l.297, 787, 894) are contract docs: noise |
| srcly | 2 | `server/tests/fixtures/comment_noise/narrated.py:1` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| srcly | 3 | `server/tests/fixtures/comment_noise/narrated.ts:1` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| srcly | 4 | `client/src/compare/stepper.ts:1` | noise | file-level flag: a one-line module header plus doc comments on pure helpers (l.1) |
| srcly | 5 | `client/src/viz/deps/contract.ts:1` | noise | file-level flag on a type contract whose fields are documented (l.1) |
| srcly | 6 | `server/app/main.py:17` | noise | docstring explains why Ctrl+C must cancel scans first (l.19-24); needed context |
| srcly | 7 | `server/app/routers/analysis.py:120` | noise | endpoint docstring states the client use (l.121-126) |
| srcly | 8 | `server/app/run.py:40` | noise | docstring states the return contract (l.41-46); 6 comments for 10 code lines |
| srcly | 9 | `server/app/services/findings/__init__.py:1` | noise | module docstring for a package |
| srcly | 10 | `server/app/services/findings/runner.py:26` | noise | plan_tools docstring lists the tool plan (l.27-33); the behavior isn't visible from the code |
| recipes-modern | 1 | `src/server/api/root.ts:1` | noise | create-t3-app scaffold comments, file-level ratio 0.57 |
| recipes-modern | 2 | `src/server/api/trpc.ts:90` | noise | create-t3-app scaffold JSDoc with @see link (l.90-97) |
| explorEDA | 1 | `apps/data-samples/pew_meaning.ts:1` | noise | file-level: sample-data provenance comments |
| explorEDA | 2 | `packages/explorEDA/src/components/GridChartPanel.tsx:6` | noise | JSDoc states a non-obvious memo contract (l.7-11); exactly the comment to keep |
| explorEDA | 3 | `packages/explorEDA/src/components/chartDetailsStore.ts:1` | noise | file-level: field docs on a store interface (l.5-10) |
| explorEDA | 4 | `packages/explorEDA/src/components/charts/Axis/axisBounds.ts:18` | noise | ratio 0.64 doc comment on a bounds helper |
| explorEDA | 5 | `packages/explorEDA/src/components/charts/Composition/useCompositionData.ts:7` | noise | ratio 0.60 hook doc |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/DataTable/columnWidths.ts:1` | noise | file-level ratio 0.83 on documented constants |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/FacetRelated/facetBarSlot.tsx:1` | noise | file-level 0.60 |
| explorEDA | 8 | `packages/explorEDA/src/components/charts/Waterfall/waterfallTypes.ts:1` | noise | file-level: documented type fields |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/annotations/useAnnotationRows.ts:4` | noise | ratio 0.60 hook doc |
| explorEDA | 10 | `packages/explorEDA/src/components/charts/emptyPlotClick.ts:1` | noise | file-level 0.71 |
| explorEDA | 11 | `packages/explorEDA/src/test/providers/DataLayerCalculations.test.tsx:79` | useful | outside the top 10 (rank 14): commented-out console.log block (l.79-82); delete |

#### `commit_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `docs/CODE_MAP.md:1` | noise | 38 commits because AGENTS.md requires updating the code map with each feature |
| srcly | 9 | `client/src/utils/metricsStore.tsx:1` | useful | 10 commits in 90d: every metric change touches this store; the catalog PR (#75) is the fix in flight |
| srcly | 10 | `client/src/viz/deps/DependencyView.tsx:1` | useful | 10 commits: the dependency view has been reworked repeatedly; a look before the next change |
| recipes-modern | 4 | `.gitignore:1` | noise | config |
| recipes-modern | 5 | `prisma/migrations/20261005050000_kroger_token_expiry/migration.sql:1` | noise | migration, written once |
| recipes-modern | 6 | `prisma/schema.prisma:1` | noise | 1 commit |
| recipes-modern | 8 | `scripts/test-regressions.cjs:1` | noise | 1 commit |
| explorEDA | 2 | `apps/demo/src/demos/examples.ts:1` | noise | 84 commits to an append-only demo registry |
| explorEDA | 4 | `apps/demo/src/demos/coverage.ts:1` | noise | 75 commits to an append-only coverage list |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/Composition/compositionTypes.ts:1` | useful | 41 commits and 53 importers (blast radius): the composition type hub changes with every feature |
| explorEDA | 10 | `packages/explorEDA/README.md:1` | noise | docs |
| context-recorder | 2 | `README.md:1` | noise | docs |
| context-recorder | 6 | `Sources/ContextRecorder/Library/SessionModel.swift:1` | useful | 13 commits in 90d: the session model every library feature edits; a look before the next one |
| context-recorder | 10 | `Package.swift:1` | noise | manifest |

Duplicates: srcly #2 `client/src/components/Treemap.tsx:1` (component_hook_count); srcly #3 `server/app/services/analysis.py:1` (loc); srcly #4 `client/src/App.tsx:1` (loc); srcly #5 `client/src/viz/deps/DependencyCanvas.tsx:1` (loc); srcly #6 `client/src/components/CodeModal/CodeModal.tsx:1` (component_loc); srcly #7 `client/src/components/Explorer.tsx:1` (loc); srcly #8 `client/src/components/HotSpotItem.tsx:1` (component_prop_count); recipes-modern #1 `src/server/api/routers/krogerRouter.ts:1` (complexity); recipes-modern #2 `src/app/list/KrogerItemDisplay.tsx:1` (complexity); recipes-modern #3 `src/server/kroger.ts:1` (complexity_avg); recipes-modern #7 `scripts/test-kroger.cjs:1` (loc); recipes-modern #9 `src/app/auth/LoginForm.tsx:1` (component_jsx_conditional_count); recipes-modern #10 `src/app/ingredients/IngredientsClient.tsx:1` (complexity); explorEDA #1 `packages/explorEDA/src/index.css:1` (loc); explorEDA #3 `apps/demo/src/demos/dashboardSettings.ts:1` (loc); explorEDA #5 `packages/explorEDA/src/components/PlotChartPanel.tsx:1` (complexity); explorEDA #6 `packages/explorEDA/src/utils/saveDataUtils.ts:1` (complexity); explorEDA #7 `apps/demo/src/demos/coverage.test.ts:1` (ts_ignore_count); explorEDA #8 `apps/demo/src/LandingPage.tsx:1` (component_jsx_depth); context-recorder #1 `Sources/ContextRecorder/main.swift:1` (loc); context-recorder #3 `Sources/ContextRecorder/Library/LibraryWindow.swift:1` (complexity); context-recorder #4 `Sources/ContextRecorder/Library/SessionView.swift:1` (loc); context-recorder #5 `Sources/ContextRecorder/Library/LibraryView.swift:1` (complexity_avg); context-recorder #7 `scripts/process_session.py:1` (complexity); context-recorder #8 `Sources/ContextRecorder/Library/SessionTimeline.swift:1` (parameter_count); context-recorder #9 `scripts/viewer.html:1` (loc).

#### `complexity`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `client/src/viz/deps/viewModel.ts:90` | useful | buildViewModel runs numbered stages ("// 1. Which leaf…" l.95) with 44 ifs in one 300-line function; split per stage |
| srcly | 2 | `client/src/compare/graphModel.ts:109` | useful | buildCompareGraph folds both graphs, renames and diffs in one function (l.113-114 start of 3 concerns) |
| srcly | 3 | `server/app/services/typescript/typescript_analysis.py:640` | useful | _get_function_name is an if/elif ladder per node.type (l.642-651) that repeats child_by_field_name('name'); a type→strategy table would collapse it |
| srcly | 4 | `client/src/viz/deps/layout.ts:507` | useful | placeAndRoute does placement and edge routing in one function (signature l.507-511) |
| srcly | 5 | `client/src/viz/treemap/components/TreemapCanvas.tsx:167` | useful | paint() mixes animation guards (l.172) with drawing; extract animation state |
| srcly | 6 | `server/app/services/deps/python_deps.py:214` | useful | build_py_edges builds index, infos and edges in one loop (l.215-219) |
| srcly | 7 | `client/src/viz/treemap/hooks/useTreemapTooltip.ts:255` | useful | buildTooltipContent branches on type, language and metric (l.260-262) for every tooltip row |
| srcly | 8 | `client/src/viz/treemap/utils/tree.ts:6` | useful | addScopeBodyDummyNodes branches on untyped `any` nodes (l.6-13); type it and split body synthesis |
| srcly | 9 | `server/app/services/deps/graph.py:82` | useful | _assemble nests ensure_folder closure inside node assembly (l.86) |
| srcly | 10 | `server/app/services/scan_workers.py:173` | useful | run_file_analyses handles timeout, cancel and worker pool in one function (l.173-178) |
| recipes-modern | 1 | `src/server/api/routers/krogerRouter.ts:87` | useful | anonymous tRPC mutation does ownership lookups (l.89-98) then Kroger calls; extract a service function (witness "mutation(ƒ)" is a weak name) |
| recipes-modern | 2 | `src/server/api/routers/purchasesRouter.ts:111` | useful | ingredientsCatalog query builds a nested Prisma filter (l.114-118) then reshapes rows inline; extract the mapping |
| recipes-modern | 3 | `src/app/list/ShoppingListCard.tsx:24` | useful | one card renders both displayMode variants (l.26) with purchase matching inline |
| recipes-modern | 4 | `src/server/krogerAuth.ts:24` | useful | exchangeToken folds two OAuth grants into ternaries (l.25-33); split code vs refresh paths |
| recipes-modern | 5 | `src/server/ai/aiTouchUp.ts:46` | noise | 15 CCN is env guard (l.49) plus response validation; reads straight, no refactor |
| recipes-modern | 6 | `src/app/ingredients/IngredientsClient.tsx:97` | useful | inline filter callback stacks recipe/aisle/... predicates (l.98-108); extract named predicates (same pattern as PurchasesList) |
| recipes-modern | 7 | `src/app/plan/PlanPageClient.tsx:66` | useful | MealPlanRow takes 5 callbacks (l.67-71) and branches on plan state in a 652-line file |
| recipes-modern | 8 | `src/app/list/KrogerItemDisplay.tsx:19` | noise | 13 CCN is optional-chained price/promo display (l.24); flat and readable |
| recipes-modern | 9 | `src/app/purchases/PurchasesList.tsx:50` | useful | second copy of the inline multi-filter pattern (l.51-61); share a predicate helper with IngredientsClient |
| recipes-modern | 10 | `src/server/ai/aiRecipe.ts:151` | useful | parseAndValidate hand-validates with `as any` casts (l.156-158); a schema parser would replace it |
| explorEDA | 1 | `packages/explorEDA/src/utils/saveDataUtils.ts:386` | useful | isChart hand-validates every chart type in one switch of && chains (l.394-415); a per-type schema table would replace 262 branches |
| explorEDA | 2 | `packages/explorEDA/src/components/charts/Composition/validateComposition.ts:46` | useful | isMark repeats `(x === undefined \|\| isString(x)) &&` per field per mark type (l.49-65); schema-driven validation |
| explorEDA | 3 | `packages/explorEDA/src/lib/dsl/compile.ts:402` | useful | compileDocument handles views, shared definitions and incomplete builds (l.405-416) in one 155-CCN function |
| explorEDA | 4 | `packages/explorEDA/src/components/charts/Composition/CompositionTraceBody.tsx:19` | useful | one tooltip body destructures 8 glyph kinds (l.21-28) and branches on each; split per glyph kind |
| explorEDA | 5 | `packages/explorEDA/src/lib/analysis/projectFile.ts:180` | useful | validateAnalysisProjectFile is another hand validator (l.181-187); same schema fix as isChart |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:337` | useful | resolveUnit in a 4,334-line file resolves subsets, scales and marks in one function (l.342-344) |
| explorEDA | 7 | `packages/explorEDA/src/lib/annotations/resolve.ts:348` | useful | projectOne chains status guards per annotation kind (l.352-355) |
| explorEDA | 8 | `packages/explorEDA/src/components/PlotChartPanel.tsx:421` | useful | PlotChartPanel component carries 74 branches of panel state (l.428 onward) |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/Composition/compositionEdits.ts:175` | useful | convertMark converts between every mark type pair in one function (l.175-182) |
| explorEDA | 10 | `.claude/skills/impeccable/scripts/live-browser.js:7654` | noise | vendored agent-skill script (12,990-line bundle), not project code |
| context-recorder | 1 | `Sources/CanvasTool/Geometry.swift:10` | useful | check() validates columns, joins and refusals in one 36-CCN function (l.11-17); split per expectation |
| context-recorder | 2 | `extension/page.js:404` | useful | regionElements computes viewport-relative rects (l.405-411) then filters elements inline; extract geometry |
| context-recorder | 3 | `Sources/ContextRecorder/Library/DevScript.swift:25` | noise | command interpreter switch (l.30), one case per command: the natural shape |
| context-recorder | 4 | `scripts/ui-test/harness.py:95` | noise | prepare() is a straight sequence of guard SystemExits (l.96-100) |
| context-recorder | 5 | `Sources/CanvasKit/Segmenter.swift:95` | useful | feed() is a run-segmentation state machine (l.96-100) worth a look before changing |
| context-recorder | 6 | `Sources/ContextRecorder/Library/AnnotationEditor.swift:416` | noise | keyDown is a keycode switch (l.418-423); dispatch, not tangle |
| context-recorder | 7 | `Sources/ContextRecorder/Library/LibraryWindow.swift:242` | useful | every key case re-branches on model.stage (l.247-249); a per-stage keymap removes the duplication |
| context-recorder | 8 | `scripts/process_session.py:452` | useful | main() parses args (l.453-457) and runs the whole pipeline; extract steps |
| context-recorder | 9 | `Sources/ContextRecorder/Library/Edits.swift:252` | noise | fixture runner with nested Decodable structs (l.253-257), test code |
| context-recorder | 10 | `Sources/ContextRecorder/Library/MarkText.swift:78` | noise | markdown string builder over optional fields (l.81-83) |

#### `complexity_avg`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `client/src/utils/guessLangFromPath.ts:1` | noise | one flat extension ladder (l.3-8) in a 24-line file; the mean of one function |
| srcly | 2 | `client/src/utils/symbolKind.ts:1` | noise | 24-line lookup helper (l.4-6) |
| srcly | 3 | `server/app/services/deps/typescript_deps.py:1` | useful | import resolver with many branchy helpers; but nesting #6 also lands here |
| srcly | 6 | `client/src/navigation/nodeActions.ts:1` | noise | small dispatch helpers; mean 7 over few functions |
| srcly | 10 | `server/app/services/typescript/components.py:1` | noise | many small AST predicates; mean 6 is unremarkable |
| recipes-modern | 3 | `src/server/api/routers/imagesRouter.ts:1` | noise | mean 5 over 4 procedures; nothing to act on |
| recipes-modern | 4 | `src/components/ui/button.tsx:1` | noise | vendored shadcn button (l.1-3 radix/cva imports) |
| recipes-modern | 5 | `src/server/kroger.ts:1` | noise | mean 5 API client helpers |
| recipes-modern | 6 | `src/components/ingredients/PurchaseQuickAddButton.tsx:1` | noise | small component, mean 4.3 |
| recipes-modern | 8 | `src/app/kroger/UserKrogerStatus.tsx:1` | noise | mean 4 |
| recipes-modern | 9 | `src/app/kroger/auth/route.ts:1` | noise | mean 4 OAuth callback |
| recipes-modern | 10 | `src/components/MainPageWithNav.tsx:1` | noise | mean 4 |
| explorEDA | 1 | `apps/demo/src/docs/gate.ts:1` | useful | findDocsErrors (l.45) is one 63-CCN function checking every docs rule; split per rule. Not in the complexity top 10 (cut at 67) |
| explorEDA | 3 | `packages/explorEDA/src/components/charts/Composition/markSummary.ts:1` | noise | one switch per mark type (13 cases); dispatch |
| explorEDA | 4 | `packages/explorEDA/src/components/charts/ScatterPlot/ScatterTraceBody.tsx:1` | noise | 3 functions, one long tooltip body; complexity already ranks bigger bodies |
| explorEDA | 5 | `packages/explorEDA/src/lib/boundaries/regionFunction.ts:1` | noise | 44-line file, one function |
| explorEDA | 7 | `apps/demo/src/demos/multiSourceShop.ts:1` | noise | demo data builder |
| explorEDA | 8 | `packages/explorEDA/src/hooks/applyFilter.ts:1` | noise | single filter function, mean = max |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/ScatterMatrix/matrixCanvas.ts:1` | noise | mean 8.5; nothing beyond what nesting shows |
| explorEDA | 10 | `packages/explorEDA/src/server/sources/routes.ts:1` | noise | route handlers, mean 8.5 |
| context-recorder | 2 | `Sources/CanvasTool/Bakeoff.swift:1` | noise | 51-line tool with one function |
| context-recorder | 4 | `Sources/ContextRecorder/ContextProbe.swift:1` | noise | mean 6 |
| context-recorder | 5 | `Sources/ContextRecorder/BrowserBridge.swift:1` | noise | mean 5.7 |
| context-recorder | 6 | `Sources/ContextRecorder/Library/RecordingViews.swift:1` | noise | mean 5.7, SwiftUI views |
| context-recorder | 10 | `Sources/ContextRecorder/Library/LibraryView.swift:1` | noise | mean 5.2 |

Duplicates: srcly #4 `server/app/services/typescript/typescript_analysis.py:1` (complexity); srcly #5 `client/src/viz/treemap/utils/tree.ts:1` (complexity); srcly #7 `server/app/services/deps/python_deps.py:1` (complexity); srcly #8 `server/app/services/deps/graph.py:1` (complexity); srcly #9 `client/src/viz/deps/viewModel.ts:1` (complexity); recipes-modern #1 `src/server/api/routers/krogerRouter.ts:1` (complexity); recipes-modern #2 `src/app/list/ShoppingListCard.tsx:1` (complexity); recipes-modern #7 `src/server/ai/aiRecipe.ts:1` (complexity); explorEDA #2 `packages/explorEDA/src/components/charts/Composition/validateComposition.ts:1` (complexity); explorEDA #6 `packages/explorEDA/src/utils/saveDataUtils.ts:1` (complexity); context-recorder #1 `Sources/CanvasTool/Geometry.swift:1` (complexity); context-recorder #3 `Sources/CanvasKit/Segmenter.swift:1` (complexity); context-recorder #7 `Sources/ContextRecorder/Library/AnnotationEditor.swift:1` (complexity); context-recorder #8 `scripts/ui-test/harness.py:1` (complexity); context-recorder #9 `Sources/ContextRecorder/Library/DevScript.swift:1` (complexity).

#### `component_effect_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 4 | `client/src/components/Popover.tsx:39` | useful | three createEffects (l.58, 80, 86) coordinate positioning; check for a derived memo |
| srcly | 6 | `server/tests/fixtures/components/react/OrderDashboard.tsx:22` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| srcly | 9 | `client/src/components/CodeModal/OutlinePopover.tsx:48` | noise | 2 effects, one resets the cursor on query change (l.112): idiomatic |
| srcly | 10 | `client/src/components/FilePicker.tsx:20` | noise | 2 effects (l.35, 103), ordinary |
| recipes-modern | 3 | `src/components/ImageLightbox.tsx:29` | noise | 2 effects: key listener and scroll lock (l.40, 56); idiomatic |
| recipes-modern | 5 | `src/app/list/AislePickerDialog.tsx:28` | noise | 1 effect |
| recipes-modern | 8 | `src/app/recipes/[id]/TimerZone.tsx:8` | noise | 1 effect (interval) |
| recipes-modern | 9 | `src/app/recipes/new/NewRecipeForm.tsx:45` | noise | 1 effect |
| recipes-modern | 10 | `src/components/RuntimeErrorOverlay.tsx:32` | noise | 1 effect |
| explorEDA | 3 | `packages/explorEDA/src/components/plot/ChartPlacementLayer.tsx:40` | useful | 6 effects in a row (l.70-99) syncing placement; check for derived state |
| explorEDA | 4 | `packages/explorEDA/src/components/schema/SchemaDiagram.tsx:133` | useful | 6 effects (l.201-277) for layout and listeners |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/Map/StreetBasemap.tsx:32` | noise | 4 effects, each syncing one map-library option (l.110-121): imperative-library glue |
| explorEDA | 8 | `packages/explorEDA/src/components/ui/multi-select.tsx:265` | noise | vendored multi-select component |
| explorEDA | 9 | `apps/demo/src/SavedViewTabs.tsx:107` | noise | 3 effects |
| explorEDA | 10 | `apps/demo/src/docs/components/search.tsx:107` | noise | 3 effects, one resets on query (l.156) |

Duplicates: srcly #1 `client/src/components/CodeModal/CodeModal.tsx:43` (component_loc); srcly #2 `client/src/components/CodeModal/CodePane.tsx:45` (component_loc); srcly #3 `client/src/components/Explorer.tsx:132` (loc); srcly #5 `client/src/viz/deps/DependencyCanvas.tsx:147` (loc); srcly #7 `client/src/App.tsx:159` (loc); srcly #8 `client/src/compare/ComparePicker.tsx:75` (loc); recipes-modern #1 `src/app/recipes/[id]/IngredientListEditMode.tsx:17` (loc); recipes-modern #2 `src/app/recipes/[id]/RecipeClient.tsx:18` (component_loc); recipes-modern #4 `src/components/ui/carousel.tsx:49` (component_hook_count); recipes-modern #6 `src/app/list/KrogerSearchPopup.tsx:32` (component_loc); recipes-modern #7 `src/app/recipes/[id]/StepListEditMode.tsx:17` (parameter_count); explorEDA #1 `packages/explorEDA/src/components/PlotManager.tsx:130` (component_loc); explorEDA #2 `apps/app/src/App.tsx:111` (max_nesting_depth); explorEDA #5 `packages/explorEDA/src/components/PlotChartPanel.tsx:421` (complexity); explorEDA #6 `apps/demo/src/SavedViewsWorkspace.tsx:300` (component_loc).

#### `component_hook_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 5 | `client/src/components/Treemap.tsx:54` | useful | 14 Solid primitives, four boolean createSignals for modes (l.60-62); fold into one view-state store |
| srcly | 8 | `client/src/viz/scatter/ScatterView.tsx:49` | useful | preset/cohort/quadrant signals mirrored to the URL by createEffect (l.57-72); a URL-state helper would own them |
| srcly | 10 | `server/tests/fixtures/components/react/OrderDashboard.tsx:22` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| recipes-modern | 8 | `src/app/recipes/[id]/RecipeEditDialog.tsx:24` | useful | 4 tRPC mutations wired inline (l.27-38); move to a useRecipeEdit hook |
| recipes-modern | 9 | `src/app/recipes/[id]/RecipeImagesSection.tsx:13` | useful | drag/upload/lightbox state in one component (l.16-19); extract upload hook |
| recipes-modern | 10 | `src/components/ui/carousel.tsx:49` | noise | vendored shadcn carousel |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/ThreeDScatter/ThreeDScatterChart.tsx:74` | useful | one zustand selector per field (l.92-94); one shallow selector or a chart-context hook |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/BarChart/BarChart.tsx:106` | useful | same per-field selector pattern (l.115-118), 30 hooks |
| explorEDA | 10 | `packages/explorEDA/src/components/charts/LineChart/TimeSeriesChart.tsx:34` | useful | 27 hooks of trace wiring (l.42-45); a useChartTraceWiring hook is shared by the charts |

Duplicates: srcly #1 `client/src/components/CodeModal/CodeModal.tsx:43` (component_loc); srcly #2 `client/src/components/Explorer.tsx:132` (loc); srcly #3 `client/src/App.tsx:159` (loc); srcly #4 `client/src/viz/deps/DependencyCanvas.tsx:147` (loc); srcly #6 `client/src/compare/CompareApp.tsx:58` (max_nesting_depth); srcly #7 `client/src/compare/CompareTable.tsx:116` (component_loc); srcly #9 `client/src/compare/ComparePicker.tsx:75` (loc); recipes-modern #1 `src/app/RecipeList.tsx:53` (loc); recipes-modern #2 `src/app/plan/PlanPageClient.tsx:227` (complexity); recipes-modern #3 `src/app/ingredients/IngredientsClient.tsx:56` (complexity); recipes-modern #4 `src/app/list/KrogerSearchPopup.tsx:32` (component_loc); recipes-modern #5 `src/app/recipes/[id]/RecipeClient.tsx:18` (component_loc); recipes-modern #6 `src/app/list/ShoppingList.tsx:21` (component_loc); recipes-modern #7 `src/app/purchases/PurchasesList.tsx:25` (complexity); explorEDA #1 `packages/explorEDA/src/components/PlotManager.tsx:130` (component_loc); explorEDA #2 `packages/explorEDA/src/components/PlotChartPanel.tsx:421` (complexity); explorEDA #3 `packages/explorEDA/src/components/charts/ScatterMatrix/ScatterMatrix.tsx:98` (component_loc); explorEDA #4 `apps/demo/src/SavedViewsWorkspace.tsx:300` (component_loc); explorEDA #5 `packages/explorEDA/src/components/charts/Hierarchy/HierarchyChart.tsx:177` (component_loc); explorEDA #8 `packages/explorEDA/src/components/charts/BoxPlot/BoxPlot.tsx:60` (component_loc); explorEDA #9 `packages/explorEDA/src/components/charts/ParallelCoordinates/ParallelCoordinates.tsx:122` (component_loc).

#### `component_inline_handler_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 8 | `server/tests/fixtures/components/react/OrderDashboard.tsx:22` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| srcly | 9 | `client/src/compare/CommitStepper.tsx:14` | noise | 6 one-line handlers (l.66-77); fine inline |
| explorEDA | 2 | `packages/explorEDA/src/components/charts/Composition/CompositionInspector.tsx:126` | useful | 23 inline handlers, some multi-line (l.247 onClick={() => {); extract named actions |
| explorEDA | 3 | `packages/explorEDA/src/components/charts/Map/PointMap.tsx:52` | useful | per-point pointer/focus/click handlers inline in the map loop (l.357-365); hoist to one delegated handler |
| explorEDA | 4 | `packages/explorEDA/src/components/charts/DataTable/DataTableContextMenu.tsx:72` | noise | one onSelect per menu item (l.169-181): the natural shape for a menu |
| explorEDA | 8 | `packages/explorEDA/src/components/charts/Sankey/SankeyChart.tsx:107` | useful | hover handlers created per link in the render loop (l.480-481) |
| explorEDA | 9 | `packages/explorEDA/src/components/settings/annotations/AnnotationFields.tsx:113` | noise | one onChange per form field (l.184-239) |

Duplicates: srcly #1 `client/src/viz/deps/DependencyCanvas.tsx:147` (loc); srcly #2 `client/src/components/Explorer.tsx:132` (loc); srcly #3 `client/src/App.tsx:159` (loc); srcly #4 `client/src/compare/CompareApp.tsx:58` (max_nesting_depth); srcly #5 `client/src/components/Treemap.tsx:54` (component_hook_count); srcly #6 `client/src/compare/ComparePicker.tsx:75` (loc); srcly #7 `client/src/compare/CompareTable.tsx:116` (component_loc); srcly #10 `client/src/components/HotSpotItem.tsx:29` (component_prop_count); recipes-modern #1 `src/app/RecipeList.tsx:53` (loc); recipes-modern #2 `src/app/plan/PlanPageClient.tsx:227` (complexity); recipes-modern #3 `src/app/recipes/[id]/RecipeImagesSection.tsx:13` (component_hook_count); recipes-modern #4 `src/app/ingredients/IngredientsClient.tsx:56` (complexity); recipes-modern #5 `src/app/recipes/[id]/IngredientListEditMode.tsx:17` (loc); recipes-modern #6 `src/app/ai/recipe/page.tsx:12` (parameter_count); recipes-modern #7 `src/app/recipes/[id]/RecipeEditDialog.tsx:24` (component_hook_count); recipes-modern #8 `src/app/purchases/PurchasesList.tsx:25` (complexity); recipes-modern #9 `src/app/recipes/[id]/StepListEditMode.tsx:17` (parameter_count); recipes-modern #10 `src/app/list/KrogerSearchPopup.tsx:32` (component_loc); explorEDA #1 `packages/explorEDA/src/components/charts/Composition/UnitInspector.tsx:2399` (loc); explorEDA #5 `packages/explorEDA/src/components/charts/ParallelCoordinates/ParallelCoordinates.tsx:122` (component_loc); explorEDA #6 `packages/explorEDA/src/components/charts/ScatterPlot/ScatterPlot.tsx:76` (component_loc); explorEDA #7 `packages/explorEDA/src/components/PlotManager.tsx:130` (component_loc); explorEDA #10 `packages/explorEDA/src/components/SummaryTable/components/FieldInspector.tsx:80` (component_jsx_depth).

#### `component_jsx_conditional_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 7 | `client/src/components/feedback/ScanProgress.tsx:13` | noise | 11 <Show> blocks, one per progress state (l.48-123); the natural shape |
| srcly | 8 | `client/src/compare/Inspector.tsx:54` | noise | 9 <Show> guards for optional fields (l.122-140) |
| recipes-modern | 8 | `src/app/auth/LoginForm.tsx:18` | noise | 4 conditionals |
| explorEDA | 5 | `packages/explorEDA/src/components/charts/Map/RegionTraceBody.tsx:15` | useful | nested ternary on region.state (l.129-134) among 22 conditionals; map state→view |
| explorEDA | 6 | `packages/explorEDA/src/components/project/ProjectSchemaPanel.tsx:45` | useful | 22 conditionals in one panel |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/PivotTable/PivotTable.tsx:118` | useful | 21 conditionals (22 `&& (`/`? (` lines) |
| explorEDA | 8 | `packages/explorEDA/src/components/charts/BarChart/BarTraceBody.tsx:11` | noise | tooltip body: optional rows per field |

Duplicates: srcly #1 `client/src/viz/deps/DependencyCanvas.tsx:147` (loc); srcly #2 `client/src/viz/treemap/components/TreemapTooltip.tsx:33` (component_jsx_depth); srcly #3 `client/src/App.tsx:159` (loc); srcly #4 `client/src/compare/ComparePicker.tsx:75` (loc); srcly #5 `client/src/compare/CompareApp.tsx:58` (max_nesting_depth); srcly #6 `client/src/compare/CompareTable.tsx:116` (component_loc); srcly #9 `client/src/components/CodeModal/CodePane.tsx:45` (component_loc); srcly #10 `client/src/components/CodeModal/MetricsTable.tsx:12` (component_jsx_depth); recipes-modern #1 `src/app/ai/recipe/page.tsx:12` (parameter_count); recipes-modern #2 `src/app/plan/PlanPageClient.tsx:227` (complexity); recipes-modern #3 `src/app/recipes/[id]/IngredientListEditMode.tsx:17` (loc); recipes-modern #4 `src/app/list/KrogerSearchPopup.tsx:32` (component_loc); recipes-modern #5 `src/app/purchases/PurchasesTable.tsx:70` (component_prop_count); recipes-modern #6 `src/app/AddToMealPlanPopover.tsx:18` (max_nesting_depth); recipes-modern #7 `src/app/RecipeList.tsx:53` (loc); recipes-modern #9 `src/app/ingredients/IngredientsClient.tsx:56` (complexity); recipes-modern #10 `src/app/list/ShoppingList.tsx:21` (component_loc); explorEDA #1 `packages/explorEDA/src/components/charts/Composition/CompositionTraceBody.tsx:19` (complexity); explorEDA #2 `packages/explorEDA/src/components/PlotChartPanel.tsx:421` (complexity); explorEDA #3 `apps/app/src/ProjectWorkspace.tsx:79` (component_prop_count); explorEDA #4 `packages/explorEDA/src/components/SummaryTable/components/FieldInspector.tsx:80` (component_jsx_depth); explorEDA #9 `packages/explorEDA/src/components/charts/ScatterPlot/ScatterTraceBody.tsx:16` (complexity_avg); explorEDA #10 `packages/explorEDA/src/components/charts/Composition/UnitInspector.tsx:2399` (loc).

#### `component_jsx_depth`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 5 | `client/src/viz/treemap/components/TreemapTooltip.tsx:33` | useful | child rows rendered inline in <For> at depth 11 (l.136-150); extract a ChildRow |
| srcly | 7 | `client/src/components/CodeModal/FileFindings.tsx:32` | noise | depth 10 from <Show>/<For> wrappers around a list; reads fine |
| srcly | 8 | `client/src/components/CodeModal/MetricsTable.tsx:12` | noise | table markup depth |
| srcly | 9 | `client/src/components/MetricPicker.tsx:25` | noise | grouped picker markup depth |
| recipes-modern | 1 | `src/app/recipes/[id]/CookingModeOverlay.tsx:21` | useful | nested group→step maps inline at depth 11 (l.95-115), and an <li> inside a <label> (l.109); extract StepItem |
| explorEDA | 1 | `packages/explorEDA/src/components/SummaryTable/components/FieldInspector.tsx:80` | useful | depth 11 and 22 conditionals; extract sections |
| explorEDA | 2 | `packages/explorEDA/src/components/calculations/CalculationManager.tsx:10` | useful | depth 11 list-in-dialog markup (l.112); extract the row |
| explorEDA | 3 | `packages/explorEDA/src/components/charts/FacetRelated/FacetGridLayout.tsx:40` | useful | depth 11 grid cells inline (l.247), 14 props |
| explorEDA | 4 | `packages/explorEDA/src/components/SummaryTable/components/CompactSummaryTable.tsx:110` | noise | table markup depth 10 |
| explorEDA | 5 | `packages/explorEDA/src/components/charts/DataTable/DataTableHeader.tsx:64` | noise | header markup depth 10 |
| explorEDA | 6 | `packages/explorEDA/src/components/plot/AddChartDialog.tsx:125` | noise | dialog markup depth 10 |
| explorEDA | 7 | `apps/demo/src/ExampleSelector.tsx:25` | noise | demo markup |
| explorEDA | 8 | `apps/demo/src/LandingPage.tsx:167` | noise | landing page markup |
| explorEDA | 10 | `apps/demo/src/landing/IntegrationGuide.tsx:76` | noise | landing page markup |

Duplicates: srcly #1 `client/src/components/FileTypeFilter.tsx:23` (component_loc); srcly #2 `client/src/compare/CompareTable.tsx:116` (component_loc); srcly #3 `client/src/App.tsx:159` (loc); srcly #4 `client/src/compare/ComparePicker.tsx:75` (loc); srcly #6 `client/src/compare/CompareApp.tsx:58` (max_nesting_depth); srcly #10 `client/src/viz/deps/DependencyCanvas.tsx:147` (loc); recipes-modern #2 `src/app/ai/recipe/page.tsx:12` (parameter_count); recipes-modern #3 `src/app/ingredients/IngredientsClient.tsx:56` (complexity); recipes-modern #4 `src/app/recipes/[id]/IngredientListEditMode.tsx:17` (loc); recipes-modern #5 `src/app/list/KrogerSearchPopup.tsx:32` (component_loc); recipes-modern #6 `src/components/ImageLightbox.tsx:29` (component_effect_count); recipes-modern #7 `src/app/RecipeList.tsx:53` (loc); recipes-modern #8 `src/app/global-error.tsx:7` (average_function_length); recipes-modern #9 `src/app/list/ShoppingListCard.tsx:24` (complexity); recipes-modern #10 `src/app/plan/PlanPageClient.tsx:66` (complexity); explorEDA #9 `apps/demo/src/docs/components/search.tsx:107` (component_effect_count).

#### `component_loc`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 4 | `client/src/components/CodeModal/CodeModal.tsx:43` | useful | 368-line Solid component with 18 createSignal/createMemo/createEffect calls; split viewer state from layout |
| srcly | 7 | `client/src/compare/CompareTable.tsx:116` | useful | 330-line table component; extract row and header |
| srcly | 8 | `client/src/viz/scatter/ScatterPlot.tsx:35` | useful | 324-line plot with drag, axes and points inline |
| srcly | 9 | `client/src/components/CodeModal/CodePane.tsx:45` | useful | 295 lines and 20 props (CodePane(props: CodePaneProps) l.45) |
| srcly | 10 | `client/src/components/FileTypeFilter.tsx:23` | useful | 268 lines; owns open state, LOC input and path exclusions (l.24-26); also deepest JSX (13) |
| recipes-modern | 7 | `src/app/list/ShoppingList.tsx:21` | useful | 247-line list component |
| recipes-modern | 9 | `src/app/recipes/[id]/RecipeClient.tsx:18` | useful | 231 lines and 12 hooks |
| recipes-modern | 10 | `src/app/list/KrogerSearchPopup.tsx:32` | useful | 226 lines, 12 hooks, 6 JSX conditionals |
| explorEDA | 1 | `apps/demo/src/SavedViewsWorkspace.tsx:300` | useful | 1,066-line component (l.300); split |
| explorEDA | 2 | `packages/explorEDA/src/components/PlotManager.tsx:130` | useful | 967 lines, 75 hooks, 10 effects |
| explorEDA | 3 | `packages/explorEDA/src/components/charts/ParallelCoordinates/ParallelCoordinates.tsx:122` | useful | 864-line chart component |
| explorEDA | 5 | `packages/explorEDA/src/components/charts/LineChart/LineChart.tsx:67` | useful | 775-line FC (l.67) |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/ScatterPlot/ScatterPlot.tsx:76` | useful | 741-line ScatterPoints |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/RowChart/RowChart.tsx:62` | useful | 731 lines |
| explorEDA | 8 | `packages/explorEDA/src/components/charts/ScatterMatrix/ScatterMatrix.tsx:98` | useful | 717 lines, 35 hooks |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/BoxPlot/BoxPlot.tsx:60` | useful | 703 lines, 30 hooks |
| explorEDA | 10 | `packages/explorEDA/src/components/charts/Hierarchy/HierarchyChart.tsx:177` | useful | 675 lines, 32 hooks |

Duplicates: srcly #1 `client/src/viz/deps/DependencyCanvas.tsx:147` (loc); srcly #2 `client/src/App.tsx:159` (loc); srcly #3 `client/src/components/Explorer.tsx:132` (loc); srcly #5 `client/src/compare/CompareApp.tsx:58` (max_nesting_depth); srcly #6 `client/src/viz/treemap/components/TreemapCanvas.tsx:126` (complexity); recipes-modern #1 `src/app/recipes/[id]/IngredientListEditMode.tsx:17` (loc); recipes-modern #2 `src/app/plan/PlanPageClient.tsx:227` (complexity); recipes-modern #3 `src/app/ingredients/IngredientsClient.tsx:56` (complexity); recipes-modern #4 `src/app/RecipeList.tsx:53` (loc); recipes-modern #5 `src/app/ai/recipe/page.tsx:12` (parameter_count); recipes-modern #6 `src/app/recipes/[id]/StepListEditMode.tsx:17` (parameter_count); recipes-modern #8 `src/app/recipes/[id]/touch-up/touchup-client.tsx:64` (parameter_count); explorEDA #4 `packages/explorEDA/src/components/PlotChartPanel.tsx:421` (complexity).

#### `component_prop_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 2 | `client/src/viz/treemap/components/TreemapHeader.tsx:46` | useful | 16 props, mostly accessor/handler pairs (props.view()/onViewChange l.62-65); pass a view-model object |
| srcly | 3 | `client/src/components/CodeModal/CodeModalHeader.tsx:62` | useful | 15 props threaded from CodeModal; same split as CodeModal |
| srcly | 4 | `client/src/compare/CompareTreemap.tsx:19` | noise | 13 props on a local Pane, mostly pass-through |
| srcly | 7 | `client/src/compare/CompareGraph.tsx:77` | noise | 10 props on a local Pane |
| srcly | 8 | `client/src/components/CodeModal/MetricsSidebar.tsx:8` | noise | 10 props |
| srcly | 9 | `client/src/components/HotSpotItem.tsx:29` | noise | 10 props on a row; already uses HotSpotRowContext |
| srcly | 10 | `client/src/viz/scatter/QuadrantPanel.tsx:17` | noise | 10 props |
| recipes-modern | 1 | `src/app/purchases/PurchasesTable.tsx:157` | noise | 8 props |
| recipes-modern | 2 | `src/components/SimpleAlertDialog.tsx:33` | noise | 8 props on a dialog wrapper |
| recipes-modern | 4 | `src/components/recipes/RecipeTagEditor.tsx:30` | noise | 8 props |
| recipes-modern | 6 | `src/app/purchases/PurchasesFiltersPanel.tsx:44` | noise | 7 props |
| explorEDA | 1 | `packages/explorEDA/src/components/charts/ScatterPlot/ScatterSvg.tsx:408` | useful | 25 destructured props (l.408); group into scales/handlers objects |
| explorEDA | 2 | `packages/explorEDA/src/components/charts/BaseChart.tsx:75` | useful | 23 props on the base every chart passes through |
| explorEDA | 4 | `packages/explorEDA/src/components/calculations/CalculationForm.tsx:37` | noise | 16 props on a form; one per field |
| explorEDA | 5 | `apps/app/src/ProjectWorkspace.tsx:79` | useful | 15 props and 25 JSX conditionals: a workspace switching on props |
| explorEDA | 6 | `packages/explorEDA/src/components/ExplorEdaProject.tsx:101` | noise | 15 props: the public embed API (forwardRef, l.101) |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/ColorLegend/ColorScale.tsx:25` | noise | 15 presentational props |
| explorEDA | 10 | `packages/explorEDA/src/components/project/ProjectQueryPanel.tsx:35` | noise | 13 props |

Duplicates: srcly #1 `client/src/components/CodeModal/CodePane.tsx:45` (component_loc); srcly #5 `client/src/viz/treemap/components/TreemapCanvas.tsx:126` (complexity); srcly #6 `client/src/viz/scatter/ScatterPlot.tsx:35` (component_loc); recipes-modern #3 `src/components/ingredients/IngredientPurchaseHistory.tsx:39` (average_function_length); recipes-modern #5 `src/app/plan/PlanPageClient.tsx:66` (complexity); recipes-modern #7 `src/components/ui/carousel.tsx:49` (component_hook_count); recipes-modern #8 `src/components/ui/sidebar.tsx:64` (loc); recipes-modern #9 `src/app/list/KrogerSearchPopup.tsx:32` (component_loc); recipes-modern #10 `src/app/recipes/[id]/RecipeActions.tsx:51` (average_function_length); explorEDA #3 `packages/explorEDA/src/components/ui/multi-select.tsx:265` (component_effect_count); explorEDA #8 `apps/demo/src/SavedViewsWorkspace.tsx:300` (component_loc); explorEDA #9 `packages/explorEDA/src/components/charts/FacetRelated/FacetGridLayout.tsx:40` (component_jsx_depth).

#### `finding_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `server/app/routers/compare.py:1` | useful | ruff B905 zip() without strict= (l.70, l.81): a silent-truncation risk |
| srcly | 2 | `server/tests/test_analysis_context.py:1` | useful | F401 unused imports anyio, FastAPI (l.3-4): delete |
| srcly | 3 | `server/tests/test_scan_jobs.py:1` | useful | F401 unused imports (l.10, l.12) |
| srcly | 4 | `server/app/routers/files.py:1` | useful | B904 raise without from inside except (l.60) |
| srcly | 9 | `server/tests/test_cli_repo_root_detection.py:1` | useful | F401 unused os (l.1) |
| srcly | 10 | `server/tests/test_compare_commits.py:1` | useful | F401 unused Path (l.5) |
| recipes-modern | 4 | `src/components/ui/toggle-group.tsx:1` | noise | prefer-nullish-coalescing in vendored shadcn code (l.47-48) |
| recipes-modern | 8 | `src/app/kroger/page.tsx:1` | useful | unused import Button (l.3) |
| recipes-modern | 10 | `src/app/page.tsx:1` | useful | unused import Link (l.1) |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/ScatterPlot/regression.ts:1` | noise | 36 eslint `curly` style findings (l.77-85); 2,174 of the repo's ~2,350 findings are this one rule |
| explorEDA | 9 | `packages/explorEDA/src/components/ExplorEda.tsx:1` | useful | 31 react-refresh/only-export-components (l.270-272): the component file re-exports the library API; move it to index.ts |

Duplicates: srcly #5 `server/app/run.py:1` (comment_noise); srcly #6 `server/app/services/analysis.py:1` (loc); srcly #7 `server/app/services/reporting.py:1` (loc); srcly #8 `server/scripts/evaluate_metric_portfolio.py:1` (parameter_count); recipes-modern #1 `src/server/ai/aiRecipe.ts:1` (complexity); recipes-modern #2 `src/components/ingredients/IngredientPurchaseHistory.tsx:1` (average_function_length); recipes-modern #3 `src/trpc/helpers.ts:1` (ts_any_usage_count); recipes-modern #5 `src/app/RecipeList.tsx:1` (loc); recipes-modern #6 `src/app/ai/recipe/page.tsx:1` (parameter_count); recipes-modern #7 `src/app/kroger/model.ts:1` (ts_any_usage_count); recipes-modern #9 `src/app/list/KrogerItemDisplay.tsx:1` (complexity); explorEDA #1 `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` (complexity); explorEDA #2 `packages/explorEDA/src/lib/analysis/projectFile.ts:1` (complexity); explorEDA #3 `packages/explorEDA/src/lib/annotations/resolve.ts:1` (complexity); explorEDA #4 `packages/explorEDA/src/components/charts/Composition/resolveComposition.ts:1` (max_nesting_depth); explorEDA #5 `packages/explorEDA/src/lib/analysis/evaluateProject.ts:1` (parameter_count); explorEDA #6 `packages/explorEDA/src/components/charts/Map/PointMap.tsx:1` (component_inline_handler_count); explorEDA #8 `packages/explorEDA/src/components/schema/SchemaDiagram.tsx:1` (component_effect_count); explorEDA #10 `packages/explorEDA/src/components/PlotChartPanel.tsx:1` (complexity).

#### `loc`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 2 | `server/app/services/analysis.py:1` | useful | 1,036-line module mixing scan, attach and rollup (attach_file_metrics / aggregate_metrics); split rollup out |
| srcly | 3 | `client/src/viz/deps/DependencyCanvas.tsx:1` | useful | 875-line canvas component; drawing and interaction in one file |
| srcly | 4 | `server/app/services/reporting.py:1` | useful | 778 lines: ranking, rendering and artifact writing in one module |
| srcly | 5 | `DESIGN.md:1` | noise | a design document; length is not a defect |
| srcly | 7 | `client/src/compare/ComparePicker.tsx:1` | useful | 614-line picker with several sub-pickers inline; extract them |
| srcly | 8 | `client/src/App.tsx:1` | useful | 588-line App shell holding routing, scan state and layout |
| srcly | 10 | `client/src/components/Explorer.tsx:1` | useful | 542-line explorer: columns, sorting and rows in one component |
| recipes-modern | 1 | `src/server/api/routers/recipe.ts:1` | useful | 1,096-line tRPC router holding every recipe procedure; split by sub-resource |
| recipes-modern | 2 | `src/components/ui/sidebar.tsx:1` | noise | vendored shadcn/ui primitive ("use client" + radix Slot, l.1-4) |
| recipes-modern | 3 | `docs/done/04-ai-recipe-gen.md:1` | noise | finished plan doc |
| recipes-modern | 5 | `docs/02-images-for-recipes.md:1` | noise | plan doc |
| recipes-modern | 6 | `src/app/recipes/[id]/IngredientListEditMode.tsx:1` | useful | 442-line edit-mode component (also component_loc #1) |
| recipes-modern | 7 | `docs/03-ai-meal-planning.md:1` | noise | plan doc |
| recipes-modern | 9 | `src/app/RecipeList.tsx:1` | useful | 378-line list component, a god component in the 2x2 |
| recipes-modern | 10 | `scripts/test-kroger.cjs:1` | noise | one-off manual test script |
| explorEDA | 1 | `docs/research/dense-chart-interactions-2026-10-12/pro/source-packet.md:1` | noise | 25k-line generated research packet |
| explorEDA | 3 | `docs/research/data-file-inputs-2026-10-12/pro/source-packet.md:1` | noise | generated research packet |
| explorEDA | 4 | `packages/explorEDA/src/index.css:1` | noise | Tailwind theme stylesheet (l.1 @import "tailwindcss"); size is tokens, not logic |
| explorEDA | 5 | `apps/demo/src/demos/dashboardSettings.ts:1` | noise | 6,458 lines of demo chart data literals (l.4-6 `const base = {`) |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/Composition/UnitInspector.tsx:1` | useful | 3,313-line inspector component file; split per section |
| explorEDA | 9 | `docs/intent/comparison-opportunities/resources/pro-gap-analysis/explorEDA-gap-analysis-2026-10-05/reports/02-comprehensive-gap-register.html:1` | noise | generated HTML report |
| explorEDA | 10 | `packages/explorEDA/src/lib/dsl/composition.ts:1` | useful | 2,212-line DSL module |
| context-recorder | 1 | `docs/research/recording-tools/pro-output/recording-tools-sources.md:1` | noise | research doc |
| context-recorder | 2 | `docs/research/recording-tools/pro-output/recording-tools-report.md:1` | noise | research doc |
| context-recorder | 3 | `docs/research/recording-tools/pro-output/recording-tools-gap-analysis.md:1` | noise | research doc |
| context-recorder | 4 | `scripts/viewer.html:1` | useful | 589-line single-file HTML viewer with inline script; worth splitting the script out |
| context-recorder | 5 | `docs/intent/video-to-canvas/sources/pro-output/video-to-canvas-report.md:1` | noise | research doc |
| context-recorder | 7 | `docs/intent/video-to-canvas/sources/pro-output/video-to-canvas-proof-plan.md:1` | noise | plan doc |
| context-recorder | 8 | `Sources/ContextRecorder/Library/SessionView.swift:1` | useful | 465-line SwiftUI view file |
| context-recorder | 9 | `Sources/ContextRecorder/Library/MarkDetail.swift:1` | useful | 450-line view file |
| context-recorder | 10 | `Sources/ContextRecorder/main.swift:1` | useful | 430-line main.swift with app setup and commands |

Duplicates: srcly #1 `client/src/viz/deps/layout.ts:1` (already complexity #4 (placeAndRoute)); srcly #6 `server/app/services/typescript/typescript_analysis.py:1` (already complexity #3); srcly #9 `client/src/viz/deps/viewModel.ts:1` (already complexity #1); recipes-modern #4 `src/app/plan/PlanPageClient.tsx:1` (already complexity #7); recipes-modern #8 `src/app/ingredients/IngredientsClient.tsx:1` (already complexity #6); explorEDA #2 `.claude/skills/impeccable/scripts/live-browser.js:1` (already complexity #10 (vendored, noise there too)); explorEDA #6 `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` (already complexity #6); explorEDA #8 `packages/explorEDA/src/lib/dsl/compile.ts:1` (already complexity #3); context-recorder #6 `scripts/process_session.py:1` (already complexity #8).

#### `max_nesting_depth`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 3 | `client/src/viz/deps/geometry.ts:1` | useful | four nested loops over segment pairs (l.137-142); extract a pairwise-overlap helper |
| srcly | 5 | `server/app/services/deps/common.py:1` | useful | file walk nests five guards in the loop (l.75-85); extract an is_source_file predicate |
| srcly | 9 | `client/src/compare/CompareApp.tsx:1` | noise | depth 4 in event handlers; ordinary |
| recipes-modern | 1 | `src/hooks/use-url-state.ts:1` | noise | depth 4 for patch→URLSearchParams (l.22-29); natural shape |
| recipes-modern | 4 | `src/components/GlobalAddTagDialog.tsx:1` | useful | inline async onClick holds upsert + attach logic (l.70-84); extract a handler |
| recipes-modern | 10 | `src/app/AddToMealPlanPopover.tsx:1` | noise | depth 2 |
| explorEDA | 1 | `packages/explorEDA/src/components/charts/Composition/resolveComposition.ts:1` | useful | depth-5 frame math (l.1120) inside a 1,100+ line resolver |
| explorEDA | 4 | `packages/explorEDA/src/components/charts/ScatterMatrix/matrixPlan.ts:1` | useful | per-kind cell planning nested in loops (l.696-712); per-kind planners |
| explorEDA | 7 | `apps/app/src/App.tsx:1` | noise | depth 4 app shell |
| explorEDA | 8 | `apps/data-samples/prepare/beijing.ts:1` | noise | data-prep script |
| explorEDA | 9 | `apps/data-samples/prepare/lib.ts:1` | noise | data-prep script |
| explorEDA | 10 | `apps/data-samples/product_events.ts:1` | noise | sample data generator |
| context-recorder | 1 | `docs/intent/video-to-canvas/spikes/opencv_bakeoff.py:1` | noise | throwaway spike under docs/ (l.43) |
| context-recorder | 2 | `scripts/test_process_session.py:1` | noise | test file |
| context-recorder | 5 | `scripts/check-transcript.py:1` | noise | depth 1: the queue ran out of nonzero cases |

Duplicates: srcly #1 `server/app/services/deps/python_deps.py:1` (complexity); srcly #2 `server/app/services/typescript/typescript_analysis.py:1` (complexity); srcly #4 `client/src/viz/deps/layout.ts:1` (complexity); srcly #6 `server/app/services/deps/typescript_deps.py:1` (complexity_avg); srcly #7 `server/app/services/scan_workers.py:1` (complexity); srcly #8 `server/app/services/typescript/components.py:1` (complexity_avg); srcly #10 `client/src/components/Explorer.tsx:1` (loc); recipes-modern #2 `src/server/api/routers/recipe.ts:1` (loc); recipes-modern #3 `src/app/purchases/PurchasesList.tsx:1` (complexity); recipes-modern #5 `src/server/api/routers/imagesRouter.ts:1` (complexity_avg); recipes-modern #6 `src/server/api/routers/krogerRouter.ts:1` (complexity); recipes-modern #7 `src/server/api/routers/purchasesRouter.ts:1` (complexity); recipes-modern #8 `src/server/kroger.ts:1` (complexity_avg); recipes-modern #9 `src/server/krogerAuth.ts:1` (complexity); explorEDA #2 `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` (complexity); explorEDA #3 `packages/explorEDA/src/components/charts/ScatterMatrix/matrixCanvas.ts:1` (complexity_avg); explorEDA #5 `packages/explorEDA/src/lib/analysis/projectFile.ts:1` (complexity); explorEDA #6 `packages/explorEDA/src/lib/dsl/compile.ts:1` (complexity); context-recorder #3 `scripts/ui-test/harness.py:1` (complexity); context-recorder #4 `scripts/process_session.py:1` (complexity).

#### `md_data_url_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 2 | `docs/analysis/Markdown.md:1` | noise | one data URL in an analysis note |
| srcly | 3 | `docs/intent/dependency-graph-legibility/implementation-plan.md:1` | noise | one data URL |
| recipes-modern | 3 | `docs/done/01-cat-tags.md:1` | noise | one data URL in a finished plan |
| explorEDA | 3 | `packages/explorEDA/docs/archive/prd/funcs.md:1` | useful | 18 inline base64 images bloat an archived PRD; move to files |
| explorEDA | 4 | `packages/explorEDA/docs/archive/prd/05-pivot-tables/prd_plans.md:1` | noise | 5 data URLs in an archive; nobody edits it |
| explorEDA | 5 | `packages/explorEDA/docs/archive/prd/06-calcs-engine/prd_reqs.md:1` | noise | archive |
| explorEDA | 6 | `packages/explorEDA/docs/archive/prd/10-saved-data/plans.md:1` | noise | archive |
| explorEDA | 7 | `packages/explorEDA/docs/archive/prd/chart_features/parallel_coordinates.md:1` | noise | archive |
| explorEDA | 8 | `packages/explorEDA/docs/archive/prd/06-calcs-engine/calc_rework.md:1` | noise | archive |
| explorEDA | 9 | `packages/explorEDA/docs/archive/prd/18-box-plot/plans.md:1` | noise | archive |
| explorEDA | 10 | `docs/intent/database-query-contract/raw/2026-10-11-pro/database-query-contract-research.md:1` | noise | raw research |

Duplicates: srcly #1 `DESIGN.md:1` (loc); recipes-modern #1 `docs/02-images-for-recipes.md:1` (loc); recipes-modern #2 `docs/03-ai-meal-planning.md:1` (loc); recipes-modern #4 `docs/done/04-ai-recipe-gen.md:1` (loc); explorEDA #1 `docs/research/dense-chart-interactions-2026-10-12/pro/source-packet.md:1` (loc); explorEDA #2 `docs/research/data-file-inputs-2026-10-12/pro/source-packet.md:1` (loc).

#### `parameter_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 5 | `server/tests/test_reporting.py:1` | noise | sum over ~30 test functions with fixtures; a function count, not arity |
| srcly | 7 | `server/app/services/compare/snapshots.py:1` | noise | file sum 59 over many 1-3 param functions |
| srcly | 9 | `server/app/services/activity.py:1` | noise | 56 params over 25 functions (≈2.2 each) |
| srcly | 10 | `server/scripts/evaluate_metric_portfolio.py:1` | noise | file sum over small helpers |
| recipes-modern | 5 | `src/app/recipes/[id]/StepListEditMode.tsx:1` | noise | file sum of handler params |
| recipes-modern | 6 | `src/app/recipes/[id]/touch-up/touchup-client.tsx:1` | noise | file sum of handler params |
| recipes-modern | 7 | `src/app/ai/recipe/page.tsx:1` | noise | file sum |
| recipes-modern | 8 | `src/components/ui/menubar.tsx:1` | noise | vendored shadcn primitives, one prop object each |
| explorEDA | 5 | `packages/explorEDA/src/providers/DataLayerProvider.tsx:1` | noise | 183 = many small callbacks in a provider; a function count |
| explorEDA | 7 | `packages/explorEDA/src/lib/analysis/evaluateProject.ts:1` | noise | file sum |
| explorEDA | 8 | `packages/explorEDA/src/lib/notebook/writeBack.ts:1` | noise | file sum |
| explorEDA | 10 | `packages/explorEDA/src/lib/dsl/project.ts:1` | noise | file sum |
| context-recorder | 2 | `Sources/ContextRecorder/Library/AnnotationLayer.swift:1` | noise | file sum over drawing helpers |
| context-recorder | 3 | `Sources/ContextRecorder/Library/ImageCanvas.swift:1` | noise | file sum |
| context-recorder | 4 | `scripts/ui-test/cua.js:1` | noise | file sum |
| context-recorder | 5 | `Sources/CanvasKit/CanvasDocument.swift:1` | noise | file sum |
| context-recorder | 7 | `Sources/Annotation/Geometry.swift:1` | noise | geometry helpers (x, y, w, h each) |
| context-recorder | 9 | `Sources/CanvasTool/Fixtures.swift:1` | noise | file sum |
| context-recorder | 10 | `Sources/ContextRecorder/Library/SessionTimeline.swift:1` | noise | file sum |

Duplicates: srcly #1 `client/src/viz/deps/layout.ts:1` (complexity); srcly #2 `server/app/services/reporting.py:1` (loc); srcly #3 `server/app/services/analysis.py:1` (loc); srcly #4 `client/src/viz/deps/DependencyCanvas.tsx:1` (loc); srcly #6 `client/src/viz/treemap/hooks/useTreemapTooltip.ts:1` (complexity); srcly #8 `client/src/viz/deps/viewModel.ts:1` (complexity); recipes-modern #1 `src/server/api/routers/recipe.ts:1` (loc); recipes-modern #2 `src/components/ui/sidebar.tsx:1` (loc); recipes-modern #3 `src/app/recipes/[id]/IngredientListEditMode.tsx:1` (loc); recipes-modern #4 `src/app/plan/PlanPageClient.tsx:1` (complexity); recipes-modern #9 `src/hooks/use-url-state.ts:1` (max_nesting_depth); recipes-modern #10 `src/app/RecipeList.tsx:1` (loc); explorEDA #1 `.claude/skills/impeccable/scripts/live-browser.js:1` (complexity); explorEDA #2 `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` (complexity); explorEDA #3 `packages/explorEDA/src/components/charts/Composition/UnitInspector.tsx:1` (loc); explorEDA #4 `packages/explorEDA/src/lib/dsl/composition.ts:1` (loc); explorEDA #6 `packages/explorEDA/src/lib/dsl/compile.ts:1` (complexity); explorEDA #9 `packages/explorEDA/src/components/charts/Composition/resolveComposition.ts:1` (max_nesting_depth); context-recorder #1 `scripts/process_session.py:1` (complexity); context-recorder #6 `Sources/ContextRecorder/Library/Edits.swift:1` (complexity); context-recorder #8 `extension/page.js:1` (complexity).

#### `ts_any_usage_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `client/src/utils/structureTree.ts:1` | useful | 31 explicit anys typing the analysis tree; one Node type removes them |
| srcly | 2 | `client/src/utils/dataProcessing.ts:1` | useful | 22 anys in tree processing (same Node type fix) |
| srcly | 4 | `client/src/components/CodeModal/StickyBreadcrumb.tsx:1` | useful | 14 anys in breadcrumb node handling |
| srcly | 9 | `client/src/viz/treemap/hooks/useTreemapTooltip.test.ts:1` | noise | test doubles typed as any |
| recipes-modern | 2 | `src/app/kroger/model.ts:1` | noise | 1 any |
| recipes-modern | 3 | `src/trpc/helpers.ts:1` | noise | 1 any (also an eslint finding) |
| explorEDA | 1 | `packages/explorEDA/src/test/providers/fieldSettingsProvider.test.tsx:1` | noise | 4 anys in a test |
| explorEDA | 2 | `apps/data-samples/sample_data.ts:1` | noise | 1 any in sample data |
| explorEDA | 3 | `packages/explorEDA/src/server/team/accountRoutes.test.ts:1` | noise | test |
| explorEDA | 4 | `packages/explorEDA/src/server/team/fileIntake.test.ts:1` | noise | test |

Duplicates: srcly #3 `client/src/viz/treemap/hooks/useTreemapTooltip.ts:1` (complexity); srcly #5 `client/src/markdown/remarkHighlightSelection.ts:1` (average_function_length); srcly #6 `client/src/App.tsx:1` (loc); srcly #7 `client/src/components/CodeModal/OutlinePopover.tsx:1` (component_effect_count); srcly #8 `client/src/components/Explorer.tsx:1` (loc); srcly #10 `client/src/components/Treemap.tsx:1` (component_hook_count); recipes-modern #1 `src/server/ai/aiRecipe.ts:1` (complexity).

#### `ts_ignore_count`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| explorEDA | 1 | `apps/demo/src/demos/coverage.test.ts:1` | noise | deliberate @ts-expect-error in a negative type test |
| explorEDA | 2 | `apps/demo/src/docs/gate.test.ts:1` | noise | deliberate @ts-expect-error in a negative type test |

#### `preset:activity:high_both`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `client/src/viz/deps/viewModel.ts:1` | useful | complex (111 CCN) and changed often (6 commits in 90d): refactor before the next change |
| srcly | 2 | `client/src/viz/deps/layout.ts:1` | useful | complex (62 CCN) and changed often (9 commits in 90d): refactor before the next change |
| srcly | 3 | `server/app/services/typescript/typescript_analysis.py:1` | useful | complex (66 CCN) and changed often (6 commits in 90d): refactor before the next change |
| srcly | 4 | `client/src/viz/treemap/components/TreemapCanvas.tsx:1` | useful | complex (54 CCN) and changed often (8 commits in 90d): refactor before the next change |
| srcly | 5 | `client/src/viz/treemap/hooks/useTreemapTooltip.ts:1` | useful | complex (41 CCN) and changed often (9 commits in 90d): refactor before the next change |
| srcly | 6 | `client/src/App.tsx:1` | useful | complex (20 CCN) and changed often (12 commits in 90d): refactor before the next change |
| srcly | 7 | `client/src/viz/deps/DependencyCanvas.tsx:1` | useful | complex (22 CCN) and changed often (11 commits in 90d): refactor before the next change |
| srcly | 8 | `server/app/services/analysis.py:1` | useful | complex (16 CCN) and changed often (14 commits in 90d): refactor before the next change |
| srcly | 9 | `client/src/components/Explorer.tsx:1` | useful | complex (19 CCN) and changed often (10 commits in 90d): refactor before the next change |
| srcly | 10 | `client/src/components/CodeModal/CodeModal.tsx:1` | useful | complex (15 CCN) and changed often (10 commits in 90d): refactor before the next change |
| explorEDA | 1 | `packages/explorEDA/src/utils/saveDataUtils.ts:1` | useful | complex (262 CCN) and changed often (62 commits in 90d): refactor before the next change |
| explorEDA | 2 | `packages/explorEDA/src/components/charts/Composition/validateComposition.ts:1` | useful | complex (255 CCN) and changed often (39 commits in 90d): refactor before the next change |
| explorEDA | 3 | `packages/explorEDA/src/components/PlotChartPanel.tsx:1` | useful | complex (74 CCN) and changed often (66 commits in 90d): refactor before the next change |
| explorEDA | 4 | `packages/explorEDA/src/lib/dsl/compile.ts:1` | useful | complex (155 CCN) and changed often (24 commits in 90d): refactor before the next change |
| explorEDA | 5 | `apps/demo/src/demos/coverage.ts:1` | noise | append-only demo coverage list; its 75 commits are additions, not rework |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` | useful | complex (81 CCN) and changed often (39 commits in 90d): refactor before the next change |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/Composition/CompositionTraceBody.tsx:1` | useful | complex (100 CCN) and changed often (14 commits in 90d): refactor before the next change |
| explorEDA | 8 | `apps/demo/src/LandingPage.tsx:1` | useful | complex (39 CCN) and changed often (41 commits in 90d): refactor before the next change |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/ScatterPlot/ScatterPlot.tsx:1` | useful | complex (58 CCN) and changed often (30 commits in 90d): refactor before the next change |
| explorEDA | 10 | `packages/explorEDA/src/components/PlotManager.tsx:1` | useful | complex (42 CCN) and changed often (37 commits in 90d): refactor before the next change |
| context-recorder | 1 | `Sources/ContextRecorder/main.swift:1` | useful | complex (10 CCN) and changed often (30 commits in 90d): refactor before the next change |
| context-recorder | 2 | `Sources/ContextRecorder/Library/LibraryWindow.swift:1` | useful | complex (19 CCN) and changed often (16 commits in 90d): refactor before the next change |
| context-recorder | 3 | `scripts/process_session.py:1` | useful | complex (19 CCN) and changed often (13 commits in 90d): refactor before the next change |
| context-recorder | 4 | `Sources/ContextRecorder/Library/LibraryView.swift:1` | useful | complex (13 CCN) and changed often (13 commits in 90d): refactor before the next change |
| context-recorder | 5 | `extension/page.js:1` | useful | complex (24 CCN) and changed often (6 commits in 90d): refactor before the next change |
| context-recorder | 6 | `scripts/ui-test/harness.py:1` | noise | 21 CCN is a straight guard sequence (harness.py l.96-100); 5 commits are new checks |
| context-recorder | 7 | `Sources/ContextRecorder/Library/Edits.swift:1` | noise | witness is a fixture runner (l.252); test code |
| context-recorder | 8 | `extension/background.js:1` | noise | 11 CCN message router; at the cut-off on both axes |

#### `preset:blast_radius:high_both`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 5 | `server/app/services/compare/git_refs.py:1` | useful | comple15 (x CCN) and imported b15 y files: change only with tests |
| srcly | 6 | `server/app/services/scan_workers.py:1` | useful | comple24 (x CCN) and imported b10 y files: change only with tests |
| srcly | 7 | `server/app/services/deps/graph.py:1` | useful | comple24 (x CCN) and imported b7 y files: change only with tests |
| srcly | 8 | `client/src/utils/dataProcessing.ts:1` | useful | comple16 (x CCN) and imported b10 y files: change only with tests |
| srcly | 10 | `server/app/services/python/python_analysis.py:1` | useful | comple23 (x CCN) and imported b6 y files: change only with tests |
| explorEDA | 1 | `packages/explorEDA/src/providers/DataLayerProvider.tsx:1` | useful | comple22 (x CCN) and imported b204 y files: change only with tests |
| explorEDA | 5 | `packages/explorEDA/src/lib/valueParsing.ts:1` | useful | comple15 (x CCN) and imported b77 y files: change only with tests |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/Composition/compositionTypes.ts:1` | useful | comple19 (x CCN) and imported b53 y files: change only with tests |
| explorEDA | 8 | `packages/explorEDA/src/components/charts/Composition/resolveComposition.ts:1` | useful | comple47 (x CCN) and imported b39 y files: change only with tests |
| explorEDA | 9 | `packages/explorEDA/src/hooks/applyFilter.ts:1` | useful | comple19 (x CCN) and imported b47 y files: change only with tests |
| explorEDA | 10 | `packages/explorEDA/src/lib/fieldSettings.ts:1` | useful | comple35 (x CCN) and imported b39 y files: change only with tests |

Duplicates: srcly #1 `client/src/viz/deps/viewModel.ts:1` (earlier preset); srcly #2 `server/app/services/typescript/typescript_analysis.py:1` (earlier preset); srcly #3 `client/src/viz/deps/layout.ts:1` (earlier preset); srcly #4 `server/app/services/analysis.py:1` (earlier preset); srcly #9 `client/src/components/Explorer.tsx:1` (earlier preset); explorEDA #2 `packages/explorEDA/src/components/charts/Composition/validateComposition.ts:1` (earlier preset); explorEDA #3 `packages/explorEDA/src/utils/saveDataUtils.ts:1` (earlier preset); explorEDA #4 `packages/explorEDA/src/lib/dsl/compile.ts:1` (earlier preset); explorEDA #6 `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` (earlier preset).

#### `preset:comment_noise:high_x`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 1 | `server/tests/fixtures/comment_noise/commented_out.ts:1` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| srcly | 2 | `server/tests/fixtures/comment_noise/narrated.ts:1` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| srcly | 3 | `client/src/compare/stepper.ts:1` | noise | ratio 0.421, CCN 3: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| srcly | 4 | `client/src/viz/deps/encoding.ts:1` | noise | ratio 0.429, CCN 2: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| srcly | 5 | `client/src/viz/deps/hubs.ts:1` | noise | ratio 0.292, CCN 8: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| srcly | 6 | `server/tests/fixtures/comment_noise/narrated.py:1` | excluded | srcly test fixture written to trip the metric; excluded from rates |
| srcly | 7 | `client/src/test/setup.ts:1` | noise | ratio 0.4, CCN 0: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| srcly | 8 | `client/src/components/ui/HeatSwatch.tsx:1` | noise | ratio 0.357, CCN 2: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| srcly | 9 | `client/src/viz/treemap/utils/colors.ts:1` | noise | ratio 0.311, CCN 5: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| srcly | 10 | `client/src/navigation/location.ts:1` | noise | ratio 0.257, CCN 8: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| recipes-modern | 1 | `src/server/api/trpc.ts:1` | noise | ratio 0.602, CCN 3: scaffold docs |
| recipes-modern | 2 | `src/server/api/root.ts:1` | noise | ratio 0.361, CCN 0: scaffold docs |
| recipes-modern | 3 | `src/server/auth.ts:1` | noise | ratio 0.275, CCN 5: scaffold docs |
| recipes-modern | 4 | `src/trpc/react.tsx:1` | noise | ratio 0.227, CCN 4: scaffold docs |
| recipes-modern | 5 | `src/trpc/server.ts:1` | noise | ratio 0.235, CCN 1: scaffold docs |
| recipes-modern | 6 | `src/app/api/auth/[...nextauth]/route.ts:1` | noise | ratio 0.2, CCN 0: scaffold docs |
| explorEDA | 1 | `apps/demo/src/vite-env.d.ts:1` | noise | ratio 1, CCN 0: vite triple-slash directive counted as a comment |
| explorEDA | 2 | `packages/explorEDA/src/vite-env.d.ts:1` | noise | ratio 1, CCN 0: vite triple-slash directive counted as a comment |
| explorEDA | 3 | `packages/explorEDA/src/components/GridChartPanel.tsx:1` | noise | ratio 0.462, CCN 5: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| explorEDA | 4 | `packages/explorEDA/src/components/charts/Waterfall/waterfallTypes.ts:1` | noise | ratio 0.435, CCN 6: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| explorEDA | 5 | `packages/explorEDA/src/components/chartDetailsStore.ts:1` | noise | ratio 0.48, CCN 1: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/DataTable/columnWidths.ts:1` | noise | ratio 0.455, CCN 2: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/emptyPlotClick.ts:1` | noise | ratio 0.417, CCN 3: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| explorEDA | 8 | `packages/explorEDA/src/cli/examples.ts:1` | noise | ratio 0.444, CCN 0: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/panelBody.ts:1` | noise | ratio 0.324, CCN 7: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |
| explorEDA | 10 | `packages/explorEDA/src/components/charts/FacetRelated/facetBarSlot.tsx:1` | noise | ratio 0.375, CCN 2: documented module or helper; the comments explain intent (e.g. hubs.ts l.1-6, GridChartPanel.tsx l.7-11) |

#### `preset:component_weight:high_both`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| srcly | 5 | `client/src/components/Treemap.tsx:54` | useful | 261-line component with 18 hooks/primitives: split state from markup |
| srcly | 6 | `client/src/compare/CompareApp.tsx:58` | useful | 341-line component with 15 hooks/primitives: split state from markup |
| srcly | 7 | `client/src/compare/CompareTable.tsx:116` | useful | 330-line component with 14 hooks/primitives: split state from markup |
| srcly | 8 | `client/src/compare/ComparePicker.tsx:75` | useful | 263-line component with 13 hooks/primitives: split state from markup |
| srcly | 9 | `client/src/viz/scatter/ScatterView.tsx:49` | useful | 189-line component with 14 hooks/primitives: split state from markup |
| srcly | 10 | `client/src/viz/scatter/ScatterPlot.tsx:35` | useful | 324-line component with 9 hooks/primitives: split state from markup |
| recipes-modern | 1 | `src/app/RecipeList.tsx:53` | useful | 352-line component with 18 hooks/primitives: split state from markup |
| recipes-modern | 2 | `src/app/plan/PlanPageClient.tsx:227` | useful | 426-line component with 15 hooks/primitives: split state from markup |
| recipes-modern | 3 | `src/app/ingredients/IngredientsClient.tsx:56` | useful | 357-line component with 14 hooks/primitives: split state from markup |
| recipes-modern | 4 | `src/app/recipes/[id]/IngredientListEditMode.tsx:17` | useful | 469-line component with 5 hooks/primitives: split state from markup |
| recipes-modern | 5 | `src/app/recipes/[id]/RecipeClient.tsx:18` | useful | 231-line component with 12 hooks/primitives: split state from markup |
| recipes-modern | 6 | `src/app/list/KrogerSearchPopup.tsx:32` | useful | 226-line component with 12 hooks/primitives: split state from markup |
| recipes-modern | 7 | `src/app/list/ShoppingList.tsx:21` | useful | 247-line component with 10 hooks/primitives: split state from markup |
| recipes-modern | 8 | `src/app/recipes/[id]/touch-up/touchup-client.tsx:64` | useful | 245-line component with 8 hooks/primitives: split state from markup |
| recipes-modern | 9 | `src/app/ai/recipe/page.tsx:12` | useful | 288-line component with 6 hooks/primitives: split state from markup |
| recipes-modern | 10 | `src/app/recipes/[id]/RecipeEditDialog.tsx:24` | useful | 167-line component with 10 hooks/primitives: split state from markup |
| explorEDA | 3 | `apps/demo/src/SavedViewsWorkspace.tsx:300` | useful | 1066-line component with 34 hooks/primitives: split state from markup |
| explorEDA | 4 | `packages/explorEDA/src/components/charts/ScatterMatrix/ScatterMatrix.tsx:98` | useful | 717-line component with 35 hooks/primitives: split state from markup |
| explorEDA | 5 | `packages/explorEDA/src/components/charts/ParallelCoordinates/ParallelCoordinates.tsx:122` | useful | 864-line component with 29 hooks/primitives: split state from markup |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/Hierarchy/HierarchyChart.tsx:177` | useful | 675-line component with 32 hooks/primitives: split state from markup |
| explorEDA | 7 | `packages/explorEDA/src/components/charts/BoxPlot/BoxPlot.tsx:60` | useful | 703-line component with 30 hooks/primitives: split state from markup |
| explorEDA | 9 | `packages/explorEDA/src/components/charts/RowChart/RowChart.tsx:62` | useful | 731-line component with 25 hooks/primitives: split state from markup |
| explorEDA | 10 | `packages/explorEDA/src/components/charts/ThreeDScatter/ThreeDScatterChart.tsx:74` | useful | 490-line component with 32 hooks/primitives: split state from markup |

Duplicates: srcly #1 `client/src/viz/deps/DependencyCanvas.tsx:147` (earlier preset); srcly #2 `client/src/components/Explorer.tsx:132` (earlier preset); srcly #3 `client/src/App.tsx:159` (earlier preset); srcly #4 `client/src/components/CodeModal/CodeModal.tsx:43` (earlier preset); explorEDA #1 `packages/explorEDA/src/components/PlotManager.tsx:130` (earlier preset); explorEDA #2 `packages/explorEDA/src/components/PlotChartPanel.tsx:421` (earlier preset); explorEDA #8 `packages/explorEDA/src/components/charts/ScatterPlot/ScatterPlot.tsx:76` (earlier preset).

#### `preset:findings:high_both`

| Repo | # | Location | Verdict | Evidence |
| --- | ---: | --- | --- | --- |
| recipes-modern | 1 | `src/server/ai/aiRecipe.ts:1` | useful | 30 eslint findings: no-explicit-any/no-unsafe-member-access around parseAndValidate (l.156-158) |
| explorEDA | 1 | `packages/explorEDA/src/components/charts/Composition/resolveUnit.ts:1` | noise | 193 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 2 | `packages/explorEDA/src/components/charts/Composition/validateComposition.ts:1` | noise | 25 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 3 | `packages/explorEDA/src/lib/analysis/projectFile.ts:1` | noise | 72 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 4 | `packages/explorEDA/src/utils/saveDataUtils.ts:1` | noise | 4 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 5 | `packages/explorEDA/src/lib/annotations/resolve.ts:1` | noise | 54 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 6 | `packages/explorEDA/src/components/charts/Composition/resolveComposition.ts:1` | noise | 47 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 7 | `packages/explorEDA/src/lib/analysis/evaluateProject.ts:1` | noise | 46 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 8 | `packages/explorEDA/src/components/PlotChartPanel.tsx:1` | noise | 29 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 9 | `packages/explorEDA/src/lib/dsl/compile.ts:1` | noise | 3 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
| explorEDA | 10 | `packages/explorEDA/src/components/charts/Map/PointMap.tsx:1` | noise | 37 findings, all or nearly all eslint `curly` (style); the quadrant's 'fix the findings first' doesn't hold |
