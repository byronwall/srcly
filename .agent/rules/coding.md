---
trigger: always_on
---

# Agents

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
> - **If the metric is TS/TSX-specific**: Gate it to TS/TSX in `analyze_single_file` / `TreeSitterAnalyzer` and avoid assuming the fields exist on plain lizard `FileInformation` objects.
>
> **2. Wire into API models and node construction**
>
> - Extend the `Metrics` Pydantic model in `server/app/models.py` with the new field(s), using clear, consistent names (e.g. `ts_any_usage_count`, `ts_export_count`).
> - In `server/app/services/analysis.py`:
>   - In `attach_file_metrics`, copy the new file-level values from `file_info` into `node.metrics`, guarding with `hasattr(...)` if the field is TS-only.
>   - In the `convert_function` helper inside `attach_file_metrics`, copy any per-function values from the `func` object into `func_node.metrics` via `getattr(func, "field_name", 0)`.
>   - In `aggregate_metrics`, update the folder-level rollup:
>     - Initialize running totals/maxes for the new metric(s).
>     - Accumulate from `child_metrics` in the main loop.
>     - Assign the aggregated value(s) back to `node.metrics` for `node.type == "folder"`.
>
> **3. Frontend typing and hotspot plumbing**
>
> - In `client/src/utils/metricsStore.tsx`:
>   - Add the metric id to `HotSpotMetricId` (use the exact field name from `Metrics`).
>   - Add a corresponding entry to `HOTSPOT_METRICS` with a short label, stable color class, and `invert` if “lower is better”.
> - In `client/src/components/Explorer.tsx`:
>   - Extend the `metrics` shape on the `Node` interface with the optional field.
>   - Add the metric to the `SortField` union and wire an accessor into `SORT_FIELD_ACCESSORS` so it can be used for sorting.
>   - Only add a new visible column if there’s a strong UX case; reuse the hotspot area for most TS/TSX-specific metrics.
> - In `client/src/components/Treemap.tsx`:
>   - Because color mapping is driven by `primaryMetric` + `HOTSPOT_METRICS`, most metrics will “just work”.
>   - If the metric needs special coloring behavior (like `comment_density`, `todo_count`, `max_nesting_depth`), add a dedicated branch in the color selection logic for rectangles and labels.
>
> **4. UX / validation**
>
> - Confirm the metric appears in:
>   - The **Hot Spots** metric selector and contributes to the hotspot scores.
>   - The treemap **Color** selector and legend.
>   - The node tooltip or table views if it’s important for quick inspection.
> - Avoid `// @ts-ignore` / `// @ts-expect-error`; instead, update types so the pipeline is type-safe from API response through to the UI.
