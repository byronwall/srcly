# UI patterns for trustworthy dependency investigation

**Design recommendation:** keep the current graph, make each selected connection explainable, then compare a producer-first view and a source-first tree/ledger using equal evidence. This document provides complete textual mock states plus optional vector storyboards in the ZIP. Every mock is a **proposal**, not a screenshot of a working Srcly feature.

**Baseline:** `ee8a771ce94fb59573492445d0f5fa2411ad83c8` · October 28, 2026 (America/Indianapolis) · topic `srcly.dependency-analysis-tool-ui-deep-dive.v1`. Current implementation, external mechanism, inference and proposed design are labelled separately. No interactive prototype, user study or runtime benchmark was executed.

## 1. The interaction contract

A dependency investigation has a stable question: **selected expression + dependency class + direction + scope + generation**. A selected neighbor is not automatically a new root. Expansion reveals evidence under that question; rerooting starts a new question and records a history entry.

There are four distinct inspectable objects:

- **Relation:** a source-backed or modelled local fact, with raw endpoints and proof records.
- **Bundle:** a set of relations grouped into a displayed connection; may contain alternatives or disconnected members.
- **Witness:** an explicitly compatible sequence/state graph from the analyzer. A bundle is not a witness merely because its members can be drawn in a row.
- **Frontier:** where analysis stopped, with a named reason and coverage scope.

The current `ViewEdge` holds one reduced proof/status/relation set. Explain connection needs member and projection lineage before it can expose what was grouped. [Current fields][R-VIEWMODEL] [Current projection][R-ADAPTER]

### Honesty dimensions that stay separate

| Dimension | Proposed wording | Wording to avoid |
| --- | --- | --- |
| Dependency class | “Value transfer,” “import,” “call site,” “same declared property,” “condition.” | An unlabeled arrow whose meaning changes across views. |
| Provenance | “Source fact,” “framework model,” “assumption,” “unknown proof kind.” | A confidence percentage without a calibrated model. |
| Composition | “Contributing relations; path compatibility not evaluated.” | “Proven path” for displayed reach through folded/merged boxes. |
| Conditions | “Not analyzed,” “partial: exceptions unavailable,” or explicit predicates/polarity. | Empty condition group interpreted as unconditional. |
| Coverage | “Partial: external call,” “budget reached,” “cancelled,” “stale generation.” | “No dependencies” after an unavailable or cancelled analysis. |
| Runtime | “Static possibility.” | “This happened” without a run/event record. |

The public anchor outcome vocabulary is worth preserving. The proposed wording clarifies its scope; it does not replace all statuses with a single warning. [Anchor contract][R-ANCHORCONTRACT] [Proof traits][R-KINDS]

## 2. External patterns and their limits

| Pattern and evidence | Transfer to Srcly | Counterexample / poor fit |
| --- | --- | --- |
| Occurrence inspection: Understand; LSP/Pyright retain occurrence locations. [Browser][SPC33] [Protocol][IDE13] [Provider][IDE27] | Aggregate first, then expose contributors in the selected edge's existing inspector. | A list of occurrences is not one context-compatible value chain. |
| Rooted expansion: IntelliJ value exploration and JDT call hierarchy. [IDEA][IDE01] [JDT][IDE17] | Keep root/scope/direction visible; expand locally and allow source return. | An unfolded tree duplicates reconvergent flow and may bury a shared consumer. |
| Selected witness: CodeQL path presentation. [Path contract][SPC06] [Figure][SPC13] | Make one certified witness inspectable; keep alternatives separate. | Numbered rows can imply execution order or exhaustive paths unless the contract says otherwise. |
| Local source context: VS Code peek. [Navigation][IDE09] | Open the exact occurrence while preserving the question; reuse Srcly source/history facilities. | A large new editor workspace duplicates existing navigation and can crowd a personal tool. |
| Explicit analysis policy: Joern data/control queries and Semgrep models. [Control][SPC26] [Semantics][SPC27] [Limits][SPC15] | Name missing models and allow dependency-class expansion only with supporting facts. | An empty condition panel cannot repair a collector that never emitted control dependence. |
| Structural aggregation: NDepend matrix and dependency-cruiser module rules. [Matrix][SPC44] [Module options][SPC49] | Use for cycles/module impact if those tasks justify it. | A matrix cell cannot answer why a specific branch allowed a save. |

These sources establish available mechanisms; the transfer column is this assignment's design inference. No vendor figure is usability evidence for Srcly.

## 3. Three coherent alternatives and a frozen baseline

**A0** is the unchanged current folded graph and inspector, retained as the evaluation baseline. **A1** is the preferred incremental proposal: the same graph plus Explain connection. **B** and **C** are alternative representations. The mandated comparison remains A0/B/C, with A1 tested separately. A prototype with hand-authored condition facts is not the frozen current application.

The common question used in the mocks is: “Where does `draft` go, and what permits `persist(draft)`?” The proposed fixture has an early exit if `!canSave`, then a save only when `dirty`. The semantic condition is `canSave && dirty`; the current engine does not provide that complete guard-to-write fact. This deliberate mismatch tests whether the UI can be useful without overstating it.

### Alternative A1 — current graph plus Explain connection

**Intent:** answer why a visible line exists while preserving route/component orientation. Reuse the current inspector, layout/state machinery and source viewer. No full investigation workspace or new graph library is needed. The current route edge-step view is a presentation precedent, not a universal witness provider. [State][R-FLOWSTATE] [Route steps][R-EDGESTEPS] [Prior decisions][R-DECISIONS]

| State | Proposed screen contents | Annotation and acceptance |
| --- | --- | --- |
| **A1.1 Initial** | Header: `Value · draft · To · project scope · generation 42`. Canvas retains draft, persist frame and visible stops. Selected connection card: `draft → persist`, `3 contributing relations`, kind counts, `path compatibility not evaluated`, `conditions not analyzed`. | **① Question stays fixed. ② Count has a unit. ③ Unknown conditions are visible before expansion.** The number 3 is illustrative, not a measured Srcly result. |
| **A1.2 Expand evidence** | Card lists raw endpoints and exact file/spans for argument, hidden reference and consumer relation. A partial member remains partial. Group headings distinguish parallel contributors from any known hidden sequence; no implied certification. “Open containing frame” remains separate. | **④ Expansion reveals the evidence under the line, not every member of a large function. ⑤ An internal gap between folded entry and exit stays a gap.** No arbitrary concatenation through a summary node. |
| **A1.3 Inspect source** | User opens the second relation. Source focuses its full span and keeps root/direction in a return breadcrumb. The branch source can be opened separately; the card still says condition analysis unavailable. | **⑥ Source location belongs to the selected member, not whichever proof was first in an array.** A human can read the guard without the tool pretending it analyzed it. |
| **A1.4 Return** | Return restores the same connection, member, scroll, expansion and camera. An edited source generation shows stale state and an explicit refresh action. | **⑦ Return preserves orientation; refresh does not silently attach old evidence to new boxes.** Keyboard focus returns to the selected member. |

**When A1 wins:** users already understand the graph but need to verify why two boxes are connected, distinguish two uses, or inspect a hidden/weak step. **When it loses:** most connections are already obvious; the card adds reading burden; relation sets are too large without useful grouping; users infer a complete path despite the limited wording. In those cases retain A0 and use narrower source-link/status fixes.

Optional ZIP storyboard: `assets/mockups/alternative-a1.svg`. All content needed to assess it is reproduced in the table above.

### Alternative B — producer-first, with explicit conditions and identity

**Intent:** make the selected value question the first reading unit. Do not show every structural or alias-related relation initially, but disclose the existence or absence of those analyses before the user concludes that a write is unconditional.

| State | Proposed screen contents | Annotation and acceptance |
| --- | --- | --- |
| **B.1 Initial** | Header retains the exact draft selection and forward direction. Main lane shows nearest meaningful consumers and terminal purpose. Beside it: `Conditions: not analyzed` and `Object identity: not evaluated`. Unsupported library boundaries remain visible in the lane. | **① Prioritization is not deletion. ② Missing evidence is not displayed as zero.** A smaller screen may still produce an incomplete answer. |
| **B.2 Expand condition/identity** | In the engine-realistic prototype, Conditions opens an explanation of unavailable facts plus the guard source. In the oracle prototype, it shows separate `canSave = true` and `dirty = true` prerequisites with source spans. Identity opens a selected receiver's evidence or unknown status. | **③ Separate tracks must be labelled. ④ Predicate inputs are not value producers. ⑤ A shared property declaration is not a shared object.** Changing selection to a guard is an explicit reroot action. |
| **B.3 Inspect source** | Preview/click opens the exact guard or callback registration. The producer lane remains the return target; the selected dependency class is visible. | **⑥ Source inspection can challenge the model.** Resource scheduling and prior values are not inferred from a simple source→fetcher transfer. |
| **B.4 Return** | Restores root, selected witness/consumer and condition disclosure. Direction change asks a new from/to question under the same root; selecting a row alone does not reroot. | **⑦ Orientation is part of the answer.** Returning from a predicate must not turn the predicate into the selected value silently. |

**When B wins:** a from/to question has many incidental relationships but a small set of relevant producers/consumers, and explicit expansions prevent false certainty. **When it loses:** missing facts make most controls unhelpful, conditions are overlooked, or repeated expansion costs exceed the saved inspection. A thin default must be rejected if it conceals a material condition or unsupported boundary. The visual pattern does not justify transplanting Java pointer assumptions.

Optional ZIP storyboard: `assets/mockups/alternative-b.svg`.

### Alternative C — source-first tree or evidence ledger, optional graph

**Intent:** let the developer read one local explanation in source order or witness order without interpreting a full canvas. Reuse the existing ledger where possible, but do not assume its current row order is an execution timeline or a context-certified chain. [Current ledger][R-LEDGER]

| State | Proposed screen contents | Annotation and acceptance |
| --- | --- | --- |
| **C.1 Initial** | Header: root, direction, scope and generation. Rows: selected draft, argument transfer, persist occurrence. Columns: relation, source span, provenance, coverage. Condition group shows not analyzed. Optional graph is closed. | **① Rows are individually sourced. ② Order is labelled “explanation order” unless a witness contract supplies a stronger meaning.** No false sequence from sort order. |
| **C.2 Expand occurrence** | Expand the call row into its contributing source relations; two calls appear as separate occurrence branches. Shared subpaths get a cross-reference badge, not an automatically connected shortcut. Select one certified witness only if available. | **③ Tree identity includes the occurrence/path context, not only the target element. ④ Repeated nodes are navigational reuse, not proof of identity.** |
| **C.3 Inspect source** | The active row opens source, retaining row/ancestor IDs. A small optional graph can show convergence for the selected evidence scope, with the same semantics as the rows. | **⑤ Graph and list are two projections of the same evidence.** Opening the graph must not create additional path claims. Cross-file rows must actually navigate. |
| **C.4 Return** | Return restores the selected row, expanded ancestors, scroll and question. The optional graph returns to its selected witness view. A stale generation blocks recomposition. | **⑥ Keyboard focus and scroll are stable.** Expansion and source navigation are undoable through the existing history model. |

**When C wins:** reading and verifying individual source steps, narrow screens, keyboard-heavy work and one-path questions. **When it loses:** extensive reconvergence, component architecture or many alternative calls cause duplicated rows and repeated expansion. If it improves visual density but not correct explanations, retain the graph as default.

Optional ZIP storyboard: `assets/mockups/alternative-c.svg`.

## 4. Projection rules that all alternatives obey

### Preserve local evidence without inventing a chain

For every rendered connection keep the raw member IDs and endpoints, query/run membership, source spans and proof variants. Track which projection steps folded scopes or removed reference nodes. Reorder members deterministically for display, while retaining identity independently of order. If pagination hides members, show total/shown units and the exact reason; never silently present a truncated bundle as complete.

A folded scope is a set, not a value. Suppose one raw relation enters member u and another leaves member v. The displayed A→Scope→B route is traversable as a picture even when u cannot reach v. The executed P1 check demonstrates this property. The UI can say A and B each connect to that scope, but cannot certify A→B without an internal compatible witness. [Adapter][R-ADAPTER] [Projected reach][R-REACH]

A same-name hidden reference is still evidence. If A→R is partial and R→B is source-backed, removing R must retain the partial step. Similarly, parallel A→B relations can have different kinds and provenance. A representative proof chosen by input order is not a safe summary.

### Aggregation has logic, not only styling

- **Independent contributors:** display a set and its distribution; do not call it a chain.
- **Alternative witnesses:** each alternative gets its own identity/status. One valid alternative does not validate all others.
- **Serial witness:** every required hop must be compatible and supported; a weak/missing hop cannot be hidden by a strong adjacent hop.
- **Structural ownership:** visually separate from transfer. Traversing through a scope box must not silently upgrade ownership into value reach.
- **Unknown relationship:** retain the boundary and source/model context. Do not manufacture a link to make the picture connected.

These are proposed invariants. Full serial witness certification requires later engine state preservation; first-slice bundles can be useful while explicitly declining that promise.

### Selection and history

A selection changes emphasis and details without a full layout jump. Expansion adds context locally and retains the anchor position when practical. A direction control acts on the named root; “Trace from this occurrence” is a separate action. Preserve camera and selected evidence during source inspection. Multi-anchor comparisons keep membership visible and do not turn shared nodes into claims of common invocation. [Current state reuse][R-FLOWSTATE] [Current multi-anchor projection][R-MULTI]

## 5. Readability, density and accessibility

Use Srcly's existing light visual system: restrained surfaces, source names, readable monospaced snippets and text status labels. Keep semantic meaning in words/icons as well as color. A dashed line can indicate a model/boundary only if the legend and inspector state its exact meaning; the same stroke must not mean both “unimportant neighbor” and “unproven transfer.” [Current design system][R-DESIGN] [ViewEdge styling][R-VIEWMODEL]

For dense desktop, the inspector stays bounded and source excerpts wrap intentionally. Show filename plus exact line/column; use the full path on request to disambiguate duplicate basenames. Do not show only the first proof location. Long anonymous callback names should name role and source, not merely the containing file. Lists of stops group by reason and allow restoration of all occurrences; route-gap deduplication remains existing backlog work.

At narrower widths, the same content can use a stacked detail drawer with a persistent question bar; this is a proposal to test, not an established mobile workflow. The connection's selected member and Return action stay available. Keyboard order should follow question → result → details → source → return, with visible focus. Announce loading, stale and cancelled states as states rather than replacing content with an unlabeled blank.

## 6. Scale without semantic loss

| Scale problem | Preferred mechanism | Evidence/interaction constraint |
| --- | --- | --- |
| Large fan-out | Group by terminal purpose/scope; disclose counts and show contributors lazily. | Display savings are separate from analysis work. |
| Recursion/cycles | Show cycle membership and a bounded back-reference to an already visited state. | Element recurrence alone does not identify the same invocation state. |
| Many aliases | Present receiver/field abstraction and widening; offer identity evidence when available. | Do not pretend a shorter producer lane resolved heap identity. |
| Multiple call sites | Separate call occurrence branches/witnesses and keep source spans. | Same function target does not merge return destinations. |
| Many repeated gaps | Group reason + count and offer all source occurrences. | Preserve distinct reasons and never drop a material unsupported boundary. |
| Cold or cancelled work | Keep query identity and explicit progress/outcome. | Cached paint, warm engine query and cold indexing have separate latency measures. |

The `fetchSignal` stale-response check prevents obsolete UI writes but does not itself terminate computation. A new detail request must send expected generation and honor actual cancellation where supported. LSP provider APIs show a cancellation-token mechanism; the proposed benefit for Srcly remains to be measured. [Current fetch guard][R-FETCH] [Provider API][IDE14]

## 7. What would falsify these designs

The first semantic gate is uncompromising: no certified cross-call or cross-object path, no concealed unknown library, no false unconditional write and no source evidence from the wrong generation. Beyond correctness, A1 should be rejected if users treat its contributor list as a verified path despite clear labeling. B should be rejected if condition/identity controls hide information needed for the first answer. C should be rejected if duplicated rows and source jumps cost more without improving accuracy.

The comparison should retain A0 when these proposals do not improve correct explanations. A useful outcome can be a small source-link/proof fix with no new default representation. Mockups communicate a hypothesis and a buildable boundary; they are not results of the proposed evaluation.

## References used in this document

[IDE01]: https://www.jetbrains.com/help/idea/analyzing-data-flow.html
[IDE09]: https://code.visualstudio.com/docs/editing/editingevolved
[IDE13]: https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md
[IDE14]: https://code.visualstudio.com/api/references/vscode-api#CallHierarchyProvider
[IDE17]: https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/reference/views/ref-call-hierarchy.htm
[IDE27]: https://github.com/microsoft/pyright/blob/1.1.414/packages/pyright-internal/src/languageService/callHierarchyProvider.ts
[R-ADAPTER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L21-L207
[R-ANCHORCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L125
[R-DECISIONS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/intent/dataflow-robustness/decision-log.md#L1-L32
[R-DESIGN]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/DESIGN.md#L1-L165
[R-EDGESTEPS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowInspector.tsx#L334-L393
[R-FETCH]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/fetchSignal.ts#L1-L40
[R-FLOWSTATE]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/FlowView.tsx#L286-L408
[R-KINDS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L8-L211
[R-LEDGER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/components/CodeModal/ValueFlowLedger.tsx#L1-L121
[R-MULTI]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/multiAnchorAdapter.ts#L1-L64
[R-REACH]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/reach.ts#L1-L85
[R-VIEWMODEL]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/viewModel.ts#L59-L78
[SPC06]: https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/
[SPC13]: https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/assess-alerts
[SPC15]: https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/advanced
[SPC26]: https://docs.joern.io/cpgql/control-flow-steps/
[SPC27]: https://docs.joern.io/dataflow-semantics/
[SPC33]: https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html
[SPC44]: https://www.ndepend.com/docs/dependency-structure-matrix-dsm/
[SPC49]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md
