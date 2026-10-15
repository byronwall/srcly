# Local activity — implementation plan

## Plan at a glance

Verify bounded history extraction before any UI or combined score. Then compare useful decisions on real repositories. Source scanning stays independent throughout.

## Implementation strategy

Depend on metric trust's source and availability contract. Reuse repository-root discovery in `analysis.py`, but keep history in a small separate service, proposed as `server/app/services/git_activity.py`. Its input is a root, revision, window and explicit traversal policy. Its output is file frequency, commit evidence, completeness and dirty-source state.

The first fixture uses saved Git output. Proposed focused loop: `cd server && uv run pytest tests/test_git_activity.py`. Add temporary real Git repositories to the same tests for protocol fidelity. No network or credentials are needed. Inject missing Git, shallow objects, malformed output and a timeout.

The real local Git binary is the only new material dependency. Use argument arrays, NUL-delimited paths and the official `git log` contract. `--follow` applies to one file, so do not assume it solves repository-wide renames. Use a bounded batch with an explicit initial rename policy. [Git manual](https://git-scm.com/docs/git-log).

Bypass activity with one option. Revert its integration commit to remove it. No mixed-version API or database is required.

## Milestone 1: File histories produce correct, inspectable counts

Parse saved `git log` output into a human-readable table with the exact window, HEAD, traversal policy and supporting commits. Then run the same cases against temporary real repositories with whitespace/non-ASCII paths, rename, merge and formatting commits. Choose and document whether merge changes are excluded; do not count the same change twice.

Return explicit incomplete status for shallow history and unavailable status without Git. Pin history to HEAD, flag dirty source, and set a bounded runtime limit. Report truncation instead of silently treating a partial pass as complete. Do not add churn to frequency as a second vote. Folder frequency uses the union of touching commits rather than summed file counts.

### Desired end state

- A local table reconciles manually with Git for all fixture histories.
- Saved-output and real-Git tests establish both counting and protocol behavior.
- Source scanning succeeds when history is absent or disabled.

## Milestone 2: Activity changes justified review priorities

Using the portfolio protocol, verify ten file histories in each of three authorized repositories. Compare source-only and activity-assisted queues. Start with a 90-day window and inspect 180-day sensitivity; record these as provisional choices.

Add an optional activity column and supporting-commit detail to `Explorer.tsx` and report output only after the extraction gate passes. A two-axis view may follow using existing visualization primitives; avoid a new default aggregate. Keep history configuration and source measurement manifests distinct.

Default visibility requires useful new decisions in at least two repositories and acceptable local cost. Record runtime and memory against source-only scanning; propose a budget from observed pilot cost before enabling it by default. If no useful decisions appear, retain an optional report or remove the prototype.

### Desired end state

- Every displayed count opens the commits and policy that support it.
- No-history and dirty-source cases remain explicit in UI and reports.
- Focused tests, local browser use, client build and reporting tests verify the optional path.

## Below the cut line

- Function archaeology, remote fetch, author scores and ticket integration.
- Co-change until frequency earns its cost. A later proof must show a hidden peer, an expected test pair, and a bulk-change false positive.
- Universal churn thresholds or a combined health score.
