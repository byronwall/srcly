# Explain connection: implementation plan

Status: planned for review; application implementation is not authorized by this research run.
[Research summary](../../research/dependency-analysis-ui-2026-10-28/README.md) · [Recommendation review](../../research/dependency-analysis-ui-2026-10-28/reconciliation.md)

## Complete Pro materials

[All Pro reports and assets](assets/pro-results/README.md) are preserved with this intent entry.
The package includes all eight reports, figures, mockups, experiment source and results, source register, manifest, and original ZIP.
The originals retain their supplied content and directory structure. Use the reviewed plan below for implementation decisions.

## Outcome and boundary

A selected connection explains which source relations caused it to appear.
Each contributor opens its source occurrence. Return restores the selected member and the graph position.
The existing graph stays primary. A relation group does not certify an end-to-end value path.

Use current main as the implementation base. This plan reviewed `47aa927`; check newer changes before starting.
Reuse the existing inspector, source viewer, generations, and view-state registry.
Keep unsupported, assumed, budget, and stale outcomes visible.

Do not add a general path solver, condition analysis, heap analysis, runtime recorder, or separate workspace.
Do not reopen the folding, gap, branch, callback, or receiver tasks that already landed.

## Milestone 1 — preserve evidence before projection

**Deliverable:** the anchor result retains every relation that contributes to a displayed edge or hidden serial step.

Change `engine/src/srcly/ops/anchor-graph.ts`, especially `walk`, `addEdge`, and `pushEdge`.
Capture original endpoints and source locations before alias suppression and endpoint deduplication.
Keep all distinct relation IDs and their proofs; deduplicate repeated references to the same fact only.
Do not change the collector or traversal merely to populate the explanation.

Extend `engine/src/srcly/contracts/anchor-graph.ts` with a small relation-member table and edge member references.
Each member needs its raw relation ID, endpoints, kind, status, full locations, and proof records.
Include hidden endpoints needed for source navigation. Retain query and declaration-run membership when results combine.
Membership identifies inclusion; it does not certify invocation compatibility.

Reuse result generation and program hash. Mark path compatibility unevaluated and conditions unanalyzed.
Start with inline data in the existing response. Add a detail operation only if measured response cost requires it.
Count relations, not paths or confidence. A limited result must name its omitted evidence and coverage boundary.

Coordinate proof fields with `task-send-proof-strength-to-the-client-through-the-contract`.
Use `proofStrength` from `engine/src/srcly/kinds.ts`; preserve unknown strength instead of treating it as proven.
Update Python proof normalization only where producer evidence supports a classification.

Run `cd engine && pnpm emit-contracts` to regenerate schemas and client types.
Update the Pydantic mirror in `server/app/services/dataflow/models.py` in the same change.
Preserve fields through `server/app/routers/dataflow.py` and client transport.
Do not add compatibility code for an older deployed contract.

**Proof:** two relations with equal displayed endpoints and different kinds or proofs both survive serialization.
Reversing their order leaves the member set unchanged. Mixed and unknown proof strengths survive the round trip.
Use focused contract/model checks and an existing annotated fixture where it expresses the source behavior.

**Main risk:** capturing members after an alias branch has already discarded them.
Document the contract in `docs/CODE_MAP.md` and add a short worked connection example beside this plan.

## Milestone 2 — preserve members through display grouping

**Deliverable:** folded, hidden, and merged relations remain inspectable without creating a new path guarantee.

Change `client/src/viz/deps/flow/anchorAdapter.ts`, `multiAnchorAdapter.ts`, and `client/src/viz/deps/viewModel.ts`.
Union member references when combining display endpoints. Preserve hidden reference evidence and all source locations.
Account for current component entries and `twins` suppression from #273.
Keep query membership on merged edges. Do not infer a common invocation from a shared element ID.

Keep independent contributors distinct from serial steps. Do not number an unordered group as a path.
Preserve status per member; choosing the strongest or weakest member alone cannot explain every group.
Review adjacent reach labels in `reach.ts`, `FlowView.tsx`, and the inspector.
Qualify displayed connectivity where current wording implies a certified path through folded members.
This milestone does not add a compatible-path service.

Use four focused regression cases:

| Case | Required result |
| --- | --- |
| Parallel proven/partial relations, reversed | Same member set and summary in both orders. |
| Partial A→R reference, proven R→B, hidden R | Detail keeps both steps and the partial qualification. |
| A→u→x and y→z→B in a folded remote component | No certified A→B path when x and y are disconnected. |
| A→X in query one, X→B in query two | Preserve both query memberships; do not certify their composition. |

Extend adapter/reach tests for these guarantees. Do not add tests that only mirror the new object shape.
Update the worked example to show a folded connection and its recovered members.

**Main risk:** unchanged display reach wording still implies more than the new explanation can establish.

## Milestone 3 — inspect, open source, and return

**Deliverable:** an anchor connection opens a useful explanation in the current inspector.

Change `FlowInspector.tsx` and `FlowView.tsx` under `client/src/viz/deps/flow/`.
Use the existing route edge detail as a presentation precedent, not as an anchor-path provider.
Show displayed endpoints, relation count, member meaning, source occurrence, and proof strength.
Offer full member details on demand. Avoid adding a global mode selector.

The question, direction, and scope stay visible. Source controls target the selected occurrence, including its columns.
For missing facts, say “Execution conditions not analyzed” and “Path compatibility not evaluated.”
Describe shared-property evidence at its actual abstraction; do not claim that two receivers are one object.

Extend existing view-state capture with member selection and detail scroll only where required.
Return restores edge, member, expansion, camera, and keyboard focus.
A generation change shows stale state and requires a fresh result. Never join old detail to new boxes.
Keep structural placement distinct from transfer, and use text as well as color for status.

**Proof:** open the second occurrence of a grouped edge and return to that occurrence.
Check the flow with keyboard input and a changed generation.
Use a browser test for this important behavior; run the established full browser suite before its UI PR.
Capture screenshots for the UI PR under `tmp/` and attach them with `gh`.

**Main risk:** a source-relation list appears to promise one execution sequence.
Update the worked example with initial, expanded, source, and Return states.

## Milestone 4 — decide whether the explanation helps

Freeze the current graph and inspector as A0. Compare the added explanation, A1, on selected connection questions.
Reuse TSX T2/T4 and one Python folded trace from the audits, with their current source revisions recorded.
Record correct answers, missing qualifiers, source mistakes, expansions, and orientation failures before measuring speed.
Measure response bytes and query/serialization cost separately from rendering and cold index construction.

Keep the comparison small: maintainer walkthrough plus an independent review where practical.
A larger participant study is optional, not a gate for this personal project.
If the list adds work without improving correct explanations, reduce it or retain A0.

Producer-first and source-first alternatives remain separate experiments.
Use equal engine facts in each view. Label hand-authored condition or identity evidence as a different experiment.
Reject invented paths, hidden material boundaries, false unconditional writes, wrong source anchors, and stale evidence.
Do not treat fewer boxes as a successful outcome by itself.

**Deliverable:** append findings and the retain/revise decision to this plan.
No speedup or default-view change is established by the current research.

## Checks for future implementation

Run `scripts/check.sh --changed` for the implementation diff, plus the focused cases above.
For generated contracts, run engine contract tests, server model/outcome tests, and client shape tests.
When snapshots change, use the documented `SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest tests/test_dataflow_outcomes.py` flow.
Run `pnpm survey-gate` for analysis or corpus changes using the instructions active at implementation time.
Do not update a baseline merely because this older research prompt mentions one.
Do not run parallel real-repository Programs. Use the established 4 GiB limit for any required benchmark.

No implementation checks in this section were run by this documentation-only PR.
