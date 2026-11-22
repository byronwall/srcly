---
id: area-data-flow-library-models-as-data
label: "Data flow: library models as data"
type: area
status: planned
rawContext: |
  Move library knowledge from TypeScript and Python code into JSON rows that both collectors read. The plan and migration order are in `docs/intent/dataflow-library-models/plan.md` (§6).

  Landed: step 1 (#206), step 2 (#212), and checker-resolved import matching for `module#name` (#209). Step 3 is #211 (see the open-PRs area).
---
Library knowledge is rows in `engine/models/*.json` (`docs/dataflow-engine.md`, Library models). The 2026-11 migration to access paths and the `cell`, `slot` and `keyed` shapes is closed (`docs/research/dataflow-library-models-2026-11/README.md`, section 6). Open work: the last name lists in `function-effects.ts` and `program-evidence-support.ts`, checker-resolved matching everywhere, and user rows.

