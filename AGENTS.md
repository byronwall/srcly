# Agents

## Pull requests and releases

- Use a Conventional Commit title for each PR. CI checks the title.
- Use `fix: ...` for fixes and `feat: ...` for new features.
- Use `perf: ...`, `deps: ...`, or `revert: ...` for those changes.
- Use `docs: ...`, `refactor: ...`, `test: ...`, `build: ...`, `ci: ...`, `chore: ...`, or `style: ...` for maintenance.
- Add `!` before the colon for breaking changes, such as `feat!: remove an API`.
- An optional scope is valid, such as `fix(scan): stop cancelled scans`.
- Squash merge PRs. Keep the PR title as the squash commit title.
- Wait for the `PR title` and `build` checks before merging.
- Do not bump versions, add change fragments, or push release tags for normal changes.
- Release Please opens and updates the release PR after changes merge into `main`.
- Review and squash merge that PR when a release is wanted. Do not merge it without user approval.
- The release PR updates `CHANGELOG.md`, `.release-please-manifest.json`, `server/pyproject.toml`, and `server/uv.lock`.
- Client and server changes share one release. Only `srcly` is published; the client stays private.
- Release Please creates the `v<version>` tag and GitHub release. The Release action publishes to PyPI.
- Check the Release action and PyPI before reporting a release as complete.
- For workflow setup, token renewal, and failed releases, use `docs/releases.md`.

## Finding code

Start with `docs/CODE_MAP.md`: a feature → file index for the backend, API, and client. When you add, move, or remove a feature's main files, update the matching row in the same change.

## Client Package Management

Use `pnpm` for all package management operations.

- Install: `pnpm install`
- Add: `pnpm add <package>`
- Run: `pnpm run <script>`
- Direct run: `pnpm dlx ...`

When adding deps, always call `pnpm add` instead of modifying package.json directly.

## Python Guide

Use `uv` for all Python operations
Create proper tests for new functionality, using `pytest` instaed of ad hoc scripts.
To run tests, `cd server && uv run pytest`.

### Add / extend a metric (agent rule)

> When adding a new metric that should flow end-to-end (backend → API → frontend hotspots/treemap), follow this process:
>
> **1. Backend analysis layer**
>
> - **If the metric is language-generic (from lizard)**: Prefer extending `lizard` usage where possible; otherwise:
>   - Add any per-function/file fields to the `FunctionMetrics` / `FileMetrics` dataclasses in `server/app/services/tree_sitter_analysis.py`.
>   - Implement helper(s) on `TreeSitterAnalyzer` (e.g. `_count_...`) to compute the metric from the tree-sitter AST.
>   - Populate the new fields in `TreeSitterAnalyzer.analyze_file` and, if relevant, in `_calculate_function_metrics`.
>   - Next to each increment, call `self._mark("<metric_id>", node, note)` so the code viewer can mark the lines behind the count (`server/app/services/markers.py`). Keep the marker count equal to the metric; `tests/test_markers.py` checks this.
> - **If the metric is TS/TSX-specific**: Gate it to TS/TSX in `analyze_single_file` / `TreeSitterAnalyzer` and avoid assuming the fields exist on plain lizard `FileInformation` objects.
>
> **2. Wire into API models and node construction**
>
> - Extend the `Metrics` Pydantic model in `server/app/models.py` with the new field as `int | None = None` (or `float | None`). `None` is N/A: the metric doesn't apply, the file was skipped or failed, or a mean has nothing to average. Never report N/A as 0; a measured zero stays 0.
> - In `server/app/services/analysis_types.py`, add the metric id to `MEASURED_FILE_METRICS` (and `MEASURED_SCOPE_METRICS` if measured per scope) for each language whose analyzer computes it. `attach_file_metrics` and `convert_function` copy exactly those fields (same name on `file_info` / the scope object) and leave the rest `None` with an `na_reason`.
> - Function counts, means and the max-complexity witness use executable scopes only (`iter_executable_scopes`, `scope_kind`); classes, types, object literals and JSX containers are display scopes.
> - A max-type metric whose file value comes from one scope (complexity, `component_*`) names that scope: `complexity_witness`, or an entry in `Metrics.witnesses` (set in `attach_file_metrics`, carried up in `aggregate_metrics`). Add the id to `WITNESSED_METRICS` in `client/src/utils/metricsStore.tsx` so the explorer, Hot Spots, tooltip and code viewer show and open it.
> - In `aggregate_metrics`, folders sum by default and skip N/A children. Add the id to `_MAX_ROLLUP` or `_MEAN_ROLLUP` when a sum is wrong.
>
> **3. Frontend typing and hotspot plumbing**
>
> - In `client/src/utils/metricsStore.tsx`:
>   - Add the metric id to `HotSpotMetricId` (use the exact field name from `Metrics`).
>   - Add a corresponding entry to `HOTSPOT_METRICS` with a label, a `shortLabel` (≤5 characters; the Explorer column header), its language `group` (drives the grouped metric picker). Every metric is "higher is worse"; there is no inverted direction. A count that describes code without saying it needs work (TODOs, exports, imports) goes in the `Detail` group with `neutral: true`, and as `direction="neutral"` in `reporting.METRIC_DEFINITIONS` with no `PROFILE_WEIGHTS` entry: it is shown and colorable, never ranked. Thresholds for new risk signals are absolute (e.g. comment noise), not relative to the repo. Set `scope: "file"` when `convert_function` doesn't copy it onto scope nodes, and `languages` when it applies to fewer languages than its group (e.g. `["tsx"]`); the code viewer's metrics table uses these to hide rows that don't apply. Metric values render in neutral text; don't add per-metric colors.
> - In `client/src/components/Explorer.tsx`:
>   - Extend the `metrics` shape on the `Node` interface with the optional field as `MetricValue` (`number | null`). Explorer cells, Hot Spots, the tooltip and the treemap already render `null` as N/A and rank it out.
>   - Columns and sorting come from `HOTSPOT_METRICS` via `client/src/utils/explorerColumns.ts`: every metric is offered in the column picker, and the treemap's color metric is always shown as the last, heat-tinted column. No per-metric wiring is needed.
> - In `client/src/components/Treemap.tsx`:
>   - Because color mapping is driven by `primaryMetric` + `HOTSPOT_METRICS`, most metrics will “just work”.
>   - If the metric needs special coloring behavior (like `comment_noise`, `component_loc`, `max_nesting_depth`), add its `[fine, midpoint, attention]` stops to `METRIC_DOMAINS` in `viz/treemap/utils/colors.ts`, so it shares `TREEMAP_RAMP` (and the legend) with every other metric.
>
> **4. UX / validation**
>
> - Confirm the metric appears in:
>   - The **Hot Spots** metric selector and contributes to the hotspot scores.
>   - The treemap **Color** selector and legend.
>   - The node tooltip or table views if it’s important for quick inspection.
> - Avoid `// @ts-ignore` / `// @ts-expect-error`; instead, update types so the pipeline is type-safe from API response through to the UI.
