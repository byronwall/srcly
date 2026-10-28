---
id: task-components-lens-gap-list-repeats-and-uses-engine-words
label: Components lens gap list repeats and uses engine words
type: task
status: planned
parent: area-data-flow-tsx-usability-audit-2026-10
---
Evidence: the Components lens (`lens=components`) still lists 318 gaps on `/docs/[id]`; 256 repeat "Element limit reached before Text" or "Terminal limit reached before Text", 23 say "The A definition is outside the route source scope". Selecting the origin re-lays out the canvas and ends in "field lineage N/A: The selected source has no unique compiler-backed filesystem origin."

Files: `client/src/viz/deps/flow/FlowInspector.tsx`, `client/src/viz/deps/flow/adapter.ts`.

Done when: repeated gaps fold into one line with a count, each reason reads in a developer's words, and selecting an origin keeps the layout.

