---
title: "Multi-scale dependency view — implementation plan"
slug: "dependency-view"
phase: plan
status: current
last_updated: "2026-10-14"
---

# Multi-scale dependency view — implementation plan

## Plan at a glance

The riskiest part is the drawing, not the data. If the view can't produce orthogonal, bundled, box-avoiding layouts in ≤50-box focus views, better import resolution won't help. So Milestone 1 builds the whole new client pipeline on the TS `/dependencies` payload we already have, as fixture JSON, and treats routing quality as automated geometry tests rather than eyeballing. Only then does the server change, in three steps that each add one unknown: a language-neutral hierarchical contract with full TS resolution, then Python, then symbol-level usage. The old `DependencyGraph.tsx` stays behind a toggle until the new view reaches parity, then it's deleted.

Pushback against the obvious route:
- Don't fix the 2,000-line component in place. Its post-layout repositioning and super-node hacks are the problem.
- Don't start with Python. Python resolution is tractable work. Routing quality is the unknown that could change the architecture.

## Implementation strategy

- **First proof:** On the srcly repo, the new view shows a folder overview and a three-sided focus on `metricsStore.tsx`, with 0 edges crossing boxes.
- **Primary seams:**
  - `GraphContract` (the finest-level hierarchical graph) feeds the client view model.
  - `layoutView(viewModel) → positioned geometry` hides the layout engine behind one function.
- **Fast local loop:** `pnpm --dir client test -- deps` runs pure-function tests (roll-up, budget, layout, geometry checks) against checked-in fixture JSON. `cd server && uv run pytest -k dependency_graph` covers the server.
- **Local dependencies:** none; the layout is our own code. The fixtures are captured from srcly itself plus small synthetic repos under `server/tests/fixtures/`.
- **Visual confirmation:** screenshots of the running app at the overview and both focus fixtures, at 1440 and 1024 px wide.
- **Rollout and rollback:** a "New dependency view" toggle in `TreemapHeader`. The old component and the `/dependencies` endpoint stay untouched until Milestone 5.

## Milestone 1: New focus view renders today's TS data with clean routing

This proves the layout and routing core and the multi-scale interaction. It deliberately excludes new backend data. Symbols, Python, and edge flags come later.

- **Change — client view-model module (`client/src/viz/deps/`)**
  - `hierarchy.ts`: derive the folder → file tree from file-node paths, collapsing single-child folder chains.
  - `viewModel.ts`: given a focus and a budget, choose visible nodes. The focus goes in the center, 1-hop incoming nodes on the left and outgoing on the right. Neighbors that don't fit roll up to their nearest folder, and aggregate edges carry a count.
  - Vitest on fixtures: no visible node is both itself and an ancestor; every real edge maps to exactly one visible edge; the box count stays within budget.
- **Change — layout and routing (`layout.ts`, `bundle.ts`)**
  - A custom grid + channel layout (decided in the spike below): uniform boxes in globally aligned rows, regions folded into columns to fit the viewport, edges routed only through channels between columns and gutters between rows, shared tracks bundled.
  - Partitioning puts incoming layers, then the focus, then outgoing layers in order, and each side layers by its own internal edges.
  - Routing is orthogonal with `mergeEdges`.
  - A post-pass offsets coincident segments 1–2px. Nodes are never moved after layout.
  - `geometry.ts` checks feed the tests: edge-segment/box intersections must be 0, plus the crossing count and the aspect-fill ratio.
- **Change — `DependencyView.tsx` behind a toggle**
  - Uniform boxes with truncated labels and a hover tooltip, faint neighbor↔neighbor edges, and count badges on aggregate edges.
  - Click to drill or recenter, breadcrumbs, and pan/zoom that only magnifies.
  - The initial focus comes from `currentRoot().path`.
- **Spike — is ELK good enough? (resolved: no — custom layout)**
  - ELK layered (partitions, Coffman–Graham, mergeEdges) never crossed boxes, but tuning packing and bundling turned into endless parameter fiddling; aspect fit and trunk bundling were not controllable.
  - Replaced with `layout.ts`: grid columns per region with depth layering folded to the viewport, barycenter row ordering, channel/gutter routing with crossing-cost track ordering, and 1–2px bundle offsets. Zero box crossings holds by construction and is still asserted in tests; layout runs in ~1–10ms.

### Desired end state

- The toggle shows the new view on srcly. The overview and focus views stay under 50 boxes and read left to right.
- Geometry tests pass with 0 node crossings on all fixtures.
- The spike decision is recorded in the initiative map.

## Milestone 2: Language-neutral graph contract with full TS resolution

- **Change — `GET /api/analysis/dependency-graph`**
  - Pydantic models in `server/app/models.py` cover hierarchy nodes (folder, file, symbol) and finest edges with `kind` flags: `type_only`, `test`, `external`, and `via_barrel`. Edges always point importer → imported.
  - Cached through `app/services/cache.py`, keyed like the analysis cache.
- **Change — TS extractor (`server/app/services/deps/typescript.py`)**
  - Merge the duplicate tsconfig helpers from `routers/analysis.py` and `focus_overlay.py`.
  - Cover all tsconfig `paths` entries and `.js/.jsx/.mjs` files.
  - Follow `export *` and named re-exports through barrels to the file that defines the symbol.
  - Detect `import type`, key externals by package name, and classify test files by path or name convention.
  - Pytest fixtures cover each case.
- **Change — client consumes the contract**
  - Default filters hide externals, tests, and type-only imports, with UI to toggle them back on.

### Desired end state

- The new view runs on the new endpoint, and barrel imports land on the file that defines the symbol.
- All M1 geometry tests still pass when run on contract-shaped fixtures.

## Milestone 3: Python fills the same contract

- **Change — Python extractor (`server/app/services/deps/python.py`)**
  - Detect package roots: `pyproject` and `setup.cfg` package dirs, `src/` layouts, `__init__.py` chains, and top-level modules.
  - Resolve relative imports and absolute imports into repo modules.
  - For `from pkg import name`, decide whether `name` is a submodule or a symbol.
  - Pass `__init__` re-exports through to the defining module, flag `TYPE_CHECKING` blocks as `type_only`, and treat `conftest`, `test_*`, and `tests/` as test code.
  - Pytest covers a synthetic repo with each layout, plus srcly's `server/` as a real-world check.

### Desired end state

- The dependency view on `server/` shows `routers → services → models` seams with correct aggregate counts.

## Milestone 4: Focus expands into symbols with function-level usage

- **Change — symbol edges in the contract**
  - Add symbol nodes and edges from the using function to the imported symbol.
  - TS reuses the scope and usage resolution in `focus_overlay.FocusAnalyzer`. Python gets an equivalent tree-sitter scope walk that handles `import x` with `x.attr` access and aliases.
- **Change — the view**
  - A focused file expands into symbol rows.
  - The other side shows using functions while the budget allows, otherwise it falls back to file boxes with bundled edges.
  - Test on the `metricsStore.tsx` fixture, where `Explorer.tsx › SortHeader()` → `HOTSPOT_METRICS` appears.

### Desired end state

- Symbol-level focus works for both languages, with the M1 geometry checks still passing.

## Milestone 5: Retire the old view

- **Change** — Make the new view the default, then delete `DependencyGraph.tsx`, the toggle, and the old `/dependencies` route, after checking the CLI reports don't use them.

### Desired end state

- One dependency view, and no dead code.

## Open decisions and spikes

- **Python package-root detection:** if heuristics misfire on unusual layouts, the fallback is a `srcly` config entry listing roots. Decide after the M3 fixtures.

## Below the cut line

- Symbol explorer and search for popular symbols. The contract keeps symbols as first-class nodes so this view can reuse it later.
- Multi-hop flows, call chains, and continuous semantic zoom.
- Incremental indexing for 10k+ file repos.
- Cross-language edges (TS → Python API calls) and CSS imports.
- Animated transitions and storing the focus in the URL.
