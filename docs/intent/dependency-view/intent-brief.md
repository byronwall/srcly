---
title: "Multi-scale dependency view"
slug: "dependency-view"
phase: intent
status: current
last_updated: "2026-10-14"
---

# Multi-scale dependency view

## My read

You want to explore a codebase and understand how its parts interconnect, in both TypeScript and Python. Today the view is a single tangled file graph. The replacement should scale with attention. From far away it shows folders or modules joined by a few thick aggregate edges that tell the broad story. When you drill into something, it becomes the focus: it opens up into its symbols, and exact edges connect it to the specific functions that use it and the things it uses. The scope is **immediate seams** (direct, one-hop dependencies). Call chains and multi-hop flows are later work.

## What matters most

- **No spaghetti at any level.** Aggregate edges when zoomed out, and split them into real edges only when you drill in.
- **Accuracy at the focus.** The focus shows its symbols, and edges reach the actual using function on the other side, not just the importing file.
- **Visual discipline.** Uniform boxes, clean labels, orthogonal edges that never pass through a node, as few crossings as possible, and edges sharing a path bundled within 1–2px.
- **Use the screen.** About 30–50 boxes, packed to the screen's aspect ratio instead of three thin columns of empty space.

## The experience you want

1. The view opens on the treemap's current selection, or at the repo's top-level folders. Grouping follows folders and module boundaries, with aggregate edges between them.
2. Clicking a folder drills in: it expands, becomes the focus, and its bundled edges split. Breadcrumbs go back out. Scrolling only magnifies.
3. A focused view flows left to right. Incoming code (things that depend on the focus) is on the left, the focus is in the middle, and outgoing code (things it depends on) is on the right. Each side spreads into as many layers as its own interconnections need. For example, if dependent A imports dependent B, A sits further left. Everything is still one hop from the focus. A single focus node takes only a narrow column.
4. The focus expands into symbols. On the other side, edges land on the function that uses each symbol (`Explorer.tsx › SortHeader()` → `HOTSPOT_METRICS`) when there's room. Otherwise they stay bundled at file level.
5. Edges between neighbors that don't touch the focus are drawn faintly.
6. Folder roll-up and condensing happen only when a side still won't fit.
7. Clicking any node recenters the graph on it.

## Boundaries

### Must be true

- Edges are rectilinear, never cross a node box, and are bundled when they share a path.
- All boxes are the same size. Text never sets the box width.
- Hidden or collapsed by default: external packages, tests, and type-only imports (TS `import type` and Python `TYPE_CHECKING`). Barrel/`__init__` re-exports pass through to the file that defines the symbol.
- TypeScript and Python reach parity, including symbol-level usage.
- Fast on repos of about 2k files. The graph is built once and cached.

### Must be avoided

- A whole-repo flat graph, or 100 real edges where one aggregate edge would do.
- Holding to a rigid three-column grid that wastes the screen.
- Edges routed through boxes, or fanned out and unbundled.

## What seems settled

- Grouping follows folders and module boundaries, not automatic clustering.
- Detail changes with click-to-drill, not continuous semantic zoom.
- The focus comes from the treemap selection or a click in the graph.
- The order of proof is (1) layout and routing on today's TS data, (2) Python resolution, (3) symbol-level usage.

## Later, but don't preclude

- A **symbol-focused explorer**: search and list symbols, perhaps surfacing popular or heavily used ones. The treemap can't offer this. The graph's data model should treat symbols as nodes from the start so this view can reuse it.
- Multi-hop flows and call-chain rendering.

## Current reality that matters

- **Python has no dependency graph.** `/api/analysis/dependencies` (`server/app/routers/analysis.py`) only walks `.ts/.tsx` files. The Python analyzer only counts imports.
- **TS resolution is partial.** It handles relative imports and the *first* tsconfig `paths` it finds. It skips `.js/.jsx`, ignores barrels and `export *`, and doesn't distinguish type-only imports. Externals are keyed by full import string, not by package.
- **There is no hierarchy or usage data.** The graph holds flat files plus export nodes, with no folders, no aggregate edges, and no record of which function uses an import. Edge direction is also inconsistent: file edges point importer→imported, while export edges point export→importer.
- **The client can't deliver the routing goals.** `DependencyGraph.tsx` (about 2k lines) runs one ELK layered layout over everything and hides hubs behind letter-coded "super nodes". It moves export pills *after* layout, so routed edges no longer line up with their boxes. Box sizes come from the labels.
- Nothing is cached. The graph is rebuilt on every request.

## Next step after confirmation

Shape: choose the layout and routing approach (packed layered sides, orthogonal routing with bundling, node avoidance) and the hierarchical graph contract. Prove it first on today's TS data.
