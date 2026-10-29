---
id: task-calls-through-function-typed-params-and-props
label: Calls through function-typed params and props
type: task
status: planned
priority: high
parent: area-data-flow-trace-coverage
---
262 traces stop as `disconnected · call` (about 17 of 69 sampled).

When `targetFunction` gets a parameter origin (or `props.onX`):
- Collect the caller bindings: JSX `component-prop` values at each occurrence, and `argument-binding` sources for calls.
- `resolveValue` each one (`engine/src/analysis/value-origin.ts`).
- Pair per call site through the invocation stack (cross-call block, `needsOneCallSite`).
- Any binding that does not resolve keeps a named frontier.

Negative fixture: two call sites that bind different handlers never cross.

Other `disconnected · call` causes: state setters (~11), `useCallback`/`createMemo` wrappers (6), interface-typed context (6), unions (5).

