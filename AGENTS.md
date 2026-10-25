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

## Engine

`engine/` is the data-flow engine: tsx-data-flow's analysis behind a stdio protocol, a standalone pnpm package with its own lockfile. Provenance is in `engine/UPSTREAM.md`; the plan is `docs/intent/tsx-dataflow-integration/detailed-plan.md`.

- Install and check: `cd engine && pnpm install && pnpm test && pnpm typecheck && pnpm lint`.
- Run it from the server in a checkout with `SRCLY_ENGINE_DEV=1` (`dev.sh` sets it). The server runs `engine/bin/srcly-engine.ts` through the engine's own `tsx`, ahead of any bundle.
- The wheel ships a bundle: `build-srcly.sh` runs `cd engine && pnpm bundle` (`engine/scripts/bundle.mjs`), which writes `server/app/engine/` (git-ignored, packaged through hatch `artifacts`). A path that climbs out of `src/` in a checkout must check `IS_BUNDLE` (`engine/src/srcly/bundle.ts`), because the bundle is one flat folder. Users still need Node 18+ on PATH (or `SRCLY_NODE`). Without Node or an engine, every data-flow endpoint answers `not-analyzed` with a reason; the scan never depends on it.
- Python owns the child (`server/app/services/dataflow/engine.py`): one lazy process per scan root, at most two alive, closed after 15 idle minutes. `SRCLY_DATAFLOW_TIMEOUT` overrides every request timeout.
- To add an op: a Zod contract in `engine/src/srcly/contracts/` (and its `registry.ts` entry) → the op in `engine/src/srcly/ops/` and its worker branch → `cd engine && pnpm emit-contracts` → a Pydantic mirror in `server/app/services/dataflow/models.py` (`tests/test_dataflow_models.py` checks its fields against the schema) → a route in `server/app/routers/dataflow.py` → the client call. The emitted `server/app/services/dataflow/contracts/*.schema.json` and `client/src/dataflow/contract.generated.ts` are never edited by hand; `engine/test/srcly/contracts-current.test.ts` fails when they drift.
- Every result carries `generation` and `programHash`. A query with an older `expectedGeneration` is `stale`, a named outcome; never mix generations.
- Not analyzed is never 0: show the outcome or reason by name.
- Python roots: `engine/python/srcly_pyfacts.py` (stdlib `ast` + mypy, run with srcly's own interpreter) emits facts in the collector's raw shape; roles and boundaries come from the element kind, so new Python recognition goes in the helper's tables, never in `engine/src/analysis`. Its tests need an interpreter with mypy (`SRCLY_PYTHON`, else `server/.venv` after `cd server && uv sync`). Decision: `docs/intent/python-dataflow/decision.md`.
- Coverage survey: `engine/scripts/survey-blockers.ts` traces about 120 exports of one repo both ways and writes every outcome and stop as JSON; `engine/scripts/survey-report.ts <dir>` ranks the stops by how many traces each cuts short. Run one repo per process, one at a time, under `node --max-old-space-size=4096`: a big repo's Program takes 2–3 GB.
- Never edit `engine/src/analysis` to recognise srcly-specific code. The only planned analysis edits are M5's four invocation-identity changes, each with a negative fixture.

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
>   - Add any per-function/file fields to the `FunctionMetrics` / `FileMetrics` dataclasses in `server/app/services/analysis_types.py`.
>   - Implement helper(s) on `TreeSitterAnalyzer` in `server/app/services/typescript/typescript_analysis.py` (e.g. `_count_...`) to compute the metric from the tree-sitter AST.
>   - Populate the new fields in `TreeSitterAnalyzer.analyze_file` and, if relevant, in `_calculate_function_metrics`.
>   - Next to each increment, call `self._mark("<metric_id>", node, note)` so the code viewer can mark the lines behind the count (`server/app/services/markers.py`). Keep the marker count equal to the metric; `tests/test_markers.py` checks this.
> - **If the metric is TS/TSX-specific**: Gate it to TS/TSX in `analyze_single_file` / `TreeSitterAnalyzer` and avoid assuming the fields exist on plain lizard `FileInformation` objects.
>
> **2. Wire into API models and node construction**
>
> - Extend the `Metrics` Pydantic model in `server/app/models.py` with the new field as `int | None = None` (or `float | None`). `None` is N/A: the metric doesn't apply, the file was skipped or failed, or a mean has nothing to average. Never report N/A as 0; a measured zero stays 0.
> - In `server/app/services/analysis_types.py`, add the metric id to `MEASURED_FILE_METRICS` (and `MEASURED_SCOPE_METRICS` if measured per scope) for each language whose analyzer computes it. `attach_file_metrics` and `convert_function` copy exactly those fields (same name on `file_info` / the scope object) and leave the rest `None` with an `na_reason`.
> - Function counts, means and the max-complexity witness use executable scopes only (`iter_executable_scopes`, `scope_kind`); classes, types, object literals and JSX containers are display scopes.
> - A max-type metric whose file value comes from one scope (complexity, `component_*`) names that scope: `complexity_witness`, or an entry in `Metrics.witnesses` (set in `attach_file_metrics`, carried up in `aggregate_metrics`). Set `witness=True` on its catalog entry so the explorer, Hot Spots, tooltip and code viewer show and open it.
> - In `aggregate_metrics`, folders sum by default and skip N/A children. Add the id to `_MAX_ROLLUP` or `_MEAN_ROLLUP` when a sum is wrong.
>
> **3. One catalog entry**
>
> - Add a `MetricSpec` to `METRICS` in `server/app/services/metric_catalog.py`: label, `short_label` (≤5 characters; the explorer column header), unit (plural and singular), `group` (drives the grouped picker), `direction`, `aggregation`, a one-line `description` (the picker's hover text), `color_domain` (`[fine, midpoint, attention]` treemap stops on the shared ramp), and `weights` for any report profile that should use it. Don't repeat languages or scope: they come from the analyzer tables in step 2.
> - `direction` is `higher-worse` for risk; `lower-worse` exists but nothing uses it yet. A count that describes code without saying it needs work (TODOs, exports, imports) is `neutral` in the `Detail` group, with no weights: it is shown and colorable, never ranked. Thresholds for new risk signals are absolute (e.g. comment noise), not relative to the repo. Set `compare="neutral"` for size measures a PR is expected to grow.
> - Nothing else changes. The API serves the catalog (`GET /api/metrics/catalog`); the client loads it before rendering (`client/src/utils/metricsStore.tsx`), so the metric picker, Hot Spots, explorer columns, treemap color and legend, tooltips and the code viewer pick it up. `srcly report --metric`, `srcly hotspots --metric`, the report's profile weights and `metrics.schema.json`, and compare's better/worse table (`compare/diff.COMPARE_METRICS`) all derive from it.
> - Refresh the snapshots the client's tests read: `cd server && SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest tests/test_metric_catalog.py tests/test_ranking_parity.py`. `tests/test_metric_catalog.py` fails until every `Metrics` field has exactly one catalog entry.
>
> **4. UX / validation**
>
> - Confirm the metric appears in the **Color** and **Rank by** pickers (Rank by only when it isn't neutral), ranks Hot Spots with its unit and N/A group, and shows in the tooltip and code viewer for the languages that measure it.
> - Avoid `// @ts-ignore` / `// @ts-expect-error`; instead, update types so the pipeline is type-safe from API response through to the UI.
