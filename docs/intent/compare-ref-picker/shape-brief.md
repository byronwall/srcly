---
title: "Compare ref picker — shape brief"
slug: "compare-ref-picker"
phase: shape
status: current
last_updated: "2026-10-15"
---

# Compare ref picker — what we are adding

**Outcome:** One picker that knows your work. Your open PRs (stacked ones included), your live worktrees and your branches are each one click from a correct compare. Inside a PR, you can step commit by commit.

**Primary flow:** Compare → picker opens on "My PRs" → pick #1922 → srcly compares its merge-base with `codex/concurrency-05-build-reuse` against its head → step through its commits with ◀ ▶.

## Feature scope

```text
Compare ref picker (replaces RefBar's datalist inputs)
├── PLANNED ADDITIONS
│   ├── Sources, each loading independently
│   │   ├── My PRs (via gh), with a toggle for all open PRs
│   │   │   ├── row: #, title, head → base, draft / review state, checks, updated
│   │   │   └── badges: "worktree", "local", "needs fetch"
│   │   ├── Worktrees: live ones only (no prunable), newest HEAD first,
│   │   │   searchable, showing branch and path
│   │   ├── Branches: local and remote, with ahead/behind counts
│   │   └── Advanced: today's free-text base/head fields, kept
│   ├── Picking
│   │   ├── PR → base = merge-base(origin/<baseRefName>, head), head = headRefOid
│   │   ├── worktree → head = that worktree's files on disk; base = its open PR's base,
│   │   │   else merge-base with the default branch
│   │   └── branch → merge-base with the default branch, as today
│   ├── Commit stepper (when a PR or branch range is picked)
│   │   ├── strip of first-parent commits, oldest → newest; ◀ ▶ and click
│   │   └── step i compares commit i-1 → commit i (the first step uses the merge-base)
│   └── Speed visibility
│       └── progress shows per-phase timings and cache hits
├── EVALUATE BEFORE COMMITTING
│   ├── scan the two sides in parallel instead of one after the other
│   └── pre-warm the next commit's side after each step lands
└── LATER POSSIBILITIES
    ├── reuse per-file analysis across commits (keyed by blob hash)
    └── ?pr=1922 deep link, plus the srcly compare --pr CLI
```

## Behavior

| Situation | Expected result |
| --- | --- |
| `gh` missing, not authed, or offline | The PR section shows the reason. Worktrees, branches and Advanced still work |
| Stacked PR (base is not `main`) | Only that PR's own changes appear, matching GitHub's file count |
| PR head commit not present locally | One click fetches it (objects only, no branch or worktree change), then compares |
| Picker opens on modeler (240 worktrees) | Git sections appear in under 300ms. PRs fill in when `gh` returns (about 2s, then cached briefly) |
| Step forward through a PR | Each step costs at most one new side scan. The previous side is a cache hit |

## Decisions and boundaries

**Appetite:** Medium. It adds one server sources endpoint, a picker component, worktree-as-head support, and a stepper. The compare engine and its views stay unchanged.

**Key decisions:**
- **Use the PR's real base.** Your PRs are stacked (#1927 → `codex/concurrency-02-trace-visibility`). The PR's `baseRefName` is used, not the default branch, so the diff matches GitHub's.
- **`gh pr list --json` behind one server seam.** One subprocess with a timeout and a short in-memory cache feeds everything. It is faked in tests from recorded JSON. The rest of the picker never depends on GitHub being reachable.
- **Worktree head means a scan of a directory.** It is today's WORKTREE semantics pointed at another path, reusing the path-and-mtime analysis cache. No checkout is needed.
- **Measure before optimizing.** The progress UI first shows phase timings, so it is clear whether the slow first run comes from checkout, scan or graph build. Parallel sides and pre-warming are evaluated afterward.

**Boundary:**
- srcly never changes branches, the stash, or any worktree's files. Fetching a missing PR head adds objects only.
- `gh` is read-only: list and view.
- Fixtures are synthetic or srcly's own PRs. No modeler PR data is committed, because the repo is public.

**Collisions:** Independent of the other three initiatives. It touches `client/src/compare/RefBar.tsx`, `CompareApp.tsx`, `CompareProgress.tsx`, `api.ts`, and `server/app/routers/compare.py` and `services/compare/*`. Unified-navigation also touches `compare/api.ts`, but only its push/popstate helpers. Keep that seam.

**First proof:**
- **Try:** `GET /api/compare/sources` (PRs, worktrees, branches) plus the picker, with PR picking only. Use modeler #1925 (base `main`) and stacked #1922.
- **Observe:**
  - each PR's changed-file count equals `gh pr view N --json changedFiles`;
  - the git sections render in under 300ms;
  - the phase timings for a cold side are visible.
- **Decide:** If the counts match, add worktree heads and the stepper. If stacked counts mismatch, fix base resolution (remote base ref, fetch) before anything else.

Intent: [intent-brief.md](intent-brief.md)
