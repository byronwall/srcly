---
id: task-send-proof-strength-to-the-client-through-the-contract
label: Send proof strength to the client through the contract
type: task
status: planned
priority: medium
parent: area-data-flow-library-models-as-data
---
After #210, `client/src/dataflow/outcome.ts` keeps its own list of assumed proof kinds (`external-call`, `partial-classification`). Emit each proof's strength from `PROOF_TRAITS` in `engine/src/srcly/kinds.ts` through the contract instead, so the two lists can't drift.

