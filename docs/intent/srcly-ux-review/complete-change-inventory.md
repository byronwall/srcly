---
title: "Changes → Compare: keep the whole change in view"
slug: "srcly-ux-review"
phase: shape
status: proposed
last_updated: "2026-11-22"
---

# Changes → Compare: keep the whole change in view

**Scope:** First slice of [#444](https://github.com/byronwall/srcly/issues/444), not implementation approval. A reviewer should answer “what changed, including the data driving the code?” and inspect the relevant revision without re-entering a range or losing their place.

## Starting point

At current main `5c1b671`, the server's Changes payload for the exact committed range [`bb2eb8e… → f2544ff…`](https://github.com/byronwall/srcly/commit/f2544ffc3ed203cb5cb7ec6441cd99450b87c0b1) gives 11 paths in both Touched and Net and a note that four paths were left out. Git gives 15: the missing paths are `engine/models/{library-models.schema,react,solid}.json` and `engine/test/srcly/__snapshots__/library-readers.txt`. Those four account for 397 of 469 additions in this commit; that is line volume, not a measure of importance. The Nov. 22 browser study also saw 15 in Compare; the post-fix check here was the server payload, not a browser rerun. The clearest witness is the new [`react-router/useParams` row](https://github.com/byronwall/srcly/blob/f2544ffc3ed203cb5cb7ec6441cd99450b87c0b1/engine/models/react.json#L352-L356), a declared URL-read origin absent from the parent. This proves a model-table change, not a change in trace behavior.

[#452](https://github.com/byronwall/srcly/pull/452) already opens Changes hunks at their correct repository, revision, side, path and range, including deleted content from its earlier revision. Keep that handoff, its visible revision label and no working-tree fallback. It does not restore the missing paths.

## Pick the path list, not a bigger graph

| Option | Tradeoff |
| --- | --- |
| Expand what the structural map parses | Makes more tiles immediately visible, but mixes an inventory problem with parser coverage, costs more on big repos, and encourages made-up metrics. |
| **Give Changes a complete changed-path list next to the existing map and carry its selected range/path into Compare** | Keeps the map and existing chunks useful while making non-structural changes findable. Requires an inventory contract and a real return-state handoff, not a layout rewrite. |
| Send reviewers to Compare for the missing files | Reuses Compare now but keeps Changes incomplete, loses Touched-only paths in an endpoint diff, and asks reviewers to reconstruct context. |

Recommend the middle option. One always-reachable **Changed paths** list is the discoverable, keyboard-accessible fallback next to the existing map. Present one result per logical path (show both names for a rename) and distinguish **Changed paths** from **Files with structural metrics**. For JSON and other supported text, show a bounded Git diff and exact historical source without generating structural chunks. Binary, mode-only and unreadable paths remain discoverable with the relevant reason, not an empty successful diff or metric zero. Keep existing map filters, chunk counts, commit rail, Only edits/In repo navigation, and source and diff selection behavior.

## Seams and cut line

1. **Inventory and evidence eligibility.** In `server/app/services/changelens/{hunks,chunks,service}.py`, separate Git change facts from which files the analysis reads. Use the resolved Changes window, scope and first-parent policy. Touched follows its actual included commits; Net uses its effective endpoints. Reuse Compare's NUL-delimited Git name/status handling (`server/app/services/compare/git_refs.py`) where semantics match; don't substitute Compare's two-snapshot result for Touched. Feed a separate inventory through the existing payload rather than giving unparsed paths pretend chunks. Do not widen scan enumeration, structural parsing or its size limits. Keep existing payload fields/counters compatible; label any view counts by what they count.
2. **Evidence and return.** For a selected path, distinguish a whole-window diff from one commit on the rail. Carry the repo, actual base/head or effective comparison endpoints, scope, mode, optional commit, old/new paths, selected side/range and stable return selection through Changes → Compare → source → Back. The cross-view input should carry exact refs, not a mutable branch label or the name of the current checkout. Keep Changes as the owner of its return state and reuse #452's source-locator contract at the evidence boundary. Compare is still an endpoint view; if a selected Touched-only edit was reverted, say that it has no endpoint diff and preserve its Changes receipt instead of picking another file.
3. **Coordinate, don't wait unnecessarily.** [#440](https://github.com/byronwall/srcly/issues/440) owns tracked eligibility for a single repository snapshot. Reuse its path normalization, status vocabulary and coverage contract when available; an exact Git change range can prove this slice independently. If it would create competing path identities, agree on a shared seam before merging the second implementation. Keep the existing [Product Grid batch-run task](../../../pgm/data/projects/srcly-backlog/nodes/task-start-the-data-flow-batch-run-from-the-app.md) for an explicit, progress-visible run; do not create a duplicate or require a batch run to see Git paths.

**Not in this slice:** new layout engine, automatic impact or behavioral-equivalence claims, unchanged-neighbor analysis, responsibility-movement scoring, arbitrary historical whole-program tracing, batch-run UX, or agent provenance. Those are separate shapes after this path-to-source proof. Start with reproducible committed ranges. Existing worktree and upstream-merge views must not regress; if an exact comparison endpoint cannot be expressed in Compare today, state why and keep the existing Changes/source path. Don't silently substitute HEAD for a worktree or the effective base tree.

## Acceptance proofs

- **Historical Git oracle:** For the full-repo range above, compare path sets, not just counts, with `git diff --name-status -z -M <base> <head>`. Changes exposes all 15; the four formerly omitted paths have no invented structural score. Use the keyboard to find the React JSON path, see its actual diff and open the head-side `useParams` row at the exact revision/range. Compare receives the same committed range and selection. Close source and go Back: the same Changes window, mode, scroll/selection and prior diff are available.
- **Falsifying control:** Edit one tracked JSON value, then revert it in a second commit. Both commits produce one logical path with two touches; Net excludes it across the pair. From the first commit alone, the real text diff and exact source remain inspectable without structural metrics. From Touched, Compare names the absent endpoint diff and returns to that selection.
- **Boundary controls:** A mode-only change and a binary file both appear, without a fake text hunk; a rename retains old/new identity and opens the correct side. A neighboring path outside a scoped scan does not leak in. An unavailable old blob yields an explicit historical-source error; no working-copy fallback. A shallow, truncated or excluded-upstream baseline must state the relevant scope/limit, not claim complete history.
- **Preserve and measure:** Re-run existing #452 tests, Changes/Compare source and keyboard smoke, and one measured TypeScript chunk. Do not regress chunk, diff, rail, Only edits/In repo or Compare cancel/progress. Inventory should reuse the existing Git work when possible; capture commands, timing and bytes read on the fixture and a larger repo to detect an accidental per-path read or parse. Do not turn shell timings into user-task speed claims.

**Decision needed only if proposed scope expands:** whether to make a mutable worktree or synthetic upstream-adjusted tree a first-class portable Compare endpoint, or place rows without structural metrics on the graph itself. Neither is needed to prove the committed first slice. The recommended default is an explicit unavailable state for unmatched endpoints and a single path list for non-structural rows.
