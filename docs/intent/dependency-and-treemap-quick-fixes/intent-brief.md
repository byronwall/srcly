---
title: "Dependency and treemap quick fixes"
slug: "dependency-and-treemap-quick-fixes"
phase: intent
status: current
last_updated: "2026-10-15"
---

# Dependency and treemap quick fixes

## My read

You said "we've got some quick fixes here to get the dependency viewer to be nice and tight". These are the odds and ends from the session: real bugs, small visual corrections, and a couple of contained reworks. Each one is independently shippable, and none needs a new layout or navigation model. The larger themes live in [dependency-graph-legibility](../dependency-graph-legibility/intent-brief.md), [unified-navigation](../unified-navigation/intent-brief.md), and [compare-ref-picker](../compare-ref-picker/intent-brief.md).

The common goal: your eye goes to the important thing first. That means dark text, monospace for code, a color ramp with punch, and a tooltip that earns its space. Opening code from anywhere should behave as well as it does from the treemap. Performance stays untouched.

## What matters most

- **Fix the bugs first:** stuck gray dimming, "No metrics available", opening the file instead of the symbol, and double-click that doesn't open.
- **Contrast and hierarchy** in the treemap.
- **Coherent metrics** in the code viewer.

## The fixes

### Bugs

1. **Everything stays gray after a click** (10:30, 10:52).
   - Cause: `hoverNode` and `hoverEdge` survive a refocus. Their DOM nodes are replaced, so `mouseleave` never fires. `activeNodes` then holds a stale id and dims everything (`client/src/viz/deps/DependencyCanvas.tsx:75-76`, `:119-142`, `:279-284`).
   - Fix: clear the hover state when the layout changes, or ignore ids the layout no longer contains.
2. **"No metrics available" and no symbol sidebar when code is opened from the graph** (7:02, 9:52).
   - Cause: `DependencyView` renders its own `CodeModal` with only `filePath` (`DependencyView.tsx:107-112`, `:200-202`). `MetricsSidebar` hides everything without a `fileNode` (`CodeModal/MetricsSidebar.tsx:22`, `:34-46`).
   - Fix: route the graph's open action through the app's modal and `findNodes` (`App.tsx:66-121`, `:353-406`). The graph's `absPath` matches the treemap's absolute `path`.
3. **Opens the whole file, not the symbol** (9:45, 10:06).
   - Cause: the symbol is dropped, and no line range is passed.
   - Fix: map `absPath` plus the symbol `line` to the treemap scope node (`${file}::${name}`), then pass its `start_line`/`end_line` and the node. Today the contract carries only a start `line` (`contract.ts:23-24`, `server/app/services/deps/graph.py:130`).
4. **Double-click to open doesn't work on neighbors** (9:59).
   - Cause: the first click refocuses and re-renders, so the second click lands elsewhere (`DependencyCanvas.tsx:294-303`).
   - Fix: delay single-click focus until the double-click window has passed, or make open a visible action. You mentioned "middle click", and no middle-click handler exists; adding `auxclick` is cheap.

### Dependency graph polish

5. **Drop the "Imported by / Focus / Imports" headers** (2:31). They "just sort of get in the way" (`DependencyCanvas.tsx:17-21`, `:157-170`, `:207-222`). Keep the file-name title when a file is the focus.
6. **Add a legend at the bottom right** (2:43–3:01). Dashed means a faint neighbor↔neighbor or internal edge (`viewModel.ts:336-338`), not type-only. A dashed box border means an external package (`DependencyCanvas.tsx:245-254`, `:318`). The legend should also cover edge thickness, meaning weight.

### Treemap visuals

7. **Make important text dark.** Folder labels are hard-coded `#888888`, and chunk labels sit at alpha 0.7 (`client/src/viz/treemap/components/TreemapCanvas.tsx:199-207`). Use `--plc-on-surface` and `--plc-on-muted` instead.
8. **Use monospace labels** to signal "code stuff" (14:22). The canvas uses the generic `sans-serif` (`TreemapCanvas.tsx:87`, `:153`). Use IBM Plex Mono (`--font-mono`, `index.css:9-18`).
9. **Fix the washed-out color.** The ramp is three pastels (`#dbeafe → #fde68a → #fecaca`), interpolated in RGB, and `brighter(depth*0.15)` lightens each level further (`viz/treemap/utils/colors.ts:14-31`). Use stronger stops, interpolate in a perceptual space, and soften the depth effect. Compare's treemap and legend reuse this ramp.
10. **Tighten the spacing slightly** ("a pixel too big"). Current values are `paddingOuter(4)`, `paddingInner(2)`, white leaf strokes, and a 20px header (`client/src/components/Treemap.tsx:200-207`, `TreemapCanvas.tsx:38-40`).
11. **Enrich the tooltip** (14:34–14:54). It wastes space today. It should show the symbols inside, a connectivity hint (fan-in and fan-out), and mono tabular numbers. The current card is in `viz/treemap/hooks/useTreemapTooltip.ts:68-121` and `components/TreemapTooltip.tsx`. `CompareTreemap`'s `HoverCard` (`plc-floating`, `plc-data-sm`, edge flip) is the pattern to copy.
12. **Toolbar popovers feel bad** (13:46, confirmed in round 1). Both the Color picker and the file filter are affected.
    - Opening one doesn't close the other. Check how the trigger's `stopPropagation` (`Popover.tsx:50-58`) interacts with the outside-click handler (`:88-102`).
    - They feel jumpy or "off". The content renders at 0,0 for a frame before rAF positions it (`:36`, `:69-85`), and it has no flip or clamp on the right or bottom (`:82`).
    - Polish them with `emil-design-eng` guidance on origin-aware motion and open/close behavior.
    - The Color picker is also a multi-select where only the first metric colors the map (`MetricPicker.tsx:42-49`, `:106-113`; `Treemap.tsx:66`).

### Code viewer

13. **Rework the metrics panel into a coherent display** (15:22). Every one of 22 metrics prints for scope and file, including TSX metrics on Python and zeros everywhere (`CodeModal/MetricsSection.tsx:12-21`; `server/app/models.py:4-46` defaults to 0). The server already records which language and scope each metric applies to (`server/app/services/reporting.py:21-59`), but the client never receives that data. Show the applicable metrics, grouped, with the scope value against the file value. Keep the code pane as it is ("all of that's really good").

## Boundaries

- No change to scan, cache, or graph-build cost.
- Each fix ships alone and gets a test where the logic branches: the hover reset, symbol lookup, click timing, and metric applicability.
- Compare views pick up the ramp and font changes. Check them, don't fork them.

## What seems settled

- Bugs 1–4 come first, and the code pane in the viewer stays as it is.
- Both toolbar popovers get the open/close and positioning fix (round 1).

## Possibilities, not decisions

- Monospace may only suit file and symbol labels, with folder headers staying sans. Check this on screen.
## Next step after confirmation

Fix bugs 1–4 together as one PR, since they share the graph-open path. Then make the treemap visual pass (7–11) as one PR with before/after screenshots on modeler.
