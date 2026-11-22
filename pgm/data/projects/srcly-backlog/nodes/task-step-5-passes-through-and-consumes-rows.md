---
id: task-step-5-passes-through-and-consumes-rows
label: "Library models: last name lists in effects and call operations"
type: task
status: planned
priority: medium
parent: area-data-flow-library-models-as-data
rawContext: |
  Framework `passes-through` rows exist (`splitProps`, `mergeProps`, `useDeferredValue`, `unwrap`, `createMutable` in `engine/models/solid.json` and `react.json`). Move `callOperation`'s library half, `isFrameworkCall`, `isKnownGlobal`, and function-effects' `MODELLED_PURE`, `MODELLED_RECEIVER_WRITES` and `AMBIENT_INPUTS` to rows. `functionEffects` reads the same rows.

  Decide `onCleanup` first (see #213). Solid framework calls (`createMemo`, accessor calls such as `view()` and `scan()`) still draw as assumed; rows in steps 4–5 should make them modelled.
---
`isFrameworkCall` is gone (a framework call is one a row names). What is left as code: `callOperation`'s library half and `isKnownGlobal` (`engine/src/analysis/program-evidence-support.ts`), and `MODELLED_PURE`, `MODELLED_RECEIVER_WRITES` and `AMBIENT_INPUTS` in `engine/src/analysis/effects/function-effects.ts`. Move them to `passes-through` and `consumes` rows (`writes: "this"`) and an `origin` row per ambient input, read through `builtinTsModel`.

Done when: those lists are gone and the survey gate shows no moves.

