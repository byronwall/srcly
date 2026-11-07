# Handoff: explain a displayed connection without inventing a path

**Assignment:** srcly.dependency-analysis-tool-ui-deep-dive.v1  
**Related PR:** https://github.com/byronwall/srcly/pull/256  
**Fixed source baseline:** ee8a771ce94fb59573492445d0f5fa2411ad83c8  
**Prepared:** 2026-10-29 UTC  
**Status:** research and proposed integration plan; no product changes authorized by this document.

## 1. Preferred first slice

**DA-001 / DAG-001 — Keep the current folded graph and add “Explain connection” in its existing inspector.** The explanation shows every source relation summarized by the selected visible edge, including hidden reference steps, original endpoints, source spans, proof provenance and query membership. It explains why the connection was drawn. It does not claim that arbitrary routes through the graph form a compatible value-flow path.

This addresses a concrete baseline loss: AnchorGraphBuilder.pushEdge keeps the first relation for a source/target pair; anchorGraphToViewModel groups endpoints again after hiding references and folding functions. Later evidence is lost before an inspector can explain it. The smallest useful repair is preserving and inspecting those members. A general control/heap analysis, new investigation workspace or replacement graph library is outside this slice. [Engine loss](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L660-L683); [client loss](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L68-L107)

The baseline's product intent makes the graph primary and the ledger a detail surface; it explicitly dropped the investigation workspace and pinned preview. This proposal fits those decisions while leaving a source-first alternative open for a bounded comparison under DA-006. [R1 and R8](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/intent/dataflow-robustness/decision-log.md#L11-L29)

### Why this is a grounded transfer from other tools

The proposed inspector adapts Understand’s occurrence-inspection interaction while retaining Srcly’s own relation semantics. This is a design transfer, not evidence of value-flow precision or measured Srcly usability. **External evidence:** official documentation and inspected figure, no application exercise. [SPC32: dependency meaning](https://docs.scitools.com/help/dependencies/what-are-dependencies.html); [SPC33: browser](https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html)

LSP/Pyright motivate preserving occurrence identity through grouping. Transfer that invariant, while requiring Srcly’s separate value and invocation evidence for any stronger claim. **External evidence:** LSP 3.17 and Pyright 1.1.414 source inspection; no IDE workflow executed. [IDE13: LSP](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md); [IDE27: provider](https://github.com/microsoft/pyright/blob/1.1.414/packages/pyright-internal/src/languageService/callHierarchyProvider.ts#L426-L462)

**Decision to test:** does source-linked member inspection produce more correct explanations with fewer orientation errors than the current folded graph/inspector? If it adds reading and clicks without improving correctness, keep the current UI. There is no measured usability win in this research.

## 2. Scope and guarantee

### Included in the first proof

- Preserve raw relation members before engine and client endpoint grouping.
- Preserve original endpoint IDs and locations even when the displayed endpoints are aliases or folded scopes.
- Retain suppressed reference evidence, member-level status and per-proof strength.
- Retain query/run membership and generation/hash.
- Show separate member rows; expose source and the existing Return route.
- State **pathCompatibility: not-evaluated** and **conditions: not-analyzed**.
- Keep named unsupported/library/framework/budget boundaries.
- Ensure aggregate counts, inspection and member sets are independent of input ordering.
- Give the selected connection neutral evidence emphasis; do not certify a transitive path through a summary node.

### Outside the cut line

**DA-002:** context-compatible multi-hop witness construction.  
**DA-003:** complete condition or alias/object-identity analysis.  
**DA-006:** shipping a new source-first primary screen before comparison.  
**DA-008:** rebuilding import analysis.  
**DA-011:** runtime instrumentation or dynamic slicing.  
**DA-012:** wholesale Thin Slicing/CPG/workspace rewrite.

DA-004 question-specific semantics, DA-005 proof strength and DA-007 source/Return are prerequisites or direct supporting work. DA-009 budget/cancellation concerns are limited here to preventing stale or silently truncated evidence. DA-010 effects remains an existing separate answer to “what does this function touch?”

## 3. Current implementation and decisive limitations

| Baseline fact | Consequence for this handoff |
| --- | --- |
| queryEvidenceSlice carries an invocation stack and field path in queue/visited state; accepted output is an element/relation union. [queue/pairing](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L243-L337), [output](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L485-L562) | A card can explain each accepted raw relation. It cannot reconstruct certified context compatibility from the flat graph. |
| AnchorGraphBuilder.walk suppresses same-span bookkeeping and Python transparent names via alias maps. [walk](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L414-L454) | Capture evidence before these branches skip drawing. A client-only patch is insufficient. |
| pushEdge deduplicates source/target pairs; addElement keeps first metadata except side. [source](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L634-L683) | Keep source identity separate from per-member/per-query roles and status. |
| The anchor contract carries one edge kind/status/proof array and no raw member list, run or hidden-chain lineage. [schema](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L119) | Additive contract work is required before the UI can inspect all evidence. |
| Client folding maps multiple values to a function box; passThroughs suppresses same-name references; grouping again chooses the first endpoint pair. [adapter](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L68-L181) | A summary is a collection, not a value node through which every incoming member can flow to every outgoing member. |
| anchorsToViewModel merges independently queried results by IDs and endpoint pairs. [merge](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/multiAnchorAdapter.ts#L17-L60) | Preserve query membership. “Present in both queries” is not shared invocation identity. |
| reachFrom traverses drawn adjacency, including structural placement links, while stopping at faint edges. [reach](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/reach.ts#L33-L84) | Do not use that traversal as the proof behind the new card. Where a current “proven reach” count is shown beside this explanation, suppress or qualify it until compatibility is available. |
| TS collects expression selections but no general predicate-to-guarded-write relation in this collector route. [collection](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L26-L95), [selection](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-boundary-processing.ts#L336-L375) | Empty condition data must be labeled not analyzed; never render “unconditional.” |
| member-state matches checker property symbols, not individual allocations. [identity abstraction](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-declarations.ts#L218-L234), [connections](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L437-L451) | Wording may say “same declared property”; it must not certify “same object.” |

The existing routePath inspector provides a row/source navigation pattern, but its producer is route lineage/bridge evidence. Its path IDs are absent from anchorGraph, and its transfer ordering can append unchainable items. Reuse presentation infrastructure, not a claim that this is already a general compatible-path service. [routePath input](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/route-path.ts#L16-L105); [ordering](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/route-path.ts#L133-L152)

## 4. Proposed evidence contract

**Design sketch, not final type names or an approved API.** Prefer an evidence table plus member references if inline duplication threatens the existing response bound. The integration owner should decide after measuring representative payloads.

### 4.1 Query identity and coverage

| Proposed field | Meaning and constraint |
| --- | --- |
| queryRef.id | Opaque identity for generation + anchor selection + direction + policy. It is not an invocation-context ID. |
| queryRef.generation / programHash | Reuse the result's current generation fields. Never merge evidence from different generations. |
| queryRef.runIds | Distinguish parameter/return/use runs of a declaration. Run membership is not context compatibility. |
| explanationCoverage.pathCompatibility | Literal not-evaluated in this slice. |
| explanationCoverage.conditions | Literal not-analyzed in this slice. A framework value model does not change this to complete. |
| explanationCoverage.identity | State the abstraction where relevant: property-symbol or field-selection evidence; otherwise not-analyzed. |
| evidenceBudget | Supplied, omitted and limit counts plus named reason when truncated. Absence of a member cannot silently mean no relation. |

The baseline already carries generation/hash and rejects a mismatched supplied expectedGeneration. It accepts an omitted expectedGeneration, so any new lazy request must explicitly send the visible graph's value. [generation contract](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/primitives.ts#L3-L12); [guard](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/session.ts#L223-L232)

### 4.2 Raw relation member

| Proposed field | Required behavior |
| --- | --- |
| memberId / relationId | Stable within a generation; deduplicate repeated references to the same raw fact without dropping distinct evidence alternatives. |
| rawSourceId / rawTargetId | Original element identities before aliasing, hiding, folding or merge. |
| kind | Actual relation kind; no conversion of a call/reference/structural edge into data transfer. |
| status | Original member status. Structural links remain explicitly structural. |
| proof[] | All applicable proof records with kind, detail, original locations and normalized strength. |
| source / target | Element label, kind, source file/span and source-navigation target, including elements not displayed as boxes. |
| memberships[] | Query and run IDs that included the member. Record all memberships on merge. |
| projectionRefs[] | IDs of projection operations that changed presentation of this member's endpoints or suppressed adjacent evidence. |

**Proof strength:** use the registry's proven/modelled/assumed classification plus an explicit unknown/null. Human-facing “source-backed” can explain the registry's proven category. Retain the original status separately. Python wire kinds need normalization: they are cast into TS-side unions and may have no registry entry. Missing/unknown must not be interpreted as proven. This extends already-owned proof-strength work. [kinds.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L133-L207); [Python normalization](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/python/facts.ts#L94-L140); [existing task](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-send-proof-strength-to-the-client-through-the-contract.md)

### 4.3 Presentation mapping and aggregate edge

A projection record identifies same-span alias hiding, reference hiding, scope folding or endpoint grouping, the affected raw IDs, and the displayed IDs. It retains hidden relation IDs. It does **not** assert an executable chain between all members of a scope.

A displayed edge has:

- Display source and target IDs.
- A set of contributing raw member IDs.
- Projection references needed to explain its endpoints.
- Counts by member kind, status and proof strength.
- A relation-bundle presentation type.
- The explicit path/condition coverage above.

For a same-name reference that was removed, the evidence detail retains the reference's proof/status and the visible successor's proof/status separately. For a folded function, incoming and outgoing members remain distinct source occurrences. Do not number independent incident relations as successive steps.

### 4.4 Aggregation rules

1. **Union membership; never first-wins evidence.** Reordering raw edges must not change the inspector's set of members or proofs.
2. **Do not conflate alternatives with serial steps.** Two members connecting the same display pair are two supported relations, not automatically a two-step path.
3. **Do not average certainty.** Show counts or a mixed-evidence label when strengths/statuses differ. Keep each row's actual provenance. A conservative visual style may indicate any uncertain member without claiming every alternative is equally weak.
4. **Preserve all source spans.** A first-location label can be a compact subtitle; it is not the complete provenance record.
5. **Preserve structural meaning.** Structural placement is not a transfer, even if it visually connects to a proven relation.
6. **No context invention.** Query/run membership is useful bookkeeping, but callContext is not exported today. Display not-evaluated rather than synthesizing a context from an element or scope ID.
7. **Preserve frontiers.** Hiding, grouping, merging and detail truncation cannot remove an unsupported or assumed qualification that matters to the inspected connection.

## 5. User interaction and reviewable states

Use the existing inspector width, source viewer and navigation model. Do not create a separate workspace or pinned code pane.

| State | User action | Required visible result |
| --- | --- | --- |
| Initial folded result | Select an edge or “Explain connection” | Existing graph stays oriented; inspector names displayed endpoints and reports “N source relations.” A folded endpoint identifies its function and member count. |
| Evidence bundle | Open member list | Rows show relation meaning, exact source occurrence, proof strength and status. Header says “Path compatibility not evaluated” and “Execution conditions not analyzed.” |
| Hidden evidence expansion | Expand “Hidden reference” or “Inside function” | Reveal contributing raw members and the reason they were folded. No new certainty is inferred merely by expansion. |
| Source inspection | Activate a row or a particular proof location | Open the corresponding file/line/span. Keep selected edge/member and camera in Return state. If span highlighting needs a small source-navigation extension, do that extension within the current viewer. |
| Return | Return / existing keyboard route | Restore graph camera, expanded scopes, selected edge, member and inspector position. Do not rerun a valid cached graph solely to restore the view. |
| Stale generation | Source generation changed during a detail request | Show stale evidence state; do not mix old members with new boxes. Offer a fresh query that keeps the source question understandable. |
| Unsupported/truncated detail | Engine/model/detail cap cannot supply a member | Named boundary and omitted count where known; no empty “complete” panel. |

FlowView already captures selection, selected edge, reach mode and camera; openAt opens source under the scan root. Extend that capture with member selection/scroll only if necessary. [FlowView state/source](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L330-L398)

FlowInspector currently has route edge detail and source-opening callbacks. Add anchor relation-bundle handling as a distinct detail mode rather than assigning route “In order” semantics to it. [inspector props](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L87-L154); [route detail precedent](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L334-L382)

**Example content:** “createResource source → fetcher parameter. Framework model: source value supplied to this inline parameter. Execution conditions not analyzed. Inspect factory / inspect parameter.” This uses a current value model; it does not imply the fetcher runs unconditionally. [bindResourceSource](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-call-support.ts#L149-L169)

## 6. Affected files and integration order

| Layer | Files / symbols at baseline | Proposed change |
| --- | --- | --- |
| Engine projection | [anchor-graph.ts: walk](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L414-L493), [addEdge/pushEdge](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L660-L683) | Capture raw evidence before hidden-alias branches; retain all members in displayed-edge aggregation. |
| Contract source | [contracts/anchor-graph.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L119), [kinds.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L133-L207) | Evidence members, mapping, coverage and normalized proof strength. Add an explanation schema only if lazy detail is selected. |
| Generated artifacts | [emitContracts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/emit.ts#L19-L40) | Regenerate server JSON Schemas and client contract.generated.ts from Zod; do not hand-edit generated files. |
| Server mirror / route | [models.py: AnchorEdge/AnchorGraphResult](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/dataflow/models.py#L640-L704), [anchor_graph endpoint](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/routers/dataflow.py#L363-L389) | Update Pydantic models so validation/serialization preserves new fields. Existing emitter does not generate these Python class definitions. Add endpoint only if measured payload needs justify lazy detail. |
| Client transport/model | [api.ts: fetchAnchorGraph](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/dataflow/api.ts#L180-L200), [ViewEdge](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/viewModel.ts#L59-L78) | Carry membership/provenance without flattening full locations into display strings. |
| Client grouping | [anchorAdapter](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L68-L181), [multiAnchorAdapter](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/multiAnchorAdapter.ts#L17-L60) | Union member sets and query memberships; preserve hidden-edge mapping; don't infer compatible paths through summaries. |
| Detail/navigation | [FlowInspector](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L87-L154), [FlowView](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L286-L398) | Anchor connection detail, neutral member emphasis, source navigation and Return. |
| Verification | [fixture runner](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/fixture-annotations.test.ts#L10-L30), [contract gate](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/contracts-current.test.ts#L1-L15) | Add only invariants needed for this guarantee; inspect corresponding server model/client projection/return tests. |

**Proposed order:** reconcile this fixed-baseline handoff against current main → define additive contract and negative fixtures → preserve engine evidence → propagate schema/server/client shapes → preserve grouping membership → render inspector and Return → execute bounded comparison → decide whether to keep or revise the first slice.

In a complete checkout, the baseline's generator command is **pnpm emit-contracts**, run from the **engine/** directory (shown here as an instruction, not executed). It is declared in [engine/package.json](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/package.json#L10-L21). The selected packet omits the scripts wrapper and is not runnable; Codex should use the full checkout and its current instructions. The inspected emitContracts implementation identifies the actual outputs.

## 7. Acceptance criteria and negative fixtures

All integration tests below are **proposed**, not executed for this assignment.

| ID | Gate | Negative case / oracle |
| --- | --- | --- |
| AC-01 | All evidence survives engine grouping | Two raw relations with equal displayed endpoints but different kind/proof/status remain inspectable. Reversing relation order changes neither set nor summary. |
| AC-02 | All evidence survives client projection | More than 40 boxes; A→u and v→B are disconnected inside one folded function. Card shows separate members; never certifies A→B through the scope. |
| AC-03 | Hidden reference does not upgrade certainty | Partial A→R reference plus proven R→B; hiding R retains the partial step and original source location. Use schema-valid sides (seed/up/down/both). |
| AC-04 | Multi-anchor membership survives | A→X in one query and X→B in another retain query membership. The union may be navigable, but shared X alone does not certify one invocation-compatible chain. |
| AC-05 | Direct evidence is source anchored | Every supplied member opens its exact raw endpoint/proof occurrence, including multiple call sites on one source line. |
| AC-06 | Conditions remain honest | if (!canSave) return; if (dirty) persist(draft). The card can explain draft as argument; it says conditions not analyzed and cannot say always/unconditional. |
| AC-07 | Resource callbacks stay qualified | Inline createResource source→fetcher parameter keeps model evidence and framework boundaries. An inactive-source case cannot be presented as unconditional fetch execution. |
| AC-08 | Closure/call limits remain visible | Existing two-call helper and closure examples; the detail shows actual accepted relations and does not invent missing context. A later certified chain must additionally pass two closure instances and same-input fanout. |
| AC-09 | Unknown library and proof kind remain unknown/assumed | Unknown slugify keeps external-call qualification; an unfamiliar Python proof kind is not promoted to source-proven. |
| AC-10 | Object abstraction is named | Two Box instances share a property declaration; one is written, the other read. Member-state evidence may say same declared property; it cannot say same object. |
| AC-11 | Stale/detail limits are explicit | Change generation during lazy detail load or exceed detail cap; reject stale joins and show named truncation with counts where known. |
| AC-12 | Return and keyboard access work | Source-open/Return restores edge/member/camera/expansion. Evidence rows and disclosure controls are keyboard reachable and do not rely on color alone. |
| AC-13 | Contract survives round trip | Zod emission, JSON Schema, Pydantic validation/serialization and generated client types preserve all new fields; unknown strength and mixed members survive snapshots. |
| AC-14 | User benefit is demonstrated before a default change | Test A1 (Explain connection increment) against frozen A0 (current folded graph/inspector) on the selected connection tasks. Separately compare A0, B (producer-first) and C (source-first tree/ledger) on identical hand-labeled tasks with equal evidence. Keep engine-realistic facts and hand-authored future-interface payloads in separate tracks. Record correctness, false unconditional claims, incompatible-context claims, inspected relationships, clicks/expansions, time to correct explanation, orientation errors and cold/warm latency. Keep A0 if a candidate costs more interaction without better correct answers; record A0’s existing failures without silently repairing the baseline. |

Reuse the existing resource-source.tsx, closures.ts, two-call-identity-helper.tsx, returns-other-argument.tsx and external-calls.tsx fixtures. Their annotations assert endpoints/stops and some proof kinds; they do not yet assert full member sets or state-compatible ordered paths. Add dedicated member-set tests or narrowly extend the runner. [existing annotation contract](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/fixture-annotations.test.ts#L16-L30); [matching behavior](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/fixture-annotations.test.ts#L91-L137)

A targeted later engine hypothesis is worth checking independently: addElement may avoid enqueueing a second invocation state when the raw element and field path were already included. The source supports the hypothesis; it was not reproduced. Use input→id(input) twice to test whether both continuations survive. This is not a reason to hold direct relation inspection behind a broad call-analysis rewrite. [early return](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L243-L277)

### Existing verification entry points

Run the repository's established commands in the full checkout after integration:

- Engine contract-current, anchor-graph and fixture-annotations tests.
- server/tests/test_dataflow_models.py and relevant engine snapshots.
- client/src/dataflow/shapes.test.ts.
- anchorAdapter.test.ts, multiAnchorAdapter.test.ts and reach.test.ts.
- Relevant browser coverage in client/e2e/dataflow.spec.ts and return-latency.spec.ts.

Do not treat passing old tests as sufficient: current edge assertions can match an edge anywhere, and a nonempty proof array does not establish compatible composition. Add the new acceptance invariants above, then stop broadening tests once the adopted guarantee is sufficiently verified.

## 8. Executed evidence versus proposed work

**Executed in this research:** four isolated pure-projection micro-checks using the pinned anchorAdapter, multiAnchorAdapter and reach function bodies on synthetic graphs. Type syntax/imports were removed; only visual vocabulary/color dependencies were stubbed. The checks demonstrated scope-quotient reach, order-dependent endpoint evidence, hidden partial-reference loss, and new reach in a multi-query union.

**Limits:** these did not execute collectors, the engine as an application, browser layout or a real repository query. They establish properties of the tested projection functions and inputs, not frequency of user-facing failures. A union test alone does not prove its contexts incompatible; it demonstrates absence of a compatibility certificate. A hidden-reference test concerns lost qualification when the underlying raw topology already connects the endpoints.

**Not executed:** proposed semantic fixtures, application tests, IDE tool workflows, usability comparison, latency/memory benchmarks and rollout. Existing audit measurements are historical author reports, not new measurements. This handoff creates no PR/issue and changes no application code.

## 9. Cost, dependencies and reasons the preferred slice can lose

**Relative cost:** small-to-medium compared with context-preserving witness analysis. It crosses engine contract, server mirror, client grouping and inspector layers; this is not a one-component copy change. It reuses existing source facts, the graph, inspector, source viewer, generation guard and Return state.

**Main risks:** payload inflation from repeated proof locations; subtle evidence loss at a still-unmodified projection; users reading a relation bundle as a sequence; mixed strength becoming a confusing badge collection; source opening not preserving member position; schemas silently omitting fields; and the uncertainty message becoming so generic that it stops informing decisions.

**Mitigations to test:** one shared evidence table per result, count→members disclosure, plain relation verbs, exact source locations, an explicit coverage line, and distinct “summary connection” versus direct relation treatment. A lazy endpoint is an option only after payload evidence justifies it; it adds request/generation/cancellation complexity.

**Why it may lose:** the current inspector may already be sufficient for small local tasks; full relation detail may bury a clear answer in plumbing; producer-first filtering may save more relevant reading on the audit's large functions; a source-first tree may better preserve orientation for users who avoid graphs. Those outcomes support keeping baseline or investigating DA-006 rather than declaring the preferred slice a universal win.

## 10. Open decisions for Codex and the maintainer

1. Inline normalized evidence table or lazy detail operation? Start with the smaller integration path, measure payloads, and keep generation semantics identical.
2. How should mixed evidence affect visual styling? The required invariant is preserved member-level provenance, not one mandatory color or scalar aggregation.
3. Which current reach wording must change when the new card is active? Do not ship “proven path” semantics without DA-002; keep the initial change bounded to truthful inspection.
4. Which Python proof kinds map to source-backed versus modelled versus assumed? Verify producers; unknown is a valid state.
5. Is syntactic-condition extraction valuable enough to pursue next? It must carry restricted coverage and fail the early-return oracle if incomplete.
6. Does the bounded comparison show enough benefit to justify the new default interaction? A keep-baseline result is valid.

Codex owns reconciliation with later commits, implementation, final verification and repository integration. This document is a source-backed proposal, not a product approval. Assistant-generated research and derivatives should be excluded from substantive product-activity ranking.
