---
id: task-land-213-prove-nothing-from-a-call-s-being-imported
label: "Land #213: prove nothing from a call's being imported"
type: task
status: needs-review
priority: high
parent: area-data-flow-land-the-open-prs
---
PR: https://github.com/byronwall/srcly/pull/213 (branch `claude/dfx-host-api-strength`). Land after #210.

`isExternalCall` gives any imported call an `effect-input` with a `host-api` proof, which `kinds.ts` classes as `modelled`. After #211, `assumedThrough` exempts modelled proofs, so arbitrary library calls would count as proven. This PR keeps `modelled` only for a library model row or a named host API.

`onCleanup` stays assumed until a Solid `consumes` or `calls-back` row exists. Decide this before library-models step 5.

