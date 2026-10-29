---
id: task-collectors-record-end-attributes-for-typescript
label: Collectors record end attributes for TypeScript
type: task
status: planned
priority: low
parent: area-data-flow-engine-structure
---
`engine/src/srcly/facts.ts` still checks TypeScript nodes directly to decide some ends. Make the collectors record end attributes as facts, so `facts.ts` reads facts only, as it does for Python.

