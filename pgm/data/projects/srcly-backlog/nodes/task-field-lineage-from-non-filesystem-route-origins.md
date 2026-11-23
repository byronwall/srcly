---
id: task-field-lineage-from-non-filesystem-route-origins
label: Field lineage from non-filesystem route origins
type: task
status: planned
parent: area-data-flow-trace-coverage
---
From the retired `dataflow-robustness` plan (T4, never started).

- Evidence: a selected route origin gets exact field lineage only when it is a filesystem read. On solid-route `/records`, the `createResource(loadRecords)` origin lights its row destinations through `createMemo`, but `graph.lineage` is `{ status: "unavailable", fields: 0 }` with a reason that names "filesystem origin" (`engine/test/srcly/route-graph-source.test.ts`, "never lights ViewerCard from the records origin").
- Files: `engine/src/srcly/ops/route-graph.ts` (lineage), the route field-proof code in `engine/src/analysis`.
- Rule: no srcly-specific recognition in `engine/src/analysis`. If the edit makes any compact-field-proof obligation fail (`scripts/accept-route-field-proof.ts`, G01–G20), stop and keep the named frontier.
- Done: the records origin draws proven `field` edges to the `RecordTable` row terminals and none to `ViewerCard`; the test's `unavailable` assertion flips; G01–G20 stay green.

