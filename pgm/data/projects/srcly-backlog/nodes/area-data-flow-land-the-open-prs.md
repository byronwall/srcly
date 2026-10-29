---
id: area-data-flow-land-the-open-prs
label: "Data flow: land the open PRs"
type: area
status: planned
---
Four data-flow PRs are open and conflict with `main`. Land them in this order, one at a time.

Each one needs a rebase on `main`, `pnpm survey-gate --update` (until #214 lands), and green `PR title`, `build`, `browser` and `survey` checks. Wait with `gh pr checks <n> --watch`.

Land #214 first: it removes the committed gate baseline that makes every open data-flow PR conflict.

