---
id: task-react-19-action-hooks-as-library-rows
label: React 19 action hooks as library rows
type: task
status: planned
parent: area-data-flow-trace-coverage
---
From the retired `dataflow-js-react-solid` plan (Stage 5, RE-06: review current React APIs one at a time; never started). Handles, external stores and class state are W11's redo of srcly#425, not this node.

- Evidence: `engine/models/react.json` has no rows for React 19's `useActionState`, `useOptimistic` or `use`. A value through any of them falls to the generic call rules.
- Shape: library intake first (AGENTS.md → Engine). Each hook keeps state once per call, so each is a `cell` row in the existing shapes. Take one hook per slice, each with its input, result and lifecycle contract and a negative control.
- Files: `engine/models/react.json`, fixtures in `engine/examples/value-flow-basics/src/`, React patterns in the catalog.
- Done: for each hook, a fixture where the action's return reaches the state read and a dropped argument reaches nothing.

