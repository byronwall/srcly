---
id: task-ledger-classify-reads-kind-traits
label: Ledger `classify()` reads kind traits
type: task
status: planned
priority: low
parent: area-data-flow-engine-structure
---
`classify()` in `engine/src/srcly/ops/value-flow.ts` keeps its own kind lists. Read `elementTraits(...).role` and `relationTraits(...).role`, as `anchor-graph.ts` does.

