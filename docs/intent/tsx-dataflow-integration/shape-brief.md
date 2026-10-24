---
title: "Bring tsx-data-flow into srcly — shape brief"
slug: "tsx-dataflow-integration"
phase: shape
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly — what we are adding

**Outcome:** srcly's dependency viewer gains a data-flow mode. It shows tsx-data-flow's route → terminal graph using srcly's layout, selection, and code opening, and the compiler-backed evidence behind it is kept whole.

**Primary flow:** Scan (instant) → the engine builds in the background → Graph view → Data flow → pick a route → select a field → see every destination → pick one → follow the path → open the code.

## Feature scope

```text
Data flow in srcly
├── PLANNED ADDITIONS
│   ├── Engine in srcly (engine/ TypeScript package, bundled in the wheel)
│   │   ├── Route discovery, occurrence surface, field lineage, frontiers: moved intact
│   │   └── Background program build, route inventory, per-route detail on demand
│   ├── Data-flow graph contract (beside the import contract)
│   │   ├── Nodes: route, component occurrence, control flow, value or operation, terminal, frontier
│   │   ├── Edges: render nesting, prop/context handoff, field flow (proven only)
│   │   └── A route → occurrence → step hierarchy, so roll-up and expansion work
│   ├── Data-flow mode in the dependency view (same canvas and interactions)
│   │   ├── Route picker in the go-to palette, plus the route in the URL
│   │   ├── Component projection: route backbone, UI primitives collapsed
│   │   ├── Field reach: select a field → every proven destination lights up
│   │   ├── Path projection: one destination → ordered steps grouped by owner
│   │   ├── Frontier nodes with their cause (unsupported, opaque, budget, identity loss)
│   │   └── Any node → code viewer at its line
│   └── Supporting evidence through srcly's existing pipelines
│       ├── Findings + markers: defenses, impossible fallbacks, relay hops
│       ├── Catalog metrics: burden, defenses, relay, fan-out/in (treemap, Hot Spots, compare)
│       └── Work packets in srcly report; the agent skill merged into srcly-code-quality
├── EVALUATE BEFORE COMMITTING
│   ├── Route flow as its own layout rule vs the existing in/center/out packing
│   ├── Path burden as visible factors on the destination list
│   └── Boundary report, junctions, path families, inline preview: rules or report-only
└── LATER POSSIBILITIES
    ├── Linking import-graph files to the routes they feed
    └── A selected path → work packet / agent prompt
```

**Dropped:** tsx-dataflow-serve, which includes its canvas, camera, and layout code, its overview and report pages, and the world map.

## Behavior

| Situation | Expected result |
| --- | --- |
| Engine still building | Import graph works; Data flow shows progress. |
| Not a SolidStart/TSX app, or no Node | Data flow is N/A with the reason; nothing else changes. |
| A field has dozens of destinations | Destinations are grouped by owning component; it reads as broad use, not as a wall of nodes. |
| A path stops early | A frontier node names the cause; it never pretends to be complete. |
| Switching between component and path projection | Route and field selection are kept; the camera stays on the selection. |

## Decisions and boundaries

**Appetite:** Big program. The graph lands first, as slices that can each be reverted, and the supporting evidence follows.

**Key decision:** The engine provides evidence, and srcly provides the picture. The engine's output is a graph in srcly's own contract style: a hierarchy plus typed edges. srcly's dependency view renders it with its existing canvas, focus, expand-in-place, hover, keyboard, and code opening. That retires about 9.6K lines of tsx-data-flow graph UI instead of porting it. The new graph also picks up every future improvement to srcly's graph.

**Boundary:** Edges are proven evidence only. No repository-wide variable graph. Layout changes coordinate with `dependency-graph-legibility`, which is active in `viz/deps/layout.ts`: build on its branch, or after it merges.

**Where it lives / how it ships:** An `engine/` package in the srcly repo. The release build bundles it with esbuild into the wheel, and srcly runs it with the system `node` (18 or later). It uses the project's `typescript` when present and otherwise a bundled copy. Without Node, data flow is N/A.

**First proof:** **Try:** Export one route's existing totality evidence (`examples/solid-route`, then visual-notes `/time-blocks`) into the data-flow contract. Render it in the current dependency canvas, with field selection and code opening, and with no new layout code. **Observe:** Can someone answer "where does this field go, and what happens on one path?" as easily as in Route Totality? Do the nodes open the right lines? **Decide:** If the existing packing reads well, extend it. If top-down route flow fights it, add one route layout rule inside the same canvas and keep every interaction layer. If the export is missing ordered steps, add the smallest analyzer fact, not an invented step.

See the [intent brief](intent-brief.md) and [initiative-map.json](initiative-map.json).
