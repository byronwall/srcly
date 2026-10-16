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
| Headless commands (`scan`, `report`, `hotspots`, `explain`) | `server/app/run.py` (`_run_headless`) → `server/app/services/reporting.py` |
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

### API surface

| Endpoint | Handler | Notes |
| --- | --- | --- |
| `POST /api/scans` | `routers/scans.py:start_scan` | Start (or join) a background scan; returns a progress snapshot |
| `GET /api/scans/{id}/events` | `routers/scans.py:stream_scan` | SSE stream of snapshots, ending with `complete` / `failed` / `cancelled` |
| `GET /api/scans/{id}` | `routers/scans.py:get_scan` | Snapshot (polling fallback) |
| `GET /api/scans/{id}/result` | `routers/scans.py:get_scan_result` | Node tree once complete (409 before) |
| `DELETE /api/scans/{id}` | `routers/scans.py:cancel_scan` | Cancel a scan |
| `GET /api/analysis` | `routers/analysis.py:get_analysis` | Blocking one-shot scan (kept for API users; the UI uses `/api/scans`) |
| `POST /api/analysis/refresh` | `routers/analysis.py:refresh_analysis` | Re-scan cwd root |
| `GET /api/analysis/context` | `routers/analysis.py:get_analysis_context` | Cwd + repo root with rough file counts (first-run screen) |
| `GET /api/analysis/dependencies` | `routers/analysis.py:get_dependencies` | TS/TSX import graph, tsconfig `paths` aliases |
| `GET /api/files/content` | `routers/files.py:get_file_content` | Raw file text; `ref=<sha>` reads it from a git commit (`git show`) |
| `GET /api/files/markers` | `routers/files.py:get_file_markers` → `services/markers.py` | Lines behind each metric (`{metric: [{line, end_line, note}]}`) for the code viewer overlay; `ref=` as above |
| `GET /api/compare/refs` | `routers/compare.py:list_refs` | Branches + recent commits for the compare ref picker |
| `GET /api/compare/sources?kind=prs\|worktrees\|branches` | `routers/compare.py:list_sources` → `services/compare/sources.py` | One picker section each (PRs with worktree/needs-fetch context, live worktrees newest first, branches with ahead/behind); a source that can't load returns `available: false` + reason |
| `GET /api/compare/commits?base=&head=` | `routers/compare.py:get_commits` → `git_refs.list_commits` | First-parent commits in a range, oldest first, each with its first parent (commit stepper; capped at 100) |
| `POST /api/compare/prewarm` | `routers/compare.py:prewarm` → `jobs.CompareJobManager.prewarm` | Scan one commit side in the background after running compares finish; a per-commit lock in `snapshots.load_side` stops duplicate scans |
| `POST /api/compare`, `GET /api/compare/{id}`, `GET /api/compare/{id}/result`, `DELETE /api/compare/{id}` | `routers/compare.py` → `services/compare/jobs.py` | Background compare job (polled), payload includes both trees + graphs |
| `GET /api/files/suggest` | `routers/files.py:suggest_files` | Path autocomplete for the path bar |
| Pydantic response models | `server/app/models.py` | `Node`, `Metrics`, dependency graph models |

### Metrics end-to-end

Adding a metric touches every layer; the step-by-step checklist lives in `AGENTS.md` ("Add / extend a metric").

| Layer | Where |
| --- | --- |
| Compute | language analyzer (see above) + `server/app/services/analysis_types.py` |
| API model | `server/app/models.py` (`Metrics`) |
| Copy into nodes / roll up | `server/app/services/analysis.py` (`attach_file_metrics`, `aggregate_metrics`) |
| Report scoring + definitions (risk vs neutral `direction`) | `server/app/services/reporting.py` (`METRIC_DEFINITIONS`, `PROFILE_WEIGHTS`) |
| Client metric registry (labels, groups, neutral Detail, per-file vs per-scope, languages, witnessed maxima, value formatting) | `client/src/utils/metricsStore.tsx` (`HOTSPOT_METRICS`, `WITNESSED_METRICS`, `formatMetricValue`); `utils/metricApplicability.ts` (`applicableMetrics`); `utils/explorerColumns.ts` (`witnessOf`) |
| Metric picker (Hot Spots "Rank by" + treemap "Color") | `client/src/components/MetricPicker.tsx` |
| Explorer sort/columns (incl. always-on color-metric column) | `client/src/utils/explorerColumns.ts` (`EXPLORER_COLUMNS`, `visibleExplorerColumns`) |
| Treemap color mapping | `client/src/viz/treemap/utils/colors.ts` (`TREEMAP_RAMP`, `ramp`) |

### Headless reports for agents

| Feature | Where |
| --- | --- |
| Artifact writing (`report.md`, `findings.json`, …) | `server/app/services/reporting.py` (`write_report`, `build_report_payload`) |
| Ranking (one cohort: files or functions; zeros count, N/A drops out) / findings / tree summary | `server/app/services/reporting.py` (`rank_nodes`, `cohort_nodes`, `build_findings`, `summarize_tree`) |
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
| Hot Spots ranking (Files / Functions cohort, N/A not ranked) | `client/src/utils/hotSpotRanking.ts` (`cohortNodes`, `rankHotSpots`), toggle in `Explorer.tsx` |
| N/A cells, 0 vs N/A, max-complexity witness link | `client/src/utils/explorerColumns.ts` (`metricCellText`, `metricCellTitle`, `witnessOf`); rows in `TreeNode.tsx`, `HotSpotItem.tsx`; code viewer in `CodeModal/MetricsTable.tsx`; treemap hatch in `viz/treemap/utils/colors.ts` (`TREEMAP_NA_COLOR`) |
| Column definitions, cell text/heat tint, color-metric column | `client/src/utils/explorerColumns.ts` |
| Scope bar: breadcrumb, LOC/files/fns counts, top file by color metric | `client/src/components/ExplorerScopeBar.tsx`, `client/src/utils/explorerScope.ts` |
| Filter box, empty state, grouped column picker | `client/src/components/ExplorerControls.tsx` |
| Linked hover between explorer rows / Hot Spots and treemap tiles | `client/src/utils/hoverLink.ts`; rows in `TreeNode.tsx`, `HotSpotItem.tsx`; ring in `viz/treemap/components/TreemapCanvas.tsx` |
| Sidebar collapse (`[`), rail, resize handle, saved width | `client/src/hooks/useSidebarLayout.ts`, `client/src/components/SidebarRail.tsx`; wired in `client/src/App.tsx` |
| Virtual tree rows, keyboard navigation, initial auto-expand | `client/src/components/TreeNode.tsx`, `client/src/utils/explorerTree.ts` |
| Hot spot rows | `client/src/components/HotSpotItem.tsx` |
| File-type filter popover | `client/src/components/FileTypeFilter.tsx` |

### Client: Navigation (one location for treemap + graph)

| Feature | Where |
| --- | --- |
| Location model: `?repo=&at=&view=` parse/serialize, legacy `depFocus` alias, breadcrumbs, scan-path ↔ `at`, graph-id mapping | `client/src/navigation/location.ts` |
| `at` → scan-tree node (prefix descent, bare-symbol match, nearest-ancestor fallback) | `client/src/navigation/resolveTree.ts` |
| Navigation store: `location()`, `go` (pushState), `replace`, popstate, visit history (sessionStorage mirror), graph filters that survive view toggles | `client/src/navigation/store.ts` |
| Missing-path fallback + toast, treemap/explorer zoom → `go`, `?repo=` → analyze | `client/src/App.tsx` (`resolved`, `zoomTo`, `handleFileSelect`) |
| History dropdown (last 30 places, MRU) | `client/src/navigation/HistoryMenu.tsx`, ring in `client/src/navigation/history.ts` |
| Node actions menu (Focus · Open code · Show folder; right-click in both views, hover "⋯" on graph nodes) | `client/src/navigation/NodeActionsMenu.tsx`, availability rules in `client/src/navigation/nodeActions.ts` |
| Open any location in the code viewer (scope, graph symbol, file) | `client/src/App.tsx` (`openAt`) |
| Scan state that outlives the view (data, progress, cancel, superseded-request guard) | `client/src/state/scanStore.ts` |
| Compare ⇄ normal without remount (normal view stays mounted, hidden) | `client/src/App.tsx` (`App`) |

### Client: Treemap

| Feature | Where |
| --- | --- |
| Layout, zoom, isolate/exclude, tile context menu | `client/src/components/Treemap.tsx` |
| Header toolbar (Treemap \| Graph switch, shared location breadcrumb, filter, color metric, legend) | `client/src/viz/treemap/components/TreemapHeader.tsx` |
| Canvas tile rendering + keyboard selection | `client/src/viz/treemap/components/TreemapCanvas.tsx`, `viz/treemap/utils/hitTest.ts` |
| Canvas zoom motion through a shared tile | `client/src/viz/treemap/utils/zoom.ts`, `viz/treemap/components/TreemapCanvas.tsx` |
| Tooltip | `client/src/viz/treemap/components/TreemapTooltip.tsx`, `viz/treemap/hooks/useTreemapTooltip.ts` |
| Color scales per metric (one shared `TREEMAP_RAMP`) | `client/src/viz/treemap/utils/colors.ts` |
| Scope `(body)` nodes with shared unchanged branches, path lookup | `client/src/viz/treemap/utils/tree.ts`, `viz/treemap/utils/path.ts` |
| Label text fitting | `client/src/utils/svgText.ts` |

### Client: Code viewer modal

| Feature | Where |
| --- | --- |
| Modal composition, keyboard (`/` outline, `[` `]` step hits, Esc), display controls | `client/src/components/CodeModal/CodeModal.tsx`, `CodeModalHeader.tsx` |
| Highlighted source (Shiki worker) | `client/src/components/CodeModal/CodePane.tsx`, `hooks/useHighlightedCode.ts`, `workers/highlight.worker.ts`, `utils/shikiHtml.ts` |
| Markdown rendering | `client/src/components/CodeModal/MarkdownPane.tsx`, `client/src/markdown/*` |
| Outline / go-to-symbol popover (off the breadcrumb) | `client/src/components/CodeModal/OutlinePopover.tsx`, `utils/structureTree.ts` |
| Metrics rail (left): applicable metrics, scope vs file, click to overlay | `client/src/components/CodeModal/MetricsSidebar.tsx`, `MetricsTable.tsx`; applicability in `client/src/utils/metricApplicability.ts` |
| Sticky scope breadcrumb | `client/src/components/CodeModal/StickyBreadcrumb.tsx` |
| Metric overlay: lines behind a metric (marked lines, notes, overview ruler, stepping) | `GET /api/files/markers` → `server/app/services/markers.py` (`MarkerSink`, `collect_markers`; analyzers call `_mark`); client `hooks/useMetricMarkers.ts`, `utils/metricMarkers.ts`, `CodePane.tsx` |
| File fetching | `client/src/services/fileContent.ts`, `hooks/useFileContent.ts` |
| Line-range slicing / indent reduction | `client/src/utils/lineRange.ts`, `utils/indentation.ts` |

### Client: Graph views

| Feature | Where |
| --- | --- |
| Dependency view (whole-repo graph fetched once; focus = location `at`) | `client/src/viz/deps/DependencyView.tsx`; graph contract in `viz/deps/contract.ts`, hierarchy/filters in `viz/deps/hierarchy.ts` |
| Dependency view model (focus → in / center / out boxes, roll-up to the box budget) | `client/src/viz/deps/viewModel.ts` |
| Dependency grid layout (viewport-shaped packing in `rankPackings`, channel/gutter edge routing) | `client/src/viz/deps/layout.ts` |
| Dependency hubs (targets most boxes import become shape/color badges; their edges hide until hovered) | `client/src/viz/deps/hubs.ts`; per-box link counts, cycles and badges in `viz/deps/boxInfo.ts` |
| Dependency graph canvas (four-row boxes, pastel metric tint, icon hover cards, hover, click to focus, double/middle/⌘-click to open) | `client/src/viz/deps/DependencyCanvas.tsx`, pointer logic in `viz/deps/interaction.ts` |
| Dependency graph legend (edge/box encodings, collapsible) | `client/src/viz/deps/DependencyLegend.tsx`; shared stroke constants in `viz/deps/encoding.ts` |
| Open code from the graph (graph symbol → treemap scope by name, then by line) | `App.tsx` (`openAt`) → `navigation/resolveTree.ts`; line fallback `utils/dataProcessing.ts` (`findScopeForSymbol`) |
| Dependency graph LOC + treemap color join (absPath → treemap node index, built once per scan in `Treemap.tsx`) | `client/src/viz/deps/metrics.ts` |
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

## Tests

| Area | Where | Run |
| --- | --- | --- |
| Backend | `server/tests/test_*.py` | `cd server && uv run pytest` |
| Client utils | `client/src/utils/*.test.ts` | `cd client && pnpm test` |
| Dependency view geometry (aspect band, box crossings, crossing baseline) | `client/src/viz/deps/*.test.ts` | `cd client && pnpm test -- viz/deps compare/graphModel` |

## Other docs

- `DESIGN.md` — visual design system.
- `docs/design-audits/`, `docs/analysis/` — past audits and language-analysis notes.
- `docs/prd/` — product requirement drafts.
