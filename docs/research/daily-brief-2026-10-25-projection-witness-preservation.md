---
title: Context-valid witnesses through graph projections
origin: repo-reading-brief
topic_id: srcly.projection-witness-preservation.v1
source_edition: 2026-10-25
source_url: https://chatgpt.com/space/page_3358521822708191983f8eae35a55272
status: research-proposal
---

# Context-valid witnesses through graph projections

Assistant-generated research from the [October 25, 2026 Repo Reading Brief](https://chatgpt.com/space/page_3358521822708191983f8eae35a55272). Stable topic ID: `srcly.projection-witness-preservation.v1`; origin: `repo-reading-brief`. Exclude this document, branch, PR and derivative assistant research from future substantive-activity ranking. They are research input, not independent user demand or product implementation.

## Decision to investigate

Does a context-valid engine answer remain equally qualified after the client combines anchors, deduplicates endpoint pairs, folds reference boxes and computes reach emphasis? Investigate this **projection boundary**, not another engine call-identity implementation. No projection bug is demonstrated here. The first deliverable is a small, reproducible witness-preservation audit; retain current behavior if it passes.

A graph may contain individually justified edges without every path through those edges being valid for the selected seed. Visual overlap can mean “these queries contain the same element,” not “the value from this caller reaches every destination in the combined picture.” Make that distinction explicit in the experiment and eventual UI decision.

## Reading and transferable mechanism

Susan Horwitz, Thomas Reps and David Binkley, [Interprocedural Slicing Using Dependence Graphs](https://www.cs.purdue.edu/homes/xyzhang/fall07/Papers/p26-horwitz.pdf), *ACM TOPLAS* 12(1), January 1990, pp. 26–60, supplies the central distinction. Plain transitive closure across procedure boundaries can mix callers. Their system-dependence graph adds summary dependence edges and uses two restricted reachability passes to preserve calling context. Study the motivating example on pp. 28–29 and the slicing algorithm in section 4, rather than copying its representation.

The paper analyzes a restricted imperative language and reports that the complete interprocedural algorithm was not yet implemented. It is not a JavaScript, closure, heap, framework or asynchronous-runtime solution. Its useful transfer is a proof obligation: connectivity alone does not establish a context-compatible dependence. Srcly already implements a different bounded invocation-stack mechanism. This proposal asks whether later display transformations preserve its answer, not whether to replace it with the paper's algorithm.

Ben Livshits and colleagues, [In Defense of Soundiness: A Manifesto](https://yanniss.github.io/Soundiness-CACM.pdf), *Communications of the ACM*, February 2015, pp. 44–46, provides the evaluation discipline: identify deliberate omissions and evaluate their consequences on the inputs being analyzed. For this audit, record named unsupported cases and budget stops alongside successful witnesses. A dynamically observed path could expose a missing behavior, but a finite observation would not establish universal soundness. Nor should a named Srcly frontier be described as the same contract as a conservative whole-program overapproximation.

## Verified repository baseline and scope

Inspected October 25, 2026. Main was `84fe9225c7189b3822f342198c88553b1e4a930a`. The release commit identifies the snapshot only; it is not evidence of new demand. Read [AGENTS.md](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/AGENTS.md) and [CODE_MAP.md](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/docs/CODE_MAP.md) before later implementation. This document adds no feature file, contract or code-map row.

| Existing work | What must be preserved |
| --- | --- |
| Merged [#132](https://github.com/byronwall/srcly/pull/132), T13 | Bounded invocation stack, call-paired returns, negative tests for two helper calls and a non-returned argument. Do not propose call sensitivity as missing. |
| Merged [#123](https://github.com/byronwall/srcly/pull/123), T2 | Structural declaration links are not proven edges; prop reads retain relation evidence; partial outcomes are meaningful. |
| Merged [#142](https://github.com/byronwall/srcly/pull/142), T20 | Up to three same-direction anchors, separate engine queries, shared element IDs, generation protection and an existing merge adapter. |
| Merged [#136](https://github.com/byronwall/srcly/pull/136), T16 | Existing route-edge explanation/ledger surface; do not invent a second generic explanation product. |
| Open [#151](https://github.com/byronwall/srcly/pull/151), head `1e872dc128e8f5e5d9d72307999d0b96beabaa18` | Proposed own-function facts, unbound-read frontiers, budget-stop consolidation and engine-fingerprint cache invalidation. These are not in the inspected main. |
| Open [#152](https://github.com/byronwall/srcly/pull/152), head `696a15bb60b273ce33a85eb7dc7ba9721ca7f5a6`, stacked on #151 | Proposed reference folding and named stop presentation. Evaluate this as a separate candidate snapshot, never silently combine it with main. |

The current [multi-anchor adapter](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/client/src/viz/deps/flow/multiAnchorAdapter.ts) merges nodes by element ID and keeps the first edge for a `source|target` pair. Its first retained edge therefore supplies relation, status and proof for that pair. The [single-anchor adapter](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/client/src/viz/deps/flow/anchorAdapter.ts) also deduplicates endpoint pairs. These are source observations, not evidence that conflicting input edges occur.

[reach.ts](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/client/src/viz/deps/flow/reach.ts) walks the projected graph. Faint nonstructural edges stop it; structural links are traversable but not lit as proven edges. Its public node counts therefore have a deliberately broader structural-navigation interpretation than a simple proven-edge path. Preserve and document that distinction: do not automatically treat every traversed node as a pure data-dependence theorem.

The [#152 adapter](https://github.com/byronwall/srcly/blob/696a15bb60b273ce33a85eb7dc7ba9721ca7f5a6/client/src/viz/deps/flow/anchorAdapter.ts) identifies same-label, same-side reference boxes with one incoming `references` edge, removes those reference links and redirects outgoing sources to the retained box. Research must examine the discarded reference evidence as well as the retained outgoing evidence. The implementation has not been exercised in this research.

## What is new, and what is already covered

[Engine anchor tests](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/engine/test/srcly/anchor-graph.test.ts) already assert that `props.a` and `props.b` in `two-call-identity-helper.tsx` independently reach only their own slots, that a seed inside the helper remains ambiguous, and that `returns-other-argument.tsx` never produces a false terminal. Reuse these oracles.

[Multi-anchor tests](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/client/src/viz/deps/flow/multiAnchorAdapter.test.ts) check shared boxes, unique nodes and one-anchor behavior using a synthetic second graph. The inspected file does not test context-sensitive reach after merging the real two-call outputs. Existing [adapter tests](https://github.com/byronwall/srcly/blob/84fe9225c7189b3822f342198c88553b1e4a930a/client/src/viz/deps/flow/anchorAdapter.test.ts) cover relation/status/proof preservation and structural strokes for captured fixtures; #152 adds a folding example. The missing *research question* is cross-stage semantic preservation, not an asserted absent test suite.

Reviewed research PRs [#101](https://github.com/byronwall/srcly/pull/101), [#102](https://github.com/byronwall/srcly/pull/102), [#103](https://github.com/byronwall/srcly/pull/103) and [#113](https://github.com/byronwall/srcly/pull/113), the current robustness plan, research-directory inventory, and open/closed PR searches. #101 supersedes the earlier integration proposals; #113 concerns dependency-aware reuse and edit invalidation, not projection semantics. This proposal neither reopens those superseded proposals nor changes their dispositions. Search coverage is not proof of exhaustive novelty; refresh it before acting.

## Proposed invariant and audit record

For a **value-flow claim from a selected seed**, require an ordered witness compatible with that seed's invocation context. A union of individually valid edges is insufficient. For a shared element selected without a unique seed/context, retain explicitly separate alternatives or describe the selection as structural/ambiguous; do not silently choose whichever anchor arrived first. This is a proposed review contract, not a claim about a reproduced UI failure.

For every inspected display claim, record:

- snapshot, program hash, generation, direction, seed element and contributing anchor query;
- source/target element IDs, original relation IDs/kinds/statuses and evidence locations;
- ordered call-entry/return pairing or the exact boundary where compatibility is unknown;
- projection mapping from original IDs to displayed IDs, including folded links;
- whether the UI asserts data dependence, structural navigation, shared presence or a stop;
- expected and actual terminal/frontier sets, retained proof alternatives and any discrepancy.

Compare normalized claim sets, not pixel positions, node order or raw object serialization. Anchor labels and chip order may intentionally change with selection order. The semantic evidence attached to a chosen seed must not silently change.

## Small validation matrix for a separately authorized agent

Run first on the two pinned snapshots, with one engine session/generation per fixture. Capture complete engine results before projecting; retain the original results as the oracle input. No tests below were run for this document.

| ID | Fixture or transformation | Required observation |
| --- | --- | --- |
| PW01 | Existing `engine/examples/value-flow-basics/src/two-call-identity-helper.tsx`: query `props.a` and `props.b` separately, then merge A+B and B+A | A's value-flow claim retains only its own terminal; B's retains only its own. Shared helper boxes may be drawn once, but paths cannot borrow the other query's exit. |
| PW02 | Same fixture, seed `value` inside the helper | Preserve the existing two-call ambiguity/frontier contract. Adding an outer anchor must not silently convert the inner seed to an unqualified proven result. |
| PW03 | Existing `returns-other-argument.tsx`, combined with another supported anchor | The non-returned argument still has no terminal witness. Presence of a terminal elsewhere in the merged view is not success for that argument. |
| PW04 | Same endpoint pair with distinct relation/proof/status records | First test whether real engine outputs produce this case. Then use a clearly marked synthetic projection fixture to specify collision handling. A synthetic failure demonstrates an adapter contract issue only, not a real-world engine bug. |
| PW05 | #152 reference folding on its captured fixture, plus a partial/structural incoming-reference variant | Every displayed transfer can expand to its original chain; removed evidence is retained or the displayed claim is qualified. Same label is not itself proof of substitution safety. |
| PW06 | Declaration anchor with structural parameter/return links and existing `half-landed.tsx`; #151 `nested-helpers.tsx` separately | Keep structural navigation distinct from value dependence; a sibling prop's origin cannot certify an unbound read. Reuse #151's intended fix rather than replacing it. |
| PW07 | Lower an existing supported walk budget on a fixture that reaches the limit | Omitted work remains a named stop. A second anchor or folded view cannot erase incompleteness for the first seed; counts distinguish visible coverage from complete evidence. |
| PW08 | Repeat a query, remove/re-add an anchor, reverse two anchors, then use three | Claim/proof sets remain stable modulo declared focus changes; duplicate input does not manufacture new evidence. Mixed generations must still be refused by existing orchestration. |

Begin with PW01, PW03 and PW05: they provide the smallest engine-to-client comparison. Include both directions only where the current contract supports them. If recursion, callbacks, dynamic dispatch or closure capture are unsupported, record the stop; do not expand the analyzer just to make the matrix green.

## Options and stopping rules

1. **No change beyond tests/documentation.** Prefer this if captured results prove that the necessary context survives projection and semantic claims are order-independent.
2. **Keep per-query provenance through the display.** A shared visual node can retain multiple semantic owners; reach is computed from the selected query's evidence. Costs include more metadata and a context-choice UI.
3. **Preserve multiple edge witnesses rather than first-wins deduplication.** Useful only if different evidence can actually collide. It does not by itself prevent cross-context path composition.
4. **Qualify or avoid a lossy fold.** Keep reference boxes where the incoming chain cannot be safely represented. This sacrifices compactness before it sacrifices evidence.

Do not prescribe a universal status ranking such as “proven wins” or “partial wins”: two statuses may describe different contexts. Do not adopt summary edges, rewrite the engine or add a generic graph framework from this reading alone. The default is a focused projection experiment, not broader analysis scope.

Stop and report the first minimal counterexample with raw results and mapping. Classify it as engine, projection, claim wording or unsupported-oracle ambiguity before proposing a fix. If the fixture matrix passes, report that bounded result and retain the current design; it is not proof for all JavaScript programs.

## Handoff and validation status

A later agent should refresh the main and PR heads, reconcile newly added tests, capture the first three cases, and return the witness ledger plus a small proposed disposition. Follow AGENTS.md's restrictions on `engine/src/analysis`; this research does not authorize implementation. Reuse the existing targeted engine/client tests and existing browser smoke after any separately authorized change.

This PR is documentation only. Repository source, PR metadata, current research conventions and primary readings were inspected. No application tests, runtime captures, benchmark, fault injection or proposed experiment were executed. CI on the documentation head can establish repository check status, not the hypothesis above. No application code, generated contracts, settings, issues, merges, deployments or releases are changed.
