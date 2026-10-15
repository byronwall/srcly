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
                                                   ├─ walk + .gitignore filtering
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
| Ignore rules: built-in dirs/files/extensions | `server/app/config.py` |
| Ignore rules: nested `.gitignore` translation | `server/app/services/analysis.py` (`_load_gitignore_spec`, `_translate_gitignore_pattern`) |
| Worker pool: reuse, hard per-file timeouts, crash recovery | `server/app/services/scan_workers.py` (`run_file_analyses`), wrapped by `analysis.py` (`_run_file_analyses_with_hard_timeouts`) |
| Scan cancellation (`CancelToken`, `ScanCancelled`, `cancel_all_scans`) | `server/app/services/scan_workers.py` |
| Scan progress hooks (`ScanObserver`) | `server/app/services/scan_progress.py`; called from `analysis.py` |
| Background scan jobs, progress snapshots, dedupe by path | `server/app/services/scan_jobs.py` (`ScanJob`, `ScanJobManager`) |
| Language dispatch by extension | `server/app/services/analysis.py` (`analyze_single_file`) |
| TypeScript / TSX metrics + nested scopes | `server/app/services/typescript/typescript_analysis.py` |
| Python metrics | `server/app/services/python/python_analysis.py` |
| CSS / SCSS metrics | `server/app/services/css/css_analysis.py` |
| Markdown metrics | `server/app/services/markdown/markdown_analysis.py` |
| Jupyter notebook metrics | `server/app/services/ipynb/ipynb_analysis.py` |
| Everything else (generic) | `lizard.analyze_file` fallback in `analyze_single_file` |
| Analyzer result dataclasses | `server/app/services/analysis_types.py` |
| Folder rollups of metrics | `server/app/services/analysis.py` (`aggregate_metrics`) |
| Function/scope → Node conversion, `(body)` nodes | `server/app/services/analysis.py` (`attach_file_metrics`) |
| Result cache (currently a no-op stub) | `server/app/services/cache.py` |

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
| `GET /api/files/content` | `routers/files.py:get_file_content` | Raw file text |
| `GET /api/files/suggest` | `routers/files.py:suggest_files` | Path autocomplete for the path bar |
| Pydantic response models | `server/app/models.py` | `Node`, `Metrics`, dependency graph models |

### Metrics end-to-end

Adding a metric touches every layer; the step-by-step checklist lives in `AGENTS.md` ("Add / extend a metric").

| Layer | Where |
| --- | --- |
| Compute | language analyzer (see above) + `server/app/services/analysis_types.py` |
| API model | `server/app/models.py` (`Metrics`) |
| Copy into nodes / roll up | `server/app/services/analysis.py` (`attach_file_metrics`, `aggregate_metrics`) |
| Report scoring + definitions | `server/app/services/reporting.py` (`METRIC_DEFINITIONS`, `PROFILE_WEIGHTS`) |
| Client metric registry (labels, groups, value formatting) | `client/src/utils/metricsStore.tsx` (`HOTSPOT_METRICS`, `formatMetricValue`) |
| Metric picker (Hot Spots "Rank by" + treemap "Color") | `client/src/components/MetricPicker.tsx` |
| Explorer sort/columns | `client/src/components/Explorer.tsx` (`SORT_FIELD_ACCESSORS`) |
| Treemap color mapping | `client/src/viz/treemap/utils/colors.ts` (`TREEMAP_RAMP`, `ramp`) |

### Headless reports for agents

| Feature | Where |
| --- | --- |
| Artifact writing (`report.md`, `findings.json`, …) | `server/app/services/reporting.py` (`write_report`, `build_report_payload`) |
| Ranking / findings / tree summary | `server/app/services/reporting.py` (`rank_nodes`, `build_findings`, `summarize_tree`) |
| Agent skill shipped with the repo | `skills/srcly-code-quality/SKILL.md` |

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
| Tree / Hot Spots tabs, columns, sorting, filter box | `client/src/components/Explorer.tsx` |
| Virtual tree rows + keyboard navigation | `client/src/components/TreeNode.tsx`, `client/src/utils/explorerTree.ts` |
| Hot spot rows | `client/src/components/HotSpotItem.tsx` |
| File-type filter popover | `client/src/components/FileTypeFilter.tsx` |

### Client: Treemap

| Feature | Where |
| --- | --- |
| Layout, zoom, isolate/exclude, view switching | `client/src/components/Treemap.tsx` |
| Header toolbar (breadcrumb, filter, color metric, legend) | `client/src/viz/treemap/components/TreemapHeader.tsx` |
| Canvas tile rendering + keyboard selection | `client/src/viz/treemap/components/TreemapCanvas.tsx`, `viz/treemap/utils/hitTest.ts` |
| Canvas zoom motion through a shared tile | `client/src/viz/treemap/utils/zoom.ts`, `viz/treemap/components/TreemapCanvas.tsx` |
| Tooltip | `client/src/viz/treemap/components/TreemapTooltip.tsx`, `viz/treemap/hooks/useTreemapTooltip.ts` |
| Color scales per metric (one shared `TREEMAP_RAMP`) | `client/src/viz/treemap/utils/colors.ts` |
| Scope `(body)` nodes with shared unchanged branches, path lookup | `client/src/viz/treemap/utils/tree.ts`, `viz/treemap/utils/path.ts` |
| Label text fitting | `client/src/utils/svgText.ts` |

### Client: Code viewer modal

| Feature | Where |
| --- | --- |
| Modal composition + display controls | `client/src/components/CodeModal/CodeModal.tsx`, `CodeModalHeader.tsx` |
| Highlighted source (Shiki worker) | `client/src/components/CodeModal/CodePane.tsx`, `hooks/useHighlightedCode.ts`, `workers/highlight.worker.ts`, `utils/shikiHtml.ts` |
| Markdown rendering | `client/src/components/CodeModal/MarkdownPane.tsx`, `client/src/markdown/*` |
| Structure tree (left) | `client/src/components/CodeModal/StructurePanel.tsx`, `SidebarTree.tsx`, `utils/structureTree.ts` |
| Scope metrics (left, bottom) | `client/src/components/CodeModal/MetricsSidebar.tsx`, `MetricsSection.tsx`, `MetricItem.tsx` |
| Sticky scope breadcrumb | `client/src/components/CodeModal/StickyBreadcrumb.tsx` |
| File fetching | `client/src/services/fileContent.ts`, `hooks/useFileContent.ts` |
| Line-range slicing / indent reduction | `client/src/utils/lineRange.ts`, `utils/indentation.ts` |

### Client: Graph views

| Feature | Where |
| --- | --- |
| Dependency graph (ELK worker + force-layout worker) | `client/src/components/DependencyGraph.tsx`, `client/src/workers/dependencyForce.worker.ts` |

### Client: UI primitives

| Primitive | Where |
| --- | --- |
| Button, IconButton, TextInput, CheckboxRow | `client/src/components/ui/*` |
| Popover (behavior) + PopoverPanel (styling) | `client/src/components/Popover.tsx`, `components/ui/PopoverPanel.tsx` |
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

## Other docs

- `DESIGN.md` — visual design system.
- `docs/design-audits/`, `docs/analysis/` — past audits and language-analysis notes.
- `docs/prd/` — product requirement drafts.
