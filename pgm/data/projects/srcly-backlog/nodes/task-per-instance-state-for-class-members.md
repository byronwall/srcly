---
id: task-per-instance-state-for-class-members
label: Per-instance state for class members
type: task
status: planned
parent: area-data-flow-trace-coverage
---
From the retired `dataflow-js-react-solid` plan (Stage 5, SH-05, an Explore item; never started).

- Evidence: per-call contexts landed (each factory call and each `new` is its own context), but a member's state is still the class's, not one instance's (`docs/dataflow-coverage.md`, "Receivers and keys"). Two instances of one class that write and read the same member can join.
- Shape: prototype first. Pick two disjoint-receiver cases (two `new Store()` instances; two receivers keyed by distinct literal keys) and measure trace size and survey cost before choosing a wider allocation or owner context. Keep exact aliases and known literal fields. Label unresolved ancestry and dynamic selection by name.
- Files: `engine/src/analysis/cells.ts`, the per-call context code, a fixture in `engine/examples/value-flow-basics/src/`.
- Done: an annotated fixture where `a.set(x)` reaches `a.get()` and never `b.get()` for two instances of one class; `pnpm survey-gate` shows no new error or trace over the time limit.

