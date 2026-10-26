---
id: task-step-5-passes-through-and-consumes-rows
label: "Step 5: passes-through and consumes rows"
type: task
status: planned
priority: medium
parent: area-data-flow-library-models-as-data
---
Move `callOperation`'s library half, `isFrameworkCall`, `isKnownGlobal`, and function-effects' `MODELLED_PURE`, `MODELLED_RECEIVER_WRITES` and `AMBIENT_INPUTS` to rows. `functionEffects` reads the same rows.

Decide `onCleanup` first (see #213). Solid framework calls (`createMemo`, accessor calls such as `view()` and `scan()`) still draw as assumed; rows in steps 4–5 should make them modelled.

