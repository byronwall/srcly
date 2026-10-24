---
title: "Bring tsx-data-flow into srcly"
slug: "tsx-dataflow-integration"
phase: intent
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly

## My read

What you want most from tsx-data-flow is its route → terminal data-flow graph, shown in srcly's dependency viewer. You also want to keep the compiler-backed analysis behind it.

tsx-data-flow's Route Totality and Data trajectories work already answers hard questions about one route. Where does this field go? Which components hand it along? What happens to it on the way? Where does it end up rendered? Where does the proof stop, and why? The evidence is strong: TypeScript type checking, symbol-level identity, field lineage, and explicit proof frontiers. The visualization around it is the weak part.

srcly has the better visuals and selection. Its dependency view already has focus, expand in place, hubs, linked hover, a go-to palette, keyboard movement, legible layouts, and one-click opening into the code viewer. The goal is to keep tsx-data-flow's analysis and give it srcly's graph experience. In srcly, a route's data flow becomes something you navigate the way you navigate imports today.

The other tsx-data-flow features still come along: findings, metrics, code-viewer marks, work-packet reports, and compare. They support the graph, and they are not the reason for the merge. srcly stays the fast base layer throughout.

Several Pro threads are working out the details. This document is the shared map they update.

## What matters most

- **The route → terminal graph lives in srcly's dependency viewer.** It is the headline, not a later phase.
- **The analysis is kept whole.** Type checking, symbol identity, field lineage, and proof frontiers move over intact. They are not re-derived or approximated.
- **srcly owns the visuals and the interaction.** Selection, focus, expansion, layout, hover, keyboard, and opening code follow srcly's dependency-view patterns.
- **srcly stays crazy fast.** The data-flow program builds in the background and never delays the first treemap or import graph.
- **Every node leads to code.** Route, component, field, operation, and terminal nodes open the exact lines.

## The experience you appear to want

You open srcly on a SolidStart app. The treemap and import graph appear as they do today. The dependency view also offers a data-flow mode and a list of routes. You pick a route. The graph shows the route's component structure down to its terminal render points, with UI primitives collapsed. You select a field, and every proven destination lights up. You select one destination and follow the path. You see its handoffs, transformations, branches, and file crossings, all grouped by the component that owns them. Partial paths show where proof stopped and what kind of gap it was. Any node opens the code viewer at that spot.

## Boundaries

### Must be true

- Graph nodes and edges come from tsx-data-flow's compiler-backed evidence. srcly lays them out and adds interaction, but never invents a step.
- Each node and edge kind states what it means: a component occurrence, a value, an operation, a terminal, or a frontier.
- Proof frontiers stay visible and keep their cause.
- The base scan, cache, and import graph work with no Node and no data-flow layer at all. When data flow is unavailable, it shows N/A with a reason.
- The strict-tsconfig rule holds.

### Must be avoided

- Don't port the TypeScript compiler-API analysis to Python.
- Don't carry over tsx-data-flow's graph canvas, layout engine, or SPA.
- Don't turn the data-flow graph into a repository-wide variable or call graph.
- Don't block the base scan on the TypeScript program build.

## What seems settled

- One repository. The engine moves into srcly. tsx-dataflow-serve goes away.
- The engine stays TypeScript, and the release build bundles it into the wheel.
- Value order: the route → terminal graph in the dependency viewer comes first. Findings, metrics, code-viewer marks, and reports support it.

## Possibilities, not decisions

- The route hierarchy maps onto srcly's box hierarchy (route → component occurrence → field or operation), so roll-up and expand in place work unchanged.
- A field-reach focus and a selected-path focus act as two projections over one evidence model, as tsx-data-flow's own trajectory shape proposes.
- The engine builds the program once in the background, serves a route inventory, and computes each route's detail on demand.

## Current reality that matters

- tsx-data-flow's Route Totality frontend is about 9.6K lines. It has its own layout, camera, disclosure, and emphasis code. All of that is what srcly replaces.
- srcly's graph contract (`client/src/viz/deps/contract.ts`) covers folder, file, symbol, and external nodes with import edges. Its layout puts importers on one side and imports on the other. Route flow is top-down, so it may need its own layout rule inside the same canvas.
- `dependency-graph-legibility` has active work in `viz/deps/layout.ts`. Data-flow graph work overlaps with it.
- The engine takes about 4.5 s for 50K LOC and about 120 s for 200K. That works as a background layer, and per-route detail must stay interactive.

## Next step after confirmation

Shape: see [shape-brief.md](shape-brief.md). The Pro threads refine each branch in [initiative-map.json](initiative-map.json).
