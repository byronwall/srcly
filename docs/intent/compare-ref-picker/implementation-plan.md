---
title: "Compare ref picker — implementation plan"
slug: "compare-ref-picker"
phase: plan
status: current
last_updated: "2026-10-15"
---

# Compare ref picker — implementation plan

## Plan at a glance

The plan proves PR resolution before building any picker. Milestone 1 adds a `gh` seam and a sources endpoint. It also adds `pr:<n>` as a ref that `resolve_ref` understands. That makes `srcly compare pr:1922` from the CLI the first proof. It answers the question that would sink the feature: does the PR's own base give the same diff as GitHub, including for stacked PRs? It costs one server change and no UI.

Milestone 2 replaces the datalist with the picker, using sources that load independently. Milestone 3 makes "another worktree" a head. It reuses the existing in-place scan, so no new snapshot machinery is needed. Milestone 4 adds the commit stepper. Phase timings land in Milestone 1, so every later speed decision rests on measurements instead of the feeling that "the first run was slow".

**Pushback:**
- The shape puts the picker first. The plan puts `pr:<n>` ref resolution first, because the CLI, the URL (`?compare=pr:1922..`) and the picker can all share it. One resolver also means one place to get stacked bases right.
- `gh` is used only through `run_gh`, a single monkeypatchable function, so tests never need the network.

## Implementation strategy

- **First proof:** `srcly compare pr:1925` and `srcly compare pr:1922` on modeler. The changed-file counts must equal `gh pr view N --json changedFiles`.
- **Primary seam:** `services/compare/github.py`. `run_gh(repo, *args)` handles the timeout, the JSON parse, and the reasons for failure (no binary, not authenticated, no network). On top of it sit `list_prs(repo)` and `pr_info(repo, n)`.
- **Fast local loop:** `cd server && uv run pytest tests/test_compare*.py`. It uses the real-git `repo` fixture (`tests/test_compare_snapshots.py:40-57`) and monkeypatches `run_gh` with recorded JSON. Client: `cd client && pnpm test`.
- **Local dependencies:** git is real at every rung, as today. `gh` is faked in tests and real only in manual modeler checks.
- **Live confirmation:** run the CLI and the UI by hand on modeler PRs #1925 (base `main`) and #1922 (stacked). Record before/after timings in the PR description, not in the repo, since srcly is public.
- **Rollout and rollback:** the free-text base/head fields stay under "Advanced". Any source the picker can't load hides itself and shows a reason. Reverting Milestone 2 brings back the old RefBar.

### Material dependency proof strategy

`gh` is the only new external dependency.

```text
recorded gh JSON via monkeypatched run_gh (pytest)
    → real gh on modeler, by hand (CLI + UI)
```

No contract suite is needed, because the server reads only fields that are stable in `gh pr list --json`.

## Milestone 1: `pr:<n>` resolves to a GitHub-equal compare, with phase timings

- **Change: gh seam** (`server/app/services/compare/github.py`, new)
  - `run_gh(repo, *args, timeout=10)` runs `subprocess.run(["gh", ...], cwd=repo)`. A missing binary, a non-zero exit or a timeout comes back as `GhUnavailable(reason)`.
  - `list_prs(repo, mine=True)` runs `gh pr list [--author @me] --limit 50 --json number,title,headRefName,baseRefName,headRefOid,isDraft,reviewDecision,updatedAt,author,statusCheckRollup`. The result is cached in memory for 60s per repo.
  - Tests: monkeypatch `run_gh` for the success path, the missing-gh path, and the non-zero exit path.
- **Change: resolve `pr:<n>`** (`git_refs.py:99-107`)
  - Base is `git merge-base origin/<baseRefName> <headRefOid>`. If that ref is missing, fall back to the local `<baseRefName>`.
  - Head is `headRefOid`. If the commit isn't local, run `git fetch origin pull/<n>/head`, which only fetches objects (no branch or worktree change). Then verify the commit again.
  - `ResolvedRef.label` becomes `#<n> <title>`.
  - Tests: build a stacked branch in the fixture repo, fake the PR JSON, and check that the change set holds only the top PR's files.
- **Change: phase timings** (`jobs.py:109-112` `_set_phase`)
  - Record `phase_seconds` in the snapshot (`jobs.py:73-83`).
  - `CompareProgress.tsx` shows the elapsed time per phase, plus "cached" from `payload.base` and `payload.head` (`service.py:20-29`).
- **Change: path passthrough.** `fetchRefs` and `startCompare` (`client/src/compare/api.ts:53-60`) send the analyzed repo path instead of relying on the server's `ROOT_PATH`.

### Desired end state

- `srcly compare pr:1925` and `pr:1922` on modeler match GitHub's changed-file counts.
- The progress panel shows where a cold compare spends its time.
- **Decision:** if stacked PRs mismatch because of rebases or force-pushes, use the PR's merge commit base from `gh pr view --json baseRefOid` instead.

## Milestone 2: Rich picker with independent sources

- **Change: `GET /api/compare/sources?path=&kind=prs|worktrees|branches`** (`routers/compare.py`)
  - Each kind is fetched separately, so the git kinds return immediately.
  - Worktrees come from `git worktree list --porcelain`, with prunable entries and srcly's own `snapshots/` entries dropped. They are sorted by HEAD commit date. This follows the parser in `git-visual-files/src/lib/gitWorktrees.ts:75-184`.
  - Branches come from `for-each-ref refs/heads refs/remotes` with `%(upstream:track)`, as in `git-visual-files/src/lib/gitBranchSummaries.ts:188-227`.
  - Tests: fixture repo with two worktrees, one of them prunable.
- **Change: `ComparePicker.tsx`**, a popover that replaces the datalist (`client/src/compare/RefBar.tsx:28-57`).
  - It has sections for My PRs (with an "all open" toggle), Worktrees and Branches, plus search, and Advanced holding the old free-text fields.
  - PR rows show #, title, head → base, draft or review state, a checks summary, the update time, and the badges "worktree" and "needs fetch".
  - Picking a PR navigates to `?compare=pr:<n>..pr:<n>` (`compareHref`, `api.ts:119-124`). The resolver treats `pr:n` on the base side as the PR base.
  - Use the shared `Popover`. If quick-fix PR D has landed, pick up its fixes.
- **Change: PR context in the header.** When the compare is a PR, the summary strip shows the PR title and number.

### Desired end state

- Opening the picker on modeler renders the worktree and branch sections in under 300ms. PRs appear within about 2s, or a reason is shown.
- One click on a PR lands on the correct compare, and the URL can be shared.

## Milestone 3: A worktree as the head

- **Change: a `worktree:<path>` head ref**
  - `ResolvedRef` gains `dir: Optional[Path]`.
  - `load_side` calls `_load_worktree(dir)` (`snapshots.py:247-276`). That cache is keyed by absolute path, so worktrees don't collide.
  - `list_changes` runs with `cwd=dir` for the head (`git_refs.py:113-155`).
  - Base: the PR base when `list_prs` finds an open PR for the worktree's branch, otherwise the merge-base with the default branch.
  - Tests: compare a second worktree of the fixture repo that has uncommitted edits. The result shows those edits, and neither worktree's state changes.
- **Change:** the picker's worktree rows produce `?compare=auto..worktree:<path>`.

### Desired end state

- Picking any live modeler worktree compares it correctly, without a checkout, using its PR base when one exists.

## Milestone 4: Commit stepper inside a PR or range

- **Change: `GET /api/compare/commits?base=&head=`** returns `git rev-list --first-parent --reverse base..head` with subjects. Cap it at 100 commits.
- **Change: `CommitStepper.tsx`** under the summary strip: a strip of commits with ◀ ▶ buttons and click-to-select. Step i navigates to `c[i-1]..c[i]`, where `c[-1]` is the merge-base. The whole-PR view stays one click away.
- **Spike: parallel sides or pre-warming.** Use the Milestone 1 timings.
  - **Decision required:** keep sequential sides, run them in parallel (`service.py:49-67`), or pre-warm the next step's side.
  - **Evidence to gather:** cold-side seconds on modeler, with sequential vs parallel scans under the shared process pool.
  - **Fallback:** keep sequential sides and pre-warm only the next commit.

### Desired end state

- Stepping forward through a modeler PR costs at most one new side scan per step.
- Each step shows only that commit's changes.

## Below the cut line

- Reusing per-file analysis across commits, keyed by blob hash.
- A `?pr=1922` shorthand and `srcly compare --pr` sugar. `pr:<n>` already covers both.
- PRs from forks whose head can't be fetched.
- Review comments and check details inside srcly.
