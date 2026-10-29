# Intent brief: show the logic, not only the components

Status: shape-ready after three question rounds (2026-10-28).

## My read

The TS/TSX Data flow graph should show how data moves through the code: where it enters, which symbols carry it, where it is reshaped, where it is stored, where it crosses to the server, and where it ends. Today the graph "looks like everything is a TSX component", so the internal logic is hidden. Components stay on the path, but only as one kind of stop.

There are two equal jobs:

1. **Follow a full route.** Open a page route and see its data from the URL, through the server query and the database read, back to the values that the page renders.
2. **Spider out from a symbol.** Start at a known symbol and branch out to what it touches and depends on. This includes value flow, the functions it calls, the state it reads or writes, and its callers.

Plain TS (servers, CLIs, the engine itself, with no routes or components) is an equal target.

Why the graph reads as components today:

- A trace over 40 boxes folds each function except the anchor's own into one box (`anchorAdapter.ts`). `/docs/[id]` opens as 74 grey boxes named after functions.
- A folded box uses the `value` mark. That mark has the same grey as `component`.
- The engine's `scope` frame carries only a name and a file. It has no role.
- Edge relation kinds (`argument`, `function-return`, `component-prop`, `http-bridge`) are in the contract, but the canvas draws them only as solid or dashed. Standard-library transforms are proof notes, not visible steps.
- Calls, callers and state reads come from a separate op (`function-effects`). The view shows them only in the inspector rail.

## What matters most

- **Symbols are the boxes.** Named bindings are the boxes: parameters, `const`s, signals, stores, resources, memos and returns. An unnamed intermediate (a call result, a prop read, a literal) folds into the edge between two symbols.
- **One symbol, one box.** All reads of the same binding are one box. In `/docs/[id]` today, `doc` (the binding), `doc()` (the accessor call) and `doc()` in `<Match when>` are three boxes. They must be one `doc` box, with its uses listed on it or on its out-edges. Byron sees this pattern in many places.
- **Value flow is the bold main line.** Its edge names the operation: `.map`, `await`, `JSON.parse`, `pack`, prop handoff. Calls and state reads or writes are thin grey links that you can turn on and off.
- **Functions are light frames with a role.** The roles are component, hook, helper, event handler, resource fetcher and server query. A component is one frame among the others, and its props are symbols on the edges into it.
- **Three things must be visible:** transforms, state containers and the server boundary (a separate band, with the database on its far side). Plain helpers matter less.
- **The first screen is the main path.** It is about 25 symbols, from origins to ends. Side branches fold into `+N` stubs.
- **Growth must be easy.** You grow the view with a keyboard shortcut or a depth slider. Many single clicks are not acceptable.
- **A folded function still names its symbols.** It shows the symbols that go in and come out (`id → DocDetail`). It is never one anonymous grey box.

## Boundaries

- Engine changes are in scope when the client does not have the facts (function role, transform operation, call and state links). A new kind gets one entry in `kinds.ts`. A change that moves the survey gate commits its baseline.
- Do not edit `engine/src/analysis` to recognize code that only srcly uses.
- "Not analyzed" is never 0. A role that the engine cannot decide is "unknown". It must not fall back to "component".
- Folding must keep the witness for each claim (#153). An edge that folds intermediates must still open to its proof.
- The Components lens stays as the render-tree view.

## What seems settled

- **Proof approach.** Dial in the UX on a small example first: a fixture with a route, a store, a server query, a transform and some plain TS logic. Use larger repos (visual-notes, srcly's own client and server) to build out the engine and to find errors. The `/docs/[id]` answers from the October audit are the known-good check at scale.
- **#256 (draft Pro prompt)** surveys how IDEs and analysis tools show value, call and effect dependencies at scale. Its gap map should inform the shape. Its rule holds: UI filtering cannot repair facts the engine does not have.
- **#210 (`assumed` outcome) and #211 (library rows)** change edge colors and end words. The row model is a natural home for named transform operations.
- **Backlog to absorb or replace:** `task-route-data-traces-flood-the-canvas`, `task-hub-summaries-for-size-limited-slices`, `task-show-and-match-when-is-not-a-dom-attribute`, `task-calls-through-function-typed-params-and-props`.

## Next step after confirmation

Shape the symbol-graph view. Define what a "symbol" is in the contract, how the main path is chosen, how the grow key and the slider work, and which fixture proves the first screen.
