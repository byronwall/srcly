---
id: task-library-write-into-a-non-local-receiver
label: Library write into a non-local receiver
type: task
status: planned
priority: high
parent: area-data-flow-trace-coverage
---
367 traces stop as `external-code · call`.

Change the #175 block in `connectExternalCall` (`engine/src/analysis/program-evidence-collector-call-support.ts`, the receiver's root name loop):
- Walk element access too.
- Accept local, closure and parameter (`parametersBySymbol`) roots. Keep module state excluded (`log.push` negative).
- Write into the field path (#197), with `assumedProof`.

Positive fixtures: indexed element, parameter field. Negative fixtures: module state, kept call value.

