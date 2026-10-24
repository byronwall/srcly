---
title: "Bring tsx-data-flow into srcly"
slug: "tsx-dataflow-integration"
phase: intent
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly

## My read

What you want most from tsx-data-flow is its route → terminal data-flow graph, shown in srcly's dependency viewer. You also want to keep the compiler-backed analysis behind it. That analysis is tsx-data-flow's real asset: TypeScript type checking, symbol-level identity, field lineage, and explicit proof frontiers. srcly has the better visuals and selection, so srcly draws the picture and tsx-data-flow supplies the evidence.

Two research PRs widen what that evidence can answer. Both take the same direction: tsx-data-flow as the semantic engine, with srcly as the place you inspect the results.

- **Value investigation** ([#102](https://github.com/byronwall/srcly/pull/102)) starts from one exact expression in the code viewer. It follows that value forward or backward, and explains the path as an ordered ledger: inputs, transfers, fallbacks, branches, transforms, and terminals, each with the reason it is proven or where proof stops.
- **Function effects** ([#103](https://github.com/byronwall/srcly/pull/103)) answers what calling a function does: network, filesystem, DOM, timers, ambient reads, writes, and how async results are handled, with unknowns kept beside known facts.

Taken together, srcly answers three new questions about TS/TSX code. Where does a route's data go? What happened to this value? What does this function touch? Findings, metrics, marks, and reports carry the same evidence into srcly's existing surfaces. srcly stays the fast base layer throughout.

## What matters most

- **The route → terminal graph lives in srcly's dependency viewer.** It is the headline.
- **The analysis is kept whole.** Evidence is never re-derived, approximated, or invented to make a picture look complete.
- **srcly owns visuals and interaction.** Graph, code viewer, selection, navigation, and return all follow srcly's patterns.
- **Honest evidence.** Proven, partial, not analyzed, and stale are different states. Not analyzed is never 0.
- **srcly stays crazy fast.** The engine starts only when needed and never delays the treemap or import graph.

## The experience you appear to want

You open srcly on a SolidStart app. The treemap and import graph appear as they do today. In the dependency view's Data flow mode you pick a route. Its component structure runs down to the terminal render points, with UI primitives collapsed. You select a field, and every proven destination lights up. You pick one destination, and an ordered ledger explains that path. Any step opens the code.

From any line in the code viewer you can also ask "where does this value go?" or "what does this function touch?" You get the same kind of ledger or effects panel. Back or Return lands you exactly where you started.

## Boundaries

### Must be true

- Graph and ledger content comes from compiler-backed evidence with exact source spans.
- Connectivity, coverage, and value properties stay separate. A local proof does not prove its caller's origin. A null check does not prove a value is finite. A fallback is not automatically a defect.
- Evidence is tied to the Program text, tsconfig, and analysis generation that produced it. Stale evidence is shown as stale or refused.
- Call identity is preserved. Two calls to the same helper never merge their values.
- Without Node, a tsconfig, or TS files, data flow is N/A with a reason, and everything else is unchanged.

### Must be avoided

- Don't port the analysis to Python or build a second TypeScript analyzer.
- Don't relabel import edges as data flow or execution.
- No purity, testability, or tangle score, and no single "safe" badge.
- Don't carry over tsx-data-flow's canvas, layout engine, or SPA.

## What seems settled

- One repository. The engine moves into srcly, and tsx-dataflow-serve goes away. This overrides #102's "don't merge the repositories", which assumed two repos.
- The engine stays TypeScript and is bundled into the wheel.
- Priority order:
  1. the route graph;
  2. the value-path ledger, which also explains a path selected in the graph;
  3. function effects;
  4. findings, metrics, and reports.

## Possibilities, not decisions

- One lazy Node process, owned by the server and shared by every query family, so the TypeScript Program is built once. #102 recommends this. #103 starts with a one-shot command and defers a resident service until startup cost is measured.
- A small branch graph next to the ledger, if a real example shows it helps.
- A later, bounded execution view for async lifecycles such as `watchScan`.

## Current reality that matters

- tsx-data-flow's route canvas projects component surfaces. Its evidence-node and evidence-edge arrays are empty, so it cannot show operation order. That is why the ordered ledger carries path detail.
- Exact field proof is narrower than general expression tracing. It depends on specific source and carrier patterns. Generic expression selection and per-invocation tracking still need to be built.
- srcly's own client provides real anchors:
  - value flow: `HotSpotItem.tsx:135`, plus `HotSpotList.tsx:88` and its separate call at line 109;
  - effects: `extractFilePath`, `rankHotSpots`, `startScan`.
  Route-graph anchors are `examples/solid-route` and visual-notes `/time-blocks`.
- `dependency-graph-legibility` has active work in `viz/deps/layout.ts`.

## Next step after confirmation

See [shape-brief.md](shape-brief.md). The Pro threads update [initiative-map.json](initiative-map.json).
