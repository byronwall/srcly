---
id: task-action-parameters-walk-into-their-useaction-sites
label: Action parameters walk into their useAction sites
type: task
status: planned
parent: area-data-flow-tsx-usability-audit-2026-10
---
Evidence: forward from `updateDoc`'s `payload` (`app/src/services/docs.actions.ts:160`) draws six `runUpdateDoc` dead ends, one per `const runUpdateDoc = useAction(updateDoc)` in a component. The walk reaches the action's uses (the `useAction` call) as if the payload went there.

Files: `engine/src/srcly/ops/anchor-graph.ts` (`declarationRuns`, uses), `engine/src/analysis/value-origin.ts` (`FUNCTION_WRAPPERS`).

Done when: a forward trace from an action's parameter draws no box at its `useAction` sites, with a fixture in `engine/examples/value-flow-basics/src/function-wrappers.tsx`.

