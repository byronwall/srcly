---
title: "PR compare mode — shape brief"
slug: "pr-compare"
phase: shape
status: current
last_updated: "2026-10-15"
---

# PR compare mode — what we are adding

**Outcome:** For any two commits, you can see what changed in the file tree and the dependency graph, side by side. You can also tell whether each changed area got better or worse.

**Primary flow:** Choose base and head (default: merge-base with `main` → working tree; any two commits from a picker) → srcly scans both → PR summary → focused before/after tree and dependency graph → widen for context.

## Feature scope

```text
PR compare mode
├── PLANNED ADDITIONS
│   ├── Snapshots: any commit, branch, or the working tree on either side
│   │   ├── commits are checked out read-only into a temp directory and scanned normally, cached by SHA
│   │   └── the working tree is scanned in place with the existing fingerprint cache
│   ├── Change set: added / removed / modified / renamed files from git, with +/- lines
│   ├── PR summary strip
│   │   ├── file counts by change type, net LOC
│   │   ├── per-metric movement over changed files (complexity, nesting, size, fan-in/out)
│   │   └── edges gained / lost, cross-folder edges called out
│   ├── Tree compare (Explorer in compare mode)
│   │   ├── only changed files plus their ancestor folders by default
│   │   ├── before → after columns with a signed delta, green or red by each metric's direction
│   │   └── "show unchanged" toggle and sorting by the size of the delta
│   ├── Treemap compare
│   │   ├── one layout over the union tree, each tile sized by max(before, after), drawn twice
│   │   ├── each side fills its tile to its own size; an empty hatched slot marks a file absent on that side
│   │   └── default scope is changed files and their folders; color uses the existing metric ramp
│   ├── Dependency compare
│   │   ├── one layout computed over the union of both graphs, drawn twice (left = before, right = after)
│   │   ├── left marks removed nodes and edges, right marks added; unchanged items are muted and stay in place
│   │   ├── default focus is the changed files plus 1-hop neighbors; the existing roll-up budget still applies
│   │   └── a widely used changed file shows "used by N files" instead of drawing every edge
│   └── Entry points: compare picker in the app shell, a shareable base/head URL, and `srcly compare` JSON for agents
├── EVALUATE BEFORE COMMITTING
│   └── change islands: connected groups of changed files as a hint for splitting the PR
└── LATER POSSIBILITIES
    ├── ripple / frontier view: callers of a changed symbol that did or did not change
    ├── route and component lenses (tsx-data-flow memo)
    └── open a GitHub PR by number
```

## Behavior

| Situation | Expected result |
| --- | --- |
| A file exists in both commits | Same box, same position on both sides; delta badges only on the right |
| A file was renamed | Matched by git rename detection and drawn as one moved node, not a delete plus an add |
| A metric where lower is better rises | The delta is red, whatever its sign |
| The changed set exceeds the budget | Folders roll up as they do today, and a rolled-up folder shows its own change counts |
| A widely used utility changed | It is marked "used by N files" with a bundled edge, and the rest of the graph is not lit up |
| A file grew from 100 to 400 LOC | Its treemap tile sits in the same place on both sides; the left fills a quarter of it, the right fills all of it |

## Decisions and boundaries

**Appetite:** One compare mode over the existing tree, metrics, and dependency graph. No new analyzers, no call-graph analysis, and no GitHub API.

**Key decisions:**
- **Union layout, drawn twice, for both the treemap and the graph.** Laying out each side on its own would move boxes between the two views. This shape lays out the union once and filters what each side shows. That guarantees stable positions. The existing grid layout handles the graph, and the treemap only needs different tile weights.
- **Diff on the server, drawing on the client.** A pure Python module turns two cached trees and two graphs into one compare payload: the change set, node status, and metric deltas. The UI and a future headless report share one definition of better and worse.
- **Snapshots via `git worktree add --detach` into srcly's cache directory**, removed after the scan. It leaves your checkout, branch, and stash alone, and it keeps the path layout real so tsconfig and package roots resolve.

**Boundary:** Compare mode is a separate view. The normal single-scan view stays as it is. Repositories that aren't git and commits outside the local clone are out of scope.

**First proof:** **Try:** Compare `aa3ed35^` → `aa3ed35` (the language-neutral graph PR, with 7 files added, 2 deleted, and 6 modified) on srcly itself, from the command line. Snapshot and scan both commits, then print the change set, metric deltas for each changed file, and the added and removed dependency edges as JSON. **Observe:** Every file from `git diff --name-status` appears with plausible deltas, and a second run finishes from the cache. **Decide:** If the deltas match a hand-checked sample and both scans take under about 2× a normal scan, build the compare UI on this payload. If snapshot scanning breaks path resolution, switch to `git archive` into a mirror of the path before building any UI.

**Settled:** per-metric deltas plus a neutral net line, with no overall verdict. Treemaps are in v1. The default head is the working tree, and both sides can be set to any commit.

See [intent-brief.md](intent-brief.md).
