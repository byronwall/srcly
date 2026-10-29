---
id: task-move-the-remaining-alias-resolution-sites-to-the-value-origin-resolver
label: Move the remaining alias-resolution sites to the value-origin resolver
type: task
status: planned
priority: medium
parent: area-data-flow-trace-coverage
---
#198 added `resolveValue(ts, checker, expr)` in `engine/src/analysis/value-origin.ts` and used it in `targetFunction`, `stateRoleOf` and `renderedComponent`. About 24–34 other sites still resolve aliases on their own. The #198 PR body lists them.

Remaining path dependence: `refreshDataflow`'s untraced stop line differs by folder.

