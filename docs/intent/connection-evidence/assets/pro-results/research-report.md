# Dependency analysis and investigation UI: design research for Srcly

**Finding:** keep the current graph as the default while adding a source-linked **Explain connection** inspector that preserves the evidence behind each displayed connection. Evaluate a producer-first view and a source-first tree/ledger as alternatives after their semantic prerequisites are explicit. The first useful increment is better explanations of existing evidence, not a new analysis platform.

**Assignment:** `srcly.dependency-analysis-tool-ui-deep-dive.v1` · PR #256 · research date October 28, 2026 (America/Indianapolis). **Source baseline:** `ee8a771ce94fb59573492445d0f5fa2411ad83c8`. Recommendations are proposals for Codex to verify and integrate. No repository code, settings, issues, PRs or merge state were changed.

## 1. What was established, and what remains untested

The supplied packet contains 729 selected tracked files plus `SOURCE-PACKET.md`, which states that it is incomplete, includes no local edits, omits screenshots and is not a runnable checkout. Required architecture, intent, audit, backlog and implementation routes were followed; this is not a claim that every supplied file was exhaustively read. Four historical screenshots were fetched from the exact baseline and inspected. The embedded `engine/` is Srcly's current engine; its upstream provenance does not make another checkout authoritative. [Embedded-engine provenance][R-UPSTREAM]

The external study used primary documentation, public implementations, maintainer issues, original papers and inspected official UI figures. It covers more than twelve tools, with independent deep workflows from IntelliJ IDEA, VS Code and Eclipse JDT, plus CodeQL, Semgrep and Joern; Understand supplies an additional evidence-inspection exemplar. JetBrains products sharing one mechanism do not count as separate independent design evidence. No external product was installed or exercised. Versions, access limits and exact retrieval sources are recorded in the standalone survey and source register.

Four **isolated projection checks were executed** against the actual pinned bodies of `anchorAdapter.ts`, `multiAnchorAdapter.ts` and `reach.ts`, using synthetic graph inputs. Visual helpers were stubbed; collector, engine, schema validation, layout and browser were not executed. The accompanying harness and JSON results are included in the ZIP. All proposed application fixtures, latency measurements and user comparisons remain unrun. Historical audit scores are reported observations, not reproduced results.

### Ranked conclusions

1. **Preserve evidence before compressing it.** Both engine and client can merge edges before the user inspects them. Endpoint equality is insufficient to combine proof, invocation context or conditions. A graph-library change cannot restore those facts. [Engine projection][R-ENGINEPROJECT] [Client projection][R-ADAPTER]
2. **A displayed route through folded boxes is not automatically a valid value path.** The executed checks demonstrate this projection property; its incidence in real repositories is unmeasured. The UI must distinguish a neighborhood of connections from an individually supported witness.
3. **Several desired interactions already exist.** The source ledger, folded frames, trace-from, grouped anchor stops, history and route edge steps should be extended. Rebuilding them as a new workspace would duplicate working capabilities and prior decisions. [Ledger][R-LEDGER] [Inspector][R-INSPECTOR] [State/navigation][R-FLOWSTATE] [Decision log][R-DECISIONS]
4. **Producer-first is an experiment, not an established winner.** General guard-to-write control dependence and receiver/alias identity are insufficiently represented to promise a complete condition or identity expansion today. Missing evidence must remain visible.
5. **Backlog work stays with its existing owners.** Component folding, repeated route gaps, action-wrapper noise, `Show`/`Match` vocabulary and cold-query latency already have tasks. This study contributes a preservation contract, counterexamples and a comparative evaluation, not a replacement backlog.

## 2. What “dependency” means

The UI should name the relationship being answered. These are different contracts, even when they share endpoints or an arrow style.

| Dependency | Question and evidence | Guarantee boundary |
| --- | --- | --- |
| Import/module | Which file names or resolves this module? Import/re-export records and resolver policy. | A module may be imported without a particular symbol being called; dynamic or unresolved resolution can be absent. |
| Symbol reference | Which syntax occurrences refer to this declaration? Name binding or syntactic matches. | References include reads, writes, types and passed function values; they need not execute. |
| Type hierarchy | Which types extend, implement or conform to this type? Type-system relations. | Subtyping alone does not show a call, a value transfer or an object instance. |
| Calls | Which callable can invoke which other callable at which call site? Resolved targets or conservative candidates. | Dynamic dispatch, callbacks and framework invocation require specific models. A call edge says nothing by itself about which argument reaches which return. |
| Value/data | Which expression supplies, stores, transforms or receives a value? Def-use, fields, argument/return and modelled transfer records. | Static possibility is not observed execution; transformations are not necessarily value equality. |
| Control | Which predicate or execution event permits a statement? Branch polarity, control dependence and activation evidence. | A predicate consuming the value is not the same fact as that predicate controlling a write. |
| Alias/heap identity | Can this write and this read address the same object/location? Allocation, receiver and field evidence. | A common field name or class property symbol does not prove a common instance. |
| Effects | Which externally visible operations may a function perform, and when? Writes, reads, throws, scheduling and their witnesses. | An effects summary is not a complete value slice or a purity theorem when analysis stops. |
| Framework/reactive | Which registration, source, callback, accessor or render boundary transfers a value or activates code? Explicit framework model. | Value delivery, activation, repetition and timing are distinct; one modelled edge does not establish all four. |
| Runtime | What actually happened in one identified execution? Trace, breakpoint or instrumented event. | An observed path says nothing about all unobserved inputs or runs. |

These distinctions are visible in primary tools: LSP call hierarchy retains occurrence ranges; CodeQL distinguishes semantic data-flow paths from syntax; Joern exposes separate data/control traversals; debugger data breakpoints answer an execution question. Their combination is a taxonomy, not evidence of one universal dependency algorithm. [LSP][IDE13] [CodeQL semantics][SPC05] [Joern control][SPC26] [Runtime breakpoint][IDE21]

### Five questions and their first answer

| User question | First answer to show | Mandatory qualification/expansion |
| --- | --- | --- |
| Where does this value come from? | Selected expression, nearest meaningful producers, source locations; preserve separate call-site alternatives. | Transformation/model boundaries; conditions and object identity as separate evidence, or explicitly not analyzed. |
| Where does it go? | Known consumers and terminal uses, grouped by purpose and scope. | Do not silently union independent invocation contexts or equate a branch test with the write it guards. |
| What permits this write? | Write site plus predicates/activation facts and their polarity. | If only producer facts exist, say conditions are not analyzed and open the enclosing source. |
| What does this function touch? | Effects organized by target, activation and handling, with witnesses and frontiers. | Do not substitute all reference neighbors or claim purity from an incomplete result. |
| What could this change affect? | A choice of module dependents, symbol uses, callers, value consumers or effects, with scope stated. | Do not conflate broad import reach with precise behavioral impact; no universal “safe change” verdict. |

## 3. The Srcly source-to-screen route

### 3.1 Import and symbol dependency view

`collect_edges` dispatches TypeScript and Python collectors, and `build_graph` turns their file/symbol records into the graph hierarchy. TypeScript uses tree-sitter plus resolver heuristics; literal dynamic import/require calls are included, while arbitrary computed module expressions are not resolved by this pass. Python uses AST/module indexing and handles relative imports and selected initializer re-exports. These are useful source-navigation analyses, but they are not the compiler evidence slice. [Collection and aggregation][R-IMPORT] [TypeScript][R-TSIMPORT] [Python][R-PYIMPORT]

There are material completeness limits. The collector filters ignored/hidden files, declarations and large source files; TypeScript resolution follows its own relative, tsconfig and workspace/package-entry rules. An unresolved bare specifier becomes an external dependency; an unresolved relative specifier can disappear. Symbol-usage collection matches syntactic names within declarations, so shadowing and binding precision must not be assumed. Symbol edges skip same-file relationships; unused imported names can retain a file-level edge. The import contract does not expose the value-flow outcome vocabulary or a complete resolver coverage report. [Eligibility and emission][R-IMPORTFILTER] [Import contract][R-IMPORTCONTRACT]

**Design implication:** an import edge inspector should eventually expose contributing imports and resolution limits, using the same presentation idiom as Explain connection but a separate semantic type. Do not label that work a value-flow proof or make it a prerequisite for the first anchor slice.

### 3.2 Value and framework evidence

At a selected source location, the client resolves an anchor candidate and asks the server/engine for an anchor graph or ledger. The engine identifies the seed, performs directional evidence walks, builds nodes and stops, and computes an outcome. Generation data crosses the contract; the server validates and forwards the result. The client then projects it into display nodes and edges, performs layout, derives neighborhood emphasis and renders the inspector. [Selection][R-SELECT] [Server bridge][R-ROUTER] [Anchor operation][R-ANCHOROP] [Generation contract][R-PRIMITIVES]

| Stage | Present capability | Information needed downstream |
| --- | --- | --- |
| Collector/provider | TypeScript compiler-backed facts, Python bridge facts and explicit framework/library models feed a shared evidence vocabulary. | Source spans, model identity, unsupported boundaries and the distinction between source facts and model assumptions. |
| Evidence traversal | Uses field paths and call-stack state while walking; relation traits prevent structural membership from becoming ordinary value flow. | State-compatible transition witnesses if a downstream view will certify a composed path. |
| Anchor construction | Converts evidence into explanatory nodes, terminal/boundary/frontier categories, directional runs and outcome. | All raw edge members before endpoint deduplication; outcomes must survive summarization. |
| Public contract | Node and edge IDs, endpoint IDs, kinds, status, proof records, counts and generation. | No first-class invocation-state path witness currently reaches the client. |
| Client projection | Removes selected reference nodes, folds other functions, remaps endpoints and deduplicates edges. | Hidden members and serial-versus-alternative relationships must be reversible. |
| Display and inspection | Source navigation, local proof cards, grouped stops, route-specific ordered steps, camera/history and graph expansion. | Precisely say whether the selected object is a local transfer, grouped evidence, a structural link or a certified path. |

[Traversal and flattening][R-SLICE] [Traits][R-KINDS] [Anchor contract][R-ANCHORCONTRACT] [Projection][R-ADAPTER] [Route edge-step precedent][R-EDGESTEPS]

The collector has useful framework value models, including resource source-to-fetcher transfer, but that transfer does not establish when the callback executes. General branch-to-statement control dependence with true/false polarity is not present in the inspected route. Conditional expressions and branch terminals are not equivalent evidence. Object/member state matches likewise need stronger receiver evidence before the UI promises that two instances are the same object. These are engine prerequisites for later condition/identity views, not gaps a filter can repair. The inspected [collector](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L26-L95), [resource binding](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-call-support.ts#L149-L169) and [member matching](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L437-L451) identify the exact producers; fixtures appear in the evaluation plan.

### 3.3 Context exists during traversal, but a flattened result is weaker

The evidence walk tracks call-stack and field state in queued work and visit keys. Returned elements and relations are collected into ID-keyed maps. The result therefore does not expose every state transition that justified including each relation. Combining two individually admitted relations after flattening can exceed what the traversal actually established. [Evidence slice][R-SLICE]

This is not a claim that the engine ignores call identity. It is a narrower claim: the public graph is insufficient, by itself, to certify every new chain a client can form from its union of edges. The same limitation applies to a new ordered ledger unless it carries a coherent witness. A visually tidy list can be just as misleading as a graph.

An additional **unexecuted completeness hypothesis** deserves a targeted test: when two call contexts converge on the same element and field path, the element-level insertion/requeue check may suppress one context before the flow diverges again. The handoff includes a `fanout(x)` test that must reach both `id(x)` return branches. Treat this as a testable source-derived concern, not a confirmed engine bug.

### 3.4 Projection audit and executed checks

| Projection | Pinned behavior and consequence | Executed or proposed evidence |
| --- | --- | --- |
| Function folding | More than 40 non-scope nodes triggers folding of other functions; 40 is a trigger, not a hard final cap. All members share a displayed box, without proving internal connectedness. | **P1 executed:** 45 synthetic nodes; raw `A→u` and `v→B` are disconnected, yet folding `u,v` into one scope makes displayed reach include B. |
| Reference removal | A same-named value with a single same-side incoming reference can be hidden; outgoing edges are remapped. | **P3 executed:** a partial `A→R` reference followed by proven `R→B` becomes displayed proven `A→B`; the partial evidence is lost. Raw topology did contain a path; the failure is evidence strength preservation. |
| Parallel edge deduplication | The first edge for a displayed endpoint pair survives; other relation kinds/proofs can be omitted. Engine `pushEdge` also deduplicates endpoints. | **P2 executed at client:** reversing parallel proven/partial edge order changes retained status. Engine variant remains proposed. |
| Multi-anchor union | Nodes/edges are merged across queries; shared nodes are labelled a meeting point. Per-anchor folding options are not supplied in this path. | **P4 executed:** union of `A→X` and `X→B` permits merged reach A→B although neither query certifies it. This does **not** prove incompatible invocation contexts; their compatibility is unevaluated. |
| Path emphasis | `reachFrom` traverses the displayed graph and skips faint relations. Structural relations can connect traversal without being lit. | P1/P3/P4 expose why projected reach needs weaker wording or a raw-witness check. No browser highlighting test was run. |

[Adapter source][R-ADAPTER] [Multi-anchor source][R-MULTI] [Reach source][R-REACH] [ViewEdge fields][R-VIEWMODEL] [Engine projection][R-ENGINEPROJECT]

The precise correction is **not** to color every aggregate edge with its worst member and stop there. Alternatives and sequential steps have different logic. One supported alternative does not validate all alternatives; one missing step weakens a serial chain. The view needs a member set, the composition type and a source-linked explanation. Until path compatibility is evaluated, describe selected reach as displayed connections, not an end-to-end proven value path.

### 3.5 Existing UI and performance foundations

`FlowView` already captures selected node/edge, reach mode and camera and reuses layout during expansion. Source open and history keyboard actions exist. Anchor stops are already grouped by reason, while the route overview still holds its raw gap list. The source-first `ValueFlowLedger` is present; its cross-file row behavior is currently disabled rather than a complete multi-file investigation surface. [View state][R-FLOWSTATE] [Keyboard][R-FLOWKEYS] [Stop grouping][R-INSPECTORMODEL] [Ledger][R-LEDGER]

Query tokens prevent older results from overwriting new selections. That is valuable, but ignoring a stale response is not cancellation of engine work. Generation-keyed caches and a lower rendered-node count also do not eliminate first fact-index construction. Cold startup, warm query, serialization, projection and paint must be measured separately. [Requests][R-FLOWQUERY] [Fetch guard][R-FETCH]

Effects already have a dedicated TypeScript operation, activation/handling fields, witnesses and frontiers. Python effects remain unavailable on that operation. Reuse this contract for the function question and extend its owned Python task rather than constructing an effects answer from arbitrary neighboring value nodes. [Effects operation][R-EFFECTS] [Effects contract][R-EFFECTSCONTRACT]

## 4. What the external workflows contribute

The study gives analysis semantics and interaction mechanics equal attention. The lessons below are design inferences from verified mechanisms, not vendor-validated productivity claims. The survey provides exact steps, editions, figures, precision limits, setup costs and licensing boundaries for each case.

### Case A — IntelliJ: value investigation rooted in an expression

The documented workflow selects an expression, chooses a direction and scope, then expands a value tree beside source. [Value analysis][IDE01] For Srcly, the valuable unit is a stable question with reversible expansion. A source-first hierarchy can answer one producer question without demanding that the user interpret all neighboring functions. Its poor fit is reconvergence: repeated branches can obscure that several values meet at one operation. Java analysis availability does not establish TSX or Python parity. Adopt the interaction hypothesis; do not import its semantic guarantees.

### Case B — VS Code: member result plus occurrence evidence

The call-hierarchy protocol can retain multiple occurrence ranges for one target; source peek makes a small navigation result actionable. [Protocol][IDE13] [Navigation][IDE09] This suggests retaining all contributing source locations while grouping a Srcly connection. However, a call-site range is not argument-to-return evidence. The Srcly inspector must say what kind of relation each occurrence supports. An isolated tree also needs an explicit root, because changing direction around a selected child can be mistaken for changing the original question. A recorded VS Code issue supplies a concrete warning, not a measured rate of user error. [Direction issue][IDE23]

### Case C — Eclipse: caller, constructor and scope as separate expansions

JDT distinguishes callers from construction-related exploration and exposes scope/history controls. [JDT view][IDE17] The transferable idea is to offer related activation or identity evidence without silently splicing it into a producer path. For a callback, “where registered?” and “what value supplied?” may require different expansions. Constructor-aware Java navigation cannot supply Solid scheduling semantics. A reported unresolved-match case reinforces why an empty view needs an explanation when resolution is incomplete. [JDT issue][IDE24]

### Case D — CodeQL: the path is an analysis result

A path query declares a path graph and returns path-node endpoints; the UI then explains that result. [Path contract][SPC06] The Srcly inference is architectural: order belongs to a witness-producing query, not to a shortest-path operation on arbitrary aggregated display edges. Source/sink restriction can make a question useful, but it changes the question and cannot silently stand in for “all consumers.” Partial-flow debugging illustrates a useful diagnostic surface for stopping boundaries. It does not make failure to find a full path a proof of absence. [Partial-flow debugging][SPC09]

### Case E — Semgrep: actionable trace with explicit model limits

Taint rules distinguish sources, sinks, sanitizers and propagation. Their result explains a configured finding; documented limitations prevent treating that trace as a general alias or all-path analysis. [Taint model][SPC14] [Advanced limitations][SPC15] For Srcly, a compact explanation should identify the current question and disclose hidden alternatives. A modelled library transfer can be helpful, but the UI must not promote it to receiver identity or a guard proof. A source snippet at a cross-file step is a useful local explanation pattern; it supplies no independent evidence of developer speed.

### Case F — Joern: explicit queries over distinct relations

Joern exposes source-to-sink data-flow paths and separate control traversals. External-call semantics materially change what the paths contain. [Data flow][SPC25] [External semantics][SPC27] The transferable lesson is that missing models are part of the answer. A local Srcly user should see the named boundary and the exact model used, rather than having to infer it from a graph gap. Building a CPG service solely to acquire this interface would add ingestion, model and query costs disproportionate to the first inspector improvement.

### Additional design pressure — Understand and architecture tools

Understand makes a dependency count inspectable as its contributing source references. [Dependency browser][SPC33] That is the closest mechanism to the preferred first slice: keep a compact graph and make the aggregation auditable. NDepend's matrix and dependency-cruiser's module rules answer architecture questions at a different granularity; Sourcetrail supplies a historical locality pattern but an unmaintained basis for adoption. [DSM][SPC44] [Module rules][SPC48] [Historical status][SPC42] These are alternatives for specific questions, not interchangeable value-flow engines.

## 5. Thin Slicing: useful hypothesis, constrained transfer

Sections 2–6 prioritize producer dependence and allow later expansion into omitted control/base-pointer evidence; a thin slice is not an executable extracted program. The study uses Java pointer information, including context-insensitive construction that can admit unrealizable paths. Its debugging/understanding comparisons simulate breadth-first statement inspection: aggregate reductions of 3.3× and 9.4× are not measured developer speedups. Less precise pointer information can increase inspection substantially, and complex hash-algorithm cases did not benefit in the same way. [Original paper][SPC01]

**Srcly inference:** relevance can be a layered question, but the layers need different evidence. A producer-only initial view must still disclose that conditions or identity remain unexamined. It must never describe a guarded write as unconditional. The transfer worth testing is explicit, reversible choice of dependency class. The unjustified transfer would be adopting Java pointer assumptions, claiming a speed multiplier, or hiding evidence the Srcly engine does not possess.

## 6. Compare three coherent alternatives

| Alternative | Where it should help | Where it may lose |
| --- | --- | --- |
| A0. Current folded graph + inspector | Familiar route/component structure; fan-in/out and shared consumers. Preserve the frozen baseline for comparison. | Dense graphs and quotient connectivity can obscure which source relation actually supports the selected line. |
| B. Producer-first explanation + explicit conditions/identity | A bounded from/to question with selectable additional evidence; less irrelevant traversal on first screen. | Missing condition/identity facts make promised expansions empty; controls can increase interaction cost and conceal important caveats. |
| C. Source-first tree or ordered ledger + optional graph | Reading source steps, keyboard use, narrow screens, a selected witness. | Shared subpaths repeat; incorrect ordering creates false certainty; architecture and reconvergence may require many expansions. |

**A1** adds the proposed Explain connection inspector to A0 and is tested separately as the preferred incremental change. The required representation comparison remains A0/B/C. These are not three visual skins over identical truth. The comparison must hold evidence fixed where possible and report where a new engine capability is required. The first experiment uses explicit “not analyzed” placeholders for absent facts; a later experiment may use hand-authored correct evidence to isolate interface quality, clearly labelled as a prototype. It must not present that prototype as live engine output.

The historical TSX audit improved from 47 to 77/112 while Focus remained 7/16; one route still reported 555 values in 74 functions. These motivate testing, but neither those author scores nor the synthetic checks decide a new default. The Python audit demonstrates both the usefulness of folding and unresolved callback-return behavior. [TSX historical audit][R-TSX] [Python historical audit][R-PY]

## 7. Preferred first slice, alternatives and rejection

**DA-001 / DAG-001 — Explain connection:** preserve raw relation members before engine and client aggregation; list exact source endpoints, every contributing proof/location, model/assumption strength and hidden reference steps in the existing inspector. Scope the answer to those local transfers. Use explicit `pathCompatibility: not-evaluated` and conditions not analyzed when no stronger result exists. Preserve selected member, root, direction, generation and camera when opening source and returning. The handoff supplies the contract and acceptance tests.

**DA-002 / DAG-002 — Later witness preservation:** retain traversal-state transitions, call/return identity and field context if the product will certify a composed path. A two-call negative and a convergence/redivergence completeness case are required. This is a prerequisite to claims, not necessarily to showing a useful source-linked connection list.

**DA-003 / DAG-003 — Later conditions/identity:** define guard polarity, exceptional/early-return behavior and receiver evidence independently. Every new fact needs a producer, wire contract, consumer, negative fixture and measured cost. Framework vocabulary changes alone do not satisfy ordinary control dependence.

**DA-006 / DAG-006 — Compare alternatives:** reuse the four TSX questions, Python closure/effect cases and bounded fixtures. Measure correctness and false conclusions before time or box count. Retain A if B/C add interaction without a meaningful improvement in correct explanations.

**DA-012 — Reject a wholesale thin-slicing default or infrastructure rewrite now.** It would spend implementation effort before validating the missing facts and user advantage. The current graph might remain best for component structure and reconvergence; the inspector might add clutter; preserving all evidence may enlarge payloads. The preferred slice should be cut back if grouping/source access is not useful on actual audit tasks, or if its explanation requires an unbounded materialization. None of these risks is resolved by a more attractive screenshot.

## 8. Ownership and next decision

The route-flood, repeated-gap, action-wrapper, branch-vocabulary and cold-query tasks are **already-owned**. Proof-strength delivery and one-control/source navigation are **reuse/extend**. Python effects and callbacks stay with their respective backlog work. Hub summaries must coordinate with witness/query identity before caching can be called semantically safe. Exact task names and overlap are recorded per gap.

The integration decision belongs to Codex after reconciling newer main. The immediate evidence needed is narrow: preserve a real connection's contributors, pass the negative projection cases, open and return to each source occurrence, and check whether users can explain the selected connection more accurately. No external study, UI prototype or assistant-generated report is independent product demand or substantive product progress.

## References used in this document

[IDE01]: https://www.jetbrains.com/help/idea/analyzing-data-flow.html
[IDE09]: https://code.visualstudio.com/docs/editing/editingevolved
[IDE13]: https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md
[IDE17]: https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/reference/views/ref-call-hierarchy.htm
[IDE21]: https://learn.microsoft.com/en-us/visualstudio/debugger/using-breakpoints?view=vs-2022
[IDE23]: https://github.com/microsoft/vscode/issues/190116
[IDE24]: https://github.com/eclipse-jdt/eclipse.jdt.core/issues/724
[R-ADAPTER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L21-L207
[R-ANCHORCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L125
[R-ANCHOROP]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L47-L205
[R-DECISIONS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/intent/dataflow-robustness/decision-log.md#L1-L32
[R-EDGESTEPS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L334-L393
[R-EFFECTS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/function-effects.ts#L1-L55
[R-EFFECTSCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/function-effects.ts#L1-L112
[R-ENGINEPROJECT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L634-L683
[R-FETCH]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/fetchSignal.ts#L1-L40
[R-FLOWKEYS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L445-L492
[R-FLOWQUERY]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L50-L177
[R-FLOWSTATE]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L286-L408
[R-IMPORT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/graph.py#L27-L171
[R-IMPORTCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/contract.ts#L1-L46
[R-IMPORTFILTER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/common.py#L53-L191
[R-INSPECTOR]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L116-L240
[R-INSPECTORMODEL]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/inspectorModel.ts#L95-L167
[R-KINDS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L8-L211
[R-LEDGER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/components/CodeModal/ValueFlowLedger.tsx#L1-L121
[R-MULTI]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/multiAnchorAdapter.ts#L1-L64
[R-PRIMITIVES]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/primitives.ts#L1-L19
[R-PY]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/python-dataflow-audit-2026-10/README.md#L255-L327
[R-PYIMPORT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/python_deps.py#L51-L402
[R-REACH]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/reach.ts#L1-L85
[R-ROUTER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/routers/dataflow.py#L285-L389
[R-SELECT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/investigation/valueFlowInspector.ts#L1-L108
[R-SLICE]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L92-L562
[R-TSIMPORT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/server/app/services/deps/typescript_deps.py#L74-L466
[R-TSX]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/tsx-dataflow-audit-2026-10/README.md#L17-L136
[R-UPSTREAM]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/UPSTREAM.md#L1-L35
[R-VIEWMODEL]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/viewModel.ts#L59-L78
[SPC01]: https://manu.sridharan.net/files/pldi07.pdf
[SPC05]: https://codeql.github.com/docs/writing-codeql-queries/about-data-flow-analysis/
[SPC06]: https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/
[SPC09]: https://codeql.github.com/docs/writing-codeql-queries/debugging-data-flow-queries-using-partial-flow/
[SPC14]: https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview
[SPC15]: https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/advanced
[SPC25]: https://docs.joern.io/cpgql/data-flow-steps/
[SPC26]: https://docs.joern.io/cpgql/control-flow-steps/
[SPC27]: https://docs.joern.io/dataflow-semantics/
[SPC33]: https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html
[SPC42]: https://github.com/CoatiSoftware/Sourcetrail
[SPC44]: https://www.ndepend.com/docs/dependency-structure-matrix-dsm/
[SPC48]: https://github.com/sverweij/dependency-cruiser
