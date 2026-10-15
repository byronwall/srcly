---
title: "Dependency and treemap quick fixes — implementation plan"
slug: "dependency-and-treemap-quick-fixes"
phase: plan
status: current
last_updated: "2026-10-15"
---

# Dependency and treemap quick fixes — implementation plan

## Plan at a glance

There are five milestones, one PR each. A goes first because it fixes the bugs and changes the code path that unified-navigation builds on. C, D and E share no files with A or B, so they can run in parallel worktrees from the start. B waits for A because both edit `DependencyCanvas.tsx`.

**Pushback:**
- The shape hoped to match graph symbols to treemap scopes by `file::name`. The code says no. Treemap scope names decorate classes and types (Python `(class) Foo`, TS `Foo (class)`, `X (interface)`), while graph symbols use the bare name and only list top-level declarations. A therefore matches by line inside the file's scope list and uses a normalized name to break ties. It stays client-only.
- The client has no component-test library, only pure-function Vitest tests. Each fix pulls its branching logic into a pure function that a test can cover:
  - `staleHover`
  - `findScopeForSymbol`
  - a click-intent timer
  - `applicableMetrics`

## Implementation strategy

- **First proof:** milestone A. Open a symbol from the graph and it lands scoped, with the sidebar and metrics. A drill leaves nothing gray.
- **Primary seam:** client only. No server, cache or contract change in any milestone.
- **Fast local loop:** `cd client && pnpm test`. For browser checks, run `./dev.sh` with the server started in the repo under test (`srcly` on itself, then modeler by hand).
- **Local dependencies:** none beyond the dev server.
- **Live confirmation:** manual before/after on modeler. Screenshots go in the PR description only, never committed, because srcly is public.
- **Rollout and rollback:** each milestone is a separate revertable PR.

## Milestone 1: (A) Opening from the graph works like opening from the treemap

- **Change: hover reset** (`client/src/viz/deps/DependencyCanvas.tsx:75-142`)
  - Clear `hoverNode` and `hoverEdge` in an effect on `props.layout`, and in the node `onClick`.
  - `activeNodes` and `activeEdges` ignore ids that are not in the current layout, via a pure `liveHover(layout, id)`.
  - Test: given a stale id, `activeNodes` returns null.
- **Change: click intent** (`DependencyCanvas.tsx:294-303`)
  - A single click focuses after about 220ms unless a second click arrives, in which case it opens.
  - `auxclick` with button 1 (middle) and ⌘/Ctrl-click open immediately.
  - Update the tooltip hint (`:384`) to "Click to focus · double-click or middle-click to open".
  - Test: a pure timer state machine.
- **Change: one CodeModal**
  - `DependencyView` gains an `onOpenFile(absPath, line?)` prop, passed `Treemap.tsx:250-255` → `App.handleFileFromTreemap`.
  - Remove the local `CodeModal` and the `openFile` signal (`DependencyView.tsx:55`, `:107-112`, `:200-202`).
- **Change: symbol → scope** (`client/src/utils/dataProcessing.ts`, next to `findNodes`)
  - `findScopeForSymbol(fileNode, name, line)` picks the scope whose `start_line` is closest to `line` (within ±3, so decorators and const declarators are covered). It prefers a normalized-name match, stripping `(class)`, `(async)`, `(interface)` and `(type)`.
  - On a hit, pass `start_line`/`end_line` and the node. On a miss, open the file at `line` with full file metrics.
  - Tests:
    - a Python class and a decorated function;
    - a TS `const Foo = () =>` and an interface;
    - duplicate names, and a miss.

### Desired end state

- On modeler, double-clicking `pipeline.py › run_pipeline` (or middle-clicking) opens the code viewer on that function, with the left symbol tree and both metric sections.
- After drilling into any node with the mouse held still, no node is dimmed.
- `pnpm test` is green.

## Milestone 2: (B) The graph explains itself

Starts after A merges.

- **Change: headers** (`DependencyCanvas.tsx:17-21`, `:157-170`, `:207-222`)
  - Drop the side headers. Keep the accent title when the focus is a file group.
- **Change: legend** (new `DependencyLegend.tsx`, absolutely positioned bottom-right in the graph host, `DependencyView.tsx:172`)
  - It shows four swatches drawn with the same stroke constants as the canvas: import, context (dashed), weight (thick), external (dashed box).
  - It can be collapsed, and the collapsed state is remembered in localStorage inside a try/catch.

### Desired end state

- No headers appear in any focus view, and the legend explains every visual encoding the graph uses.

## Milestone 3: (C) The treemap draws the eye

Parallel from the start.

- **Change: label color and font** (`client/src/viz/treemap/components/TreemapCanvas.tsx:65-90`, `:153`, `:199-207`)
  - Folder labels use `--plc-on-surface`, read once from computed style. Chunk labels lose their 0.7 alpha.
  - The font becomes `"IBM Plex Mono"` for file and chunk labels. Folder headers stay Inter, then evaluate on screen.
- **Change: ramp** (`client/src/viz/treemap/utils/colors.ts:14-31`)
  - Stronger stops, for example blue-200 → amber-300 → red-400, interpolated in HCL with `d3.interpolateHcl`.
  - Depth brightening drops from 0.15 to about 0.05 per level.
  - The legend gradient (`TreemapHeader.tsx:116-131`) and compare treemap follow automatically. Check the compare view by hand.
- **Change: spacing** (`client/src/components/Treemap.tsx:200-207`): use `paddingOuter(3)` and `paddingInner(1)`. Check that labels still clear the 20px header.
- **Change: tooltip** (`viz/treemap/hooks/useTreemapTooltip.ts:68-121`, `components/TreemapTooltip.tsx`)
  - Restyle with the `plc-floating` and `plc-data-sm` columns.
  - Show the top 5 child scopes by LOC, and `ts_import_coupling_count` or `python_import_count` as "imports".
  - Flip at viewport edges, as in `compare/CompareTreemap.tsx:172+`.
  - Extend `useTreemapTooltip.test.ts` for the symbol list.
- **Test:** a contrast check (WCAG ≥ 4.5:1) for label color against each ramp stop.

### Desired end state

- On modeler `model_making`, labels are dark and monospace, hot files stand out without looking muddy, and the tooltip lists the file's biggest functions.

## Milestone 4: (D) Popovers behave

Parallel from the start.

- **Change: single open** (`client/src/components/Popover.tsx`)
  - A module-level `openPopoverId` signal. Opening one popover sets it, and every other popover closes when it changes.
  - This removes the reliance on the outside-click capture race (`:50-58`, `:88-102`).
- **Change: positioning**
  - Render hidden (`visibility: hidden`), measure synchronously, then show. No 0,0 flash (`:36`, `:69-85`).
  - Flip and clamp on all four edges (`:82`).
- **Change: motion.** A 120ms scale 0.97 → 1 plus opacity transition from the trigger-side origin, following `emil-design-eng`. Under `prefers-reduced-motion`, no motion.

### Desired end state

- Opening the file filter while the Color picker is open closes the Color picker.
- Neither popover flashes or jumps, by hand in Chrome on modeler.

## Milestone 5: (E) A coherent code-viewer metrics panel

Parallel from the start.

- **Change: applicability** (`client/src/utils/metricsStore.tsx:32-73`)
  - Add `scope: "file" | "any"` to each metric (for example `python_import_count`, `file_size` and `ts_import_coupling_count` are file-only).
  - Add a pure `applicableMetrics(path, isScope)` that uses the existing `group` plus the file extension.
  - Test it for Python, TSX, Markdown, and scope vs file.
- **Change: one table** (`client/src/components/CodeModal/MetricsSidebar.tsx:34-46`, `MetricsSection.tsx:12-21`)
  - Replace the two long lists with grouped rows (Size · Complexity · Language): metric | scope | file. Zeros show only for applicable metrics.

### Desired end state

- A Python function shows about 10 relevant rows with scope and file values side by side, and no TSX or Markdown rows.

## Open decisions and spikes

- **Folder header font.** Decide whether folder headers go monospace too, after seeing C on modeler. If it is unclear, keep them Inter.

## Below the cut line

- Splitting the color metric into its own single-select, apart from Hot Spots.
- Edge legend entries for type-only edges. They aren't visually distinct today.
- Sending server metric definitions to the client.
