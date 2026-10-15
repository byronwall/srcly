---
title: "PR compare mode — implementation plan"
slug: "pr-compare"
phase: plan
status: current
last_updated: "2026-10-15"
---

# PR compare mode — implementation plan

## Plan at a glance

The plan proves the backend before it draws anything. Milestone 1 is a headless `srcly compare` command that snapshots two refs, scans both, and prints one compare payload as JSON. That payload holds the change set, per-file metric deltas, and the dependency edge diff. It answers the two questions that would sink the feature: whether a commit can be scanned correctly from a temporary checkout, and what a compare costs. No UI work is spent on them first.

After that, every milestone adds one view on top of the same payload. The Explorer table comes first because it is the cheapest way to show better and worse. The treemap comes next, then the dependency graph, which is the hardest view. Each milestone ships a working compare mode, and the normal single-scan view is never touched.

**Pushback:** the shape had the headless report under evaluation. The plan builds it first anyway, because it is the fastest test loop, and agents can use it straight away. Diffing also happens on the server, so the UI, the CLI, and the tests share one definition of a "worse" change. That definition reuses the existing `higher_is_riskier` flags in `reporting.py:METRIC_DEFINITIONS`.

## Implementation strategy

- **First proof:** `srcly compare aa3ed35^ aa3ed35 --json` on srcly itself.
- **Primary seam:** a `snapshots` service that turns a ref (a SHA, a branch, `WORKTREE`, or `merge-base`) into a scannable directory plus a cache key. Everything after it treats both sides the same way.
- **Fast local loop:** `cd server && uv run pytest tests/test_compare*.py`. The tests use a real throwaway git repo built in `tmp_path`, which is cheap and needs no network. `cd client && pnpm test` covers the pure union-layout functions.
- **Local dependencies:** only the git CLI. It is real at every rung, because faking git would hide the exact path and rename behavior being tested.
- **Rollout and rollback:** compare is a new CLI subcommand, a new `/api/compare` router, and a compare mode reached through its own URL parameter. Removing the entry point removes the feature.

## Milestone 1: `srcly compare` prints a correct compare payload

This proves snapshot scanning and diff correctness with no UI.

- **Change: ref resolution and snapshots** (`server/app/services/compare/snapshots.py`)
  - Resolve refs with `git rev-parse`. `merge-base` means `git merge-base <default branch> HEAD`, and `WORKTREE` means scan the repo root in place.
  - For a commit, run `git worktree add --detach <srcly cache dir>/snapshots/<sha>`, scan it, then run `git worktree remove --force` in a `finally` block. Prune stale snapshot directories when the service starts.
  - Test: the user's branch, HEAD, stash list, and `git worktree list` are unchanged after the run, including after a forced exception.
- **Change: cache commit scans by SHA** (`services/cache.py`)
  - Add a commit-keyed entry where the fingerprint is `sha + srcly version`, so no tree walk is needed. The working-tree side keeps the existing path and mtime fingerprint.
  - Test: a second compare loads both commit sides from disk without starting a worker pool.
- **Change: the pure compare module** (`services/compare/diff.py`)
  - Inputs are two `Node` trees, two `DepGraph`s, and the output of `git diff --name-status -M` plus `--numstat`. Paths are made relative to each snapshot root before matching, because `Node.path` is absolute and differs per snapshot.
  - Outputs are a change set (added, removed, modified, renamed, with +/− lines) and per-file metric deltas, each marked better, worse, or neutral using `higher_is_riskier`. A net summary counts the changed files and sums their deltas. The edge diff lists dependency edges added and removed at file level, and flags edges that cross folders.
  - Tests: fixture trees with rename, add, delete, a metric where lower is better, and an unchanged file. There are no git calls in these tests.
- **Change: the CLI subcommand** in `run.py` (`compare <base> [head] [--json|--out DIR]`, head defaults to `WORKTREE`). It shares payload code with the future API.

### Desired end state

- `srcly compare aa3ed35^ aa3ed35 --json` lists all 15 changed files (7 added, 2 deleted, 6 modified), and a hand-checked sample of their deltas is correct.
- The dependency edge diff shows the new `deps/` modules wired in.
- The first run takes no more than about 2× a normal srcly scan, and the second run is served from the cache.
- **Decision:** if tsconfig or package-root resolution differs inside the snapshot directory, use the Spike below before Milestone 2.

## Milestone 2: compare mode in the UI with a focused Explorer table

This is the first visible proof. It is cheap because it reuses the Explorer.

- **Change: API.** `POST /api/compare {base, head}` starts or joins a scan for each side through `ScanJobManager` and returns a compare job with SSE progress, following the `/api/scans` pattern. `GET /api/compare/{id}/result` returns the payload. Raise `MAX_MEMORY_ENTRIES` or pin the two compare entries so switching views does not evict a side.
- **Change: base content for the code viewer.** `GET /api/files/content?ref=<sha>` uses `git show`, because the before-side snapshot directory is deleted after its scan.
- **Change: the compare shell** (`client/src/compare/`). It has a ref picker with recent branches and commits, `merge-base` → `WORKTREE` as the default, and a swap button. The `?compare=base..head` URL parameter makes a view shareable. A summary strip shows file counts, net LOC, per-metric movement, and edges gained and lost.
- **Change: Explorer compare mode.** Rows are the changed files and their ancestor folders. Each metric column shows before → after with a signed delta in the existing ramp's good and bad colors, and you can sort by delta. A "show unchanged" toggle widens the list.

### Desired end state

- Opening `?compare=aa3ed35^..aa3ed35` shows only the 15 files and the summary strip, and a red delta means worse for that metric.
- Opening a removed file shows its base content.
- Vitest covers the compare row model, and pytest covers the API.

## Milestone 3: side-by-side treemaps share one layout

- **Change: union treemap layout** (`viz/treemap/utils/compare.ts`). Build a union hierarchy from the change set's paths, weight each tile by max(before LOC, after LOC), and run `d3.treemap` once.
- **Change: two canvases from one layout.** Each side fills its tile to its own LOC, using an inset rectangle scaled to the side's share of the area. Each side colors by the selected metric, and a missing file is drawn as an empty hatched slot. Zooming and selection are linked across both sides.
- **Spike: readability.** **Decision required:** whether max-weight tiles stay readable in PRs with many adds and deletes. **Evidence to gather:** screenshots of `aa3ed35` and `6687816` (15 added files). **Fallback:** group added and removed files into their own bands within each folder.

### Desired end state

- Every changed file is in the same place on both sides. A file that grew is visibly fuller on the right, and a deleted file is hatched on the right.
- A vitest test asserts that the tile rectangles are identical across the two sides.

## Milestone 4: dependency graph before and after on one union layout

- **Change: union graph view model.** Merge the two `DepGraph`s, giving each node and edge a status: both, before-only, or after-only. Focus by default on the changed files plus their 1-hop neighbors. Then run the existing `buildViewModel` budget and roll-up over the union. A rolled-up folder shows its own change counts.
- **Change: draw it twice.** Call `layoutViewSync` once and render two `DependencyCanvas` instances. The left draws removed items in strong color, the right draws added items, and unchanged items are muted. A changed file used by more than N files is drawn as "used by N" with one bundled edge.
- **Test:** vitest asserts identical box positions across both sides, and the existing geometry checks (zero edges through boxes) hold on the union.

### Desired end state

- The `88a48f1` compare shows the symbol-focus changes on the right, in the same positions as on the left.
- A hub-file change does not light up the whole graph.

## Open decisions and spikes

- **Snapshot path fidelity (Milestone 1).** **Decision required:** can a worktree in the cache directory resolve like the real checkout? **Evidence to gather:** compare the dependency graph of HEAD scanned in place with the same commit scanned as a snapshot. They should be identical. **Fallback:** create the snapshot as a sibling directory of the repo root.

## Below the cut line

- Change islands as a hint for splitting a PR. This is a cheap follow-on, because it needs only connected components over the edge diff.
- Ripple and frontier views, route and component lenses, and opening a GitHub PR by number.
- Rename matching at the symbol level, and side-by-side source diffs inside the code viewer.
- Comparing more than two refs, or watching a branch over time.
