# Recommendations: smallest useful improvement, with rejection criteria

**Recommended first proof:** **DA-001 — preserve and explain the source evidence behind a displayed connection in the existing graph inspector.** Keep the current default view while testing alternatives. This is a research proposal, not approval to implement or change product direction.

**Scope:** Srcly PR #256; topic `srcly.dependency-analysis-tool-ui-deep-dive.v1`; pinned baseline `ee8a771ce94fb59573492445d0f5fa2411ad83c8`; October 28, 2026 (America/Indianapolis). Repository integration belongs to Codex. The selected packet is not runnable. Four synthetic projection checks were executed; application tests, benchmarks and user comparisons remain proposed.

## Decision vocabulary and priorities

- **Adopt proposal:** sufficiently supported to build a bounded proof, subject to the acceptance gates below.
- **Investigate:** a plausible improvement with an unresolved semantic or usability prerequisite.
- **Defer:** useful for a different scope or after cheaper evidence exists.
- **Reject now:** poor fit or unsupported as the current default; not a permanent ban.

Relative effort is a planning comparison, not a delivery estimate: **S** changes a local presentation using existing facts; **M** crosses engine/contract/client or several navigation surfaces; **L** adds an analysis model with correctness and scale consequences. Rec IDs DA-001–DA-012 map one-to-one to gap IDs DAG-001–DAG-012. Existing backlog overlap uses **reuse**, **extend**, or **already-owned**; no new issue or PR was created.

## DA-001 — Explain connection in the existing inspector

**Disposition:** adopt proposal first · **Effort:** M · **Confidence:** high in the evidence-loss finding, medium in user benefit.

**Observed Srcly limitation:** engine endpoint deduplication, client folding/reference removal and endpoint deduplication can discard contributing relation/proof information. Four isolated projection checks expose specific loss/composition cases. The existing `ViewEdge` cannot represent a complete member set. [Engine projection][R-ENGINEPROJECT] [Client adapter][R-ADAPTER] [View contract][R-VIEWMODEL]

**External mechanism:** Understand makes aggregate dependencies inspectable as exact source references; LSP/Pyright retain occurrence ranges while grouping members. These are design precedents for inspectable aggregation, not substitutes for Srcly value semantics. [Dependency browser][SPC33] [Call-site ranges][IDE13] [Provider implementation][IDE27]

**Proposal:** preserve raw IDs, raw endpoints, kinds, proof records and every source span before the first merge. The selected connection lists its contributors and any hidden serial reference steps. Keep query/generation membership, explain source/model/assumption strength, and show `pathCompatibility: not-evaluated` until the engine supplies a stronger witness. Conditions remain “not analyzed” when absent. Count **relations**, not paths or confidence.

**First proof and gate:** P1–P4 remain truthful after folding/reordering/merging; every contributor can open its source and return to the same selected member. No new full-chain claim appears. Test A1 against the unchanged A0 on TSX T2/T4 and a Python folded trace. Reject or reduce the panel if people cannot explain the connection more accurately or mistake the bundle for one compatible path. Coordinate with existing folding/proof-strength work; do not create a duplicate layout project.

## DA-002 — Preserve compatible witness states before certifying a path

**Disposition:** investigate next, and prerequisite to a certified chain · **Effort:** L · **Confidence:** high contract insufficiency; unexecuted completeness hypothesis explicitly separate.

**Observed limitation:** traversal carries invocation/field context, but its output is an ID-keyed union. Later adjacency walks cannot reconstruct which states compose. [Evidence traversal/output][R-SLICE] [Anchor contract][R-ANCHORCONTRACT]

**External mechanism:** CodeQL returns an explicit path graph/result rather than expecting a renderer to infer a path from unrelated alert edges. [Path queries][SPC06]

**Proposal:** retain accepted state transitions with selected query/run identity, call push/pop match, field path/widening and source relation membership. Share immutable states or store selected predecessor witnesses; do not enumerate all paths. The consumer may certify only a chain connected through compatible states. Recursion and truncation must be explicit.

**First proof and gate:** F4 must forbid left-call entry/right-call return, preserve both fanout returns from one input, and survive two calls on the same line. P4 must retain per-query membership. If the engine cannot supply an affordable compatible witness, retain local transfer explanations and decline certified-path wording. **Backlog:** extend higher-order-call and hub-summary work; no general CPG service required.

## DA-003 — Explicit condition and identity expansion, backed by new facts

**Disposition:** investigate in narrow stages · **Effort:** L · **Confidence:** high that current general facts are insufficient; medium in the value of dedicated panels.

**Observed limitation:** branch tests and selected-expression dependencies do not encode general guard→write polarity; member-state matches property declarations rather than individual receiver allocations. Framework value delivery does not encode activation. [Collector](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L26-L95) [Member matching](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L437-L451)

**External mechanism:** Joern's separate control queries and WALA's distinct dependence policies make dependency-class choice explicit. [Control traversal][SPC26] [Dependence options][SPC02]

**Proposal and prerequisites:** first show honest unavailable evidence plus source. Later add basic guard polarity and early-return structure in a scoped control producer, with a coverage field; separately add receiver/allocation evidence where supported. Resource activation must name its model and version. Neither a shared field name nor a UI filter repairs missing identity.

**First proof and gate:** F3 must distinguish producers from `canSave && dirty`; F1 must not imply inactive-source fetch execution; F6 must not certify flow between two `Box` instances. Unknown exceptional control remains named. **Backlog:** branch vocabulary is already-owned and narrower; alias resolver refactoring is already-owned but not an allocation analysis. Do not silently expand either task's scope.

## DA-004 — Keep question and dependency class visible

**Disposition:** adopt proposal in touched surfaces · **Effort:** S · **Confidence:** high.

**Observed limitation:** imports, projected value edges, references and effects have different contracts while sharing navigation concepts. A generic change-impact answer could overstate them. [Import contract][R-IMPORTCONTRACT] [Relation traits][R-KINDS] [Effects][R-EFFECTSCONTRACT]

**External mechanism:** Visual Studio documents different call/reference coverage, and rust-analyzer's incoming/outgoing implementations differ in the syntax they consider. [Call semantics][IDE20] [Implementation][IDE28]

**Proposal:** persistent question/root/direction/scope; explicit reroot; relation text beside each explanation. “Possible value transfer,” “same declared property,” “module import” and “observed event” must not collapse into one proof category. Avoid a new global mode selector if existing entry points already provide the question.

**First proof and gate:** a reviewer can identify which contract answers all five user questions. No call/reference result is scored as a value witness. Change-impact tasks must name the family before reporting reach.

## DA-005 — Reuse proof-strength ownership and separate honesty dimensions

**Disposition:** adopt by extending existing task · **Effort:** M · **Confidence:** high.

**Observed limitation:** engine proof traits and client assumptions can diverge; Python wire kinds include kinds not normalized by the registry. Proof strength, per-query completeness and path compatibility are separate. [Proof registry][R-KINDS] [Public edge contract][R-ANCHORCONTRACT]

**External mechanism:** Joern's model-dependent external-call behavior and Semgrep's precision limits show why an attractive trace needs its model boundary disclosed. [External semantics][SPC27] [Taint limitations][SPC15]

**Proposal:** `task-send-proof-strength-to-the-client-through-the-contract` remains the owner. Preserve proven/modelled/assumed/unknown per member, and do not let unknown become proven. Keep condition coverage, generation, runtime/static distinction and outcome separate from that strength. A mixed bundle shows its distribution, not a single confidence percentage.

**First proof and gate:** unknown Python proof kind, mixed serial strengths, alternative modelled/source-backed records, partial result and stale generation all survive serialization and inspection. Any displayed confidence percentage without a calibrated model is rejected.

## DA-006 — Compare producer-first and source-first views against frozen baseline

**Disposition:** investigate, no default switch yet · **Effort:** M for prototypes; L if new engine facts are bundled · **Confidence:** medium hypothesis.

**Observed limitation:** historical Focus remains low, and the current ledger is not a context-preserving universal path fallback. [TSX audit][R-TSX] [Ledger][R-LEDGER]

**External mechanism:** IntelliJ's value tree, VS Code's source peek and CodeQL's selected path presentation provide different reading units. [Value tree][IDE01] [Peek][IDE09] [Selected paths][SPC13]

**Proposal:** compare A0 current, B producer-first and C source-first using equal facts; test A1 evidence inspector separately. A future hand-authored condition/identity prototype is a distinct evidence track. Do not compare a richer oracle payload to the baseline and credit the UI.

**First proof and gate:** reuse audit T1–T4, representative Python tasks and F1–F7. Reject any view that hides conditions/boundaries, invents paths or loses source. If correctness ties and interactions increase, keep A0. Thin Slicing is a hypothesis source; no claimed productivity multiplier.

## DA-007 — Extend existing source and Return behavior

**Disposition:** adopt for the first slice · **Effort:** S–M · **Confidence:** high reuse opportunity.

**Observed limitation:** state/history exists, but a new contributor selection requires additional exact member identity; the current ledger cannot jump from every cross-file row. [View state][R-FLOWSTATE] [Keyboard][R-FLOWKEYS] [Ledger][R-LEDGER]

**External mechanism:** Eclipse history and stable query scope illustrate returning to an investigation without rebuilding its question. [JDT][IDE17]

**Proposal:** save selected connection/member, root, direction, expansion, scroll/camera and generation through source navigation. Keep keyboard focus and visible status text. Reuse the current history/inspector instead of reviving the previously dropped investigation workspace. [Decision log][R-DECISIONS]

**First proof and gate:** open the second occurrence in a grouped edge, inspect source, return, and recover the same member and camera; a changed generation must be explicit. Extend the existing return and one-control work. Avoid a second independent history stack.

## DA-008 — Apply inspectable aggregation to imports later, with a separate contract

**Disposition:** defer implementation behind DA-001; retain design direction · **Effort:** M · **Confidence:** high semantic distinction.

**Observed limitation:** heuristic import collection and syntactic symbol use do not carry complete resolver coverage or source occurrences through the current dependency edge contract. [Import implementation][R-IMPORT] [Resolution][R-TSIMPORT] [Contract][R-IMPORTCONTRACT]

**External mechanism:** dependency-cruiser distinguishes module analysis from filtered output; NDepend's matrix groups structural dependencies. [Options][SPC49] [DSM][SPC44]

**Proposal:** later list imports/re-exports/uses contributing to each aggregated edge, name resolution policy and unresolved/skipped boundaries. Reuse presentation components but not value-path language. This should not block the value inspector.

**First proof and gate:** unresolved relative import and shadowed symbol cases cannot produce a false “no dependency” or precise binding claim. Use a matrix only when cycle/architecture tasks justify it, not for a branch-controlled value question.

## DA-009 — Keep rendering, analysis cost and cancellation separate

**Disposition:** extend existing latency/cache tasks · **Effort:** M · **Confidence:** high distinction, unmeasured optimization benefit.

**Observed limitation:** function folding changes output density after analysis; the stale-response guard does not itself cancel engine work. [Adapter][R-ADAPTER] [Fetch guard][R-FETCH] [Requests][R-FLOWQUERY]

**External mechanism:** LSP deferred requests/cancellation and rust-analyzer's revision-based snapshots offer lifecycle patterns. [Cancellation-token API][IDE14] [Architecture][IDE29]

**Proposal:** reuse generation-keyed requests, add actual cancellation where the engine protocol supports it, distinguish loading/cancelled/stale/budget, and measure each latency phase. Any hub summary cache must include the semantic query identity needed by its result, not just a convenient displayed node key.

**First proof and gate:** cancelled work is never rendered as an empty successful graph; old-generation detail is never joined to new evidence. Report cold construction, warm query and local expansion separately. Existing first-query and hub-summary tasks are already-owned/extend, not a new “faster graph” initiative.

## DA-010 — Reuse the effects contract; keep Python expansion owned

**Disposition:** adopt reuse, defer new scope to existing work · **Effort:** S UI reuse / L provider extension · **Confidence:** high.

**Observed limitation:** TypeScript functionEffects exists with activation, handling, witnesses and frontiers; Python support is explicitly unavailable. [Operation][R-EFFECTS] [Contract][R-EFFECTSCONTRACT]

**External mechanism:** debugger data breakpoints illustrate how an observed mutation is a different answer from a static may-effect. [Breakpoint types][IDE21]

**Proposal:** “what does this function touch?” should use effects, not all outgoing value neighbors. Preserve latent/after-await scheduling distinctions and incomplete scope. Keep `task-effects-view-for-python` as owner of the Python provider; expose unavailability honestly until implemented.

**First proof and gate:** direct, latent callback and discarded/awaited operation examples remain distinguishable; partial effects cannot be paraphrased as purity. No runtime occurrence claim appears in a static card.

## DA-011 — Runtime why/why-not investigation

**Disposition:** defer · **Effort:** L · **Confidence:** high scope mismatch for first slice.

**Observed limitation:** current route is static and carries no run identity or recorded events. [Anchor contract][R-ANCHORCONTRACT]

**External mechanism:** Whyline and debugger observation motivate execution-specific questions, with different input and instrumentation requirements. [Original runtime research][SPC54] [Debugger][IDE21]

**Proposal:** revisit only if a recurring task needs “why did this happen in this run?” Add run/environment identity, event ordering and source correlation before mixing runtime edges with static possibilities.

**First proof and gate:** one repeatable run with an explicitly recorded condition and value; an unobserved path must not disappear from the static result. Until demand and integration cost are demonstrated, source-backed static explanation is the cheaper proof.

## DA-012 — Reject an immediate wholesale replacement

**Disposition:** reject now · **Effort avoided:** L · **Confidence:** high sequencing decision, not a universal judgment.

**Observed limitation:** missing semantic facts and projection losses precede visual relevance; current source navigation and graph/ledger capabilities are substantial. Prior decisions already rejected a larger workspace. [Projection][R-ADAPTER] [Decision log][R-DECISIONS]

**External mechanisms considered:** full CPG/query infrastructure, a universal thin-slice default, an architecture matrix for all questions, unmaintained Sourcetrail adoption, and a new graph library as a semantic fix. Their costs or relation semantics do not fit the first question. [Joern setup][SPC24] [Historical project][SPC42] [Matrix][SPC44]

**Why the preferred direction might lose:** preserving every relation can enlarge payloads; an evidence list can create reading burden; sparse graphs already make a connection obvious; context remains unverified; the current graph can outperform trees on reconvergence and component structure. If A1 fails its task gates, retain A0 and use narrower source-link/proof fixes. If B/C fail the equal-evidence comparison, keep them optional or reject them. No attractive prototype substitutes for those results.

## Minimum new-fact contracts before expanding scope

| Requirement | Producer → contract → consumer | Negative fixture and cost |
| --- | --- | --- |
| Raw contributor preservation (DA-001) | Anchor builder before dedup → member sets/raw endpoints/proofs/query membership → existing edge inspector. | P1–P4 and unknown proof kind; M; preserve existing facts, no new general collector. |
| Compatible chain (DA-002) | Evidence traversal accepted transitions → bounded state/witness IDs with call/field context → selected path explanation and reach emphasis. | F4 cross-call plus fanout; L; avoid all-path enumeration. |
| Guard polarity (DA-003) | Scoped control analysis in TS and later Python → predicate/target/polarity/coverage → condition expansion. | F3 early-return/save, unsupported exceptions; L. |
| Receiver identity (DA-003) | Receiver/allocation or explicit alias analysis → identity evidence/unknown/widened → identity expansion. | F6 two instances; L; property-symbol match remains a weaker fact. |
| Framework activation (DA-003) | Named framework model plus source condition → model/version/activation and separate transfer → callback explanation. | F1 inactive source and two resources; M–L. |
| Runtime evidence (DA-011) | Instrumented run → run/event identity/source correlation → execution-specific view. | Missing event must not mean impossible static path; L and deferred. |

The decisive next artifact is a working connection explanation on a complete checkout, with its preserved members inspectable and its limits explicit. It is not a new default view, a broadened backlog or a product approval.

## References used in this document

[IDE01]: https://www.jetbrains.com/help/idea/analyzing-data-flow.html
[IDE09]: https://code.visualstudio.com/docs/editing/editingevolved
[IDE13]: https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md
[IDE17]: https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/reference/views/ref-call-hierarchy.htm
[IDE20]: https://learn.microsoft.com/en-us/visualstudio/ide/call-hierarchy?view=vs-2022
[IDE21]: https://learn.microsoft.com/en-us/visualstudio/debugger/using-breakpoints?view=vs-2022
[IDE27]: https://github.com/microsoft/pyright/blob/1.1.414/packages/pyright-internal/src/languageService/callHierarchyProvider.ts
[IDE28]: https://github.com/rust-lang/rust-analyzer/blob/2026-10-26/crates/ide/src/call_hierarchy.rs
[IDE29]: https://rust-analyzer.github.io/book/contributing/architecture.html
[R-ADAPTER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L21-L207
[R-ANCHORCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L125
[R-DECISIONS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/intent/dataflow-robustness/decision-log.md#L1-L32
[R-EFFECTS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/function-effects.ts#L1-L55
[R-EFFECTSCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/function-effects.ts#L1-L112
[R-ENGINEPROJECT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L634-L683
[R-FETCH]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/fetchSignal.ts#L1-L40
[R-FLOWKEYS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L445-L492
[R-FLOWQUERY]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L50-L177
[R-FLOWSTATE]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L286-L408
[R-IMPORT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/graph.py#L27-L171
[R-IMPORTCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/contract.ts#L1-L46
[R-KINDS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L8-L211
[R-LEDGER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/components/CodeModal/ValueFlowLedger.tsx#L1-L121
[R-SLICE]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L92-L562
[R-TSIMPORT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/typescript_deps.py#L74-L466
[R-TSX]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/tsx-dataflow-audit-2026-10/README.md#L17-L136
[R-VIEWMODEL]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/viewModel.ts#L59-L78
[SPC02]: https://wala.github.io/javadoc/com/ibm/wala/ipa/slicer/Slicer.DataDependenceOptions.html
[SPC06]: https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/
[SPC13]: https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/assess-alerts
[SPC15]: https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/advanced
[SPC24]: https://docs.joern.io/quickstart/
[SPC26]: https://docs.joern.io/cpgql/control-flow-steps/
[SPC27]: https://docs.joern.io/dataflow-semantics/
[SPC33]: https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html
[SPC42]: https://github.com/CoatiSoftware/Sourcetrail
[SPC44]: https://www.ndepend.com/docs/dependency-structure-matrix-dsm/
[SPC49]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md
[SPC54]: https://faculty.washington.edu/ajko/papers/Ko2009JavaWhylineUI.pdf

## References used in this document

[IDE14]: https://code.visualstudio.com/api/references/vscode-api#CallHierarchyProvider
