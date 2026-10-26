# Srcly Code Map

A feature → code index. Start here when you need to find "where does X happen?".
Keep it current: when a PR adds, moves, or removes a feature's main files, update the matching row.

Paths are relative to the repo root. `server/` is the Python (FastAPI + tree-sitter) backend, `client/` is the SolidJS SPA.

## Request lifecycle at a glance

```
CLI (server/app/run.py)
  ├─ `srcly [path]`            → uvicorn → app.main:app → serves client build + /api/*
  └─ `srcly scan|report|...`   → services/reporting.py (no server)

Browser
  App.tsx ── GET /api/analysis/context ──► routers/analysis.py:get_analysis_context
          ── POST /api/scans            ──► routers/scans.py → services/scan_jobs.py (thread per job)
          ── GET  /api/scans/{id}/events (SSE progress) ◄── ScanJob snapshots
          ── GET  /api/scans/{id}/result ──► finished tree
                                              └─ services/analysis.py:scan_codebase(observer=ScanJob)
                                                   ├─ discover_files (git ls-files, or walk + .gitignore)
                                                   ├─ per-file analysis in a killable worker pool (scan_workers.py)
                                                   │    └─ analyze_single_file → language analyzer
                                                   ├─ build folder/file/function Node tree
                                                   └─ aggregate_metrics (folder rollups)
          ◄── Node tree (models.py:Node) ── rendered by Explorer + Treemap
```

## Features

### CLI and process lifecycle

| Feature | Where |
| --- | --- |
| CLI entry point, arg parsing, port pick, browser open | `server/app/run.py` (`main`) |
| Headless commands (`scan`, `report`, `hotspots`, `explain`; `report --quadrant <preset>`) | `server/app/run.py` (`_run_headless`) → `server/app/services/reporting.py` |
| FastAPI app, CORS, static SPA mount | `server/app/main.py` |
| Ctrl+C / SIGTERM: cancel running scans, then uvicorn shutdown | `server/app/main.py` (`lifespan`, `_install_scan_cancelling_signal_handlers`); CLI exit code in `server/app/run.py` (`main`) |
| Dev loop (uvicorn reload + Vite) | `dev.sh`; Vite proxies `/api` → `:8000` in `client/vite.config.ts` |
| Release build (client → `server/app/static` → wheel) | `build-srcly.sh`, `publish-srcly.sh` |

### Scanning and analysis (backend)

| Feature | Where |
| --- | --- |
| Scan orchestration (walk, filter, analyze, build tree) | `server/app/services/analysis.py` (`scan_codebase`) |
| File discovery (scan + landing-page estimate): `git ls-files` in repos, walk fallback | `server/app/services/analysis.py` (`discover_files`); estimate in `server/app/routers/analysis.py` (`_estimate_counts`) |
| Ignore rules: built-in dirs/files/extensions, binary + minified skips | `server/app/config.py`; `analysis.py` (`classify_candidate`) |
| Ignore rules: nested `.gitignore` translation (walk fallback only) | `server/app/services/analysis.py` (`_load_gitignore_spec`, `_translate_gitignore_pattern`) |
| Worker pool: reuse, hard per-file timeouts, crash recovery | `server/app/services/scan_workers.py` (`run_file_analyses`), wrapped by `analysis.py` (`_run_file_analyses_with_hard_timeouts`) |
| Failed files (timeout/crash/error) kept with line-count LOC + `analysis_status` | `server/app/services/analysis.py` (`attach_fallback_metrics`); tooltip line in `client/src/viz/treemap/hooks/useTreemapTooltip.ts` |
| Size cap: files over `MAX_ANALYZED_FILE_BYTES` skip dispatch, kept as `too_large` (not counted as failed) | `server/app/config.py`; `analysis.py` (`split_oversized_files`, `attach_fallback_metrics`); tooltip in `useTreemapTooltip.ts` (`notAnalyzedLines`) |
| Scan cancellation (`CancelToken`, `ScanCancelled`, `cancel_all_scans`) | `server/app/services/scan_workers.py` |
| Scan progress hooks (`ScanObserver`) | `server/app/services/scan_progress.py`; called from `analysis.py` |
| Background scan jobs, progress snapshots, dedupe by path | `server/app/services/scan_jobs.py` (`ScanJob`, `ScanJobManager`) |
| Compact tree on the wire (no defaults, derived child paths, gzip); cache, compare and CLI keep the full tree | `server/app/services/scan_jobs.py` (`compact_tree`, `expand_tree`, `ScanJob.result_response`); client inverse `client/src/utils/normalizeTree.ts` (in `fetchScanResult`) |
| Language dispatch by extension | `server/app/services/analysis.py` (`analyze_single_file`) |
| TypeScript / TSX metrics + nested scopes | `server/app/services/typescript/typescript_analysis.py` |
| React/Solid component detection + per-component metrics (hooks, effects, JSX depth, props, inline handlers, JSX conditionals) | `server/app/services/typescript/components.py`; copied onto component scopes in `typescript_analysis.py` (`_attach_components`); file/folder max + `witnesses` in `analysis.py` |
| Comment noise (narrated functions, oversized docblocks, commented-out code; absolute thresholds) | `server/app/services/comment_noise.py`; fed by `typescript_analysis.py` / `python_analysis.py` (`_apply_comment_noise`) |
| Python metrics | `server/app/services/python/python_analysis.py` |
| CSS / SCSS metrics | `server/app/services/css/css_analysis.py` |
| Markdown metrics | `server/app/services/markdown/markdown_analysis.py` |
| Jupyter notebook metrics | `server/app/services/ipynb/ipynb_analysis.py` |
| Everything else lizard has a reader for (Go, PHP, JS, …) | `lizard.analyze_file` fallback in `analyze_single_file` |
| No reader (YAML, MDX, shell, HTML, dotfiles): streaming line count, no lizard | `analysis.py` (`count_lizard_style_nloc`) |
| Analyzer result dataclasses; scope kinds (`scope_kind`, executable vs display scopes); which metrics each language measures (`MEASURED_FILE_METRICS`, `MEASURED_SCOPE_METRICS`) | `server/app/services/analysis_types.py` |
| Folder rollups of metrics (N/A children skipped; complexity and component witnesses carried up) | `server/app/services/analysis.py` (`aggregate_metrics`) |
| Function/scope → Node conversion (`Node.kind`), `(body)` nodes, N/A metrics + `na_reason`, `complexity_witness` | `server/app/services/analysis.py` (`attach_file_metrics`, `language_for_path`, `_most_complex_function`) |
| Analysis cache (user cache dir, fingerprint invalidation) | `server/app/services/cache.py`, used by `server/app/services/scan_jobs.py` |
| Git activity (`commit_count`, `churn_lines`): one `git log --numstat` pass per HEAD + window (30d/90d/1y/all), renames followed, N/A on no repo / shallow / timeout, dirty tree as a note; laid over the served tree so windows never invalidate the AST cache | `server/app/services/activity.py` (`collect`, `apply_to_tree`, `recent_commits`); overlay in `scan_jobs.py` (`result_json_overlaid`), `reporting.py` (`scan_tree`), `compare/service.py` (`build_compare`) |
| Findings (`finding_count`, `error_count`): zero-config lint/type checks. Project `tsc --noEmit` per tsconfig (solution configs expanded) and `eslint` when `node_modules/.bin` has them; bundled `ruff` (project config or "srcly defaults"); srcly's tree-sitter TS rules for TS files no project tool covers. Each tool is its own job with a timeout (process group killed); missing/failed/timed-out → N/A with the reason. Runs beside the scan, cached by fingerprint + tool signatures, laid over the served tree | `server/app/services/findings/` (`runner.py` plan/run/cache, `typescript.py`, `ruff.py`, `builtin_ts.py`, `overlay.py`, `jobs.py`); started in `scan_jobs.py` (`start_findings`); report in `reporting.py` (`scan_tree`, `_checks_line`); compare uses portable tools only (`compare/snapshots.py:_with_checks`) |

### API surface

| Endpoint | Handler | Notes |
| --- | --- | --- |
| `POST /api/scans` | `routers/scans.py:start_scan` | Start (or join) a background scan; returns a progress snapshot |
| `GET /api/scans/{id}/events` | `routers/scans.py:stream_scan` | SSE stream of snapshots, ending with `complete` / `failed` / `cancelled` |
| `GET /api/scans/{id}` | `routers/scans.py:get_scan` | Snapshot (polling fallback) |
| `GET /api/scans/{id}/result` | `routers/scans.py:get_scan_result` | Node tree once complete (409 before); `?activity_window=` (`30d`, `90d`, `1y`, `all`) lays Git activity over it |
| `GET /api/scans/{id}/findings` | `routers/scans.py:get_scan_findings` | Lint/type-check status (`FindingsInfo`); the client polls while `running`, then refetches the result |
| `DELETE /api/scans/{id}` | `routers/scans.py:cancel_scan` | Cancel a scan |
| `GET /api/analysis` | `routers/analysis.py:get_analysis` | Blocking one-shot scan (kept for API users; the UI uses `/api/scans`) |
| `POST /api/analysis/refresh` | `routers/analysis.py:refresh_analysis` | Re-scan cwd root |
| `GET /api/analysis/context` | `routers/analysis.py:get_analysis_context` | Cwd + repo root with rough file counts (first-run screen) |
| `GET /api/analysis/fan-in?path=` | `routers/analysis.py:get_fan_in` → `services/quadrants.py:fan_in_by_path` | Distinct importing files per file (Blast radius 2x2) |
| `GET /api/analysis/dependency-graph?path=` | `routers/analysis.py:get_dependency_graph` → `services/deps/graph.py` | Hierarchical import graph (folders → files → symbols), tsconfig `paths` aliases, barrels passed through |
| `GET /api/dataflow/status?path=` | `routers/dataflow.py:get_status` | Whether data flow can run (`available`, `state`, N/A `reason`), engine progress, generation, RSS. Never starts the engine |
| `POST /api/dataflow/start` | `routers/dataflow.py:start` | Start the engine and build tier 1 in the background; poll `status` |
| `GET /api/dataflow/routes?path=&expectedGeneration=` | `routers/dataflow.py:get_routes` | Routes the engine discovered; `outcome` names `not-analyzed` / `stale` instead of failing |
| `GET /api/dataflow/route-graph?path=&route=&expectedGeneration=` | `routers/dataflow.py:get_route_graph` | One route's render backbone (`graph`: nodes, render/handoff edges, origins, counts, gaps; `phase: complete`); 404 for an unknown route |
| `GET /api/dataflow/route-surface?path=&route=&expectedGeneration=` | `routers/dataflow.py:get_route_surface` | The same route's backbone alone (`phase: surface`: the same boxes and render edges, no origins, handoffs or gaps), from the route file's own facts; answers before the first `route-graph` on a large app |
| `POST /api/dataflow/refresh` | `routers/dataflow.py:refresh` | Rebuild tier 1 from the sources as they are now; replies with the new generation's routes. A query naming an older generation gets `outcome: stale` |
| `DELETE /api/dataflow?path=` | `routers/dataflow.py:close` | Close the engine for a root |
| `GET /api/dataflow/route-path?path=&route=&edge=&source=` | `routers/dataflow.py:get_route_path` | One lit edge explained in order (`path`: the edge, ledger rows from the origin to where it ends, the proof, a frontier when the lineage stops); field edges need `source`; 404 for an edge the totality does not carry |
| `POST /api/dataflow/function-effects` | `routers/dataflow.py:function_effects` | What the function enclosing `{file, line[, column]}` touches (`effects`: facts with witnesses, frontiers, promise handling, assumptions); `outcome: unsupported`, `reason: no-callable` outside any function |
| `POST /api/dataflow/anchor-graph` | `routers/dataflow.py:anchor_graph` | A value's neighbourhood from any expression (`span` + `text`, or `name` + `line`), `direction` backward / forward / both; 404 for a name not on its line |
| `GET /api/files/content` | `routers/files.py:get_file_content` | Raw file text; `ref=<sha>` reads it from a git commit (`git show`) |
| `GET /api/files/markers` | `routers/files.py:get_file_markers` → `services/markers.py` | Lines behind each metric (`{metric: [{line, end_line, note}]}`) for the code viewer overlay; `ref=` as above |
| `GET /api/compare/refs` | `routers/compare.py:list_refs` | Branches + recent commits for the compare ref picker |
| `GET /api/compare/sources?kind=prs\|worktrees\|branches` | `routers/compare.py:list_sources` → `services/compare/sources.py` | One picker section each (PRs with worktree/needs-fetch context, live worktrees newest first, branches with ahead/behind); a source that can't load returns `available: false` + reason |
| `GET /api/compare/commits?base=&head=` | `routers/compare.py:get_commits` → `git_refs.list_commits` | First-parent commits in a range, oldest first, each with its first parent (commit stepper; capped at 100) |
| `POST /api/compare/prewarm` | `routers/compare.py:prewarm` → `jobs.CompareJobManager.prewarm` | Scan one commit side in the background after running compares finish; a per-commit lock in `snapshots.load_side` stops duplicate scans |
| `POST /api/compare`, `GET /api/compare/{id}`, `GET /api/compare/{id}/result`, `DELETE /api/compare/{id}` | `routers/compare.py` → `services/compare/jobs.py` | Background compare job (polled), payload includes both trees + graphs |
| `GET /api/files/commits` | `routers/files.py:get_file_commits` → `services/activity.py:recent_commits` | Last commits touching a file (hash, date, subject), following renames; the code viewer's evidence for activity |
| `GET /api/files/findings` | `routers/files.py:get_file_findings` → `services/findings/overlay.py:file_findings` | One file's findings (rule, message, line, severity, tool) and the checkers that covered it; `/api/files/markers` also returns them as `finding_count` / `error_count` line marks |
| `GET /api/files/suggest` | `routers/files.py:suggest_files` | Path autocomplete for the path bar |
| `GET /api/metrics/catalog` | `routers/metrics.py:get_metric_catalog` → `services/metric_catalog.py` | Every metric's definition; the client loads it before rendering |
| Pydantic response models | `server/app/models.py` | `Node`, `Metrics`, dependency graph models |

### Metrics end-to-end

A metric is its analyzer plus one catalog entry; the step-by-step checklist is `docs/adding-a-metric.md`.

| Layer | Where |
| --- | --- |
| Compute | language analyzer (see above) + `server/app/services/analysis_types.py` |
| API model | `server/app/models.py` (`Metrics`) |
| Copy into nodes / roll up | `server/app/services/analysis.py` (`attach_file_metrics`, `aggregate_metrics`) |
| **Metric catalog** (label, unit, group, direction, aggregation, description, witness, color stops, profile weights; languages and scope derived from `analysis_types`) | `server/app/services/metric_catalog.py` (`METRICS`, `profile_weights`, `catalog_payload`); served by `GET /api/metrics/catalog` (`server/app/routers/metrics.py`) |
| Report profile weights + metrics schema | `server/app/services/reporting.py` (`PROFILE_WEIGHTS`, `build_metrics_schema`), both from the catalog |
| Client catalog store (fetched before render; lookups, unit formatting, the one selected metric) | `client/src/utils/metricsStore.tsx` (`loadMetricCatalog`, `metricDefs`, `metricDef`, `formatMetricWithUnit`, `useMetricsStore().metric`); bootstrapped in `client/src/index.tsx` |
| Which metrics apply to a path (code viewer rows, tooltip) | `client/src/utils/metricApplicability.ts` (`applicableMetrics`, `languageForPath`); witnesses in `utils/explorerColumns.ts` (`witnessOf`) |
| Metric picker (single select: Hot Spots "Rank by" + treemap "Color") | `client/src/components/MetricPicker.tsx` |
| Explorer sort/columns (incl. always-on color-metric column) | `client/src/utils/explorerColumns.ts` (`explorerColumns`, `visibleExplorerColumns`) |
| Treemap color mapping (catalog `color_domain`, `color_per_file`) | `client/src/viz/treemap/utils/colors.ts` (`TREEMAP_RAMP`, `treemapFillColor`) |
| Client test catalog + parity fixture (server-owned snapshots) | `server/tests/snapshots/` (written by `tests/test_metric_catalog.py`, `tests/test_ranking_parity.py`); loaded by `client/src/test/setup.ts` |
| Metric portfolio evaluation (support, N/A and zero rates, Spearman, top-k overlap per language/scope; case sheets) and the pilot that tuned the defaults | `server/scripts/evaluate_metric_portfolio.py` (tests: `tests/test_evaluate_metric_portfolio.py`); record in `docs/research/metric-pilot-2026-10/` |

### Headless reports for agents

| Feature | Where |
| --- | --- |
| Artifact writing (`report.md`, `findings.json`, …) | `server/app/services/reporting.py` (`write_report`, `build_report_payload`) |
| Single-metric ranking (one cohort, worst first, ties by path; N/A counted apart): report "Top Files/Functions", `hotspots.json`, `srcly hotspots --metric` | `server/app/services/reporting.py` (`rank_by_metric`, `cohort_nodes`, `witness_of`); client mirror `client/src/utils/hotSpotRanking.ts` (`rankHotSpots`), checked by `tests/test_ranking_parity.py` + `hotSpotRanking.parity.test.ts` |
| Findings queue (profile-weighted mix; zeros count, N/A drops out) / tree summary | `server/app/services/reporting.py` (`rank_nodes`, `build_findings`, `summarize_tree`) |
| Named 2x2 presets (axes, absolute cut-offs, quadrant names), quadrant assignment, fan-in; `report --quadrant` section + `quadrants.json` | `server/app/services/quadrants.py`; served in the catalog as `quadrant_presets`; client mirror `client/src/viz/scatter/quadrants.ts` |
| Agent skill shipped with the repo | `skills/srcly-code-quality/SKILL.md` |

### Compare two git refs (PR compare)

| Feature | Where |
| --- | --- |
| `srcly compare [base] [head]` (markdown summary, `--json`, `--out`) | `server/app/run.py` (`_run_compare`) → `server/app/services/compare/service.py` (`build_compare`, `render_markdown`) |
| Ref resolution (`merge-base`, `WORKTREE`, `pr:<n>` with its own base and an objects-only fetch of a missing head), changed files with renames + line counts | `server/app/services/compare/git_refs.py` |
| GitHub PR metadata via the `gh` CLI (`run_gh` seam with timeout + failure reasons, `list_prs`, `pr_info`, 60s cache, checks summary) | `server/app/services/compare/github.py` |
| Phase and per-side step timings (`StepTimer`: resolving/base/head/diffing; cache/checkout/scan/graph/cleanup) | `server/app/services/compare/service.py`, job snapshot in `jobs.py`, shown by `client/src/compare/CompareProgress.tsx` and `SummaryStrip.tsx` |
| Commit snapshots (`git worktree add --detach` in the cache dir), SHA-keyed side cache, repo-relative paths | `server/app/services/compare/snapshots.py` |
| Per-file metric deltas, better/worse direction table, edge diff, summary | `server/app/services/compare/diff.py` (`COMPARE_METRICS`, `diff_sides`) |
| Compare mode shell (`?compare=<base>..<head>`, compared repo from the shared `repo` param, progress, code viewer at a ref) | `client/src/compare/CompareApp.tsx`, `CompareProgress.tsx`, `api.ts`; entry button in `client/src/App.tsx` (`enterCompare`, opens the picker) |
| Commit stepper (strip of a PR's commits, ◀ ▶ / `[` `]`, Whole PR; `crange` URL param; pre-warms the next commit) | `client/src/compare/CommitStepper.tsx`, step model in `client/src/compare/stepper.ts` |
| Compare picker (PRs mine/all, worktrees, branches, search, keyboard, Advanced free-text refs; picks → `pr:<n>..pr:<n>` or `auto..<ref>`) | `client/src/compare/ComparePicker.tsx`, pure helpers in `client/src/compare/pickerModel.ts` |
| `worktree:<path>` head (another worktree's files on disk, scanned in place; diff runs inside it; `ResolvedRef.dir`) | `server/app/services/compare/git_refs.py` (`_resolve_worktree`), `snapshots.py` (`_load_worktree`) |
| `auto` base (head's open PR base via `gh pr list --head`, else merge-base with the default branch) | `server/app/services/compare/git_refs.py` (`resolve_auto_base`, `branch_of`), `github.py` (`pr_for_branch`) |
| Overview band (PR context row with GitHub link, before/after refs with step timings, files, lines, imports, risk metrics) | `client/src/compare/SummaryStrip.tsx` |
| Scorecard rail (risk metrics worst-first with better/worse file split, size metrics, new cross-folder imports) | `client/src/compare/Scorecard.tsx` |
| Changed-files table (verdict, diffstat, before → after with magnitude bars; folders / most regressed / by metric; status, path, regressions filters; keyboard) | `client/src/compare/CompareTable.tsx`, row model in `client/src/compare/rows.ts` |
| File inspector (worse / better / size moves, imports gained and lost, open before/after) | `client/src/compare/Inspector.tsx` |
| Side-by-side treemaps on one union layout (√LOC tiles, fill-to-own-size, hatched absent slots, verdict outlines, linked hover/zoom) | `client/src/compare/CompareTreemap.tsx`, layout in `client/src/compare/treemapLayout.ts` |
| Before/after dependency graphs on one union layout (changed files center, importers left, imports right; added/removed edges; ghosts for absent files; "used by N" hubs; linked pan/zoom; expand) | `client/src/compare/CompareGraph.tsx`, model in `client/src/compare/graphModel.ts` (feeds `viz/deps/layout.ts:layoutViewSync`) |
| Shared bits (status icon, diffstat, health, magnitude and split bars), labels/formatting/health | `client/src/compare/bits.tsx`, `client/src/compare/metrics.ts` |

### Client: app shell and first run

| Feature | Where |
| --- | --- |
| Mount + global CSS / design tokens | `client/src/index.tsx`, `client/src/index.css` |
| App shell, scan start/cancel, loading/empty/error states | `client/src/App.tsx` |
| Scan root shown under its folder's name (server sends `"root"`) | `client/src/utils/explorerScope.ts` (`nameScanRoot`), applied in `client/src/state/scanStore.ts` |
| Scan API client (EventSource + polling fallback) | `client/src/services/scanJobs.ts` |
| Scan progress panel | `client/src/components/feedback/ScanProgress.tsx`, view model in `client/src/utils/scanProgress.ts` |
| Path bar with autocomplete + recent paths | `client/src/components/FilePicker.tsx` |
| Loading / empty / error primitives | `client/src/components/feedback/States.tsx` |
| Toasts | `client/src/components/Toast.tsx` |
| First-run screen (`AnalyzeTarget` cards) | `client/src/App.tsx` |
| Global metric + exclusion state (context) | `client/src/utils/metricsStore.tsx` |
| Immutable tree search + exclusions / noise removal | `client/src/utils/dataProcessing.ts` |

### Client: Explorer sidebar

| Feature | Where |
| --- | --- |
| Tree / Hot Spots tabs, column picker, sorting, filter box | `client/src/components/Explorer.tsx` |
| Hot Spots list (one metric, worst first; value + unit, witness, cohort tag; collapsed N/A group; arrow keys / Enter / Shift+Enter) | `client/src/components/HotSpotList.tsx`; ranking in `client/src/utils/hotSpotRanking.ts` (`cohortNodes`, `rankHotSpots`); Files / Functions toggle in `Explorer.tsx` |
| Activity window picker (chips in the metric picker's Activity group, refetches the result) | `client/src/components/MetricPicker.tsx` (`ActivityWindowControl`); state in `client/src/state/scanStore.ts` (`activityWindow`, `setActivityWindow`); per-metric N/A reasons via `utils/metricsStore.tsx` (`naReasonFor`) |
| Findings status (which checkers ran, or why N/A) in the metric picker; polling until checks finish | `client/src/components/MetricPicker.tsx` (`FindingsStatus`); `client/src/state/scanStore.ts` (`pollFindings`) |
| N/A cells, 0 vs N/A, max-complexity witness link | `client/src/utils/explorerColumns.ts` (`metricCellText`, `metricCellTitle`, `witnessOf`); rows in `TreeNode.tsx`, `HotSpotItem.tsx`; code viewer in `CodeModal/MetricsTable.tsx`; treemap hatch in `viz/treemap/utils/colors.ts` (`TREEMAP_NA_COLOR`) |
| Column definitions, cell text/heat tint, color-metric column | `client/src/utils/explorerColumns.ts` |
| Scope bar: scope name with a step up, LOC/files/fns counts, top file by color metric | `client/src/components/ExplorerScopeBar.tsx`, `client/src/utils/explorerScope.ts` |
| Filter box, empty state, grouped column picker | `client/src/components/ExplorerControls.tsx` |
| Linked hover between explorer rows / Hot Spots and treemap tiles | `client/src/utils/hoverLink.ts`; rows in `TreeNode.tsx`, `HotSpotItem.tsx`; ring in `viz/treemap/components/TreemapCanvas.tsx` |
| Sidebar collapse (`[`), rail, resize handle, saved width | `client/src/hooks/useSidebarLayout.ts`, `client/src/components/SidebarRail.tsx`; wired in `client/src/App.tsx` |
| Virtual tree rows, keyboard navigation, initial auto-expand | `client/src/components/TreeNode.tsx`, `client/src/utils/explorerTree.ts` |
| Hot spot rows | `client/src/components/HotSpotItem.tsx` |
| File-type filter popover | `client/src/components/FileTypeFilter.tsx` |

### Client: Navigation (one location for treemap + graph)

| Feature | Where |
| --- | --- |
| Location model: `?repo=&at=&view=&open=` parse/serialize, legacy `depFocus` alias, breadcrumbs, scan-path ↔ `at`, graph-id mapping | `client/src/navigation/location.ts` |
| `at` → scan-tree node (prefix descent, bare-symbol match, nearest-ancestor fallback) | `client/src/navigation/resolveTree.ts` |
| Navigation store: `location()`, `go` (pushState), `replace`, popstate, visit history (sessionStorage mirror), graph filters that survive view toggles | `client/src/navigation/store.ts` |
| Multiple anchors (T20): `anchor=a\|b\|c` (`parseAnchors`, `MAX_ANCHORS`), per-anchor queries merged by element id with shared boxes marked, Add to the trace from the inspector and the node menus, remove chips | `client/src/viz/deps/flow/multiAnchorAdapter.ts`, `client/src/viz/deps/flow/FlowView.tsx` (`anchorSpecs`, `addAnchorFrom`), `client/src/navigation/nodeActions.ts` (`addAnchorPatch`), `client/src/navigation/location.ts` |
| Field label placement (T22): labels beside their edge where they cover no box or label, else hover-only; `data-edge-label` on each drawn label | `client/src/viz/deps/edgeLabels.ts`, `EdgeLabel` in `client/src/viz/deps/DependencyCanvas.tsx` |
| Flow mark tokens (T21): marks and legend swatches in `--plc-*` tokens, `markVar` for CSS, `tokenColor`/`markColor` for the Lab tint mix over `--plc-surface` | `client/src/viz/deps/flow/marks.ts`, `client/src/viz/deps/flow/FlowMark.tsx`, `client/src/viz/deps/DependencyCanvas.tsx` (`tintFill`) |
| File and folder anchors (T19): `fileExports` op lists exported declarations (aliases resolved, type-only not traceable); `GET /api/dataflow/file-exports`; anchor `path@*`, one box per export with lazy expansion into its anchor graph, folders over 50 exports folded by file | `engine/src/srcly/ops/file-exports.ts`, `engine/src/srcly/contracts/file-exports.ts`, `server/app/routers/dataflow.py` (`get_file_exports`), `client/src/viz/deps/flow/exportsAdapter.ts`, `client/src/viz/deps/flow/FlowView.tsx` (`exportsSpec`), `client/src/navigation/nodeActions.ts` (`tracePatch`) |
| Anchor history: recent anchors and routes in the data-flow toolbar (Recent menu, Return and Forward), from the visit ring; data-flow places named by anchor or route in the header History | `client/src/navigation/flowPlaces.ts`, `RecentFlowMenu` in `client/src/viz/deps/flow/FlowTools.tsx`, `client/src/navigation/HistoryMenu.tsx` |
| View-state registry: what Back and Return restore beyond the URL (camera, selection, reach mode, metric, graph filters); snapshots in sessionStorage under a token in `history.state`; Return button and Alt+← in the data-flow graph | `client/src/navigation/viewState.ts`, `client/src/navigation/store.ts` (`canReturn`, `returnBack`), owners in `client/src/viz/deps/flow/FlowView.tsx` (`graph.view`), `client/src/utils/metricsStore.tsx` (`metrics`), `client/src/navigation/store.ts` (`graph.filters`); camera get/set and hold in `client/src/viz/deps/DependencyCanvas.tsx` |
| Missing-path fallback + toast, treemap/explorer zoom → `go`, `?repo=` → analyze | `client/src/App.tsx` (`resolved`, `zoomTo`, `handleFileSelect`) |
| History dropdown (last 30 places, MRU) | `client/src/navigation/HistoryMenu.tsx`, ring in `client/src/navigation/history.ts` |
| Header location bar: analyzed folder › breadcrumb, one for every view | `client/src/navigation/LocationBar.tsx` |
| Folder menu (chevron beside the folder name): rescan, type/browse another path, recent folders | `client/src/navigation/FolderMenu.tsx`; recents in `client/src/utils/recentPaths.ts` |
| Node actions menu (Focus · Open code · Show folder; right-click in both views, hover "⋯" on graph nodes) | `client/src/navigation/NodeActionsMenu.tsx`, availability rules in `client/src/navigation/nodeActions.ts` |
| Open any location in the code viewer (scope, graph symbol, file) | `client/src/App.tsx` (`openAt`) |
| Scan state that outlives the view (data, progress, cancel, superseded-request guard) | `client/src/state/scanStore.ts` |
| Compare ⇄ normal without remount (normal view stays mounted, hidden) | `client/src/App.tsx` (`App`) |

### Client: Treemap

| Feature | Where |
| --- | --- |
| Layout, zoom, isolate/exclude, tile context menu | `client/src/components/Treemap.tsx` |
| View toolbar (Treemap \| Graph \| 2x2 switch with arrow keys via `components/ui/segmentedKeys.ts`, slot for the active view's own tools, filter, color metric, legend) | `client/src/viz/treemap/components/TreemapHeader.tsx`; slot in `client/src/viz/viewToolbar.tsx` (`ViewToolSlot`, `ViewTools`) |
| Canvas tile rendering + keyboard selection | `client/src/viz/treemap/components/TreemapCanvas.tsx`, `viz/treemap/utils/hitTest.ts` |
| Canvas zoom motion through a shared tile | `client/src/viz/treemap/utils/zoom.ts`, `viz/treemap/components/TreemapCanvas.tsx` |
| Tooltip | `client/src/viz/treemap/components/TreemapTooltip.tsx`, `viz/treemap/hooks/useTreemapTooltip.ts` |
| Color scales per metric (one shared `TREEMAP_RAMP`) | `client/src/viz/treemap/utils/colors.ts` |
| Scope `(body)` nodes with shared unchanged branches, path lookup | `client/src/viz/treemap/utils/tree.ts`, `viz/treemap/utils/path.ts` |
| Label text fitting | `client/src/utils/svgText.ts` |

### Client: 2x2 view

| Feature | Where |
| --- | --- |
| `?view=scatter` (the "2x2" switch beside Treemap/Graph), preset/cohort/quadrant URL params, fan-in fetch, opening points | `client/src/viz/scatter/ScatterView.tsx`; mounted in `client/src/components/Treemap.tsx` |
| 2x2 controls in the view toolbar (preset menu with axes + description, Files/Functions switch, reset cut-offs) and its status line | `client/src/viz/scatter/PresetPicker.tsx`, `ScatterView.tsx` (`ViewTools`) |
| Plot: log/linear axes, quadrant fields + names, draggable cut-offs, hover card, linked hover | `client/src/viz/scatter/ScatterPlot.tsx` |
| Quadrant grid + member list (reuses `HotSpotItem` via `HotSpotRowContext`) | `client/src/viz/scatter/QuadrantPanel.tsx` |
| Points, quadrant assignment, scales, "why no data" reasons | `client/src/viz/scatter/quadrants.ts` |

### Client: Code viewer modal

| Feature | Where |
| --- | --- |
| Modal composition, keyboard (`/` outline, `[` `]` step hits, Esc), display controls | `client/src/components/CodeModal/CodeModal.tsx`, `CodeModalHeader.tsx` |
| Highlighted source (Shiki worker) | `client/src/components/CodeModal/CodePane.tsx`, `hooks/useHighlightedCode.ts`, `workers/highlight.worker.ts`, `utils/shikiHtml.ts` |
| Markdown rendering | `client/src/components/CodeModal/MarkdownPane.tsx`, `client/src/markdown/*` |
| Outline / go-to-symbol popover (off the breadcrumb) | `client/src/components/CodeModal/OutlinePopover.tsx`, `utils/structureTree.ts` |
| Metrics rail (left): applicable metrics, scope vs file, click to overlay | `client/src/components/CodeModal/MetricsSidebar.tsx`, `MetricsTable.tsx`; applicability in `client/src/utils/metricApplicability.ts` |
| Sticky scope breadcrumb | `client/src/components/CodeModal/StickyBreadcrumb.tsx` |
| Recent commits (activity evidence) under the metrics table | `client/src/components/CodeModal/RecentCommits.tsx` (in `MetricsSidebar.tsx`) |
| Findings list (findings evidence, click to jump) under the metrics table | `client/src/components/CodeModal/FileFindings.tsx` (in `MetricsSidebar.tsx`; jump in `CodeModal.tsx:jumpToFinding`) |
| Metric overlay: lines behind a metric (marked lines, notes, overview ruler, stepping) | `GET /api/files/markers` → `server/app/services/markers.py` (`MarkerSink`, `collect_markers`; analyzers call `_mark`); client `hooks/useMetricMarkers.ts`, `utils/metricMarkers.ts`, `CodePane.tsx` |
| File fetching | `client/src/services/fileContent.ts`, `hooks/useFileContent.ts` |
| Line-range slicing / indent reduction | `client/src/utils/lineRange.ts`, `utils/indentation.ts` |

### Client: Graph views

| Feature | Where |
| --- | --- |
| Dependency view (whole-repo graph fetched once; focus = location `at`) | `client/src/viz/deps/DependencyView.tsx`; graph contract in `viz/deps/contract.ts`, hierarchy/filters in `viz/deps/hierarchy.ts` |
| Dependency view model (focus → in / center / out boxes, roll-up to the box budget) | `client/src/viz/deps/viewModel.ts` |
| Expand in place (Shift-click a folder → its children in a framed block, any side, any depth; Detail −/+ and `-`/`+` keys; `?open=` URL list; camera stays on the opened box, staggered fly-out and a growing outline) | `viz/deps/viewModel.ts` (`expanded` option, `assignGroups` opened frames); `viz/deps/DependencyView.tsx` (`expand`, `collapse`, `expandLevel`, `collapseLevel`); `viz/deps/layout.ts` (`previous` option, `stickyColumns`: old columns and row count kept; `chunkColumns`: a big opened folder gets its own columns and one frame across them); `viz/deps/DependencyCanvas.tsx` (`anchoredCamera`, `planFlights` with stagger, `anchorGlow`, closable frames); `navigation/location.ts` (`open`) |
| Dependency grid layout (viewport-shaped packing in `rankPackings`, channel/gutter edge routing) | `client/src/viz/deps/layout.ts` |
| Dependency hubs (targets most boxes import become shape badges; their edges hide until hovered) | `client/src/viz/deps/hubs.ts`; per-box link counts, cycles and badges in `viz/deps/boxInfo.ts`; counts drawn at every zoom, the view's top connectors bold (`connectorMin` in `DependencyCanvas.tsx`) |
| Dependency graph canvas (four-row boxes, pastel metric tint, icon hover cards, hover, click to focus or isolate a symbol, Shift/Alt-click to open in place with a matching cursor, double/middle/⌘-click to open) | `client/src/viz/deps/DependencyCanvas.tsx`, pointer logic, click action and cursor (`clickAction`) and arrow-key movement (`nextInDirection`) in `viz/deps/interaction.ts` |
| Graph status line (bold "what a click does" for the hovered box, following Shift; quiet gesture help) | `ClickStatus` in `client/src/viz/deps/DependencyView.tsx` |
| Dependency graph keyboard (selection, arrows, Enter/F/E/C/O/M on the selected or hovered box, U up, filters X/T/Y, `?` sheet) | key handler in `viz/deps/DependencyView.tsx`; the sheet and its list in `viz/deps/ShortcutsDialog.tsx` |
| Graph go-to palette (`/`: search folders, files and symbols; Enter focus, Shift+Enter open in place, ⌘Enter code) | `client/src/viz/deps/GoToPalette.tsx`; ranking and match highlighting in `viz/deps/goto.ts` |
| Dependency graph semantic zoom (below 0.95 zoom, box names scale ≈ 1/zoom, wrap, and rows drop to name + stats) | `client/src/viz/deps/boxText.ts`, `CompactBody` in `DependencyCanvas.tsx` |
| Dependency graph legend (edge/box encodings, collapsible) | `client/src/viz/deps/DependencyLegend.tsx`; shared stroke constants in `viz/deps/encoding.ts` |
| Open code from the graph (graph symbol → treemap scope by name, then by line) | `App.tsx` (`openAt`) → `navigation/resolveTree.ts`; line fallback `utils/dataProcessing.ts` (`findScopeForSymbol`) |
| Dependency graph LOC + treemap color join (absPath → treemap node index, built once per scan in `Treemap.tsx`) | `client/src/viz/deps/metrics.ts` |
| Folder contents on graph boxes (children by LOC as a colored strip; "Largest inside" in the hover card) | `viz/deps/metrics.ts` (`viewContents`, `stripSegments`); `ContentsStrip` and `NodeCard` in `viz/deps/DependencyCanvas.tsx` |
| Local dependency-graph fixtures for layout tests (gitignored `__fixtures__/local/`) | `scripts/capture-dep-graph.sh` |

### Client: UI primitives

| Primitive | Where |
| --- | --- |
| Button, IconButton, TextInput, CheckboxRow | `client/src/components/ui/*` |
| Popover (behavior: one open at a time, flip/clamp placement, entry motion) + PopoverPanel (styling) | `client/src/components/Popover.tsx`, placement in `components/popoverPosition.ts`, `components/ui/PopoverPanel.tsx` |
| Dialog shell | `client/src/components/dialog/DialogShell.tsx` |
| Panel header | `client/src/components/layout/PanelHeader.tsx` |
| Class join helper | `client/src/components/ui/classes.ts` |
| Icons | `lucide-solid` (no emoji or unicode glyphs as icons) |
| Fonts | Inter + IBM Plex Mono, self-hosted via `@fontsource`, wired to Tailwind `font-sans` / `font-mono` in `client/src/index.css` |
| Design system spec | `DESIGN.md` (tokens mirrored as `--plc-*` CSS vars in `client/src/index.css`) |

### Data flow (engine)

The tsx-data-flow analysis lives in `engine/`, a standalone Node package with its own lockfile. Plan: `docs/intent/tsx-dataflow-integration/detailed-plan.md`.

| Feature | Where |
| --- | --- |
| Engine package, provenance (copied SHA, what moved, what stayed behind) | `engine/package.json`, `engine/UPSTREAM.md`, `engine/README.md` |
| Project loading, tsconfig resolution, TypeScript program | `engine/src/project/` |
| Analysis: evidence collection, slices, route totality, field lineage | `engine/src/analysis/` (copied unchanged; never edited for srcly-specific recognition) |
| Zod contracts and projections | `engine/src/api/` |
| Worker-thread analysis service, cache, source excerpts | `engine/src/service/` |
| stdio protocol loop (one JSON frame per line, cancel, progress frames; `console.log` rebound to stderr) | `engine/bin/srcly-engine.ts`; frames and error codes in `engine/src/srcly/protocol.ts`; stderr rebinding in `engine/src/srcly/stdio.ts` |
| Tier-1 session (the primary Program + lazy evidence provider + routes; never the legacy report, its routing Programs or its identity index), strict-tsconfig refusal, generation, `release` (drop everything, keep the generation when the hash is unchanged) | `engine/src/srcly/session.ts`; `programHash` in `engine/src/srcly/fingerprint.ts`; TypeScript choice (D4) in `engine/src/srcly/typescript-choice.ts` |
| Engine ops (`status` on the protocol thread, `routes` in the worker) | `engine/src/srcly/ops/`; worker branches in `engine/src/service/analysis-worker.ts` |
| Op contracts (Zod) → JSON Schema for Python + client types | `engine/src/srcly/contracts/` (`registry.ts` lists them); `cd engine && pnpm emit-contracts` writes `server/app/services/dataflow/contracts/*.schema.json` and `client/src/dataflow/contract.generated.ts` |
| Engine bundle in the wheel: esbuild entry + worker, the Python helper and a trimmed `node_modules/typescript` in `server/app/engine/` (`VERSION.json`), run by `build-srcly.sh`; `IS_BUNDLE` keeps bundle-relative paths beside it; smoke on the installed wheel | `engine/scripts/bundle.mjs` (`pnpm bundle`), `engine/src/srcly/bundle.ts`, `scripts/test_package.py` (`test_bundled_engine`) |
| Cold `hello` + tier-1 timing | `engine/scripts/time-tier1.ts` |
| Engine memory bound: after each request, retained heap over `SRCLY_DATAFLOW_MEMORY_MB` (default 2560) drops the session; a rebuild still over it answers `memory-limit`. Retained-heap probe over repeated anchor traces | `engine/src/srcly/memory-guard.ts` (called from `engine/src/service/analysis-worker.ts`); `engine/scripts/memory-probe.ts` (`pnpm memory-probe --root … [--anchor file:name:line \| --exports N]`) |
| Engine child owned by Python: spawn, handshake, reply matching by id, progress, timeouts, cancel then kill, crash with stderr tail, registry (cap 2, 15-minute idle close on a timer) | `server/app/services/dataflow/engine.py`; closed in `main.py:lifespan`, cancelled first on SIGINT |
| Phase profiler: tier 1, the provider's fact collection, each phase of a route's totality (candidate, surface, context, slice, bridges, lineage) and the projection, plus `anchorGraph` timings; prints JSON and a Markdown table for `measurements.md` | `engine/scripts/time-phases.ts` (`pnpm time-phases --root … --route … --anchor file:text[:direction]`), listener `observeRouteTotalityPhases` in `engine/src/analysis/route-data-totality.ts` |
| Browser smoke for Data flow (real engine on solid-route through the API and Vite: route picker, origin select, reach, inspector, anchor from the code viewer, import-graph and treemap menus, dark mode; screenshots in `tmp/e2e`); CI job `browser` | `client/e2e/dataflow.spec.ts`, `client/playwright.config.ts` (`pnpm e2e`), `.github/workflows/release.yml` |
| Fake engine for tests: every reply built from the emitted JSON Schemas, `--outcome OP=ok\|partial\|unsupported\|budget\|stale\|not-analyzed`, crash / hang / garbage / protocol flags; every op × shape validated against its schema and written to `tests/snapshots/fake-engine.*.json` for the client's `dataflow/shapes.test.ts` | `server/tests/fake_engine.py`, `server/tests/test_dataflow_outcomes.py` |
| Where the engine and Node come from, which language a root is (a tsconfig → TypeScript, else a Python project or `.py` files → Python, run with this server's interpreter), N/A reasons decided without spawning (`node-not-found`, `engine-missing`, `no-tsconfig`, `python-checker-not-found`) | `server/app/services/dataflow/availability.py` (`SRCLY_NODE`, `SRCLY_ENGINE_DEV=1`) |
| Pydantic mirrors of op results, `Outcome`, N/A reasons; the emitted JSON Schemas | `server/app/services/dataflow/models.py`, `server/app/services/dataflow/contracts/*.schema.json` |
| `/api/dataflow/*` endpoints | `server/app/routers/dataflow.py` |
| Engine `functionEffects` (M6, T14): a walk over the callable's body names each effect as a fact with a witness (families external, input, write, throw, timer, promise; activation direct, after-await, timer, latent), follows first-party callees the checker resolves (memoized, bounded, cycle-safe, aliases followed) and merges their facts behind a `via` chain, names what it cannot follow as frontiers (callback-parameter, dynamic-dispatch, unresolved-callee, recursion, budget), and says how each promise-yielding call is handled; identity from the checker, never a name; TypeScript lib intrinsics taken as pure unless named | `engine/src/analysis/effects/function-effects.ts`, `engine/src/srcly/ops/function-effects.ts`, contract `engine/src/srcly/contracts/function-effects.ts`; fixture `engine/examples/effects-basics/src/cases.ts` (21 cases) and `engine/test/srcly/function-effects.test.ts`; Python `models.py:FunctionEffectsResult` |
| Explain an edge (M4, T16): `routePath {route, source?, edge}` maps the field attachment's, frontier's or handoff bridge's `evidencePathElementIds` through the slice into ledger rows (input, transfer, transform, branch, terminal, boundary at a frontier), never inventing a step; the client selects a handoff or field edge by click and the inspector lists its steps, each opening its line | `engine/src/srcly/ops/route-path.ts`, contract `engine/src/srcly/contracts/route-path.ts`, `engine/test/srcly/route-path.test.ts`; client `DependencyCanvas.tsx` (`onSelectEdge`), `FlowView.tsx` (`selectedEdge`, `edgePath`), `FlowInspector.tsx` (`EdgeStepsView`) |
| Effects panel (M6, T15): Known facts by family and the places the analysis could not follow together, activation and via chain per fact, how each promise is handled, assumptions one click away, a witness row opens its line; in the code viewer's rail under the findings for the selected scope (else the function enclosing the opened line) and in the data-flow inspector for a selected box's function in anchor mode | `client/src/dataflow/EffectsPanel.tsx` (`createEffectsQuery`), pure wording in `client/src/dataflow/effectsModel.ts` (tested on the fake engine's shapes); hosts `CodeModal.tsx` → `MetricsSidebar.tsx` (`effects` slot) and `viz/deps/flow/FlowInspector.tsx` |
| Call identity (T13): the slice walk's invocation stack pairs a callee's return with the call the walk came in by (`pairInvocation`); a first-party callee is walked through its binding, never the bare `argument` link; the ops trust that pairing: a walk leaves a callee only through the call it entered by, and one that started inside it leaves through every call; an `argument` stays at its own call, and only the cross-calls the slice does not pair (callbacks, accessors) keep R7's one-call-site boundary (`facts.ts:needsOneCallSite`, `pairedInSlice`) | `engine/src/analysis/evidence-slice.ts`, `engine/src/srcly/facts.ts`, `engine/src/srcly/ops/{anchor-graph,value-flow}.ts`; fixtures `examples/value-flow-basics/src/{two-call-identity-helper,returns-other-argument}.tsx` |
| Dead-end relations in the collector: a callee with no in-project body (a library method, a callback, an accessor) is consumed by its call (`references` callee → call); an operator expression (comparison, arithmetic, `!`, `typeof`, a template) is a `derived` element its operands reach; an arrow function's expression body is its return; an assignment to a local variable or parameter is a binding, and a read sees the bindings that can reach it (`program-evidence-reaching-bindings.ts`, the TypeScript twin of the Python helper's `link_loads`); a first-party method that reads `this` takes the call's receiver through a `this` parameter (`thisBinding`, `readsThis`), bound and paired like an argument, and a first-party callee is bookkeeping, not a dead end; an array literal packs its elements and spreads, a spread argument passes what it spreads, a `for…of` binding takes each element (`processForOf`), and a JSX spread hands its fields to the element or component; a shorthand `{ x }` packs the value `x` names; a JSX tag that names a value the program declares (`const Badge = styled(…)`, `const Root = Primitive.Root`) renders that value there (alias → `component-occurrence`, `renderedComponent`), its props and children are component props, and an exact alias of an in-project component (`const Root = Card`) binds that component's props; a computed key (`obj[k]`) reads some field of its receiver, a `partial` read rather than a stop; a library call whose value is discarded keeps its arguments in a receiver its own function declares (`rows.push(row)`: call → binding, `partial`, proof `external-call`), and a collection method's named `call-result` is the call's own value | `engine/src/analysis/program-evidence-collector-call-support.ts` (`processCall`, `connectExternalCall`), `program-evidence-collector-boundary-processing.ts` (`processDerived`, `processReturn`, `processObject`), `program-evidence-collector-jsx-support.ts` (`processJsx`, `renderedComponent`), `program-evidence-support.ts` (`derivedOperands`); fixtures `examples/value-flow-basics/src/{callee-consumed,ends-in-place,derived-operands,arrow-body-return,computed-index,reassigned,this-methods,collections,external-calls,component-aliases}.tsx`, tests in `engine/test/srcly/anchor-graph.test.ts`; survey tooling `engine/scripts/survey-blockers.ts`, `survey-report.ts` |
| Reactive state pairs: `const [x, setX] = createSignal(init)` (also `createStore`, React `useState`, `useReducer`) holds one state element at the getter's binding; the factory call (its initial value) and every setter argument reach it, and every getter read sees it (`partial`, proof `framework-state`). A setter or getter reached through a property or `const` copy (`state.setDoc`) is resolved through the checker; two pairs never share state | `engine/src/analysis/program-evidence-state-pairs.ts` (`STATE_FACTORIES`, `stateRoleOf`); wired in `program-evidence-collector-call-support.ts` (`processVariable`, `processCall`, `stateElement`), `program-evidence-collector-boundary-processing.ts` (property reads), `program-evidence-collector-jsx-support.ts` (`connectPendingReferences`); fixtures `examples/value-flow-basics/src/{state-pairs,react-state}.tsx` |
| Engine result cache (T11): results keyed by the Program's hash under `SRCLY_DATAFLOW_CACHE_DIR` (`<cache>/dataflow`, off with `SRCLY_DATAFLOW_CACHE=0`); a new process rehashes the last build's inputs and, when nothing changed, answers `routes`, surfaces, graphs and ledgers from disk as its generation 1 while tier 1 builds behind them; a changed hash misses, and so does a different engine (`engineFingerprint`: entries live under `<program hash>.<engine>`) | `engine/src/srcly/result-cache.ts`, served in `engine/bin/srcly-engine.ts` (`fromCache` / `toCache`); the directory from `server/app/services/dataflow/engine.py:EngineRegistry` |
| Engine `routeSurface` (T9): the route's backbone from facts collected for the route file alone plus the occurrence surface, cached per route in the session (`Tier1.surface`), projected with `phase: surface`; the client draws it first and swaps in the complete graph (same node ids) when it arrives | `engine/src/srcly/ops/route-graph.ts:routeSurfaceOp`, `engine/src/srcly/session.ts`, `engine/src/analysis/route-data-totality.ts:buildRouteSurfaceRecord`; client `FlowView.tsx` (`surfaceFetch`, `drawnGraph`) |
| Engine `routeGraph`: RouteTotality → flow nodes (route, occurrence, control, terminal, origin) and render/handoff edges; route identity aligned for `export default Page`; each box's own status from the located gap or omission it contains (`markPartialBoxes`), render edges take their target's | `engine/src/srcly/ops/route-graph.ts`, `engine/src/srcly/route-identity.ts`; fixture `engine/test/srcly/__fixtures__/solid-route.route-graph.json` (`pnpm capture-route-graph`); rule tests `engine/test/srcly/route-graph-marks.test.ts` |
| Client data-flow API, per-root availability (start once, poll `status` every 250 ms; every 2 s while a graph is open so an edit shows as "Source changed. Refresh."; `refresh` rebuilds and moves the status to the new generation), outcome labels | `client/src/dataflow/{api,availability,outcome}.ts`; types in `contract.generated.ts`; the banner and generation-keyed fetches in `viz/deps/flow/FlowView.tsx`; engine op `refresh` in `engine/bin/srcly-engine.ts` → `analysis-worker.ts` (`session-refresh`) |
| Data flow mode in the graph view (`?view=graph&flow=<route>`; Imports / Data flow switch; route picker `/`; double-click or `o` opens the node's line; Shift-click opens a folded frame) | `client/src/viz/deps/flow/FlowView.tsx`, `FlowTools.tsx`, `RoutePicker.tsx`, `FlowProgress.tsx`, `FlowLegend.tsx`; switch in `viz/deps/DependencyView.tsx`; `flow` param in `navigation/location.ts` |
| Route graph → ViewModel (frames per render parent, transparent primitives, box budget, hidden containment edges) | `client/src/viz/deps/flow/adapter.ts` (test reads the engine fixture) |
| Data flow origin selection (`field`/`dest` URL params; an origin's proven destinations light up through the canvas's hover dimming; field edges and frontier boxes from the engine's field lineage) | engine `routeGraph {route, source}` in `engine/src/srcly/ops/route-graph.ts`; client `adapter.ts` (`lit`), `FlowView.tsx` (Origin select, click an origin), `DependencyCanvas.tsx` (`highlight`) |
| Data flow box vocabulary: one mark and tint per node kind, proof status as the box stroke, repetition badges (`?` conditional, `∗` per item), flow in/out counts with neighbor cards, the legend | `client/src/viz/deps/flow/marks.ts` (kinds, colors, detail words), `FlowMark.tsx` (glyphs), `FlowLegend.tsx`; drawn by `DependencyCanvas.tsx` (`KindGlyph`, `linkCounts="flow"`, `NodeCard flow`) |
| Reach emphasis: click a box to light what is proven to reach it (strong) and what it reaches (light), frontiers where a non-proven edge stopped the walk, `Reach` Both/Up/Down (`R` cycles); field edges labelled with their path; edge cards with kind, status and the engine's proof | `client/src/viz/deps/flow/reach.ts` (pure walk over the drawn view, `notFlow` ownership edges excluded), `FlowView.tsx` (`highlight`, status line), `FlowTools.tsx` (`ReachModeSwitch`), `DependencyCanvas.tsx` (`Highlight` tiers, `EdgeLabel`, `EdgeCard`) |
| Data flow inspector rail (`I`, remembered): the route's surface counts, origins with how many sites each reaches (click lights it), the engine's gaps with locations; a selected box's kind, status, file (opens code), reach counts, frame contents (open or fold in place), flows in and out (click selects) | `client/src/viz/deps/flow/inspectorModel.ts` (pure, tested on the fixture), `FlowInspector.tsx`; mounted beside the canvas in `FlowView.tsx` |
| Anchor mode (`?view=graph&anchor=<file:l:c-l:c \| file@name:line>&dir=`): Data flow traced from an expression instead of a route; the anchor in the center, where it comes from on the left, where it goes on the right, each function a frame; Trace From / Both / To; the rail's anchor overview (type, counts, origins, terminals, evidence budget) | `client/src/navigation/location.ts` (`anchor`, `dir`, `encodeAnchor` / `parseAnchor`, `isDataFlow`), `dataflow/api.ts` (`fetchAnchorGraph`), `viz/deps/flow/anchorAdapter.ts` (regions and frames), `FlowView.tsx` (anchor fetch, toolbar), `FlowTools.tsx` (`DirectionSwitch`), `FlowInspector.tsx` (`AnchorOverviewView`: "Where the trace stops", frontiers grouped by reason in `STOP_REASONS` words, click selects), marks `anchor` / `value` / `transform` / `boundary` in `marks.ts`; the canvas titles its sides (`regionTitles` in `DependencyCanvas.tsx`); a reference that only repeats a value (each `props` before `props.x`) folds into that value (`anchorAdapter.ts:passThroughs`); a declaration anchor's parameter and return links are `structural` (found by syntax, never proven; dotted neutral stroke, walked but never lit by `reach.ts`), its prop reads come from the engine's `references` → `field-input` relations with their proof, and it reads `ok` only when every prop walk lands; a `disconnected` gap is a natural start (literal, literal constant, external import or undeclared global: no box; `facts.ts:naturalEnd`), bookkeeping (no box, no landing), a value the code ends in place (a branch test, a write or a computed key, `facts.ts:endsInPlace`: its box becomes a terminal) or a dead-end frontier that leaves the outcome partial, the same rule the ledger's boundary rows use; a declaration takes only its own function's parameters and returns (`own-facts.ts`), a component rendered at a use site ends there, a prop read no binding reaches is an `unbound-read` frontier, one element limit folds into one frontier, and every frontier is named by where it stopped (`frontier-words.ts`) |
| Trace from the code viewer: right-click a line → "Trace where it goes" / "Trace where it comes from" → the expression picker → the graph anchored there, the modal closed | `client/src/components/CodeModal/InspectMenu.tsx` (`MENU_ITEMS`), `investigation/valueFlowInspector.ts` (`InspectAction`, `onTrace`), `CodeModal.tsx` (`onTrace` → `go({anchor, dir})`) |
| Trace from a symbol box in the import graph or a scope tile in the treemap: the node menu's "Trace where it goes / comes from" anchors the graph at the symbol by name on its declaration line (a JSX scope at its tag's component); a function or component anchor shows what feeds its parameters' reads (backward) and its returns and uses (forward) | `client/src/navigation/nodeActions.ts` (`traceTo` / `traceFrom`, `tracePatch`, `symbolNameOf`), `NodeActionsMenu.tsx`, `viz/deps/DependencyView.tsx` and `components/Treemap.tsx` (`line` on the menu target); engine `anchor-graph.ts` (`identifierOnLine` fallbacks, `declarationRuns`) |
| Value-flow ledger engine ops: `selectExpression` (span → supported expressions, innermost first) and `valueFlow` (the selection's parts — fallbacks, branches, assertions, calls — then its forward evidence slice in operation order; a callee with more than one call site is a `boundary` row, `unproven-handoff`) | `engine/src/srcly/ops/value-flow.ts`; spans and candidates in `engine/src/srcly/selection.ts`; call-site counting in `engine/src/srcly/call-sites.ts`; fixtures `engine/examples/value-flow-basics/`; acceptance in `engine/test/srcly/value-flow.test.ts`; timing `engine/scripts/time-value-flow.ts` |
| `POST /api/dataflow/select`, `POST /api/dataflow/value-flow` (file must resolve inside `path`) | `server/app/routers/dataflow.py` (`select_expression`, `value_flow`); models in `services/dataflow/models.py` |
| Engine `anchorGraph {file, span \| name+line, text?, direction}`: a value's neighbourhood from any expression, not a route: the evidence slice walked backward (where it comes from), forward (where it goes) or both, as boxes grouped by the owning function; R7 boundaries, the engine's gaps as frontiers. Its slices walk value relations only (the slice query's `follow`; a structural relation still connects, never spends) at four times the engine's limits; a declaration's uses are read one relation away and the first 32 walked, the rest folded into one frontier. A slice's default work budget is its element limit plus twice its relation limit | `engine/src/srcly/ops/anchor-graph.ts`, `engine/src/srcly/anchor-slice.ts` (`movesValue`, `ANCHOR_LIMITS`, `usesOf`), box words in `anchor-words.ts`, budget in `engine/src/analysis/evidence-slice.ts`, contract `contracts/anchor-graph.ts`; shared seed and call-site helpers in `engine/src/srcly/facts.ts`; fixture `test/srcly/__fixtures__/solid-route.anchor-graph.json` (`pnpm capture-anchor-graph`), `test/srcly/anchor-graph.test.ts` |
| Code viewer: right-click → "Inspect value flow" → candidate picker → ledger rows first in the metrics rail (status per row, outcome by name), rows jump to their line, lines marked through the metric overlay and ruler | `client/src/components/CodeModal/{InspectMenu,ValueFlowLedger}.tsx`, wiring in `CodeModal.tsx` (`onCodeContextMenu`, ledger overlay); controller `client/src/investigation/valueFlowInspector.ts`; DOM caret → source column in `investigation/selectionSpan.ts` |
| Engine lifecycle tests without Node (fake engine speaking the protocol); real smoke test on solid-route | `server/tests/fake_engine.py`, `test_dataflow_engine.py`, `test_dataflow_router.py`, `test_dataflow_models.py`, `test_dataflow_smoke.py` |
| Fixture projects (Solid route, compact field proof, bad-ish Solid, Python FastAPI) | `engine/examples/` |
| Python handler routes in Data flow mode: the route summary's `handler` (name, line) opens the handler in anchor mode from the picker or a `flow=` link; Python name reads are `transparent` (walked through, not drawn) | engine `contracts/routes.ts`, `ops/routes.ts`, `ops/anchor-graph.ts` (`walk`); client `viz/deps/flow/FlowView.tsx` (`handlerOf`, `pickRoute`); helper `expr_Name` |
| Language host: what the language-neutral ops (`routes`, `selectExpression`, `valueFlow`, `anchorGraph`) ask a program besides its evidence (files, candidates, parts, identifier on a line, text, checked type, owning function, call sites, and `evidence` — whether its facts pair calls (T13) and mark real dead ends (R16)); `Tier1` is `TsTier1 \| PythonTier1`, `requireTypescript` guards the TypeScript-only ops (route graph and surface, route path, function effects, file exports, legacy report, phase profiler); engine flags `--language`, `--python` | `engine/src/srcly/host.ts`, `typescript-host.ts`, `python/host.ts`, `python/session.ts`, `session.ts`; tests `engine/test/srcly/python-session.test.ts`, server `tests/test_dataflow_availability.py`, `tests/test_dataflow_smoke.py` (FastAPI example and srcly's own server over HTTP) |
| Python evidence provider: `ast` + mypy → raw ProgramElement / ProgramRelation facts, selectable expressions with checked types, function and class scopes (a class is an entry its constructor calls relate to by `definition`), call sites, FastAPI / Flask routes (one JSON document per generation); newer syntax than the interpreter's (3.14's `except A, B:`) rewritten before parsing; loaded behind the fact index by an endpoint-map relation provider; refusals `python-not-found`, `python-checker-not-found`, `no-python-files` | `engine/python/srcly_pyfacts.py`; `engine/src/srcly/python/run.ts` (spawn, probe, named errors), `facts.ts` (wire format, `PythonRelationProvider`); fixtures `engine/examples/python-fastapi/`, `engine/examples/python-anchors/` (every def and class anchored by name); tests `engine/test/srcly/python-facts.test.ts`, `python-anchors.test.ts`; decision and numbers `docs/intent/python-dataflow/decision.md` |
| Field proof acceptance runner | `engine/scripts/accept-route-field-proof.ts` |

## Tests

| Area | Where | Run |
| --- | --- | --- |
| Backend | `server/tests/test_*.py` | `cd server && uv run pytest` |
| Client utils | `client/src/utils/*.test.ts` | `cd client && pnpm test` |
| Data-flow engine | `engine/test/**/*.test.ts` | `cd engine && pnpm test && pnpm typecheck` |
| Dependency view geometry (aspect band, box crossings, crossing baseline) | `client/src/viz/deps/*.test.ts` | `cd client && pnpm test -- viz/deps compare/graphModel` |

## Other docs

- `DESIGN.md` — visual design system.
- `docs/adding-a-metric.md` — the end-to-end checklist for a new metric.
- `scripts/bootstrap.sh`, `scripts/check.sh`, `.githooks/pre-push` — worktree setup and the local copy of CI.
- `scripts/dev-ports.sh`, `scripts/dev-server.sh` — per-worktree dev ports and the servers `.claude/launch.json` runs.
- `client/scripts/shot.mjs` (`pnpm shot`) — 2x screenshots of the running app; `data-scan-state` on the app shell in `client/src/App.tsx` is its ready signal.
- `docs/design-audits/`, `docs/analysis/` — past audits and language-analysis notes.
- `docs/prd/` — product requirement drafts.
