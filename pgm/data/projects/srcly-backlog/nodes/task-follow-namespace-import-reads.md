---
id: task-follow-namespace-import-reads
label: Follow namespace-import reads
type: task
status: planned
priority: medium
parent: area-data-flow-trace-coverage
---
`import * as api from "./api"; api.X` is not followed. An exported value read only that way is a false dead end. Give it its own rule and fixture.

