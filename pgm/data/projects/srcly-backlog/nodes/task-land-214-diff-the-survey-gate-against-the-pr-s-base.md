---
id: task-land-214-diff-the-survey-gate-against-the-pr-s-base
label: "Land #214: diff the survey gate against the PR's base"
type: task
status: needs-review
priority: high
parent: area-data-flow-land-the-open-prs
---
PR: https://github.com/byronwall/srcly/pull/214 (branch `claude/dfx-gate-diff`).

The gate compares a run with the committed `engine/survey-baseline.json`. Every merge changes that file, so every other open data-flow PR conflicts. This PR surveys the base and the head in one worktree and diffs them. It removes the baseline file and `--update`.

Done when: merged, and `AGENTS.md` (Engine → Coverage gate) no longer tells agents to commit a baseline. If the gate job name changes, update the required checks on `main`.

