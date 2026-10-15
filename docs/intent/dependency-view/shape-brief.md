---
title: "Multi-scale dependency view — shape brief"
slug: "dependency-view"
phase: shape
status: current
last_updated: "2026-10-14"
---

# Multi-scale dependency view — what we are adding

**Outcome:** You can explore how any part of a TS or Python codebase connects to the rest. You start from a folder overview with a few aggregate edges and drill into exact symbol-level seams, without ever seeing spaghetti.

**Primary flow:** Open from the treemap selection → folder overview → click to drill → the focus sits center with incoming on the left and outgoing on the right → click a neighbor to recenter.

## Feature scope

```text
Dependency view (replaces DependencyGraph.tsx, behind a toggle until parity)
├── PLANNED ADDITIONS
│   ├── Overview: folders/modules with aggregate edges (weight = import count)
│   │   └── single-child folder chains collapse into one box (src/app/services)
│   ├── Focus view
│   │   ├── incoming side ◀ focus ▶ outgoing side, each side layered by its own internal imports
│   │   ├── focus file → its symbols; focus folder → its children
│   │   ├── other side → the using function when it fits, otherwise the file box
│   │   └── neighbor↔neighbor edges drawn faint
│   ├── Budget: ~30–50 boxes packed to the viewport's aspect ratio
│   │   └── over budget → roll up by folder, never "+N more"
│   ├── Drawing rules: one box size, truncated labels and full text on hover,
│   │   orthogonal edges, zero edges through boxes, shared paths bundled 1–2px apart
│   ├── Navigation: click to drill/recenter, breadcrumbs back out, scroll only magnifies
│   ├── Default filters: externals (one node per package), tests, type-only imports hidden;
│   │   barrel / __init__ re-exports resolved to the defining file
│   └── Language parity
│       ├── TS: all tsconfig paths, .js/.jsx, export * / barrels, import type
│       └── Python: absolute + relative imports, package roots / src layout, __init__, TYPE_CHECKING
└── LATER POSSIBILITIES
    ├── symbol explorer: search and list symbols, surface popular ones
    └── multi-hop flows and call chains
```

## Behavior

| Situation | Expected result |
| --- | --- |
| A folder has 100 file-level imports into another | One thick edge with a count, which splits only when you drill into either end |
| A side has 80 direct neighbors | Neighbors roll up into their nearest folders until the view is under budget, and clicking a group drills into it |
| A dependent also imports another dependent | It moves one layer further out, and the edge between them is drawn faint |
| Several edges leave the same box for the same target | They share one path, offset 1–2px |
| An edge would cross a box | Routing goes around it, and this is checked automatically |
| The focus symbol is used by 3 functions in one file | The file shows those 3 function rows if the budget allows, otherwise one file box with a bundled edge |

## Decisions and boundaries

**Appetite:** A replacement view and a single graph contract for both languages. No call graph or data-flow analysis beyond "which function references an imported name".

**Key decision:**
- **One finest-level graph, rolled up on the client.** The server emits a language-neutral graph: a folder → file → symbol hierarchy plus the finest edges it can resolve, each flagged as type-only, test, external, or barrel. The client does all aggregation and budgeting. TS and Python then only differ in how they fill the contract, and each drill stays local with no extra request. This fits the ~2k-file scale, cached once.
- **Our own grid + channel layout.** The pipeline runs in three pure stages: view model (budget and roll-up) → grid layout (regions folded into columns that fit the viewport, uniform boxes, edges only in channels and gutters, shared tracks for bundles) → render. ELK was tried first and dropped: it never crossed boxes but packing and bundling could not be steered without endless tuning. Boxes are never moved after layout. That post-layout repositioning is the main reason edges cross boxes today.

**Boundary:** The current component stays in place until the new view reaches parity, so switching back is a toggle. Edge thickness or a count badge shows aggregation, not color. External packages are aggregated by package, never by import string.

**First proof:**
- **Try:** On today's TS `/dependencies` data for srcly itself, build the view model, rollup, and layout with file-level focus only, with no backend change. Use `client/src/components` and `metricsStore.tsx` as the focus fixtures.
- **Observe:** Automated geometry checks report edges crossing boxes (must be 0), edge-crossing count, the number of boxes on screen, and aspect-ratio fill. Screenshots show the overview and both focus fixtures.
- **Decide:** 0 node crossings and readable bundling at ≤50 boxes → move on to the graph contract and Python. (Result: ELK failed the readability bar; the custom layout passed.)

**Open choices:** None blocking. Defaults I'm taking: a focused folder shows its children (not symbols), and the aggregate edge count shows as a small badge.

Intent: [intent-brief.md](intent-brief.md)
