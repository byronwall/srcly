---
title: Define the refactor recovery failure model
origin: repo-reading-brief
topic_id: srcly.refactor-journal-persistence-contract.v1
source_edition: 2026-11-05
source_url: https://chatgpt.com/space/page_4dc874109a8c819197f79f477b8e16b6
status: research-proposal
---

# Define the refactor recovery failure model

Specify which failures the refactor journal is meant to survive before extending its recovery evidence. The immediate question is whether its contract covers a stopped process with the operating system still running, or also operating-system failure and power loss. Those require different observations.

Assistant-generated research from the [November 5, 2026 Repo Reading Brief](https://chatgpt.com/space/page_4dc874109a8c819197f79f477b8e16b6). Exclude this document, branch, PR and derivative research from future substantive-activity ranking. No fault-injection experiment, power-cut test, application change or confirmed recovery defect is included.

## Reading

Thanumalayan Sankaranarayana Pillai et al., [All File Systems Are Not Created Equal: On the Complexity of Crafting Crash-Consistent Applications](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-pillai.pdf), OSDI, October 6–8, 2014. [Publication and talk](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/pillai).

BOB and ALICE connect crash-consistency claims to explicit filesystem persistence assumptions. Application operation order alone does not establish what survives a system crash. This historical Linux study is incomplete evidence, not a portability proof. ALICE used selective workloads and a pessimistic default model, omitted file attributes, and serialized threaded calls in issue order. Its results do not establish a Srcly vulnerability or validate Srcly's mode-preservation and concurrency contract.

## Verified baseline and ownership

Inspected November 5, 2026:

- Documentation branch baseline: main `e169c3df5b8a9cacd27025e17f1530c8221d9f76`.
- Independent implementation demand: open [#362](https://github.com/byronwall/srcly/pull/362), [#363](https://github.com/byronwall/srcly/pull/363), [#364](https://github.com/byronwall/srcly/pull/364) and [#365](https://github.com/byronwall/srcly/pull/365).
- Inspected implementation head: `a523c26a5e422762481cefe014d2d3c9c704bfb3`, the top of that unmerged stack. The refactor code is not in this documentation branch's main baseline.

The [decision document](https://github.com/byronwall/srcly/blob/a523c26a5e422762481cefe014d2d3c9c704bfb3/docs/intent/visual-refactoring/decision.md) already describes persistent journals, exact replay, interrupted-step recovery, source isolation and refusal to overwrite unknown edits. It also distinguishes compiler checks from runtime equivalence and warns that configured test commands can have external effects. Preserve those decisions. This proposal belongs to the existing refactor effort and does not introduce another executor, journal or storage engine.

The [current run implementation](https://github.com/byronwall/srcly/blob/a523c26a5e422762481cefe014d2d3c9c704bfb3/server/app/services/refactor/runs.py) supplies:

- Cross-process locking and source/worktree fingerprints.
- Exact before/after file contents and modes.
- A pending journal record before file changes, followed by an updated applied count and journal save.
- Recovery that accepts only known before/after content and refuses unknown edits.
- Temporary-file flushing and `fsync` before `os.replace` in `save` and `_write`.

Those two helpers do not show a containing-directory sync. Newly created directories, renamed entries, source deletion and mode changes are also part of the protocol. Their survival and ordering under machine failure should therefore be explicit assumptions to investigate, not inferred from a successful file `fsync`. This observation is not a reproduced failure, a portability verdict or a prescription to add synchronization calls without a supported-platform contract.

The [interrupted-step test](https://github.com/byronwall/srcly/blob/a523c26a5e422762481cefe014d2d3c9c704bfb3/server/tests/test_refactor.py#L121-L132) creates a pending record, writes the first change and reloads the run. It checks restoration and subsequent execution in an otherwise live filesystem. Other tests cover stale source/worktree refusal, failed-preview rollback and exact undo. The [Python tests](https://github.com/byronwall/srcly/blob/a523c26a5e422762481cefe014d2d3c9c704bfb3/server/tests/test_refactor_python.py) cover CRLF preimages, checkpoint failure, timeout and unexpected writes. These are useful existing checks; they were inspected, not rerun for this note.

## First deliverable is a failure contract

For one supported platform, record the OS, filesystem, mount/storage assumptions and exact implementation SHA. Name the boundary at which the CLI or API reports an applied step or complete plan. State the expected outcome separately for:

1. **Process interruption:** the executor stops while the kernel and filesystem remain live. Recovery restores the checkpoint before the interrupted apply or undo.
2. **Whole-system failure:** the kernel loses volatile state. The contract must identify which file contents, directory entries, removals and journal versions may survive. Do not silently extend process-restart evidence to this case.
3. **Foreign edits and I/O failures:** preserve unknown content and return an actionable refusal rather than overwriting it. A partial recovery attempt must remain inspectable.
4. **Checkpoint effects:** the decision document warns that configured checkpoint commands can have external effects; the [checkpoint runner](https://github.com/byronwall/srcly/blob/a523c26a5e422762481cefe014d2d3c9c704bfb3/server/app/services/refactor/checkpoints.py) detects worktree changes but is not a security sandbox. Retain that limit. A passing command, byte-exact file undo and durable acknowledgement are separate claims.

A valid result may be a deliberately narrow process-recovery guarantee with machine-failure durability left unqualified. Extending the guarantee is an implementation decision for #362–365's owner, not an outcome assumed by this research.

## Bounded future validation

Execution needs separate authorization. Use only a disposable synthetic repository and an isolated execution worktree. Start with the existing two-step file-move fixture and its importer/re-export rewrites; do not run on a user's working project or execute checkpoints with network or other external effects.

Draw the actual call sequence from the pinned code. Record pending-journal publication, each destination replacement or source removal, importer replacement, final applied-count/journal publication and response. Reuse the existing byte/mode fingerprints as an oracle and add explicit journal/applied-count observations. Do not presume the order in which the filesystem persists that sequence.

### Process lane

A bounded subprocess harness can interrupt the executor at these existing protocol boundaries:

- After the pending record is saved but before the first edit.
- After the first changed file, matching the existing simulated case.
- After the last file edit but before the final journal save.
- After the final save and before the caller receives the response.
- During an undo step.
- During recovery itself, followed by a second recovery attempt.

Include a no-interruption control and a pending-step case with one foreign edit, which must remain intact when recovery refuses. Record the exact stop point, exit outcome, restart result, journal status, applied count, file/mode fingerprints and whether the source checkout stayed unchanged. A timeout or harness error is missing evidence, not a pass. Killing a process does not simulate loss of the kernel's write cache.

### Persistence lane

Only if whole-system failure is intended to be supported, separately describe allowed persistence states for the same operation trace. A small disposable filesystem model or instrumented test double can enumerate selected journal/data/namespace survival combinations under a named model. Record the model and its omissions beside every result. Never label modeled states as observed behavior on a physical disk, or transfer one filesystem's results to all supported platforms.

The checker should distinguish a coherent prior checkpoint, a coherently acknowledged result and a named refusal requiring inspection. It must reject silently lost completion when the chosen contract promises completion survives that failure. It must also preserve unknown edits, avoid modifying the source checkout and keep the applied count consistent with the recovered files. The expected result at a particular stop point follows from the chosen contract, not from whatever the implementation happens to produce.

## Scope and stopping rule

Stop at a reviewed failure contract and a finite evidence matrix for the one fixture and platform/model. Record untested boundaries explicitly. If the current process-only contract is sufficient, retain it and stop. If a discrepancy is found, preserve the fixture and evidence for the existing owner; this note does not authorize code changes, a new implementation PR, issue creation or automatic repair.

No replacement WAL, database migration, generic crash-testing framework, reset of a source checkout, arbitrary test-command execution or broad durability claim is proposed. Passing tests would support only their documented failure model and cases.

## Deduplication and validation record

Before drafting, all open Srcly PRs and targeted all-state searches for refactor, journal, recovery, Pillai, durability and power loss were checked. Text searches covered research, intent and backlog material across 182 fetched remote refs. They found the existing refactor decision and journal ownership, but no matching filesystem failure-model proposal. Existing agent-reporting work also discusses atomic snapshot writes; that concerns evidence output, not this multi-file refactoring transaction. Recheck ownership before any experiment.

Prior daily-brief research was used only for deduplication. The new contribution is the persistence model and acknowledgement boundary; it does not repeat the October 18 protocol-aware simulation reading or October 30 stale-recovery cleanup reading.

Repository bootstrap completed. This change is one Markdown research document. Documentation whitespace, provenance fields, pinned source paths and the repository's changed-area check are validated before publication. Application/browser suites, the active implementation stack's tests and both proposed validation lanes are not run for this documentation-only proposal. Remote CI status is reported separately.
