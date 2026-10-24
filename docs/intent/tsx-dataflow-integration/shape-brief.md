---
title: "Bring tsx-data-flow into srcly — shape brief"
slug: "tsx-dataflow-integration"
phase: shape
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly — what we are adding

**Outcome:** srcly shows compiler-backed TS/TSX evidence in three places, all from one engine:
- route data flow in the dependency viewer;
- value paths from the code viewer;
- function effects in the code viewer.

**Primary flow:** Graph → Data flow → route → field → destination → ordered path ledger → code → Return.

## Feature scope

```text
TS/TSX semantic evidence in srcly
├── PLANNED ADDITIONS
│   ├── Engine (engine/ package, bundled in the wheel, one lazy Node process)
│   │   ├── Analysis moved intact; Program built once, shared by all queries
│   │   ├── Evidence tied to Program text + tsconfig + generation; stale = refused
│   │   └── New engine work: expression selection API, per-invocation pairing
│   ├── 1. Route graph: Data flow mode in the dependency view
│   │   ├── Separate data-flow contract (route → occurrence → step), never import edges
│   │   ├── Component projection with UI primitives collapsed; field reach lights destinations
│   │   └── Frontier nodes keep their cause; any node → code viewer
│   ├── 2. Value path ledger (from a graph destination or any code-viewer expression)
│   │   ├── Pinned preview → exact expression → forward / backward
│   │   ├── Ordered rows: input, transfer, fallback, branch, transform, terminal, boundary
│   │   ├── Evidence inspector: span, types, proof records, assumptions, stop reason
│   │   └── Back / Forward / Return restore the overview exactly
│   ├── 3. Effects panel in the code viewer
│   │   ├── Effects, ambient reads, writes, async result handling
│   │   └── Known + Partial together; exact witnesses; neutral marks, no score
│   └── 4. Supporting evidence through existing pipelines
│       ├── Findings + markers (defenses, impossible fallbacks, relay)
│       ├── Numeric catalog metrics (burden, relay, fan-out/in); effects stay categorical
│       └── Work packets in srcly report; agent skill merged
├── EVALUATE BEFORE COMMITTING
│   ├── A route layout rule vs the existing in/center/out packing
│   ├── A small branch graph beside the ledger, only if a real path needs it
│   └── Resident process vs one-shot command, decided by measured cold cost
└── LATER POSSIBILITIES
    ├── Bounded async execution view (watchScan lifecycle)
    └── Selected path or effects → work packet / agent prompt
```

**Dropped:** tsx-dataflow-serve: its canvas, layout code, overview, reports, and world map.

## Behavior

| Situation | Expected result |
| --- | --- |
| Engine cold or busy | Base views work; progress shows within 250 ms. |
| Not analyzed / unsupported / stale / budget hit | Each state is named; never "0 consumers" or "no effects". |
| Same helper, two calls (`HotSpotList` lines 88 vs 109) | Values from different calls never join. |
| `props.rank ?? "–"` | Shown as a valid default that keeps zero. |
| Network call plus an unresolved call | "Network · Partial"; the known witness stays. |
| Return or Back from a ledger | Filters, metric, expansion, selection, and camera are restored. |

## Decisions and boundaries

**Appetite:** Big program, built from revertible slices. Each query family proves itself on real code before its UI grows.

**Key decision:** One engine supplies the evidence and srcly supplies the picture. The route graph shows reach. The ledger shows order, because tsx-data-flow's canvas has no operation-order evidence: its evidence-edge arrays are empty. Picking a destination in the graph opens the same ledger the code viewer uses, so path explanation exists once. All three query families share one lazy Node process, the server's Python layer owns it, and the browser reaches it through srcly's server. The TypeScript Program is built once.

**Where it lives / how it ships:** An `engine/` package in the srcly repo. It ships as an esbuild bundle in the wheel and runs on the system `node` (18 or later). It uses the project's `typescript` when there is one, otherwise a bundled copy. In development, srcly runs `engine/` from the checkout.

**Boundary:** No import edges relabeled as data or execution. No second analyzer. Layout changes coordinate with `dependency-graph-legibility`.

**First proof:** There are three, and they are independent of each other.

- **Route graph.** **Try:** Export `examples/solid-route`'s totality evidence into the data-flow contract and render it in the current dependency canvas. **Observe:** Field reach reads clearly, and nodes open the right lines. **Decide:** Extend the packing, or add one route layout rule.
- **Ledger.** **Try:** `HotSpotItem.tsx:135` `props.node.name`, inspected from the code viewer. **Observe:** It reaches its JSX slot. Line 134's title stays distinct. The rank default keeps zero. **Decide:** If generic evidence can't prove that exactly, fix the engine before building UI.
- **Effects.** Run on `extractFilePath`, `rankHotSpots`, and `startScan`.

**Targets:** preview and return p95 ≤ 150 ms; warm first row ≤ 750 ms; cold ≤ 10 s.

**Decided:** The route-graph and ledger proofs run in parallel after the shared engine milestone.

Sources: [#102](https://github.com/byronwall/srcly/pull/102) value investigation, [#103](https://github.com/byronwall/srcly/pull/103) function effects. See the [intent brief](intent-brief.md), the [implementation plan](implementation-plan.md), and [initiative-map.json](initiative-map.json).
