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
| `GET /api/dataflow/route-graph?path=&route=&expectedGeneration=` | `routers/dataflow.py:get_route_graph` | One route's render backbone (`graph`: nodes, render/handoff edges, origins, counts, gaps); 404 for an unknown route |
| `DELETE /api/dataflow?path=` | `routers/dataflow.py:close` | Close the engine for a root |
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

A metric is its analyzer plus one catalog entry; the step-by-step checklist lives in `AGENTS.md` ("Add / extend a metric").

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
| Tier-1 session (Program + identity index + lazy evidence provider + routes; never the legacy report), strict-tsconfig refusal, generation | `engine/src/srcly/session.ts`; `programHash` in `engine/src/srcly/fingerprint.ts`; TypeScript choice (D4) in `engine/src/srcly/typescript-choice.ts` |
| Engine ops (`status` on the protocol thread, `routes` in the worker) | `engine/src/srcly/ops/`; worker branches in `engine/src/service/analysis-worker.ts` |
| Op contracts (Zod) → JSON Schema for Python + client types | `engine/src/srcly/contracts/` (`registry.ts` lists them); `cd engine && pnpm emit-contracts` writes `server/app/services/dataflow/contracts/*.schema.json` and `client/src/dataflow/contract.generated.ts` |
| Cold `hello` + tier-1 timing | `engine/scripts/time-tier1.ts` |
| Engine child owned by Python: spawn, handshake, reply matching by id, progress, timeouts, cancel then kill, crash with stderr tail, registry (cap 2, 15-minute idle close) | `server/app/services/dataflow/engine.py`; closed in `main.py:lifespan`, cancelled first on SIGINT |
| Where the engine and Node come from, N/A reasons decided without spawning (`node-not-found`, `engine-missing`, `no-tsconfig`) | `server/app/services/dataflow/availability.py` (`SRCLY_NODE`, `SRCLY_ENGINE_DEV=1`) |
| Pydantic mirrors of op results, `Outcome`, N/A reasons; the emitted JSON Schemas | `server/app/services/dataflow/models.py`, `server/app/services/dataflow/contracts/*.schema.json` |
| `/api/dataflow/*` endpoints | `server/app/routers/dataflow.py` |
| Engine `routeGraph`: RouteTotality → flow nodes (route, occurrence, control, terminal, origin) and render/handoff edges; route identity aligned for `export default Page` | `engine/src/srcly/ops/route-graph.ts`, `engine/src/srcly/route-identity.ts`; fixture `engine/test/srcly/__fixtures__/solid-route.route-graph.json` (`pnpm capture-route-graph`) |
| Client data-flow API, per-root availability (start once, poll `status` every 250 ms), outcome labels | `client/src/dataflow/{api,availability,outcome}.ts`; types in `contract.generated.ts` |
| Data flow mode in the graph view (`?view=graph&flow=<route>`; Imports / Data flow switch; route picker `/`; double-click or `o` opens the node's line; Shift-click opens a folded frame) | `client/src/viz/deps/flow/FlowView.tsx`, `FlowTools.tsx`, `RoutePicker.tsx`, `FlowProgress.tsx`, `FlowLegend.tsx`; switch in `viz/deps/DependencyView.tsx`; `flow` param in `navigation/location.ts` |
| Route graph → ViewModel (frames per render parent, transparent primitives, box budget, hidden containment edges) | `client/src/viz/deps/flow/adapter.ts` (test reads the engine fixture) |
| Data flow origin selection (`field`/`dest` URL params; an origin's proven destinations light up through the canvas's hover dimming; field edges and frontier boxes from the engine's field lineage) | engine `routeGraph {route, source}` in `engine/src/srcly/ops/route-graph.ts`; client `adapter.ts` (`lit`), `FlowView.tsx` (Origin select, click an origin), `DependencyCanvas.tsx` (`highlight`) |
| Engine lifecycle tests without Node (fake engine speaking the protocol); real smoke test on solid-route | `server/tests/fake_engine.py`, `test_dataflow_engine.py`, `test_dataflow_router.py`, `test_dataflow_models.py`, `test_dataflow_smoke.py` |
| Fixture projects (Solid route, compact field proof, bad-ish Solid) | `engine/examples/` |
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
- `docs/design-audits/`, `docs/analysis/` — past audits and language-analysis notes.
- `docs/prd/` — product requirement drafts.
