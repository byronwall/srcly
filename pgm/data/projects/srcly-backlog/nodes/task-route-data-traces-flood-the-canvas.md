---
id: task-route-data-traces-flood-the-canvas
label: Route data traces flood the canvas
type: task
status: planned
parent: area-data-flow-tsx-usability-audit-2026-10
---
Evidence: `/docs/[id]`'s data trace draws 555 boxes in 74 functions (folded), `doc` forward 580, `updateDoc`'s `payload` forward 554. Focus scored 2 or less on every task in round 2: the answer is there, but the developer filters it by eye.

Files: `client/src/viz/deps/flow/anchorAdapter.ts` (folding), `engine/src/srcly/ops/anchor-graph.ts` (walk limits).

Done when: a route's data trace opens with the route's own frame and the first component it hands each value to, the rest folded behind one box per component, and Focus scores 3 on T1 and T3.

