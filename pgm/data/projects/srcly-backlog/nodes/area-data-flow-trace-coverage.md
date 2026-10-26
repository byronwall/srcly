---
id: area-data-flow-trace-coverage
label: "Data flow: trace coverage"
type: area
status: planned
---
Rules that let more traces reach a real end. Each rule's test is an annotated fixture in `engine/examples/value-flow-basics/src/` (see `AGENTS.md` → Engine).

Measure with `engine/scripts/survey-blockers.ts` and `survey-report.ts`. The r3 survey (before #198–#212) was 19% ok: TypeScript 16%, Python 25%.

