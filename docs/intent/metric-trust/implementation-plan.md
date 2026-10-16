# Trustworthy metrics and ranking — implementation plan

## Plan at a glance

Prove one trustworthy scan/report before changing the full catalog. Then correct units and ownership. Finally align ranking and explorer behavior. Each milestone leaves a usable source-only tool. No new external data provider is required.

## Implementation strategy

Use `analysis_types.py` and `models.py` for executable kind and support. Keep availability compact: declared analyzer capabilities plus explicit failed or partial observations. Avoid per-value wrappers unless the first fixture proves they are necessary.

Use `analysis.py` for ownership and aggregation, `reporting.py` for report selection, and `metricsStore.tsx` for labels and eligibility. Share fixture inputs and expected decisions across languages; do not duplicate a full registry generation system.

Fast local loop: `cd server && uv run pytest tests/test_complexity_semantics.py tests/test_synthetic_scopes.py tests/test_reporting.py`. Client checks: `cd client && pnpm test`. Inject unsupported, skipped, failed, and partial states through fixture analyzers. These commands require installed local dependencies but no service or network once prepared.

Rollback uses coherent commits. No deployed service or database target is involved. Browser proof uses a local fixture directory with no private data, API on port 8000 and Vite on 5173.

## Milestone 1: A scan distinguishes executable evidence from unavailable data

Change `analysis_types.py`, analyzer scope conversion in `analysis.py`, and the `Node`/`Metrics` contract. Preserve origin and source range; distinguish executable functions from classes, objects, imports and bodies. Define a deterministic per-snapshot scope key from path, kind, range and sibling ordinal. Do not promise identity across refactors.

Carry supported zero and unavailable states into a report and one explorer detail row. Use a TS fixture, a Python fixture, and a skipped file. Validate nested methods and module logic explicitly. Update `docs/CODE_MAP.md` when main files change.

### Desired end state

- The API, report and explorer distinguish measured zero from N/A.
- Maximum complexity points to an executable source location.
- Focused pytest and one local browser inspection prove the same fixture values.

## Milestone 2: Measures conserve their declared units

Reproduce equal-span child, overlapping imports, nested JSX, blank/comment spans, and two Markdown data URLs on one line. Extend `test_function_body_loc.py` and `test_treemap_scopes.py` only for failures that matter.

Declare one display-area ownership rule in `analysis.py` and `client/src/viz/treemap/utils/tree.ts`. Keep source ranges independent of area. Correct real-function count/mean, own nesting and arity. Publish exact TS/Python/Lizard support. Either add a useful TS rollup or display N/A at that scope. Correct misleading labels and README complexity wording.

### Desired end state

- Rendered leaf areas sum to the declared parent measure on the proof cases.
- Function summaries use the same eligible population as their counts.
- Every current metric has a tested value or explicit unsupported scope.

## Milestone 3: Ranking and selection tell one consistent story

Change `reporting.py:rank_nodes`, CLI metric validation in `run.py`, and `Explorer.tsx`. Specify file/function cohorts, eligibility, direction, max normalization, ties and visible path priority. Default to single-metric ranking. If combinations remain, include supported zero inputs in a fixed declared denominator. Compare only equal availability sets; show incomplete evidence separately.

Use a small shared cohort to prove UI/report order parity and monotonicity with fixed peers. Remove automatic comment/TODO/class/type/import-count penalties. Keep those values searchable in neutral detail. Reproduce current-selection and filter issues before changing `MetricsSidebar.tsx`, `dataProcessing.ts`, and treemap scales. State whether normalization uses the visible cohort; show that choice in the view and report.

### Desired end state

- Increasing a supported risk input cannot lower its score with fixed peers.
- A filtered fixture has matching list, map detail and headless evidence.
- Local browser use verifies selection, N/A, source navigation and unit labels. `pnpm build`, client tests and relevant backend tests pass.

## Below the cut line

- New metric families, general type checking, compatibility layers and registry generators.
- Persistent review states, longitudinal identity, trend services and a visual redesign.
- Automatic metric deletion or default selection based solely on correlation.
