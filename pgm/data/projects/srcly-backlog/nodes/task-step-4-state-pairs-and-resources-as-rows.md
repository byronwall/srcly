---
id: task-step-4-state-pairs-and-resources-as-rows
label: "Step 4: state pairs and resources as rows"
type: task
status: planned
priority: medium
parent: area-data-flow-library-models-as-data
---
State pairs are rows now (`engine/models/solid.json`, `react.json`, read by `engine/src/analysis/framework-flows.ts`). What is left: `isResourceFactory` (`program-evidence-support.ts`, used in `program-evidence-carrier.ts` and the resource relations in `program-evidence-collector-call-support.ts`) becomes `model: "resource"` rows.

- Take the resource loader index from the row's `args`, so `createResource(fetcher)` with one argument works.
- Look up with `frameworkRow(module, name)`.
- #209 already limits `isResourceFactory` to solid-js `createResource`. Add one row per module for others.

Done when: the survey gate shows no move.
