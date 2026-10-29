---
title: "Show the logic, not only the components — implementation plan"
slug: "dataflow-logic-visibility"
phase: plan
status: draft
last_updated: "2026-10-28"
---

# Show the logic — implementation plan

## Plan at a glance

The order is: merge first, then edges and color, then frames and the server band, then the main path, then the call and read links.

The merge comes first because it is the cheapest change that can alter the plan. Engine elements already carry the checker's `symbolId`. The anchor contract does not send it. When the contract sends it, the client can merge `doc`, `doc()`, `doc.error` and the `when` read into one box. That one change shows whether a 25-symbol first screen can be built on symbols in the client. It also shows whether the main path must be picked in the engine. Building frames, colors and links before that answer could put the work on the wrong layer.

Each milestone adds one new kind of fact to the anchor contract: symbol, operation and symbol kind, frame role, path rank, links. Each fact has a client consumer and a small fixture. A switch keeps today's box model (`model=steps`) until the symbol view passes the visual-notes check. Any milestone can stop with the old view still working.

The UX is tuned on a new small example app, which keeps the loop under a second. visual-notes is the scale check at the end of each milestone, with the October audit's known answers. Only one engine runs at a time on visual-notes (see `AGENTS.md`).

Pushback: do not build the "+N stub" folding before the merge numbers exist. The flood may be mostly duplicate boxes, and in that case a simple rank is enough.

## Implementation strategy

- **First proof:** one box per symbol on the small example and on `/docs/[id]`, with box counts before and after.
- **Primary seam:** the anchor-graph contract (`engine/src/srcly/contracts/anchor-graph.ts`) → `anchorAdapter.ts`. Every new fact crosses here, and the client never guesses a fact.
- **Fast local loop:** `cd engine && pnpm vitest run test/srcly/anchor-graph.test.ts && cd ../client && pnpm vitest run src/viz/deps/flow`
- **Local dependencies:** a new example app `engine/examples/symbol-graph/` with a route, a resource, a `Match`, a store, a `"use server"` query, a database client stub, a `.map`, and one plain TS module. It is opened in the browser with `?repo=<abs>/engine/examples/symbol-graph&view=graph`. Contract drift is caught by `contracts-current.test.ts` and the fake-engine snapshots.
- **Scale confirmation:** visual-notes `/docs/[id]` and anchors T2–T4, run one at a time under `--max-old-space-size=4096`.
- **Rollout and rollback:** a `model=symbols|steps` URL parameter and a toolbar switch. The default becomes `symbols` at the end of M4. Each contract field is additive, so an old client ignores it.

## Milestone 1: One box per symbol

This is the merge, and nothing else. Colors, frames and folding stay as they are.

- **Change — send the symbol**
  - Add `symbol: string | null` (and `field: string | null` for a member read) to `anchorNodeSchema`. Fill them in `addElement` from `element.symbolId`. Then run `pnpm emit-contracts`, update the Pydantic mirror and refresh the fake-engine snapshots.
  - Add an engine test on `symbol-graph`: the binding `doc`, the call `doc()`, `doc.error` and the `when` read share one symbol, and the two `x`s in `same-name-negative.tsx` do not.
- **Spike — the symbol on accessor calls and field reads**
  - Decision required: does `doc()` carry `doc`'s symbol, or the call's symbol?
  - Evidence to gather: dump `symbolId` for each node of the `/docs/[id]` trace.
  - Fallback: in the engine op, resolve the callee identifier and the receiver of a member read to their declaration symbol.
- **Change — merge in the adapter**
  - Replace `passThroughs` with a merge by `(scope, symbol)`. A merged box lists its reads. A field read becomes the field name on its out-edge. A node with no symbol keeps its own box. Each merged edge keeps every original proof (#153).
  - Add `model=symbols|steps` to `navigation/location.ts` and a switch in `FlowTools.tsx`.
  - Add adapter tests: the `doc` case, a field read, the same name in two frames, and a node with no symbol.

### Desired end state

- `/docs/[id]` shows one `doc` box with out-edges labelled `when`, `error` and `prop doc`.
- The box counts before and after for `/docs/[id]`, T2, T3 and T4 are recorded in the initiative map.
- The decision rule is applied: a cut of a third or more means M4 ranks in the client; less means M4 ranks in the engine.

## Milestone 2: Edges that say what happens, colored symbol kinds

- **Change — operations on edges**
  - The engine sends `operation` on each edge, from the relation's or element's `operationKind` and from the kind traits (`map-result`, `parse`, `serialization`, `await`, `component-prop`, `function-return`).
  - The adapter folds each unnamed intermediate (call result, literal, prop read) into the edge between two symbols, and labels the edge with its operations. A click on the edge shows each folded step and its proof.
- **Change — symbol kinds**
  - Add a `symbolKind` trait in `kinds.ts`: `state` (signal, store, resource, memo, context), `transform`, `origin`, `end` or `plain`. The anchor node carries it.
  - In `marks.ts`, the strong color goes to the symbol kind. `value` and `component` stop sharing the grey token. Frames become neutral. Update `FlowLegend.tsx` to match.

### Desired end state

- On the small example, `items` → `.map` → `rows` reads as two symbols and one labelled edge. The store and the resource are drawn as state.
- The survey gate does not move, or its baseline is committed with the reason.

## Milestone 3: Frames with a role, and the server band

- **Change — frame role**
  - The engine sends `role` on `scope` nodes: `component`, `hook`, `helper`, `handler`, `fetcher`, `server` or `unknown`. The role comes from facts the engine already has: a component binding, a DOM event or `on*` relation, a resource fetcher argument, a `query`/`action`/`"use server"` wrapper, and a `use` name prefix for hooks. This code goes in `engine/src/srcly`, never in `engine/src/analysis`.
  - A frame shows a role word on a neutral tint. `unknown` is never shown as `component`.
- **Change — server band and folded frames**
  - Frames with the `server` role, and the database ends below them, go into a server band. The layout gets a band region next to `in`/`center`/`out` in `layout.ts`.
  - A folded frame shows its symbols in and out (`id → DocDetail`) instead of a step count.

### Desired end state

- On `/docs/[id]`, `fetchDoc` and `prisma.doc.findUnique` sit in the server band. `DocView` reads `component`, and the `createResource` callback reads `fetcher`.

## Milestone 4: Main path first, then grow

- **Change — rank and first screen**
  - Rank each symbol by whether it is on a proven path from an origin to an end. This runs in the client or the engine, as M1 decided. The first screen shows the top path, about 25 symbols. Each side branch becomes a `+N` stub.
- **Change — growth controls**
  - `+` and `−` add or remove one hop around the view. A depth slider (1, 2, 3, all) sits in the toolbar. Enter opens the selected stub. The depth goes into the URL and the view-state registry, so Back restores it.
- **Change — default**
  - `model=symbols` becomes the default. `steps` stays as the switch.

### Desired end state

- `/docs/[id]` opens on about 25 symbols, from `URL: useParams()` through the server band to `DocumentViewer`.
- Two `+` presses reach the round 2 audit's answer to T1.
- `pnpm e2e` covers the depth control by `data-*` attributes.

## Milestone 5: Calls and reads as thin links, plain TS

- **Change — links**
  - The anchor op adds `links`: calls, callers and state reads or writes for each drawn frame. The links come from the facts behind `function-effects`, and the walk does not change. The canvas draws them as thin grey lines, with one toggle.
- **Change — plain TS check**
  - Anchor a symbol in `engine/src/srcly/ops/anchor-graph.ts` and one in a plain utility of srcly's client (`client/src/utils/`). Check that each reads with no route, no Components lens, and no server band unless the trace crosses one.

### Desired end state

- Spidering out from a store in the small example shows its writers and readers as thin links next to the bold value flow.

## Cross-cutting verification

- After M4 and after M5, run audit round 3 on visual-notes with the October rubric. Record it in `docs/research/tsx-dataflow-audit-2026-10/`. The target is Focus 3 or higher on T1 and T3.
- Take dark-mode and light-mode screenshots for each PR that changes the UI (`pnpm shot … --dark`).

## Open decisions and spikes

1. **Where the main path is ranked.** Output: client or engine. Evidence: the M1 counts. Fallback: an engine rank by proven origin-to-end paths.
2. **The symbol for accessor calls.** Output: the existing `symbolId`, or resolution in the op. Evidence: the M1 spike dump. Fallback: resolve in `anchor-graph.ts`.

## Below the cut line

- Types overlay (the shape of the value at each step).
- Symbol view for the Components lens and for route-graph ops.
- Python frames with roles (the facts come from the Python helper; follow later).
- Hub summaries across generations (`task-hub-summaries-for-size-limited-slices` stays its own task).
- New walk semantics, such as calls through function-typed params.

## Overlap with open work

#210 (`assumed`) changes `anchor-graph.ts`, `kinds.ts`, the anchor contract, `anchorAdapter.ts`, `FlowLegend.tsx`, `FlowInspector.tsx` and `DependencyCanvas.tsx`. #211 changes `kinds.ts`. Land #210 and #211 before M1 starts, or build M1 on #210's branch. Both have backlog tasks to land them.
