---
title: "Bring tsx-data-flow into srcly — shape brief"
slug: "tsx-dataflow-integration"
phase: shape
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly — what we are adding

**Outcome:** One engine adds three things to srcly: route data flow in the dependency viewer, value paths, and function effects.

**Primary flow:** Graph → Data flow → route → field → destination → path ledger → code → Return.

## Feature scope

```text
TS/TSX semantic evidence in srcly
├── PLANNED ADDITIONS
│   ├── Engine: engine/ package, one lazy stdio Node child, bundled in the wheel
│   │   └── Analysis moved intact; one Program shared by all queries; stale results refused
│   ├── 1. Route graph: Data flow mode in the dependency view
│   │   ├── Own contract (route → occurrence → step), never import edges
│   │   ├── UI primitives collapsed; field reach lights proven destinations
│   │   └── Frontier nodes keep their cause; any node → code viewer
│   ├── 2. Path ledger, opened from a graph destination or any code-viewer expression
│   │   ├── Ordered rows: input, transfer, fallback, branch, transform, terminal, boundary
│   │   ├── Evidence inspector: span, types, proof, assumptions, stop reason
│   │   └── Back / Forward / Return restore the overview exactly
│   ├── 3. Effects panel in the code viewer
│   │   └── Effects, ambient reads, writes, async handling; Known + Partial; witnesses
│   └── 4. Supporting: findings, markers, catalog metrics, report work packets, compare
├── EVALUATE BEFORE COMMITTING
│   ├── A route layout rule vs the existing packing
│   └── A small branch graph beside the ledger
└── LATER POSSIBILITIES
    └── An async execution view; path/effects → agent work packet
```

**Dropped:** all of tsx-dataflow-serve.

## Behavior

| Situation | Expected result |
| --- | --- |
| Engine cold or busy | Base views work; progress shows within 250 ms. |
| Not analyzed, unsupported, stale, or over budget | The state is named, never shown as "0". |
| One helper, two calls (`HotSpotList` 88 vs 109) | The calls never join. |
| Network call plus an unresolved call | "Network · Partial". |
| Return from the ledger | Filters, metric, expansion, selection, and camera are restored. |

## Decisions and boundaries

**Appetite:** A big program of revertible slices. Each query family proves itself on real code before its UI grows.

**Key decision:** The engine supplies evidence and srcly draws it. The graph shows reach. The ledger shows order, because the old canvas has no ordering evidence. Graph paths and code-viewer expressions open the same ledger. srcly's Python server owns a stdio child, so there is no port and the Program is built once.

**Boundary:** No relabeled import edges, and no second analyzer. Layout changes coordinate with `dependency-graph-legibility`.

**First proof:** Two proofs run in parallel after M1.
- **Route graph:** **Try:** render `examples/solid-route` in the current dependency canvas. **Observe:** field reach is legible, and nodes open the right lines. **Decide:** keep the existing packing, or add one route layout rule.
- **Ledger:** **Try:** inspect `HotSpotItem.tsx:135` `props.node.name`. **Observe:** it reaches the JSX slot, line 134 stays distinct, and the rank default keeps zero. **Decide:** if the proof isn't exact, fix the engine before building UI.

See the [intent](intent-brief.md), [plan](implementation-plan.md), [research](research.md), and [initiative-map.json](initiative-map.json).
