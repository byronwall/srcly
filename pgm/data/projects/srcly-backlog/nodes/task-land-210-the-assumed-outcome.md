---
id: task-land-210-the-assumed-outcome
label: "Land #210: the `assumed` outcome"
type: task
status: needs-review
priority: high
parent: area-data-flow-land-the-open-prs
---
PR: https://github.com/byronwall/srcly/pull/210 (branch `claude/dfx-assumed-outcome`).

A trace that lands only through a step the engine assumes gets its own outcome, `assumed`, between `ok` and `partial`. Engine, contracts, server, UI, survey and gate all change.

After it lands: flip the `classed` and `leave` fixtures to `@outcome assumed` (see the #213 task).

