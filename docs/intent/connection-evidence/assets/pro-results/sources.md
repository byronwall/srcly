# Source register, provenance and claim mapping

**Assignment:** `srcly.dependency-analysis-tool-ui-deep-dive.v1` · PR #256. **Repository baseline:** `ee8a771ce94fb59573492445d0f5fa2411ad83c8`. **Research/retrieval date:** October 28, 2026, America/Indianapolis (October 29 UTC for later retrievals). External living pages may change after this date. Source code claims remain fixed to the baseline.

## 1. Access and evidence policy

The attached `source-packet(7).zip` contains 729 selected tracked files and its packet metadata, not a complete runnable checkout. `SOURCE-PACKET.md` states no local edits, omitted audit screenshots, and newer main to be reconciled by Codex. The prompt came separately from PR commit `207342c79a5390de2e956837319838cace831d5f`. Neither PR activity nor assistant research is independent product demand or substantive product progress.

Pinned source was read directly from the packet. Four omitted historical audit PNGs were retrieved from the matching public commit and visually inspected. External documentation, implementation, release metadata, original papers and official figures were read; no external application was installed or exercised. Tool versions describe reviewed editions, not locally executed binaries. Screenshots may depict older UI than their current documentation.

**Actually executed:** four isolated checks of the actual pinned pure projection/reach function bodies with synthetic graph inputs and visual-helper stubs. The collector, engine, schema validators, application, layout, browser, runtime benchmarks and human evaluation were not run. Proposed replay commands and oracles are labelled accordingly.

### Evidence labels

| Label | Meaning | Limit |
| --- | --- | --- |
| Pinned source inspection | Implementation at the exact repository SHA. | Static reading is not an executed behavior test. |
| Historical repository report | Audit narrative and screenshots from the pinned repository. | Author-scored and not reproduced here; older gaps can be fixed by baseline code. |
| Documentation / official figure | Primary vendor or project statement, or visually inspected official image. | Availability and presentation evidence, not independent usability validation. |
| Implementation inspection | Public provider/query code examined. | No executed precision/latency claim; proprietary variants may differ. |
| Original research | Author-hosted paper and its stated method/limits. | Historical language/workload conditions; no automatic Srcly transfer. |
| Inference / proposal | Reasoning or design derived from the evidence. | Requires the specified test before a product claim or decision. |

## 2. Consequential claim map

| Claim / decision | Repository or primary evidence | Validation status |
| --- | --- | --- |
| DA-001: inspect connection contributors | R-ENGINEPROJECT, R-ADAPTER, R-MULTI, R-VIEWMODEL; SPC33, IDE13/27 | Source + P1–P4; product benefit proposed. |
| DA-002: certify compatible chains only with state witnesses | R-SLICE, R-ANCHORCONTRACT; SPC06/09 | Contract insufficiency read; fanout failure hypothesis unrun. |
| DA-003: conditions/identity need distinct facts | Engine collector/resource/member-state links below; SPC26, SPC02, EXT01 | Source/oracle reasoning; new analysis unimplemented. |
| DA-004: dependency classes stay separate | R-IMPORTCONTRACT, R-KINDS, R-EFFECTSCONTRACT; IDE20/28 | Implementation/documentation distinction. |
| DA-005: proof strength is not path/completeness confidence | R-KINDS and Python adaptation; SPC15/27 | Source finding; contract tests proposed. |
| DA-006: compare three representations | R-TSX, R-PY, R-LEDGER; IDE01/09/17, SPC13 | No winning representation measured. |
| DA-007: reuse source/Return machinery | R-FLOWSTATE/R-FLOWKEYS/R-LEDGER; IDE17 | Current source inspected; added member-state test proposed. |
| DA-008: import evidence has separate guarantees | R-IMPORT/R-TSIMPORT/R-PYIMPORT/R-IMPORTFILTER; SPC44/49 | Static collector limits; no runtime resolution benchmark. |
| DA-009: lifecycle/latency are separate from folding | R-FETCH/R-FLOWQUERY; IDE14/29 | Current request logic inspected; phase timing unrun. |
| DA-010/011: effects and runtime are distinct | R-EFFECTS/R-EFFECTSCONTRACT; IDE21, SPC54 | Static contract versus observed-execution design. |
| DA-012: reject wholesale replacement now | R-DECISIONS, R-ADAPTER; SPC24/42/44 | Sequencing proposal, not a permanent verdict. |
| Thin Slicing interpretation | SPC01, corroborating policy vocabulary SPC02/03 | Sections 2–6 read; no replication or speedup claim. |

## 3. Pinned repository reference key

Paths, symbols and line windows below resolve at the fixed baseline. The longer engine index following this table supplies narrower collector/fixture links. The root code map and old plans guided reading; current implementation was checked before making behavior claims.

| ID and source | Symbol / supported claim | Evidence |
| --- | --- | --- |
| **R-UPSTREAM** [engine/UPSTREAM.md:1–35](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/UPSTREAM.md#L1-L35) | `embedded fork provenance` — Embedded engine is the authority at this baseline; upstream is provenance, not parity. | pinned source inspection. |
| **R-DESIGN** [DESIGN.md:1–165](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/DESIGN.md#L1-L165) | `design principles and component guidance` — Reuse the existing source-focused desktop interaction and visual system. | pinned source inspection. |
| **R-MAP** [docs/CODE_MAP.md:1–367](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/CODE_MAP.md#L1-L367) | `code map` — Navigation guide; actual implementation checked independently. | pinned source inspection. |
| **R-TSX** [docs/research/tsx-dataflow-audit-2026-10/README.md:17–136](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/tsx-dataflow-audit-2026-10/README.md#L17-L136) | `T1–T4 / round two` — Historical author-scored audit, questions, noise and existing task ownership. | historical repository report. |
| **R-PY** [docs/research/python-dataflow-audit-2026-10/README.md:255–327](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/python-dataflow-audit-2026-10/README.md#L255-L327) | `rounds five and six` — Historical Python folding, closure and task-queue observations. | historical repository report. |
| **R-DECISIONS** [docs/intent/dataflow-robustness/decision-log.md:1–32](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/intent/dataflow-robustness/decision-log.md#L1-L32) | `R1, R8, R18` — Graph remains primary; prior workspace and export-union alternatives have explicit decisions. | pinned source inspection. |
| **R-IMPORT** [server/app/services/deps/graph.py:27–171](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/graph.py#L27-L171) | `collect_edges / build_graph` — Import graph collection, caching, hierarchy and endpoint aggregation. | pinned source inspection. |
| **R-TSIMPORT** [server/app/services/deps/typescript_deps.py:74–466](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/typescript_deps.py#L74-L466) | `imports_in / resolve / collect_usages` — Tree-sitter import and syntactic usage collection; literal dynamic imports; heuristic resolution. | pinned source inspection. |
| **R-PYIMPORT** [server/app/services/deps/python_deps.py:51–402](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/python_deps.py#L51-L402) | `module_index / find_definer / collect_usages` — Python AST import and syntactic symbol-use collection. | pinned source inspection. |
| **R-IMPORTFILTER** [server/app/services/deps/common.py:53–191](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/common.py#L53-L191) | `source_files / emit_symbol_edges` — File eligibility, file-level unused-import edges and same-file exclusion. | pinned source inspection. |
| **R-IMPORTCONTRACT** [client/src/viz/deps/contract.ts:1–46](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/contract.ts#L1-L46) | `GraphEdge` — Imports contract does not carry value-flow path proof or coverage outcome. | pinned source inspection. |
| **R-KINDS** [engine/src/srcly/kinds.ts:8–211](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L8-L211) | `RELATION_TRAITS / PROOF_TRAITS / proofStrength` — Structural versus value/call matching; proof strength classification including unknown null. | pinned source inspection. |
| **R-SLICE** [engine/src/analysis/evidence-slice.ts:92–562](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L92-L562) | `queryEvidenceSlice / addElement / pairInvocation` — Call/field state in traversal and element/relation maps in returned slice. | pinned source inspection. |
| **R-ANCHORSLICE** [engine/src/srcly/anchor-slice.ts:17–134](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/anchor-slice.ts#L17-L134) | `ANCHOR_LIMITS / undrawn / walkFollows` — Budget and relationship filtering; structural membership is not value transfer. | pinned source inspection. |
| **R-ANCHOROP** [engine/src/srcly/ops/anchor-graph.ts:47–205](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L47-L205) | `anchorGraphOp / AnchorGraphBuilder` — Anchor selection, directional runs, landing and outcome construction. | pinned source inspection. |
| **R-ENGINEPROJECT** [engine/src/srcly/ops/anchor-graph.ts:634–683](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L634-L683) | `AnchorGraphBuilder.addElement / addEdge / pushEdge` — Engine edge construction and endpoint deduplication before the client. | pinned source inspection. |
| **R-ANCHORCONTRACT** [engine/src/srcly/contracts/anchor-graph.ts:39–125](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L125) | `anchorGraphResultSchema / anchorEdgeSchema` — Public anchor result carries nodes, edges, status, proof and generation, not traversal-state witnesses. | pinned source inspection. |
| **R-PRIMITIVES** [engine/src/srcly/contracts/primitives.ts:1–19](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/primitives.ts#L1-L19) | `generationFields` — Generation, program hash and compiler configuration identity. | pinned source inspection. |
| **R-ADAPTER** [client/src/viz/deps/flow/anchorAdapter.ts:21–207](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L21-L207) | `anchorGraphToViewModel / folds / passThroughs` — Projection, function folding, pass-through reference removal, first-wins endpoint edge deduplication. | pinned source inspection. |
| **R-MULTI** [client/src/viz/deps/flow/multiAnchorAdapter.ts:1–64](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/multiAnchorAdapter.ts#L1-L64) | `anchorsToViewModel` — Independent anchor graph union; endpoint dedup; no per-query membership in ViewEdge. | pinned source inspection. |
| **R-REACH** [client/src/viz/deps/flow/reach.ts:1–85](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/reach.ts#L1-L85) | `reachFrom / walk` — Reachability over the displayed graph, with faint/structural handling. | pinned source inspection. |
| **R-VIEWMODEL** [client/src/viz/deps/viewModel.ts:59–78](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/viewModel.ts#L59-L78) | `ViewEdge` — One proof/relation/status bundle rather than contributing raw members. | pinned source inspection. |
| **R-FLOWQUERY** [client/src/viz/deps/flow/FlowView.tsx:50–177](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L50-L177) | `query keys and anchorGraph requests` — Generation-keyed asynchronous graph and additional-anchor requests. | pinned source inspection. |
| **R-FLOWSTATE** [client/src/viz/deps/flow/FlowView.tsx:286–408](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L286-L408) | `edgePath / reach / view state / open source` — Route path precedent, projected reach, preserved camera and source-return state. | pinned source inspection. |
| **R-FLOWKEYS** [client/src/viz/deps/flow/FlowView.tsx:445–492](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L445-L492) | `keyboard handler` — Existing history, source-open and expansion keyboard support. | pinned source inspection. |
| **R-INSPECTOR** [client/src/viz/deps/flow/FlowInspector.tsx:116–240](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L116-L240) | `FlowInspector / EdgeStepsView` — Existing inspector, trace-from and TS-only effects; route ordered-step precedent later in file. | pinned source inspection. |
| **R-EDGESTEPS** [client/src/viz/deps/flow/FlowInspector.tsx:334–393](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L334-L393) | `EdgeStepsView` — Route-only ordered source-linked path presentation precedent. | pinned source inspection. |
| **R-INSPECTORMODEL** [client/src/viz/deps/flow/inspectorModel.ts:95–167](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/inspectorModel.ts#L95-L167) | `stopsOf / routeOverview / neighborsOf` — Anchor stops grouped already, route gaps ungrouped; neighbors follow drawn edges. | pinned source inspection. |
| **R-LEDGER** [client/src/components/CodeModal/ValueFlowLedger.tsx:1–121](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/components/CodeModal/ValueFlowLedger.tsx#L1-L121) | `ValueFlowLedger` — Existing source-first value ledger; cross-file rows disabled in current component. | pinned source inspection. |
| **R-SELECT** [client/src/investigation/valueFlowInspector.ts:1–108](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/investigation/valueFlowInspector.ts#L1-L108) | `createValueFlowInspector` — Caret-to-selection-to-ledger or graph flow and request token handling. | pinned source inspection. |
| **R-FETCH** [client/src/viz/deps/flow/fetchSignal.ts:1–40](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/fetchSignal.ts#L1-L40) | `createFetchSignal` — Superseded-response guard without network cancellation. | pinned source inspection. |
| **R-ROUTEADAPTER** [client/src/viz/deps/flow/adapter.ts:16–222](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/adapter.ts#L16-L222) | `routeGraphToFlowViewModel` — Route node budget, transparent wrappers, structural edges and edge projection. | pinned source inspection. |
| **R-EXPORTS** [client/src/viz/deps/flow/exportsAdapter.ts:16–143](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/exportsAdapter.ts#L16-L143) | `exportsToFlowViewModel` — Lazy file/export views and per-export graph namespacing. | pinned source inspection. |
| **R-EFFECTS** [engine/src/srcly/ops/function-effects.ts:1–55](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/function-effects.ts#L1-L55) | `functionEffectsOp` — TypeScript-only effects operation and generation checks. | pinned source inspection. |
| **R-EFFECTSCONTRACT** [engine/src/srcly/contracts/function-effects.ts:1–112](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/function-effects.ts#L1-L112) | `effect result schemas` — Activation, handling, witnesses, assumptions and frontiers. | pinned source inspection. |
| **R-ROUTER** [server/app/routers/dataflow.py:285–389](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/routers/dataflow.py#L285-L389) | `anchor_graph / value_flow / function_effects` — Server validation and engine request/response bridge. | pinned source inspection. |
| **R-ADAPTERTEST** [client/src/viz/deps/flow/anchorAdapter.test.ts:1–140](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.test.ts#L1-L140) | `adapter fixtures` — Existing folding and layout unit tests; not executed here. | pinned source inspection. |
| **R-RETURNTEST** [client/e2e/return-latency.spec.ts:1–59](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/e2e/return-latency.spec.ts#L1-L59) | `return navigation measurement` — Existing browser-return test source; not executed here. | pinned source inspection. |

### Detailed engine source windows

These windows were individually checked for path and line-range validity against the packet. A line window locates the evidence; it does not imply every line in the window independently supports every synthesis claim.

- **ENG-S001** [Decision log R1/R8, lines 11–29](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/intent/dataflow-robustness/decision-log.md#L11-L29) — `docs/intent/dataflow-robustness/decision-log.md`, lines 11–29; pinned source inspection.
- **ENG-S002** [session.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/session.ts#L92-L154) — `engine/src/srcly/session.ts`, lines 92–154; pinned source inspection.
- **ENG-S003** [generation check](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/session.ts#L208-L232) — `engine/src/srcly/session.ts`, lines 208–232; pinned source inspection.
- **ENG-S004** [program-evidence-collector.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector.ts#L10-L132) — `engine/src/analysis/program-evidence-collector.ts`, lines 10–132; pinned source inspection.
- **ENG-S005** [kinds.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L8-L207) — `engine/src/srcly/kinds.ts`, lines 8–207; pinned source inspection.
- **ENG-S006** [anchor-slice.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/anchor-slice.ts#L30-L129) — `engine/src/srcly/anchor-slice.ts`, lines 30–129; pinned source inspection.
- **ENG-S007** [evidence-slice.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L92-L163) — `engine/src/analysis/evidence-slice.ts`, lines 92–163; pinned source inspection.
- **ENG-S008** [context pairing](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L243-L337) — `engine/src/analysis/evidence-slice.ts`, lines 243–337; pinned source inspection.
- **ENG-S009** [evidence-slice.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L485-L562) — `engine/src/analysis/evidence-slice.ts`, lines 485–562; pinned source inspection.
- **ENG-S010** [anchor-graph.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L47-L202) — `engine/src/srcly/ops/anchor-graph.ts`, lines 47–202; pinned source inspection.
- **ENG-S011** [walk](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L414-L493) — `engine/src/srcly/ops/anchor-graph.ts`, lines 414–493; pinned source inspection.
- **ENG-S012** [contract](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L119) — `engine/src/srcly/contracts/anchor-graph.ts`, lines 39–119; pinned source inspection.
- **ENG-S013** [finish](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L718-L745) — `engine/src/srcly/ops/anchor-graph.ts`, lines 718–745; pinned source inspection.
- **ENG-S014** [anchorAdapter.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L28-L181) — `client/src/viz/deps/flow/anchorAdapter.ts`, lines 28–181; pinned source inspection.
- **ENG-S015** [reach.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/reach.ts#L33-L84) — `client/src/viz/deps/flow/reach.ts`, lines 33–84; pinned source inspection.
- **ENG-S016** [kinds.ts, lines 23–69](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L23-L69) — `engine/src/srcly/kinds.ts`, lines 23–69; pinned source inspection.
- **ENG-S017** [declarationRuns](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L311-L402) — `engine/src/srcly/ops/anchor-graph.ts`, lines 311–402; pinned source inspection.
- **ENG-S018** [anchor-graph.test.ts, lines 240–255](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/anchor-graph.test.ts#L240-L255) — `engine/test/srcly/anchor-graph.test.ts`, lines 240–255; pinned source inspection.
- **ENG-S019** [evidence-slice.ts, lines 280–337](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L280-L337) — `engine/src/analysis/evidence-slice.ts`, lines 280–337; pinned source inspection.
- **ENG-S020** [value-flow.test.ts, lines 65–90](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/value-flow.test.ts#L65-L90) — `engine/test/srcly/value-flow.test.ts`, lines 65–90; pinned source inspection.
- **ENG-S021** [anchor graph walk](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L414-L489) — `engine/src/srcly/ops/anchor-graph.ts`, lines 414–489; pinned source inspection.
- **ENG-S022** [evidence-slice.ts, lines 243–277](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L243-L277) — `engine/src/analysis/evidence-slice.ts`, lines 243–277; pinned source inspection.
- **ENG-S023** [pairedInSlice](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/facts.ts#L24-L40) — `engine/src/srcly/facts.ts`, lines 24–40; pinned source inspection.
- **ENG-S024** [CallSiteIndex.sitesOf](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/call-sites.ts#L27-L54) — `engine/src/srcly/call-sites.ts`, lines 27–54; pinned source inspection.
- **ENG-S025** [evidence-slice-fields.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice-fields.ts#L1-L61) — `engine/src/analysis/evidence-slice-fields.ts`, lines 1–61; pinned source inspection.
- **ENG-S026** [addElement](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L243-L251) — `engine/src/analysis/evidence-slice.ts`, lines 243–251; pinned source inspection.
- **ENG-S027** [declarations, lines 218–234](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-declarations.ts#L218-L234) — `engine/src/analysis/program-evidence-collector-declarations.ts`, lines 218–234; pinned source inspection.
- **ENG-S028** [connectMemberState, lines 437–451](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L437-L451) — `engine/src/analysis/program-evidence-collector-jsx-support.ts`, lines 437–451; pinned source inspection.
- **ENG-S029** [member-state.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/examples/value-flow-basics/src/member-state.ts#L1-L32) — `engine/examples/value-flow-basics/src/member-state.ts`, lines 1–32; pinned source inspection.
- **ENG-S030** [collectNodes](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L26-L95) — `engine/src/analysis/program-evidence-collector-jsx-support.ts`, lines 26–95; pinned source inspection.
- **ENG-S031** [processSelection](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-boundary-processing.ts#L336-L375) — `engine/src/analysis/program-evidence-collector-boundary-processing.ts`, lines 336–375; pinned source inspection.
- **ENG-S032** [facts.ts, lines 155–179](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/facts.ts#L155-L179) — `engine/src/srcly/facts.ts`, lines 155–179; pinned source inspection.
- **ENG-S033** [ends-in-place.tsx](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/examples/value-flow-basics/src/ends-in-place.tsx#L1-L10) — `engine/examples/value-flow-basics/src/ends-in-place.tsx`, lines 1–10; pinned source inspection.
- **ENG-S034** [program-evidence-reaching-bindings.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-reaching-bindings.ts#L1-L40) — `engine/src/analysis/program-evidence-reaching-bindings.ts`, lines 1–40; pinned source inspection.
- **ENG-S035** [call-support.ts, lines 149–169](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-call-support.ts#L149-L169) — `engine/src/analysis/program-evidence-collector-call-support.ts`, lines 149–169; pinned source inspection.
- **ENG-S036** [framework-flows.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/framework-flows.ts#L1-L30) — `engine/src/analysis/framework-flows.ts`, lines 1–30; pinned source inspection.
- **ENG-S037** [connectExternalCallbacks](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-call-support.ts#L481-L538) — `engine/src/analysis/program-evidence-collector-call-support.ts`, lines 481–538; pinned source inspection.
- **ENG-S038** [resource-source.tsx](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/examples/value-flow-basics/src/resource-source.tsx#L1-L12) — `engine/examples/value-flow-basics/src/resource-source.tsx`, lines 1–12; pinned source inspection.
- **ENG-S039** [kinds.ts, lines 133–207](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L133-L207) — `engine/src/srcly/kinds.ts`, lines 133–207; pinned source inspection.
- **ENG-S040** [analysis/library-models.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/library-models.ts#L1-L88) — `engine/src/analysis/library-models.ts`, lines 1–88; pinned source inspection.
- **ENG-S041** [anchor-graph.ts, lines 660–674](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L660-L674) — `engine/src/srcly/ops/anchor-graph.ts`, lines 660–674; pinned source inspection.
- **ENG-S042** [outcome](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L171-L185) — `engine/src/srcly/ops/anchor-graph.ts`, lines 171–185; pinned source inspection.
- **ENG-S043** [external-calls.tsx](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/examples/value-flow-basics/src/external-calls.tsx#L1-L36) — `engine/examples/value-flow-basics/src/external-calls.tsx`, lines 1–36; pinned source inspection.
- **ENG-S044** [438–454](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L438-L454) — `engine/src/srcly/ops/anchor-graph.ts`, lines 438–454; pinned source inspection.
- **ENG-S045** [446–454](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L446-L454) — `engine/src/srcly/ops/anchor-graph.ts`, lines 446–454; pinned source inspection.
- **ENG-S046** [634–658](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L634-L658) — `engine/src/srcly/ops/anchor-graph.ts`, lines 634–658; pinned source inspection.
- **ENG-S047** [677–683](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L677-L683) — `engine/src/srcly/ops/anchor-graph.ts`, lines 677–683; pinned source inspection.
- **ENG-S048** [204–240](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L204-L240) — `engine/src/srcly/ops/anchor-graph.ts`, lines 204–240; pinned source inspection.
- **ENG-S049** [68–107](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L68-L107) — `client/src/viz/deps/flow/anchorAdapter.ts`, lines 68–107; pinned source inspection.
- **ENG-S050** [113–181](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L113-L181) — `client/src/viz/deps/flow/anchorAdapter.ts`, lines 113–181; pinned source inspection.
- **ENG-S051** [value-flow.ts, lines 182–256](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/value-flow.ts#L182-L256) — `engine/src/srcly/ops/value-flow.ts`, lines 182–256; pinned source inspection.
- **ENG-S052** [existing tests](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/value-flow.test.ts#L54-L63) — `engine/test/srcly/value-flow.test.ts`, lines 54–63; pinned source inspection.
- **ENG-S053** [walk, lines 318–390](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/value-flow.ts#L318-L390) — `engine/src/srcly/ops/value-flow.ts`, lines 318–390; pinned source inspection.
- **ENG-S054** [MAX_ROWS](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/value-flow.ts#L23-L32) — `engine/src/srcly/ops/value-flow.ts`, lines 23–32; pinned source inspection.
- **ENG-S055** [ledger contract](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/value-flow.ts#L1-L74) — `engine/src/srcly/contracts/value-flow.ts`, lines 1–74; pinned source inspection.
- **ENG-S056** [route-path.ts, lines 16–105](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/route-path.ts#L16-L105) — `engine/src/srcly/ops/route-path.ts`, lines 16–105; pinned source inspection.
- **ENG-S057** [chainTransfers](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/route-path.ts#L133-L152) — `engine/src/srcly/ops/route-path.ts`, lines 133–152; pinned source inspection.
- **ENG-S058** [RowBuilder.path](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/route-path.ts#L229-L253) — `engine/src/srcly/ops/route-path.ts`, lines 229–253; pinned source inspection.
- **ENG-S059** [relationBetween](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/route-path.ts#L276-L282) — `engine/src/srcly/ops/route-path.ts`, lines 276–282; pinned source inspection.
- **ENG-S060** [function-effects analysis, lines 1–60](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/effects/function-effects.ts#L1-L60) — `engine/src/analysis/effects/function-effects.ts`, lines 1–60; pinned source inspection.
- **ENG-S061** [contract](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/function-effects.ts#L1-L90) — `engine/src/srcly/contracts/function-effects.ts`, lines 1–90; pinned source inspection.
- **ENG-S062** [operation](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/function-effects.ts#L10-L54) — `engine/src/srcly/ops/function-effects.ts`, lines 10–54; pinned source inspection.
- **ENG-S063** [visit/follow/nestedActivation](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/effects/function-effects.ts#L271-L377) — `engine/src/analysis/effects/function-effects.ts`, lines 271–377; pinned source inspection.
- **ENG-S064** [python/host.ts, lines 46–60](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/python/host.ts#L46-L60) — `engine/src/srcly/python/host.ts`, lines 46–60; pinned source inspection.
- **ENG-S065** [python/facts.ts, lines 94–140](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/python/facts.ts#L94-L140) — `engine/src/srcly/python/facts.ts`, lines 94–140; pinned source inspection.
- **ENG-S066** [unknown strength](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L196-L207) — `engine/src/srcly/kinds.ts`, lines 196–207; pinned source inspection.
- **ENG-S067** [statement visitor](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/python/srcly_pyfacts.py#L1442-L1552) — `engine/python/srcly_pyfacts.py`, lines 1442–1552; pinned source inspection.
- **ENG-S068** [test](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/python/srcly_pyfacts.py#L1610-L1616) — `engine/python/srcly_pyfacts.py`, lines 1610–1616; pinned source inspection.
- **ENG-S069** [BoolOp / IfExp](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/python/srcly_pyfacts.py#L1801-L1816) — `engine/python/srcly_pyfacts.py`, lines 1801–1816; pinned source inspection.
- **ENG-S070** [Celery model](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/python/srcly_pyfacts.py#L1883-L1920) — `engine/python/srcly_pyfacts.py`, lines 1883–1920; pinned source inspection.
- **ENG-S071** [expr_Call](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/python/srcly_pyfacts.py#L1922-L2042) — `engine/python/srcly_pyfacts.py`, lines 1922–2042; pinned source inspection.
- **ENG-S072** [bind_arguments](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/python/srcly_pyfacts.py#L2072-L2109) — `engine/python/srcly_pyfacts.py`, lines 2072–2109; pinned source inspection.
- **ENG-S073** [PythonRelationProvider](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/python/facts.ts#L151-L207) — `engine/src/srcly/python/facts.ts`, lines 151–207; pinned source inspection.
- **ENG-S074** [limits](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/anchor-slice.ts#L10-L28) — `engine/src/srcly/anchor-slice.ts`, lines 10–28; pinned source inspection.
- **ENG-S075** [gaps/frontier](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L533-L607) — `engine/src/srcly/ops/anchor-graph.ts`, lines 533–607; pinned source inspection.
- **ENG-S076** [hub test](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/anchor-graph.test.ts#L169-L178) — `engine/test/srcly/anchor-graph.test.ts`, lines 169–178; pinned source inspection.
- **ENG-S077** [facts.ts naturalEnd/isNaturalStart](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/facts.ts#L90-L139) — `engine/src/srcly/facts.ts`, lines 90–139; pinned source inspection.
- **ENG-S078** [outcome](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L159-L200) — `engine/src/srcly/ops/anchor-graph.ts`, lines 159–200; pinned source inspection.
- **ENG-S079** [slice coverage](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L533-L562) — `engine/src/analysis/evidence-slice.ts`, lines 533–562; pinned source inspection.
- **ENG-S080** [anchor coverage](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L138-L158) — `engine/src/srcly/ops/anchor-graph.ts`, lines 138–158; pinned source inspection.
- **ENG-S081** [session generation/release](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/session.ts#L105-L116) — `engine/src/srcly/session.ts`, lines 105–116; pinned source inspection.
- **ENG-S082** [closures.ts](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/examples/value-flow-basics/src/closures.ts#L1-L12) — `engine/examples/value-flow-basics/src/closures.ts`, lines 1–12; pinned source inspection.
- **ENG-S083** [fixture-annotations.test.ts, lines 10–30](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/fixture-annotations.test.ts#L10-L30) — `engine/test/srcly/fixture-annotations.test.ts`, lines 10–30; pinned source inspection.
- **ENG-S084** [check, lines 101–139](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/fixture-annotations.test.ts#L101-L139) — `engine/test/srcly/fixture-annotations.test.ts`, lines 101–139; pinned source inspection.
- **ENG-S085** [edgeMatches / matching](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/fixture-annotations.test.ts#L91-L137) — `engine/test/srcly/fixture-annotations.test.ts`, lines 91–137; pinned source inspection.
- **ENG-S086** [proof nonempty test](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/anchor-graph.test.ts#L204-L209) — `engine/test/srcly/anchor-graph.test.ts`, lines 204–209; pinned source inspection.
- **ENG-S087** [task-send-proof-strength-to-the-client-through-the-contract](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-send-proof-strength-to-the-client-through-the-contract.md) — `pgm/data/projects/srcly-backlog/nodes/task-send-proof-strength-to-the-client-through-the-contract.md`, whole file; pinned source inspection.
- **ENG-S088** [task-collectors-record-end-attributes-for-typescript](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-collectors-record-end-attributes-for-typescript.md) — `pgm/data/projects/srcly-backlog/nodes/task-collectors-record-end-attributes-for-typescript.md`, whole file; pinned source inspection.
- **ENG-S089** [task-ledger-classify-reads-kind-traits](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-ledger-classify-reads-kind-traits.md) — `pgm/data/projects/srcly-backlog/nodes/task-ledger-classify-reads-kind-traits.md`, whole file; pinned source inspection.
- **ENG-S090** [task-calls-through-function-typed-params-and-props](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-calls-through-function-typed-params-and-props.md) — `pgm/data/projects/srcly-backlog/nodes/task-calls-through-function-typed-params-and-props.md`, whole file; pinned source inspection.
- **ENG-S091** [task-library-write-into-a-non-local-receiver](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-library-write-into-a-non-local-receiver.md) — `pgm/data/projects/srcly-backlog/nodes/task-library-write-into-a-non-local-receiver.md`, whole file; pinned source inspection.
- **ENG-S092** [task-action-parameters-walk-into-their-useaction-sites](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-action-parameters-walk-into-their-useaction-sites.md) — `pgm/data/projects/srcly-backlog/nodes/task-action-parameters-walk-into-their-useaction-sites.md`, whole file; pinned source inspection.
- **ENG-S093** [task-walk-into-nested-functions](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-walk-into-nested-functions.md) — `pgm/data/projects/srcly-backlog/nodes/task-walk-into-nested-functions.md`, whole file; pinned source inspection.
- **ENG-S094** [task-writers-of-a-model-field](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-writers-of-a-model-field.md) — `pgm/data/projects/srcly-backlog/nodes/task-writers-of-a-model-field.md`, whole file; pinned source inspection.
- **ENG-S095** [task-move-the-remaining-alias-resolution-sites-to-the-value-origin-resolver](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/task-move-the-remaining-alias-resolution-sites-to-the-value-origin-resolver.md) — `pgm/data/projects/srcly-backlog/nodes/task-move-the-remaining-alias-resolution-sites-to-the-value-origin-resolver.md`, whole file; pinned source inspection.
- **ENG-S096** [area-data-flow-tsx-usability-audit-2026-10](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/pgm/data/projects/srcly-backlog/nodes/area-data-flow-tsx-usability-audit-2026-10.md) — `pgm/data/projects/srcly-backlog/nodes/area-data-flow-tsx-usability-audit-2026-10.md`, whole file; pinned source inspection.

## 4. External primary sources

**100 entries:** 43 IDE/language-service sources, 56 specialized-tool/research sources and 1 fixture-semantic source. Entries include unused corroborating reading; source count is not tool count or a quality score. Exact URLs also appear in each standalone companion where used.

### IDE and language services

#### IDE01 — IntelliJ IDEA: Analyze data flow

- **Primary URL:** [IntelliJ IDEA: Analyze data flow](https://www.jetbrains.com/help/idea/analyzing-data-flow.html)
- **Edition/date:** IntelliJ IDEA 2026.2 help; 2026-08-14. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation + inspected official figure.
- **Claim mapping:** upstream/downstream value tree; scope/test filtering; value/null grouping; source preview and refresh.
- **Limits:** No hands-on; algorithmic sensitivity not specified

#### IDE02 — IntelliJ IDEA: Source code hierarchy

- **Primary URL:** [IntelliJ IDEA: Source code hierarchy](https://www.jetbrains.com/help/idea/viewing-structure-and-hierarchy-of-the-source-code.html)
- **Edition/date:** 2026.2 help. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** call/type hierarchy distinctions; pinning; project/test/library scope; single-click source.
- **Limits:** Same JetBrains family; not independent evidence from WebStorm/PyCharm

#### IDE03 — WebStorm: Source code hierarchy

- **Primary URL:** [WebStorm: Source code hierarchy](https://www.jetbrains.com/help/webstorm/viewing-structure-and-hierarchy-of-the-source-code.html)
- **Edition/date:** 2026.2 help; 2026-08-17. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** caller/callee navigation; pin tab; scope and direction.
- **Limits:** Does not prove value slicing for arbitrary JS/TS expressions

#### IDE04 — WebStorm: Search for usages

- **Primary URL:** [WebStorm: Search for usages](https://www.jetbrains.com/help/webstorm/find-highlight-usages.html)
- **Edition/date:** 2026.2 help; 2026-09-09. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation + inspected official figure.
- **Claim mapping:** read/write/import/dynamic-string filters; usage preview; call hierarchy preview; incremental display of usages.
- **Limits:** Generic data-flow-for-field wording insufficient to establish Java-style value slicing

#### IDE05 — WebStorm feature request WEB-28992

- **Primary URL:** [WebStorm feature request WEB-28992](https://youtrack.jetbrains.com/projects/WEB/issues/WEB-28992/Support-Analyze-Data-Flow-to-here-from-here-actions-in-Typescript-JavaScript)
- **Edition/date:** Submitted state in retrieved current official search result. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** primary tracker search evidence.
- **Claim mapping:** JS/TS Data Flow to/from Here feature request remains submitted in retrieved evidence.
- **Limits:** Full page yielded no readable lines; search result is weaker evidence; no hands-on

#### IDE06 — IntelliJ IDEA: Dependencies analysis

- **Primary URL:** [IntelliJ IDEA: Dependencies analysis](https://www.jetbrains.com/help/idea/dependencies-analysis.html)
- **Edition/date:** 2026.2 help. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** classes/packages/modules; transitive depth; three-pane source/target/usages; backward analysis cost caution.
- **Limits:** Separate relation semantics from value flow

#### IDE07 — PyCharm: Source code hierarchy

- **Primary URL:** [PyCharm: Source code hierarchy](https://www.jetbrains.com/help/pycharm/viewing-structure-and-hierarchy-of-the-source-code.html)
- **Edition/date:** 2026.2 help; 2026-08-17. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** Python caller/callee hierarchy; scope; pinning and source navigation.
- **Limits:** No verified arbitrary-expression value slicing; sensitivity unknown

#### IDE08 — VS Code current release

- **Primary URL:** [VS Code current release](https://code.visualstudio.com/updates/v1_144)
- **Edition/date:** 1.144.0 stable; 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** release documentation.
- **Claim mapping:** current VS Code version.
- **Limits:** Does not establish every provider version

#### IDE09 — VS Code: Code Navigation

- **Primary URL:** [VS Code: Code Navigation](https://code.visualstudio.com/docs/editing/editingevolved)
- **Edition/date:** living docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation + inspected official figure.
- **Claim mapping:** peek source and result list; go-to/reference/implementation distinctions; breadcrumbs; back navigation.
- **Limits:** Official peek figure uses C#; not TS/Python precision evidence

#### IDE10 — TypeScript: Announcing TypeScript 3.8

- **Primary URL:** [TypeScript: Announcing TypeScript 3.8](https://devblogs.microsoft.com/typescript/announcing-typescript-3-8/)
- **Edition/date:** 2020 introduction. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** maintainer explanation.
- **Claim mapping:** call hierarchy retains root through caller expansion; TS 3.8 call hierarchy origin.
- **Limits:** Historical release; not current release claim

#### IDE11 — VS Code 1.43 release: JS/TS call hierarchy

- **Primary URL:** [VS Code 1.43 release: JS/TS call hierarchy](https://code.visualstudio.com/updates/v1_43)
- **Edition/date:** February 2020 / VS Code 1.43; TS 3.8. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation + inspected official figure.
- **Claim mapping:** JS/TS call-hierarchy availability; historical UI figure.
- **Limits:** Figure explicitly historical, not installed current UI

#### IDE12 — VS Code: Editing Python

- **Primary URL:** [VS Code: Editing Python](https://code.visualstudio.com/docs/python/editing)
- **Edition/date:** living docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** Pylance default Python language server; Pyright and type stubs; environment-dependent navigation.
- **Limits:** Not Pylance implementation source

#### IDE13 — LSP 3.17: Call hierarchy specification source

- **Primary URL:** [LSP 3.17: Call hierarchy specification source](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md)
- **Edition/date:** LSP 3.17; feature since 3.16. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** specification source inspection.
- **Claim mapping:** prepare then incoming/outgoing; fromRanges; selectionRange; opaque data; partial-result batches.
- **Limits:** Transport partial result differs from incomplete semantic analysis; protocol does not ensure provider support

#### IDE14 — VS Code API: CallHierarchyProvider

- **Primary URL:** [VS Code API: CallHierarchyProvider](https://code.visualstudio.com/api/references/vscode-api#CallHierarchyProvider)
- **Edition/date:** living API docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** API documentation.
- **Claim mapping:** cancellation tokens; null/undefined lack of result; incoming/outgoing ranges.
- **Limits:** No whole-program completeness or value-path guarantee

#### IDE15 — Pylance: python.analysis.indexing

- **Primary URL:** [Pylance: python.analysis.indexing](https://github.com/microsoft/pylance-release/blob/main/docs/settings/python_analysis_indexing.md)
- **Edition/date:** living docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** symbol indexing; CPU/memory cost; indexing vs analysis distinction.
- **Limits:** Does not establish all semantic queries depend on indexing switch

#### IDE16 — VS Code: Python settings reference

- **Primary URL:** [VS Code: Python settings reference](https://code.visualstudio.com/docs/python/settings-reference)
- **Edition/date:** living docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** interpreter/environment and language-server settings.
- **Limits:** Settings defaults may evolve

#### IDE17 — Eclipse JDT: Call Hierarchy View

- **Primary URL:** [Eclipse JDT: Call Hierarchy View](https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/reference/views/ref-call-hierarchy.htm)
- **Edition/date:** current latest help retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** caller/callee view; history and pin; scope; cancel; read/write filter; constructor expansion.
- **Limits:** No numerical performance or sensitivity specification

#### IDE18 — Eclipse JDT: Tips and Tricks

- **Primary URL:** [Eclipse JDT: Tips and Tricks](https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/tips/jdt_tips.html)
- **Edition/date:** current latest help; historical screenshot retained. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation + inspected official figure.
- **Claim mapping:** constructor/caller distinction; source navigation; potential reference matches.
- **Limits:** Figure chrome not current-version measurement

#### IDE19 — Eclipse 2026-09 (4.41) release

- **Primary URL:** [Eclipse 2026-09 (4.41) release](https://eclipseide.org/release/noteworthy/2026-09/)
- **Edition/date:** 2026-09 / 4.41. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** release documentation.
- **Claim mapping:** current Eclipse release edition.
- **Limits:** Page date differs from other schedule sources; report edition without asserting day

#### IDE20 — Visual Studio: View call hierarchy

- **Primary URL:** [Visual Studio: View call hierarchy](https://learn.microsoft.com/en-us/visualstudio/ide/call-hierarchy?view=vs-2022)
- **Edition/date:** workflow page dated 2025-09-23; version-labelled vs-2022 view. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation + inspected official figure.
- **Claim mapping:** C++ explicit incoming/outgoing; C#/VB incoming; call-site details; scope; reroot; implicit/delegate limitations.
- **Limits:** Current release version verified separately; no hands-on 2026 parity check

#### IDE21 — Visual Studio: Use the right type of breakpoint

- **Primary URL:** [Visual Studio: Use the right type of breakpoint](https://learn.microsoft.com/en-us/visualstudio/debugger/using-breakpoints?view=vs-2022)
- **Edition/date:** living docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** data breakpoints observe changes during execution; supported C++/.NET runtime distinctions.
- **Limits:** Observed run is not static completeness

#### IDE22 — Visual Studio 2026 release notes

- **Primary URL:** [Visual Studio 2026 release notes](https://learn.microsoft.com/en-us/visualstudio/releases/2026/release-notes)
- **Edition/date:** 18.11.2; 2026-10-25. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** release documentation.
- **Claim mapping:** current Visual Studio version.
- **Limits:** Not a guarantee of workflow parity across all installed workloads

#### IDE23 — VS Code issue #190116: direction switch root confusion

- **Primary URL:** [VS Code issue #190116: direction switch root confusion](https://github.com/microsoft/vscode/issues/190116)
- **Edition/date:** opened 2023-08-10; closed not planned 2023-10-10. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** primary failure report and disposition.
- **Claim mapping:** root versus selected-node direction complaint; closed for vote threshold.
- **Limits:** Single report, not user study; not evidence proposed change fails

#### IDE24 — Eclipse JDT issue #724: inexact call matches

- **Primary URL:** [Eclipse JDT issue #724: inexact call matches](https://github.com/eclipse-jdt/eclipse.jdt.core/issues/724)
- **Edition/date:** opened 2023-02-10; open when retrieved. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** maintainer/contributor issue discussion.
- **Claim mapping:** empty call tree can coexist with potential references; proposal for labelled inexact matches.
- **Limits:** Specific issue; not exhaustive defect inventory

#### IDE25 — Pylance issue #4102: calls versus imports/navigation

- **Primary URL:** [Pylance issue #4102: calls versus imports/navigation](https://github.com/microsoft/pylance-release/issues/4102)
- **Edition/date:** 2023 maintainer discussion. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** primary maintainer issue explanation.
- **Claim mapping:** import reference is not call; host handles navigation focus.
- **Limits:** Historical bug context; do not assume all alias problems persist

#### IDE26 — Pylance issue #7910: workspace/library call noise

- **Primary URL:** [Pylance issue #7910: workspace/library call noise](https://github.com/microsoft/pylance-release/issues/7910)
- **Edition/date:** 2026-02-27; closed/fixed-in-next-version label retrieved. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** primary issue and resolution status.
- **Claim mapping:** historical mixed-origin noise; source-origin labels as repair.
- **Limits:** Do not present as current unfixed defect

#### IDE27 — Pyright callHierarchyProvider.ts

- **Primary URL:** [Pyright callHierarchyProvider.ts](https://github.com/microsoft/pyright/blob/1.1.414/packages/pyright-internal/src/languageService/callHierarchyProvider.ts)
- **Edition/date:** Pyright 1.1.414; release 2026-09-09. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** public implementation inspection.
- **Claim mapping:** incoming user/open files; type-based outgoing declarations; property calls; preserve all fromRanges during grouping; Workspace/Library/Standard library labels.
- **Limits:** Source downloaded through raw URL; proprietary Pylance binary not inspected; no execution

#### IDE28 — rust-analyzer call_hierarchy.rs

- **Primary URL:** [rust-analyzer call_hierarchy.rs](https://github.com/rust-lang/rust-analyzer/blob/2026-10-26/crates/ide/src/call_hierarchy.rs)
- **Edition/date:** 2026-10-26 / v0.3.3097. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** public implementation inspection.
- **Claim mapping:** incoming routine based on function usages; outgoing callable syntax and resolved targets; ranges preserved by target grouping.
- **Limits:** No behavioral execution; unsupported callable kinds may be omitted

#### IDE29 — rust-analyzer architecture

- **Primary URL:** [rust-analyzer architecture](https://rust-analyzer.github.io/book/contributing/architecture.html)
- **Edition/date:** living architecture docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** maintainer design documentation.
- **Claim mapping:** immutable Analysis snapshots; on-demand incremental facts; revision cancellation; crate configuration context.
- **Limits:** Architecture claims not benchmarks or sensitivity proof

#### IDE30 — rust-analyzer features

- **Primary URL:** [rust-analyzer features](https://rust-analyzer.github.io/book/features.html)
- **Edition/date:** living docs retrieved 2026-10-28. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** references; macro source features; separate crate dependency tree.
- **Limits:** Some UI syntax features vary by editor

#### IDE31 — rust-analyzer 2026-10-26 release

- **Primary URL:** [rust-analyzer 2026-10-26 release](https://github.com/rust-lang/rust-analyzer/releases/tag/2026-10-26)
- **Edition/date:** 2026-10-26 / v0.3.3097; commit prefix 0c4d746. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** release documentation.
- **Claim mapping:** version and release date.
- **Limits:** No benchmark

#### IDE32 — Pylance stable release metadata

- **Primary URL:** [Pylance stable release metadata](https://api.github.com/repos/microsoft/pylance-release/releases/latest)
- **Edition/date:** stable 2026.4.1 published 2026-09-23T21:36:53Z. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** public GitHub release API inspection.
- **Claim mapping:** latest stable version at retrieval.
- **Limits:** Endpoint moves; exact returned version retained in local source record; web HTML release open failed

#### IDE33 — Register IntelliJ IDEA

- **Primary URL:** [Register IntelliJ IDEA](https://www.jetbrains.com/help/idea/register.html)
- **Edition/date:** 2026.2 help. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official access documentation.
- **Claim mapping:** free feature set; Ultimate trial/subscription.
- **Limits:** Specific free-tier entitlement of analysis action not established

#### IDE34 — Register WebStorm

- **Primary URL:** [Register WebStorm](https://www.jetbrains.com/help/webstorm/register.html)
- **Edition/date:** 2026.2 help. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official access documentation.
- **Claim mapping:** noncommercial/trial/commercial access.
- **Limits:** No price quote or purchase advice

#### IDE35 — Register PyCharm

- **Primary URL:** [Register PyCharm](https://www.jetbrains.com/help/pycharm/register.html)
- **Edition/date:** 2026.2 help. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official access documentation.
- **Claim mapping:** Pro trial/subscription.
- **Limits:** Exact feature entitlement not separately checked

#### IDE36 — rust-analyzer README license

- **Primary URL:** [rust-analyzer README license](https://github.com/rust-lang/rust-analyzer/blob/master/README.md)
- **Edition/date:** current repo docs at retrieval. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** source/license declaration.
- **Claim mapping:** MIT/Apache-2.0.
- **Limits:** General license declaration only

#### IDE37 — Eclipse IDE official home

- **Primary URL:** [Eclipse IDE official home](https://eclipseide.org/)
- **Edition/date:** current at retrieval. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official product/access documentation.
- **Claim mapping:** free/open source under EPL-2.0.
- **Limits:** No pricing assumptions

#### IDE38 — Visual Studio Community

- **Primary URL:** [Visual Studio Community](https://visualstudio.microsoft.com/vs/community/)
- **Edition/date:** current at retrieval. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official product/access documentation.
- **Claim mapping:** qualifying individual free use; workload setup.
- **Limits:** General access summary; not legal advice

#### IDE39 — IntelliJ source navigation

- **Primary URL:** [IntelliJ source navigation](https://www.jetbrains.com/help/idea/navigating-through-the-source-code.html)
- **Edition/date:** 2026.2 help. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** Navigate Back/Forward returns to caret.
- **Limits:** Keyboard mappings configurable

#### IDE40 — Pylance changelog

- **Primary URL:** [Pylance changelog](https://raw.githubusercontent.com/microsoft/pylance-release/main/CHANGELOG.md)
- **Edition/date:** latest retrieved prerelease 2026.4.101, 2026-10-15. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official changelog inspection.
- **Claim mapping:** stable/prerelease distinction.
- **Limits:** Main changes over time; no binary used

#### IDE41 — Pylance README

- **Primary URL:** [Pylance README](https://github.com/microsoft/pylance-release)
- **Edition/date:** current repo docs at retrieval. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official repository documentation.
- **Claim mapping:** Pylance proprietary; public repo docs/issues; Pyright core relationship.
- **Limits:** Pylance not identical to every Pyright build

#### IDE42 — VS Code license

- **Primary URL:** [VS Code license](https://code.visualstudio.com/license)
- **Edition/date:** current terms at retrieval. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official access documentation.
- **Claim mapping:** Microsoft product license.
- **Limits:** No interpretation beyond product access summary

#### IDE43 — Editing TypeScript in VS Code

- **Primary URL:** [Editing TypeScript in VS Code](https://code.visualstudio.com/docs/typescript/typescript-editing)
- **Edition/date:** current docs at retrieval. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** documentation.
- **Claim mapping:** TS/TSX/JSX support; references and definition navigation.
- **Limits:** Not data-flow proof

### Specialized tools and research

#### SPC01 — Thin Slicing (Sridharan, Fink, Bodík), PLDI 2007

- **Primary URL:** [Thin Slicing (Sridharan, Fink, Bodík), PLDI 2007](https://manu.sridharan.net/files/pldi07.pdf)
- **Edition/date:** PLDI 2007; sections 2–6. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Original paper; PDF text and figures inspected.
- **Claim mapping:** Producer/expansion semantics; Java pointer assumptions; context and algorithm tradeoffs; simulated statement-inspection evaluation and threats.
- **Limits:** Historical Java/WALA study; not a runnable slice, JS guarantee, or measured developer speedup

#### SPC02 — WALA Slicer.DataDependenceOptions API

- **Primary URL:** [WALA Slicer.DataDependenceOptions API](https://wala.github.io/javadoc/com/ibm/wala/ipa/slicer/Slicer.DataDependenceOptions.html)
- **Edition/date:** 1.9.0-SNAPSHOT as displayed. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official API documentation.
- **Claim mapping:** NO_BASE_PTRS and other dependence policies are distinct selectable analysis options.
- **Limits:** Snapshot API; no Srcly equivalence or benchmark

#### SPC03 — WALA PLDI tutorial

- **Primary URL:** [WALA PLDI tutorial](https://wala.github.io/tutorials/PLDI_WALA_Tutorial.pdf)
- **Edition/date:** Historical tutorial; version not fixed. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official tutorial PDF.
- **Claim mapping:** Thin-slicing configurations distinguish no-base-pointer data from no-control options and CISlicer.
- **Limits:** Tutorial is not verification of current JS frontend behavior

#### SPC04 — Analyzing data flow in JavaScript and TypeScript

- **Primary URL:** [Analyzing data flow in JavaScript and TypeScript](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-javascript-and-typescript/)
- **Edition/date:** Current docs; modular API. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** SSA and property nodes; local/global distinction; modelled libraries and taint; global cost/precision limits.
- **Limits:** No single universal field/context-sensitivity guarantee for all libraries

#### SPC05 — About data flow analysis

- **Primary URL:** [About data flow analysis](https://codeql.github.com/docs/writing-codeql-queries/about-data-flow-analysis/)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Semantic data-flow graph differs from AST; taint tracks derived values; source/sink restriction.
- **Limits:** Static model, not an observed execution

#### SPC06 — Creating path queries

- **Primary URL:** [Creating path queries](https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/)
- **Edition/date:** Modular API introduced in CodeQL 2.13. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** path-problem metadata; PathNode/PathGraph; flowPath source/sink witness rendering.
- **Limits:** Rendered path is not a promise to enumerate all feasible executions

#### SPC07 — Explore data flow with CodeQL for VS Code

- **Primary URL:** [Explore data flow with CodeQL for VS Code](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-vs-code/explore-data-flow)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation; workflow reconstruction, not exercised.
- **Claim mapping:** Open path-problem query; run on selected database; expand alert steps; inspect source.
- **Limits:** Extension version not independently pinned; no local run

#### SPC08 — Running CodeQL queries

- **Primary URL:** [Running CodeQL queries](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-vs-code/running-codeql-queries)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Query history retains database, query and duration; quick evaluation; source navigation; query comparisons.
- **Limits:** No measured latency in this assignment

#### SPC09 — Debugging data-flow queries using partial flow

- **Primary URL:** [Debugging data-flow queries using partial flow](https://codeql.github.com/docs/writing-codeql-queries/debugging-data-flow-queries-using-partial-flow/)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Validate sources/sinks; fieldFlowBranchLimit affects discovered paths and cost; partial exploration.
- **Limits:** Absence of results under a model/budget is not a proof of independence

#### SPC10 — Prepare code for CodeQL analysis

- **Primary URL:** [Prepare code for CodeQL analysis](https://docs.github.com/en/code-security/tutorials/customize-code-scanning/prepare-code-for-analysis)
- **Edition/date:** Current CLI documentation. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** database create; javascript-typescript language; source-root; JS/Python database setup.
- **Limits:** Proposed setup only; extraction not run

#### SPC11 — CodeQL CLI releases

- **Primary URL:** [CodeQL CLI releases](https://github.com/github/codeql-cli-binaries/releases)
- **Edition/date:** Reviewed v2.27.3, 2026-10-20. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release page.
- **Claim mapping:** Version anchor for workflow review.
- **Limits:** Current documentation may advance independently

#### SPC12 — CodeQL for VS Code repository

- **Primary URL:** [CodeQL for VS Code repository](https://github.com/github/vscode-codeql)
- **Edition/date:** Repository inspected on retrieval date. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Primary implementation/readme/license inspection.
- **Claim mapping:** Extension MIT; CodeQL itself has separate licensing and research terms.
- **Limits:** Do not infer unrestricted commercial engine use from extension license

#### SPC13 — Assess code scanning alerts / multiple paths figure

- **Primary URL:** [Assess code scanning alerts / multiple paths figure](https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/assess-alerts)
- **Edition/date:** Current docs; image version not stated. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official UI screenshot actually downloaded and visually inspected.
- **Claim mapping:** Show paths; numbered source steps; alternate paths selected separately.
- **Limits:** This figure is GitHub code scanning web UI, not the VS Code extension; no hands-on alert investigation

#### SPC14 — Semgrep taint analysis overview

- **Primary URL:** [Semgrep taint analysis overview](https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Sources/sinks/sanitizers/propagators; one trace per finding; CE/Pro scope; reproducible Playground trace exercise.
- **Limits:** Single returned trace does not enumerate alternate paths

#### SPC15 — Semgrep advanced taint analysis

- **Primary URL:** [Semgrep advanced taint analysis](https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/advanced)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Basic field sensitivity; variable rather than heap-object taint; Pro index/control options; side-effect modelling.
- **Limits:** Control taint is reachability, not a complete guard predicate; no heap-alias precision implied

#### SPC16 — Semgrep CLI reference

- **Primary URL:** [Semgrep CLI reference](https://docs.semgrep.dev/cli-reference)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** scan --config; --dataflow-traces text/SARIF output; --pro-path-sensitive option.
- **Limits:** CLI command proposed, not executed; JSON output does not expose the same trace flag behavior

#### SPC17 — Semgrep Pro Engine introduction

- **Primary URL:** [Semgrep Pro Engine introduction](https://docs.semgrep.dev/semgrep-code/semgrep-pro-engine-intro)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Cross-function/cross-file and paid-account setup boundaries; modelling limitations and resource costs.
- **Limits:** Language and scanning-mode coverage vary; no universal whole-program guarantee

#### SPC18 — Semgrep releases

- **Primary URL:** [Semgrep releases](https://github.com/semgrep/semgrep/releases)
- **Edition/date:** Reviewed v1.182.0, 2026-10-20. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release page.
- **Claim mapping:** Version anchor.
- **Limits:** Other distribution channels can advance; not a guaranteed latest build

#### SPC19 — Semgrep repository

- **Primary URL:** [Semgrep repository](https://github.com/semgrep/semgrep)
- **Edition/date:** Repository inspected on retrieval date. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Primary implementation/readme/license inspection.
- **Claim mapping:** CE LGPL 2.1; JS/TS/TSX/Python relevance; proprietary components separately licensed.
- **Limits:** Community engine license does not grant Pro service or rule-pack access

#### SPC20 — Semgrep spring 2025 release marketing kit

- **Primary URL:** [Semgrep spring 2025 release marketing kit](https://semgrep.dev/assets/release-marketing/spring-2025-semgrep-release-marketing-kit.pdf)
- **Edition/date:** Spring 2025; page 7. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official UI figure actually rendered and visually inspected.
- **Claim mapping:** Cross-file trace cards retain line, file and highlighted argument/assignment source.
- **Limits:** Historical vendor figure, not current app session or independent usability evidence

#### SPC21 — In-app snippets for cross-file dataflow traces

- **Primary URL:** [In-app snippets for cross-file dataflow traces](https://semgrep.dev/products/product-updates/in-app-code-snippets-are-now-supported-for-cross-file-dataflow-traces/)
- **Edition/date:** 2025-04-02. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official product update and official screenshot downloaded and visually inspected.
- **Claim mapping:** Inline cross-file code snippets reduce navigation required by the earlier UI; code access required.
- **Limits:** Vendor rationale, not a controlled usability result

#### SPC22 — Joern releases

- **Primary URL:** [Joern releases](https://github.com/joernio/joern/releases/)
- **Edition/date:** Reviewed v4.0.666, 2026-10-27, commit 346d3e6. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release page.
- **Claim mapping:** Version anchor.
- **Limits:** Documentation examples span older releases

#### SPC23 — Joern repository

- **Primary URL:** [Joern repository](https://github.com/joernio/joern)
- **Edition/date:** Repository inspected on retrieval date. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Primary implementation/readme/license inspection.
- **Claim mapping:** Apache 2.0; CPG and Scala query shell; documented current JDK 21 prerequisite.
- **Limits:** Not installed or executed

#### SPC24 — Joern quickstart

- **Primary URL:** [Joern quickstart](https://docs.joern.io/quickstart/)
- **Edition/date:** Current docs; x42 C fixture. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation and REPL transcript inspection.
- **Claim mapping:** importCode; project/database workflow; security question over C example.
- **Limits:** No screenshot of an interactive flow UI obtained

#### SPC25 — Joern data-flow steps

- **Primary URL:** [Joern data-flow steps](https://docs.joern.io/cpgql/data-flow-steps/)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation and tabular REPL output inspected.
- **Claim mapping:** reachableBy versus reachableByFlows; source-to-sink table with line/method/file witnesses.
- **Limits:** A traversal result is model-dependent; not evidence of observed execution

#### SPC26 — Joern control-flow steps

- **Primary URL:** [Joern control-flow steps](https://docs.joern.io/cpgql/control-flow-steps/)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** controlledBy/controls and dominance distinguish execution dependence from value propagation.
- **Limits:** No proof of complete feasible path condition

#### SPC27 — Joern custom data-flow semantics

- **Primary URL:** [Joern custom data-flow semantics](https://docs.joern.io/dataflow-semantics/)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Unknown external call conservative all-argument/return default; custom semantics eliminate unspecified flows.
- **Limits:** Incorrect custom model can remove a true flow; context/alias guarantees not specified by this page

#### SPC28 — Joern CPG slicing

- **Primary URL:** [Joern CPG slicing](https://docs.joern.io/cpg-slicing/)
- **Edition/date:** Current docs; some prerequisite text older than release. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Backward data-flow from call arguments; usage slices; JSON; scope/type-recovery options.
- **Limits:** Not a full semantic guarantee for all frontends

#### SPC29 — Joern JavaScript frontend

- **Primary URL:** [Joern JavaScript frontend](https://docs.joern.io/frontends/javascript/)
- **Edition/date:** Current jssrc2cpg docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** JS/TS frontend, type information/type-recovery options, dynamic-call argument conventions.
- **Limits:** TSX/framework/promise completeness not established

#### SPC30 — Joern Python frontend

- **Primary URL:** [Joern Python frontend](https://docs.joern.io/frontends/python/)
- **Edition/date:** Current pysrc2cpg docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Python import/virtual-environment filters and type-recovery options.
- **Limits:** All-language field/flow/context sensitivity undocumented in inspected source

#### SPC31 — Joern graph export

- **Primary URL:** [Joern graph export](https://docs.joern.io/export/)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** AST/CFG/PDG and CPG export; ossdataflow overlay; DOT graph workflow.
- **Limits:** Exported graph is not evidence of interactive usability or precision

#### SPC32 — Understand: what are dependencies?

- **Primary URL:** [Understand: what are dependencies?](https://docs.scitools.com/help/dependencies/what-are-dependencies.html)
- **Edition/date:** Understand 8 documentation. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Dependencies aggregate actual references to parent entities; language-specific edge kinds; include settings and exclusions.
- **Limits:** Reference dependency is not value-flow proof; indirect C-family calls excluded from dependency counts

#### SPC33 — Understand: browse and export dependencies

- **Primary URL:** [Understand: browse and export dependencies](https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html)
- **Edition/date:** Understand 8 documentation. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation; official UI screenshot actually downloaded and visually inspected.
- **Claim mapping:** Two-pane dependency/reference browser; count-to-source drill-down; graph/matrix routes share dependency data.
- **Limits:** Figure does not establish analysis completeness; no app exercise

#### SPC34 — Understand: open a graph

- **Primary URL:** [Understand: open a graph](https://docs.scitools.com/help/graphs/open-a-graph.html)
- **Edition/date:** Understand 8 documentation. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Context menu Graphical Views; graph variant and relationship selection.
- **Limits:** No measured layout or navigation benefit

#### SPC35 — Understand build notes

- **Primary URL:** [Understand build notes](https://docs.scitools.com/buildnotes/)
- **Edition/date:** Reviewed Understand 8.0 build 1265, 2026-10-09. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release notes.
- **Claim mapping:** Version anchor.
- **Limits:** No current executable installed

#### SPC36 — Understand supported languages

- **Primary URL:** [Understand supported languages](https://docs.scitools.com/help/getting-started/supported-languages.html)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Java, C-family, JS/TS and Python support; version-specific language coverage.
- **Limits:** Specific construct and type-system coverage requires a fixture

#### SPC37 — Understand open-source license

- **Primary URL:** [Understand open-source license](https://docs.scitools.com/help/licensing/open-source-license.html)
- **Edition/date:** Available from build 1258. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official licensing documentation.
- **Claim mapping:** No-cost per-public-Git-repository mode with online checks; commercial/trial modes separate.
- **Limits:** Not a permissive open-source software license; not applicable to private repositories

#### SPC38 — Sourcegraph code navigation

- **Primary URL:** [Sourcegraph code navigation](https://sourcegraph.com/docs/code-navigation)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Hover/definition/reference/implementation navigation; search-based versus precise navigation.
- **Limits:** Symbol navigation is not value-flow analysis

#### SPC39 — Sourcegraph precise code navigation

- **Primary URL:** [Sourcegraph precise code navigation](https://sourcegraph.com/docs/code-navigation/precise-code-navigation)
- **Edition/date:** Current docs; Enterprise feature. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** SCIP compiler indexes, per-repository setup, search fallback, TS/Python indexers.
- **Limits:** Missing/old indexes can change evidence mode; no general sensitivity claim

#### SPC40 — Sourcegraph 8.1.0 release

- **Primary URL:** [Sourcegraph 8.1.0 release](https://sourcegraph.com/changelog/releases/8.1.0)
- **Edition/date:** 2026-10-14; newer 8.1.1335 linked. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release notes.
- **Claim mapping:** Revision-aware code navigation UI improvements.
- **Limits:** Installed service/version not inspected

#### SPC41 — Sourcegraph latest changelog

- **Primary URL:** [Sourcegraph latest changelog](https://sourcegraph.com/changelog/latest)
- **Edition/date:** 2026-10-26 entries reviewed. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release notes.
- **Claim mapping:** Partial search results with warning for unavailable search backend; result warnings remain visible.
- **Limits:** Search incompleteness mechanism, not an analyzed flow path guarantee

#### SPC42 — Sourcetrail repository

- **Primary URL:** [Sourcetrail repository](https://github.com/CoatiSoftware/Sourcetrail)
- **Edition/date:** Archived 2021-12-14; historical 2021.4. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Primary archived implementation/readme/license inspection.
- **Claim mapping:** GPL 3; C/C++/Java/Python; discontinued maintenance; coordinated graph/code navigation.
- **Limits:** Native TS/TSX not listed; abandonment does not prove UI failed

#### SPC43 — Sourcetrail documentation

- **Primary URL:** [Sourcetrail documentation](https://github.com/CoatiSoftware/Sourcetrail/blob/master/DOCUMENTATION.md?plain=1)
- **Edition/date:** 2021.4 historical docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official archived documentation.
- **Claim mapping:** Search, graph/source synchronization, bundled relations, history, partial indexing.
- **Limits:** Symbol relationships, not general semantic value-flow evidence

#### SPC44 — NDepend dependency structure matrix

- **Primary URL:** [NDepend dependency structure matrix](https://www.ndepend.com/docs/dependency-structure-matrix-dsm/)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation and documented UI behavior.
- **Claim mapping:** Row/column relationships, weighted counts, cycle blocks, direct/indirect coupling, drill-down.
- **Limits:** Structural .NET dependency view, not ordered feasible value paths

#### SPC45 — NDepend analysis inputs

- **Primary URL:** [NDepend analysis inputs](https://www.ndepend.com/docs/ndepend-analysis-inputs-explanation)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** .NET assemblies mandatory; PDB/source optional; source matching and warnings.
- **Limits:** Cannot directly adopt as JS/TS/Python analyzer

#### SPC46 — NDepend purchase and access

- **Primary URL:** [NDepend purchase and access](https://www.ndepend.com/purchase)
- **Edition/date:** Current page. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official pricing/licensing page.
- **Claim mapping:** Commercial licenses; Developer UI Windows; build-machine platform/access distinction.
- **Limits:** No price recommendation or purchase performed

#### SPC47 — NDepend release notes

- **Primary URL:** [NDepend release notes](https://www.ndepend.com/release-notes)
- **Edition/date:** Reviewed 2026.1.6, 2026-06-01. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release notes.
- **Claim mapping:** Version anchor.
- **Limits:** Version-specific current app UI untested

#### SPC48 — dependency-cruiser repository

- **Primary URL:** [dependency-cruiser repository](https://github.com/sverweij/dependency-cruiser)
- **Edition/date:** Repository inspected on retrieval date. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Primary implementation/readme/license inspection.
- **Claim mapping:** MIT; JS/TS module dependency extraction, rules, graph outputs.
- **Limits:** Module dependency, not symbol/value/control/alias proof

#### SPC49 — dependency-cruiser options reference

- **Primary URL:** [dependency-cruiser options reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** Focus is output selection; doNotFollow/includeOnly/exclude may restrict traversal/input; collapse and reach filters.
- **Limits:** Display filtering does not automatically save analysis work

#### SPC50 — dependency-cruiser CLI reference

- **Primary URL:** [dependency-cruiser CLI reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md)
- **Edition/date:** Current docs. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation.
- **Claim mapping:** focus/focus-depth/reaches/affected/collapse and export flags.
- **Limits:** Proposed commands unexecuted; config determines module resolution

#### SPC51 — dependency-cruiser releases

- **Primary URL:** [dependency-cruiser releases](https://github.com/sverweij/dependency-cruiser/releases)
- **Edition/date:** Reviewed v18.6.0, 2026-10-11. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Maintainer release notes.
- **Claim mapping:** Version anchor.
- **Limits:** No performance benchmark

#### SPC52 — Madge repository

- **Primary URL:** [Madge repository](https://github.com/pahen/madge)
- **Edition/date:** Repository inspected on retrieval date. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Primary implementation/readme/license inspection.
- **Claim mapping:** Module dependency graph/cycles; filters and unresolved-file warnings; TS config/extensions and Graphviz setup.
- **Limits:** No general symbol, dataflow, control or alias semantics

#### SPC53 — Madge package manifest

- **Primary URL:** [Madge package manifest](https://github.com/pahen/madge/blob/master/package.json)
- **Edition/date:** Reviewed manifest 8.0.0; Node >=18. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Primary package/license inspection.
- **Claim mapping:** Version and MIT license.
- **Limits:** Not claiming this is the newest package-registry release

#### SPC54 — Whyline for Java (Ko and Myers), CHI 2009

- **Primary URL:** [Whyline for Java (Ko and Myers), CHI 2009](https://faculty.washington.edu/ajko/papers/Ko2009JavaWhylineUI.pdf)
- **Edition/date:** CHI 2009; author-hosted paper. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Original research paper inspected.
- **Claim mapping:** Recorded-output/time selection; why-did/why-didn't questions; scaling failures of earlier Alice global question menu.
- **Limits:** Historical instrumented-runtime research; not evidence Srcly has dynamic trace support

#### SPC55 — CodeQL built-in JavaScript TaintedPath query

- **Primary URL:** [CodeQL built-in JavaScript TaintedPath query](https://github.com/github/codeql/blob/main/javascript/ql/src/Security/CWE-022/TaintedPath.ql)
- **Edition/date:** Current primary source inspected. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation / implementation inspection.
- **Claim mapping:** Exact built-in query path, js/path-injection ID, path-problem metadata, deduplicated path graph.
- **Limits:** Not executed; package/database setup and version matching must be recorded

#### SPC56 — CodeQL js/path-injection query help

- **Primary URL:** [CodeQL js/path-injection query help](https://codeql.github.com/codeql-query-help/javascript/js-path-injection/)
- **Edition/date:** Current primary source inspected. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** Official documentation / implementation inspection.
- **Claim mapping:** Official bad/good HTTP request path fixture; source query link; alternate replay using built-in query.
- **Limits:** Not executed; package/database setup and version matching must be recorded

### Fixture semantic verification

#### EXT01 — Solid createResource API

- **Primary URL:** [Solid createResource API](https://docs.solidjs.com/reference/basic-reactivity/create-resource)
- **Edition/date:** Living Solid documentation retrieved on research date; local fixture must pin installed version. **Retrieved:** 2026-10-28 (America/Indianapolis).
- **Evidence/access:** official documentation inspected; no resource run.
- **Claim mapping:** False/null/undefined source suppresses source-triggered fetch; other source values supplied as first fetcher argument; F1 oracle separates value delivery from activation and retained resource value.
- **Limits:** No hands-on; SSR/hydration/refetch behavior beyond scoped fixture not asserted

## 5. Figures and visual evidence

All images below were visually inspected. The original URLs are the authoritative attribution; included PNGs are research evidence excerpts. Their original UI text is not a claim of a current local session. Numbered region annotations appear in the survey, while historical Srcly images are described below. Full research and marketing PDFs remain linked at their primary sources rather than bundled.

| Image / edition | Source and local ZIP path | What can be concluded |
| --- | --- | --- |
| IntelliJ value tree; current help, figure date unspecified | [Official source](https://www.jetbrains.com/help/idea/analyzing-data-flow.html); `assets/ide-ui/intellij-dataflow.png` | Visible tree/source organization; exact asset URL is also recorded by the survey if its provider URL differs. |
| VS Code call hierarchy; historical 1.43 release | [Official source](https://code.visualstudio.com/updates/v1_43); `assets/ide-ui/vscode-call-hierarchy.png` | Historical TS call-tree shape, not current provider precision. |
| VS Code peek; official generic C# illustration | [Official source](https://code.visualstudio.com/docs/editing/editingevolved); `assets/ide-ui/vscode-peek.png` | Source/result split; not TS/Python analysis proof. |
| Eclipse call hierarchy; historical figure in latest help | [Official source](https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/tips/images/call_hierarchy.png); `assets/ide-ui/eclipse-call-hierarchy.png` | Caller/construction tree and scope. |
| Visual Studio call hierarchy; vs-2022 document view | [Official source](https://learn.microsoft.com/en-us/visualstudio/ide/media/call-hierarchy-cpp.png?view=vs-2022); `assets/ide-ui/visualstudio-calls.png` | Member/call-site pane; empty pane content not inferred. |
| WebStorm call preview; current help figure | [Official source](https://www.jetbrains.com/help/webstorm/find-highlight-usages.html); `assets/ide-ui/webstorm-call-preview.png` | Usages preview, not verified arbitrary TS value slicing. |
| CodeQL paths; GitHub web UI | [Official source](https://docs.github.com/assets/cb-340783/images/help/repository/multiple-paths-available.png); `assets/evidence/codeql-multiple-paths.png` | Reported alternative witness selector; not VS Code replay screenshot. |
| Semgrep cross-file trace; April 2025 official figure | [Official source](https://semgrep.dev/assets/screenshot-2025-04-02-at-2.32.07-pm.png); `assets/evidence/semgrep-cross-file-official.png` | Source snippets across file steps; no independent guard/invocation proof. |
| Understand dependency browser; docs updated July 28, 2026 | [Official source](https://docs.scitools.com/help/assets/screenshots/dependencies/dependency-browser.png); `assets/evidence/understand-dependency-browser.png` | Inspectable occurrence grouping. |
| TSX route round 2 | [Pinned image](https://raw.githubusercontent.com/byronwall/srcly/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/tsx-dataflow-audit-2026-10/shots/r2-t1-01-route-opens-on-data.png); `assets/evidence/srcly-tsx-r2-route.png` | Large folded route graph and partial-stop inspector; historical capture, not a current measurement. |
| TSX save round 2 | [Pinned image](https://raw.githubusercontent.com/byronwall/srcly/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/tsx-dataflow-audit-2026-10/shots/r2-t4-01-database-writes.png); `assets/evidence/srcly-tsx-r2-save.png` | Named database writes amid dense folded context; do not recalculate audit score from image. |
| Python SECRET_KEY round 5 | [Pinned image](https://raw.githubusercontent.com/byronwall/srcly/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/python-dataflow-audit-2026-10/shots/r5-t4-secret-key-folded.png); `assets/evidence/srcly-python-r5-folded.png` | Folded downstream scopes and origin; current engine not executed. |
| Python closure round 6 | [Pinned image](https://raw.githubusercontent.com/byronwall/srcly/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/python-dataflow-audit-2026-10/shots/r6-t5-req-through-closure.png); `assets/evidence/srcly-python-r6-closure.png` | Partial callback/network trace; older narrative must be reconciled against baseline code. |

**Authored visual artifacts:** `assets/mockups/alternative-a1.svg`, `alternative-b.svg`, `alternative-c.svg` and their PNG previews are exact design mockups, not generated product screenshots or executed prototypes. Their state tables and numbered callouts are fully explained in `ui-patterns.md`.

## 6. Access gaps, counterevidence and rejected leads

- GitHub page retrieval sometimes failed in the web reader; read-only public file/API retrieval and the user-supplied packet supplied pinned content. A failed URL was not evidence that a feature was absent.
- WebStorm JS/TS value-slicing availability is limited by primary tracker search evidence and accessible help; Java IDEA capability was not copied into WebStorm/PyCharm claims. Proprietary Pylance was not treated as identical to open Pyright.
- Joern: official REPL transcript/table was accessible; an interactive graphical path screenshot was not obtained. Documentation steps are reproducible proposals, not terminal sessions from this assignment.
- Structure101 and Rider were not required to meet breadth/depth and were not assigned unsupported capabilities. Sourcetrail was retained as historical design evidence with archived status, not recommended as a current analysis foundation.
- Visual-notes and the Python audit application checkouts were not supplied. Their task answers, scores and cold/warm times remain historical audit evidence. Runtime behavior and current application latency are unverified.
- Original papers are evidence under their stated study conditions. Thin Slicing ratios are not a measured Srcly or developer speedup; runtime why/why-not research does not establish a static path guarantee.
- Future main may already change any listed file or task. Integration must reconcile the new implementation while retaining this baseline for research claim provenance.

## 7. Artifact and experiment integrity

The ZIP contains the eight requested standalone companions, selected evidence PNGs, authored mockups, this machine-readable source register, the isolated experiment harness/results and a SHA-256 manifest. Input archives, full third-party publications, local helper scripts and application source are not repackaged. The experiment results include the exact three source-file hashes used. The manifest covers every delivered file except itself and the outer ZIP.

- Input `source-packet(7).zip` SHA-256: `370bb45e3b4be2ec0954affcd9f211835c27e3c7dd53d8ad68078e1b3441a3cf`.
- Input `pro-prompt(20261029-013140).md` SHA-256: `3f0363a6b66ee1f57f3152fa95fb1108ceedcb60fbca92fc19e0b214bc78e663`.
