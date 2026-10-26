---
id: task-step-4-state-pairs-and-resources-as-rows
label: "Step 4: state pairs and resources as rows"
type: task
status: planned
priority: medium
parent: area-data-flow-library-models-as-data
---
`STATE_FACTORIES` (`engine/src/analysis/program-evidence-state-pairs.ts`) and `isResourceFactory` (`program-evidence-support.ts`, used in `program-evidence-carrier.ts` and the resource relations in `program-evidence-collector-call-support.ts`) become rows with `model: "state-pair"` and `model: "resource"` in new `engine/models/solid.json` and `react.json` files.

- Take the resource loader index from the row's `args`, so `createResource(fetcher)` with one argument works.
- Look up with `tsModel(this.libraryModels, ...)` or `this.modelFor(node)`.
- #209 already limits `isResourceFactory` to solid-js `createResource`. Add one row per module for others.

Done when: the survey gate shows no move.

