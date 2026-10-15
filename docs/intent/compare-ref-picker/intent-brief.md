---
title: "Compare ref picker: PRs, worktrees, commits"
slug: "compare-ref-picker"
phase: intent
status: current
last_updated: "2026-10-15"
---

# Compare ref picker: PRs, worktrees, commits

## My read

The compare views work. You said the compare treemap is "so good", and the dependency compare "feels okay" but needs testing on a real PR. What fails is *getting to the right comparison*. You work across "a ton of worktrees, a ton of PRs". Today srcly offers only two free-text ref boxes with a native datalist of local branches and recent commits. Your verdict: "woefully underpowered in terms of being able to like pick what you are looking for."

You want a rich picker that knows your actual working context:

- open PRs, pulled through the `gh` CLI with as much useful context as it gives;
- the repo's worktrees and branches.

Picking a PR should show that PR's diff. Inside a PR you also want to step commit by commit, current commit against the previous one, to watch how the PR developed. Compare should also feel fast. The first run felt slow; a later run was quick, probably from the cache.

## What matters most

- **Select the right working spot fast.** A PR, a worktree or a branch is one pick away, not a ref you type.
- **PR as the unit.** Choosing a PR sets base and head for you.
- **Development inside a PR.** You can step through its commits one at a time.

## The experience you appear to want

You click Compare. A picker opens, listing your open PRs for this repo with number, title, branch, author, draft or review state, and age. Beside them it lists local worktrees with their branches. You pick PR #1831, and srcly compares its merge-base with its head. A commit strip shows the PR's commits. Stepping to commit 3 of 7 shows commit 3 against commit 2, in the same treemap and graph views. Picking a worktree compares that worktree's state against its base, the same way the working tree works today.

## Boundaries

### Must be true

- The working tree, branch and stash stay untouched. The existing snapshot rule from `pr-compare` holds.
- The picker still works without `gh` or without network access. It falls back to worktrees, branches and commits.
- Results stay deterministic for the same two commits.
- Repeat compares are fast, and the first compare is no slower than today.

### Must be avoided

- Making you type or remember SHAs and ref syntax for routine PR work.
- Sending repo data anywhere new. `gh` is only used to *read* PR metadata.

## What seems settled

- Use the `gh` CLI for PR context, not a GitHub token flow inside srcly.
- The PR diff is the primary mode. Commit-level stepping within a PR is the next layer.
- The compare treemap and graph stay as the views. This initiative is about choosing the input, and about speed.

## Possibilities, not decisions

- Prior art: your `git-visual-files` ("igitit") project, a SolidStart app. Its pieces include:
  - a worktree popover, from `git worktree list --porcelain`;
  - a branch picker with ahead/behind counts and linked-worktree badges, from `git for-each-ref`;
  - a range timeline drawer, from `git log forkBase..target`.

  It has no `gh` usage. `daily-planning/viewer/link-metadata.ts` has the only `gh api graphql` pattern found.
- Pre-warming the snapshot cache for open PRs in the background.
- Opening srcly directly on a PR by number (`?pr=1831`).

## Current reality that matters

- **The picker** is two `<TextInput list>` fields fed by one datalist (`client/src/compare/RefBar.tsx:28-57`).
- **The ref list:** `GET /api/compare/refs` returns 20 local branches and 30 commits on HEAD (`server/app/routers/compare.py:52-86`).
- **Missing entirely:** worktree listing, remote branches, `gh` usage, and any commit stepping.
- **Why a cold compare is slow.** Each uncached commit side gets:
  - a `git worktree add`;
  - a full `scan_codebase` of the whole repo;
  - an uncached dependency graph build.

  The two sides run sequentially (`server/app/services/compare/service.py:32-72`, `snapshots.py:210-244`). The cache is keyed by whole commit SHA, with an LRU of 40 entries and no per-file reuse across commits.
- **Commit stepping would multiply the cold cost.** Each step means one new side scan unless per-file results are reused.
- **Progress** comes from polling `GET /api/compare/{id}` every 250ms (`client/src/compare/api.ts:69-103`).

## Decided in round 1

- A picked worktree compares against its open PR's base when `gh` finds one. Otherwise it uses the merge-base with the default branch.

## Next step after confirmation

Shape the work. The first proof would be a `gh pr list` and `git worktree list` endpoint plus the picker, choosing a PR on modeler and landing in the existing compare.
