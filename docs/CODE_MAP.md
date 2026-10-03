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
          ── GET /api/analysis?path=   ──► routers/analysis.py:get_analysis
                                              └─ services/analysis.py:scan_codebase
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
| `GET /api/analysis` | `routers/analysis.py:get_analysis` | Full Node tree for a path |
| `POST /api/analysis/refresh` | `routers/analysis.py:refresh_analysis` | Re-scan cwd root |
| `GET /api/analysis/context` | `routers/analysis.py:get_analysis_context` | Cwd + repo root with rough file counts (first-run screen) |
| `GET /api/analysis/dependencies` | `routers/analysis.py:get_dependencies` | TS/TSX import graph, tsconfig `paths` aliases |
| `GET /api/analysis/data-flow` | `routers/analysis.py:get_data_flow` → `services/data_flow_analysis.py` | Per-file variable def/use graph |
| `POST /api/analysis/focus/overlay` | `routers/analysis.py:get_focus_overlay` → `services/focus_overlay.py` | Identifier provenance tokens for code viewer |
| `POST /api/analysis/focus/scope-graph` | `routers/analysis.py:get_scope_graph` → `services/focus_overlay.py` | Nested scope graph for Scope Flow pane |
| `GET /api/files/content` | `routers/files.py:get_file_content` | Raw file text |
| `GET /api/files/suggest` | `routers/files.py:suggest_files` | Path autocomplete for the path bar |
| Pydantic response models | `server/app/models.py` | `Node`, `Metrics`, graph + overlay models |

### Metrics end-to-end

Adding a metric touches every layer; the step-by-step checklist lives in `AGENTS.md` ("Add / extend a metric").

| Layer | Where |
| --- | --- |
| Compute | language analyzer (see above) + `server/app/services/analysis_types.py` |
| API model | `server/app/models.py` (`Metrics`) |
| Copy into nodes / roll up | `server/app/services/analysis.py` (`attach_file_metrics`, `aggregate_metrics`) |
| Report scoring + definitions | `server/app/services/reporting.py` (`METRIC_DEFINITIONS`, `PROFILE_WEIGHTS`) |
| Client metric registry (labels, colors, hotspot ids) | `client/src/utils/metricsStore.tsx` (`HOTSPOT_METRICS`) |
| Explorer sort/columns | `client/src/components/Explorer.tsx` (`SORT_FIELD_ACCESSORS`) |
| Treemap color mapping | `client/src/viz/treemap/utils/colors.ts` |

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
| App shell, analysis fetch, loading/empty/error states | `client/src/App.tsx` |
| Path bar with autocomplete + recent paths | `client/src/components/FilePicker.tsx` |
| Loading / empty / error primitives | `client/src/components/feedback/States.tsx` |
| Toasts | `client/src/components/Toast.tsx` |
| Global metric + exclusion state (context) | `client/src/utils/metricsStore.tsx` |
| Tree filtering / noise removal | `client/src/utils/dataProcessing.ts` |

### Client: Explorer sidebar

| Feature | Where |
| --- | --- |
| Tree / Hot Spots tabs, columns, sorting, filter box | `client/src/components/Explorer.tsx` |
| Tree rows | `client/src/components/TreeNode.tsx` |
| Hot spot rows | `client/src/components/HotSpotItem.tsx` |
| File-type filter popover | `client/src/components/FileTypeFilter.tsx` |

### Client: Treemap

| Feature | Where |
| --- | --- |
| Layout, zoom, isolate/exclude, view switching | `client/src/components/Treemap.tsx` |
| Header toolbar (breadcrumb, filter, color metric, legend) | `client/src/viz/treemap/components/TreemapHeader.tsx` |
| SVG rendering of rectangles + labels | `client/src/viz/treemap/components/TreemapSvg.tsx` |
| Tooltip | `client/src/viz/treemap/components/TreemapTooltip.tsx`, `viz/treemap/hooks/useTreemapTooltip.ts` |
| Color scales per metric | `client/src/viz/treemap/utils/colors.ts` |
| Scope `(body)` dummy nodes, path lookup | `client/src/viz/treemap/utils/tree.ts`, `viz/treemap/utils/path.ts` |
| Label text fitting | `client/src/utils/svgText.ts` |

### Client: Code viewer modal

| Feature | Where |
| --- | --- |
| Modal composition + toggles (reduce indent, data flow, scope flow) | `client/src/components/CodeModal/CodeModal.tsx`, `CodeModalHeader.tsx` |
| Highlighted source (Shiki) | `client/src/components/CodeModal/CodePane.tsx`, `hooks/useHighlightedCode.ts`, `utils/shikiHtml.ts` |
| Markdown rendering | `client/src/components/CodeModal/MarkdownPane.tsx`, `client/src/markdown/*` |
| Structure tree (left) | `client/src/components/CodeModal/StructurePanel.tsx`, `SidebarTree.tsx`, `utils/structureTree.ts` |
| Scope metrics (left, bottom) | `client/src/components/CodeModal/MetricsSidebar.tsx`, `MetricsSection.tsx`, `MetricItem.tsx` |
| Sticky scope breadcrumb | `client/src/components/CodeModal/StickyBreadcrumb.tsx` |
| Data-flow identifier overlay + tooltips | `client/src/components/FlowOverlayCode.tsx`, `FlowTooltip.tsx`, `utils/flowDecorations.ts` |
| Scope Flow pane | `client/src/components/CodeModal/ScopeFlowPane.tsx` |
| File fetching | `client/src/services/fileContent.ts`, `hooks/useFileContent.ts` |
| Line-range slicing / indent reduction | `client/src/utils/lineRange.ts`, `utils/indentation.ts` |

### Client: Graph views

| Feature | Where |
| --- | --- |
| Dependency graph (ELK layout) | `client/src/components/DependencyGraph.tsx` |
| Data flow graph | `client/src/components/DataFlowViz.tsx` |

### Client: UI primitives

| Primitive | Where |
| --- | --- |
| Button, IconButton, TextInput, CheckboxRow | `client/src/components/ui/*` |
| Popover (behavior) + PopoverPanel (styling) | `client/src/components/Popover.tsx`, `components/ui/PopoverPanel.tsx` |
| Dialog shell | `client/src/components/dialog/DialogShell.tsx` |
| Panel header | `client/src/components/layout/PanelHeader.tsx` |
| Class join helper | `client/src/components/ui/classes.ts` |
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
