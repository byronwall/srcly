---
id: task-exported-api-end-rule-open-the-pr
label: "Exported-API end rule: open the PR"
type: task
status: working
priority: medium
parent: area-data-flow-land-the-open-prs
---
Branch: `claude/dfx-exported-api-end` (commit 3aafcfa "wip exported-api", pushed, no PR).

An exported value that nothing in the project reads ends at the export, not at a false dead end. It uses `readSymbols` in `engine/src/srcly/facts.ts`. Fixtures: `exported-api.ts` and `exported-api-reader.ts` in `engine/examples/value-flow-basics/src/`.

Steps: rebase on `main` (the throw commit drops out, it landed as #207), `pnpm typecheck`, `pnpm lint`, survey gate, open the PR.

