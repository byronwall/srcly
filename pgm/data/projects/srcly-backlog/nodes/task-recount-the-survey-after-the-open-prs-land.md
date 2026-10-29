---
id: task-recount-the-survey-after-the-open-prs-land
label: Recount the survey after the open PRs land
type: task
status: planned
priority: low
parent: area-data-flow-trace-coverage
---
The r3 survey predates #198–#212 and the open PRs. Run `survey-blockers.ts` on the six repos again (one repo per process, `--max-old-space-size=4096`, one at a time), and rank the stops with `survey-report.ts` to pick the next rules.

