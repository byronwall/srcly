# Srcly recommendations and initiative-shaping input
Research date: **2026-10-15**. Inspected baseline: **`83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4`**.
Status: **research proposals; not final Software Design Sleuth artifacts and not implementation authorization**.

## Decision order

Repair meaning and unavailable-data handling first (**I01**), then make UI/report comparisons honest (**I02**), then run the three-repository portfolio pilot (**I03**). The recommended first new prioritization input is bounded local Git activity (**I05**); graph evidence repair (**I04**) is a prerequisite for architecture metrics and must reuse the existing dependency-view initiative. Clone evidence (**I06**), coverage/CRAP (**I07**) and static findings (**I08**) are separately gated, not a commitment to implement everything.

**First cut line:** I01 + I02 + the I03 pilot. Then fund one additional evidence workflow, not an enterprise platform. A source-only release can remain useful with corrected executable CCN, size context and explicit availability.

“Adopt” means accept the proposal's bounded direction and first proof, not that the metric is empirically validated. “Investigate” is explicitly reversible. “Demote” in the current inventory preserves compatible raw fields in diagnostics while withdrawing unjustified quality interpretation. Permanent public-field deletion requires a separate compatibility and evidence gate.

## Stable recommendations


### R01 — Preserve executable identity, display origin and ownership
**Disposition:** adopt. **Initiative group:** I01.

**Observed baseline:** The API converts every analyzer scope to type=function and drops origin_type. That makes denominators, ranking and later coverage joins ambiguous.

**Proposal:** Retain origin kind, real-executable flag, synthetic role, stable scope identity and own-versus-inclusive evidence. Keep display hierarchy separate from the executable metric population.

**First proof:** Mixed TS class/object/JSX/nested functions, Python classes/lambdas, CSS, Markdown and notebook fixtures classify every node without using display labels as the rule.

**Rejection / cut:** Reject a label-only fix that leaves wrong populations or ambiguous identities; do not introduce coverage/CRAP before this proof.

Code evidence: [`server/app/services/analysis_types.py:4–36`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis_types.py#L4-L36); [`server/app/services/analysis.py:207–251`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L207-L251).


### R02 — Represent unavailable evidence instead of manufactured zero
**Disposition:** adopt. **Initiative group:** I01.

**Observed baseline:** All numeric fields default zero; file outcome does not express per-metric support, parser completeness, graph omissions or coverage provenance.

**Proposal:** Add support/availability metadata beside compatible values, then render N/A and exclude unsupported inputs from comparisons. Report measured/eligible/unknown counts and source/configuration/version hashes.

**First proof:** A valid zero, wrong-language metric, skipped-large file, parser failure, stale artifact and unmapped source are distinguishable in API, UI and headless exports.

**Rejection / cut:** Reject any state model that still ranks missing as healthy or low-comment worst; keep old raw fields only with explicit compatibility semantics.

Code evidence: [`server/app/models.py:4–54`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/models.py#L4-L54); [`server/app/services/analysis.py:895–927`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L895-L927); [`server/app/services/analysis.py:1038–1071`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1038-L1071); [`server/app/services/reporting.py:536–546`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L536-L546).

Primary research: [S04](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition), [S14](https://www.ndepend.com/docs/code-metrics), [S19](https://docs.scitools.com/help/reference/graph-catalog.html), [S29](https://typescript-eslint.io/rules/no-unsafe-assignment/), [S30](https://docs.semgrep.dev/licensing), [S31](https://docs.semgrep.dev/semgrep-code/triage-remediation), [S32](https://www.jetbrains.com/help/qodana/ui-overview.html), [S33](https://coverage.readthedocs.io/en/latest/branch.html), [S34](https://github.com/istanbuljs/nyc), [S37](https://github.com/sverweij/dependency-cruiser), [S39](https://dl.acm.org/doi/10.1145/2568225.2568271). Retrieved 2026-10-15.


### R03 — Separate measurement units from treemap area
**Disposition:** adopt. **Initiative group:** I01.

**Observed baseline:** Custom file nonblank counts and scope physical spans are mixed; backend union attribution and client body supplementation do not guarantee conserved area.

**Proposal:** Define code/nonblank/physical/display measures. Give each source line or byte range one display-area owner; preserve independent source spans for evidence.

**First proof:** Equal-span child, blank/comment lines, disjoint imports, two Markdown URLs on one line and nested JSX each conserve declared area and source selection.

**Rejection / cut:** Reject a visual patch that fixes one fixture by double-counting another; no blanket summing of inclusive scope LOC.

Code evidence: [`server/app/services/analysis.py:166–205`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L166-L205); [`client/src/viz/treemap/utils/tree.ts:6–64`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/viz/treemap/utils/tree.ts#L6-L64); [`server/app/services/markdown/markdown_analysis.py:313–394`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/markdown/markdown_analysis.py#L313-L394).


### R04 — Correct structural semantics before adding another complexity metric
**Disposition:** adopt. **Initiative group:** I01.

**Observed baseline:** File/folder max CCN is already intentional and tested, but custom scope classification, means, counts, arity totals and nested-depth ownership remain inconsistent.

**Proposal:** Keep max with a witness; define executable-function population and analyzer-specific decision rules. Fix counts/means and own nesting/arity. Keep method thresholds separate from file summaries.

**First proof:** Gold cases cover nested methods, class/type/object containers, switches/elif/comprehensions, arrow parameter forms and matching mean/max denominators.

**Rejection / cut:** Reject claims of language equivalence without fixtures. Do not revert the corrected file max to README's stale average wording.

Code evidence: [`server/app/services/analysis.py:254–270`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L254-L270); [`server/app/services/typescript/typescript_analysis.py:56–74`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L56-L74); [`server/app/services/python/python_analysis.py:14–83`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L14-L83); [`server/app/services/typescript/typescript_analysis.py:195–220`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L195-L220).

Primary research: [S04](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition), [S05](https://www.sonarsource.com/blog/cognitive-complexity-because-testability-understandability/), [S06](https://arxiv.org/abs/2007.12520), [S07](https://www.rascal-mpl.org/blog/2016/01/01/empirical-analysis-of-the-relationship-between-CC-and-SLOC/), [S22](https://radon.readthedocs.io/en/master/intro.html), [S24](https://github.com/boyter/scc), [S28](https://eslint.org/docs/latest/rules/complexity). Retrieved 2026-10-15.


### R05 — Remove moral judgments from comments and task counters
**Disposition:** adopt. **Initiative group:** I02.

**Observed baseline:** Low Comments is inverted into UI badness, while TODOs/classes/types/import syntax receive weights without establishing a code defect.

**Proposal:** Make documentation/task/structural counts neutral. Keep counts as useful search/context; remove target comment-density claims and unsupported docs TODO scoring.

**First proof:** An intentionally terse pure function, documented difficult function and a deliberate TODO each appear as evidence, not automatically good/bad.

**Rejection / cut:** Reject any replacement rule that simply substitutes another arbitrary comment percentage or penalizes deliberate negative type tests.

Code evidence: [`client/src/utils/metricsStore.tsx:49–72`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/metricsStore.tsx#L49-L72); [`server/app/services/reporting.py:60–115`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L60-L115).


### R06 — Unify ranking, eligibility and explainable presentation
**Disposition:** adopt. **Initiative group:** I02.

**Observed baseline:** Browser sums normalized metrics; report averages only positive-valued weights, and custom CLI ignores direction/registry validation. Cohorts mix files/scopes/languages and change with navigation.

**Proposal:** Default to explicit question/lens ranking within a declared cohort. For optional combinations expose all weights, transforms, denominators and contributions; fix zero eligibility, support direction, validation and tie rules. Separate importance from quality.

**First proof:** One complete synthetic cohort yields identical browser/report order. Increasing a supported badness input cannot lower its score with fixed peers. Missing, zero, outliers and path multipliers have explained behavior.

**Rejection / cut:** Reject another opaque aggregate or an algorithm whose comparisons silently change when an unsupported field becomes available. Freeze/reference cohort visibly.

Code evidence: [`client/src/components/Explorer.tsx:393–456`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/Explorer.tsx#L393-L456); [`server/app/services/reporting.py:251–313`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L251-L313); [`server/app/run.py:319–350`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/run.py#L319-L350).


### R07 — Repair or explicitly restrict TS/TSX support and names
**Disposition:** adopt. **Initiative group:** I01.

**Observed baseline:** Ten TS counters remain zero at folders; most scope counters never exist. Raw lexical names and JSX attributes are presented as stronger semantics than computed.

**Proposal:** Publish a support matrix; implement only useful missing propagation. Rename JSX attributes, literal repetition, static imports and explicit any precisely. Split directives; gate useEffect to verified React context. Investigate or retire render branching.

**First proof:** Every TS metric has a file/scope/folder expected value or explicit N/A; React and Solid cases produce no cross-framework advice; before/after JSX traversal order does not change claimed render evidence.

**Rejection / cut:** Reject filling zeros with guessed counts. A file-only diagnostic is a valid cut line; a false promise of full propagation is not.

Code evidence: [`server/app/services/analysis_types.py:4–28`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis_types.py#L4-L28); [`server/app/services/analysis.py:128–141`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L128-L141); [`server/app/services/analysis.py:815–893`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L815-L893); [`server/app/services/typescript/typescript_analysis.py:126–273`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L126-L273).

Primary research: [S28](https://eslint.org/docs/latest/rules/complexity), [S29](https://typescript-eslint.io/rules/no-unsafe-assignment/). Retrieved 2026-10-15.


### R08 — Use a compact default and a neutral diagnostic catalog
**Disposition:** adopt. **Initiative group:** I02.

**Observed baseline:** Twenty-two selectable fields mix intrinsic structure, metadata, framework syntax and content. Their distinctness is not established by existence in the picker.

**Proposal:** Start with corrected CCN and size context. Offer a compact set of question-based lanes, enabling history/architecture/clones only after proof. Keep all compatible raw fields searchable in diagnostics, with quality-neutral labels.

**First proof:** Users can find every old field and complete a focused structural review without selecting a composite score. Default results do not duplicate file/child evidence.

**Rejection / cut:** Reject permanent public-field deletion before compatibility review and evaluation. Demotion of a misleading risk interpretation need not await a correlation study.

Code evidence: [`client/src/utils/metricsStore.tsx:49–72`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/metricsStore.tsx#L49-L72); [`client/src/components/CodeModal/MetricsSection.tsx:6–24`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/CodeModal/MetricsSection.tsx#L6-L24); [`server/app/services/reporting.py:31–115`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L31-L115).


### R09 — Measure incremental decision value before permanent portfolio changes
**Disposition:** investigate. **Initiative group:** I03.

**Observed baseline:** No repository correlations or predictive outcomes were measured in this assignment; conceptual overlap alone is insufficient for deletion.

**Proposal:** Run the staged stratified protocol in the report: three-repo pilot then twelve, size-conditioned relationships, ablations and blinded action review, including compact versus all-organized portfolios.

**First proof:** Produce a reproducible pilot manifest, pairwise/size-adjusted summaries and at least one adjudicated useful and one rejected counterexample per candidate.

**Rejection / cut:** Reject either a candidate or the proposed compact default when useful decisions/coverage of failure modes are lost; never remove solely because Spearman is high.

Code evidence: [`server/tests/test_reporting.py:1–288`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/tests/test_reporting.py#L1-L288); [`server/tests/test_complexity_semantics.py:1–77`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/tests/test_complexity_semantics.py#L1-L77).

Primary research: [S04](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition), [S05](https://www.sonarsource.com/blog/cognitive-complexity-because-testability-understandability/), [S06](https://arxiv.org/abs/2007.12520), [S07](https://www.rascal-mpl.org/blog/2016/01/01/empirical-analysis-of-the-relationship-between-CC-and-SLOC/), [S08](https://docs.enterprise.codescene.io/latest/guides/technical/hotspots.html), [S09](https://docs.enterprise.codescene.io/latest/guides/technical/change-coupling.html), [S10](https://docs.enterprise.codescene.io/latest/guides/technical/xray.html), [S22](https://radon.readthedocs.io/en/master/intro.html), [S24](https://github.com/boyter/scc), [S25](https://pmd.github.io/pmd/pmd_userdocs_cpd.html), [S26](https://github.com/kucherenko/jscpd), [S27](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md), [S28](https://eslint.org/docs/latest/rules/complexity), [S38](https://git-scm.com/docs/git-log). Retrieved 2026-10-15.


### R10 — Add bounded local activity before complex history analytics
**Disposition:** adopt. **Initiative group:** I05.

**Observed baseline:** Filesystem last_modified is not Git activity; existing source metrics cannot distinguish frequently changed versus dormant code.

**Proposal:** Prototype commit frequency with separately inspectable churn, window, merge and rename policy. Add co-change peers only after the activity view earns its cost; exclude people scoring.

**First proof:** C01's manually verified histories and blind prioritization review succeed without source changes, installs or a hosted service.

**Rejection / cut:** Do not expand into method archaeology, tickets or author analytics before file-level value; stop if history quality or local cost invalidates the result.

Code evidence: [`server/app/services/analysis.py:483–622`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L483-L622); [`server/app/models.py:14–14`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/models.py#L14-L14).

Primary research: [S08](https://docs.enterprise.codescene.io/latest/guides/technical/hotspots.html), [S09](https://docs.enterprise.codescene.io/latest/guides/technical/change-coupling.html), [S10](https://docs.enterprise.codescene.io/latest/guides/technical/xray.html), [S24](https://github.com/boyter/scc), [S38](https://git-scm.com/docs/git-log). Retrieved 2026-10-15.


### R11 — Extend the existing dependency initiative with evidence, not another graph
**Disposition:** adopt. **Initiative group:** I04.

**Observed baseline:** The new TS/Python hierarchical view and symbol/barrel projection already exist. The projected graph loses original declarations and omits some unresolved/oversized files; its cache fingerprint omits resolution inputs.

**Proposal:** Preserve declared edges and source witnesses, tag edge kinds, expose resolution completeness, and include configuration fingerprints. Then add SCC membership, unique degree context and optional boundary rules within the current focus UI.

**First proof:** Cycle/barrel/type-only/unresolved fixtures and a config-only resolution change produce correct evidence, while existing focus budget/geometry invariants remain intact.

**Rejection / cut:** Reject a replacement renderer or full call-graph promise. Do not label projected dependency cycles as proven runtime initialization defects.

Code evidence: [`server/app/services/deps/graph.py:37–171`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/deps/graph.py#L37-L171); [`server/app/services/deps/common.py:1–191`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/deps/common.py#L1-L191); [`client/src/viz/deps/DependencyView.tsx:40–161`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/viz/deps/DependencyView.tsx#L40-L161); [`docs/intent/dependency-view/shape-brief.md:9–70`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/docs/intent/dependency-view/shape-brief.md#L9-L70).

Primary research: [S14](https://www.ndepend.com/docs/code-metrics), [S19](https://docs.scitools.com/help/reference/graph-catalog.html), [S37](https://github.com/sverweij/dependency-cruiser). Retrieved 2026-10-15.


### R12 — Import clone families before building clone analysis
**Disposition:** adopt. **Initiative group:** I06.

**Observed baseline:** Current duplicated text counts repeated literal values within a file, not duplicated logic or cross-file coordination.

**Proposal:** Parse one pinned CPD/jscpd artifact, preserve family/region identities and token policy, and add peer-region comparison. Current jscpd version-family differences require schema verification.

**First proof:** Verified cross-file family, intentional duplicate and overlapping-region cases yield reproducible side-by-side evidence and unioned extent.

**Rejection / cut:** Reject automatic abstraction advice, custom embeddings or a new detector until artifact-based decisions prove useful.

Code evidence: [`server/app/services/typescript/typescript_analysis.py:69–69`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L69-L69); [`client/src/components/CodeModal/CodeModal.tsx:6–17`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/CodeModal/CodeModal.tsx#L6-L17).

Primary research: [S25](https://pmd.github.io/pmd/pmd_userdocs_cpd.html), [S26](https://github.com/kucherenko/jscpd), [S27](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md). Retrieved 2026-10-15.


### R13 — Import actionable diagnostics with licensing and provenance boundaries
**Disposition:** adopt. **Initiative group:** I08.

**Observed baseline:** Token any and ignore counts cannot establish unsafe type propagation or concrete rule violations.

**Proposal:** Import relevant project diagnostics with rule, source region, confidence, suppression and baseline identity. Keep authorized external findings separate from bundled analyzer/rule licensing.

**First proof:** A type-aware issue not visible to token counting, an intentional negative test and duplicate tool reports are correctly distinguished.

**Rejection / cut:** Reject ingestion without source/config matching or a default flood of stylistic findings. Do not redistribute restricted rule packs without permission.

Code evidence: [`server/app/services/typescript/typescript_analysis.py:134–136`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L134-L136); [`server/app/services/typescript/typescript_analysis.py:169–181`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L169-L181); [`server/app/services/reporting.py:316–351`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L316-L351).

Primary research: [S29](https://typescript-eslint.io/rules/no-unsafe-assignment/), [S30](https://docs.semgrep.dev/licensing), [S31](https://docs.semgrep.dev/semgrep-code/triage-remediation), [S32](https://www.jetbrains.com/help/qodana/ui-overview.html). Retrieved 2026-10-15.


### R14 — Import coverage only through a trustworthy join
**Disposition:** adopt. **Initiative group:** I07.

**Observed baseline:** The snapshot contains no execution coverage. Its present display scopes and notebook virtual lines are not safe universal method identifiers.

**Proposal:** Start with one artifact format and matched files; preserve kind, covered/total opportunities, exclusions and source map. Enable function coverage only after ownership mapping is proven.

**First proof:** C05's missing/stale/uncovered/excluded/source-map fixtures are all distinct; unknown maps abstain and ratios recompute from compatible counts.

**Rejection / cut:** Reject CRAP or a coverage penalty when a file is absent from an incomplete artifact. No test execution inside a normal scan.

Code evidence: [`server/app/services/analysis.py:207–251`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L207-L251); [`server/app/services/ipynb/ipynb_analysis.py:18–126`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/ipynb/ipynb_analysis.py#L18-L126); [`server/app/services/reporting.py:536–546`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L536-L546).

Primary research: [S01](https://testing.googleblog.com/2011/02/this-code-is-crap.html), [S02](https://www.artima.com/weblogs/viewpost.jsp?thread=215899), [S03](https://dx42.github.io/gmetrics/metrics/CrapMetric.html), [S33](https://coverage.readthedocs.io/en/latest/branch.html), [S34](https://github.com/istanbuljs/nyc), [S39](https://dl.acm.org/doi/10.1145/2568225.2568271). Retrieved 2026-10-15.


### R15 — Keep mutation evidence targeted and externally supplied
**Disposition:** defer. **Initiative group:** I07.

**Observed baseline:** Source-only measurements cannot show assertion strength; mutation execution is a materially different and potentially expensive workflow.

**Proposal:** Accept a small existing report after coverage joins are sound. Show survivor evidence and provider-specific outcomes; do not launch mutation suites from Srcly.

**First proof:** One meaningful surviving mutation changes a test decision that coverage alone did not identify, with equivalent/invalid/timeout cases handled.

**Rejection / cut:** Remain deferred without a valid existing artifact or if manual false-positive cost dominates. Reject survivor count as a count of real bugs.

Code evidence: [`server/app/services/reporting.py:316–351`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L316-L351).

Primary research: [S35](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/), [S36](https://pitest.org/quickstart/basic_concepts/). Retrieved 2026-10-15.


### R16 — Treat CRAP as an optional interaction, never another independent vote
**Disposition:** investigate. **Initiative group:** I07.

**Observed baseline:** CRAP is absent from the baseline; present function classification and zero defaults would make naive computation misleading.

**Proposal:** Use the component-first design and exact formula/boundary treatment in the report. Label coverage variants; do not multiply an existing CCN/coverage aggregate by another CRAP vote.

**First proof:** Reproduce arithmetic and comparator fixtures, refuse missing coverage, and compare components-only versus contour-assisted decisions.

**Rejection / cut:** Reject a default scalar if no incremental decision value appears. Do not adopt the historical threshold as a validated defect predictor.

Code evidence: [`server/app/services/analysis.py:207–258`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L207-L258); [`server/app/services/reporting.py:251–313`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L251-L313).

Primary research: [S01](https://testing.googleblog.com/2011/02/this-code-is-crap.html), [S02](https://www.artima.com/weblogs/viewpost.jsp?thread=215899), [S03](https://dx42.github.io/gmetrics/metrics/CrapMetric.html). Retrieved 2026-10-15.


### R17 — Reject opaque replacement scores and defer costly weak-fit metrics
**Disposition:** reject. **Initiative group:** I03.

**Observed baseline:** Adding MI, Halstead effort, general centrality, universal framework counts or developer scoring would add semantic/maintenance costs without a demonstrated distinct personal-project decision.

**Proposal:** Reject default MI/Halstead effort/bug estimates and low-comments morality. Defer LCOM, centrality, people scores and framework rule engines until a bounded use case can falsify the decision.

**First proof:** A reconsideration must name a unique missed decision, required data and a cheaper comparator before implementation.

**Rejection / cut:** Evidence can overturn rejection; mathematical independence or a competitor feature checkbox cannot.

Code evidence: [`server/app/services/reporting.py:60–115`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L60-L115); [`client/src/utils/metricsStore.tsx:49–72`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/metricsStore.tsx#L49-L72).

Primary research: [S14](https://www.ndepend.com/docs/code-metrics), [S16](https://www.jarchitect.com/Metrics), [S19](https://docs.scitools.com/help/reference/graph-catalog.html), [S22](https://radon.readthedocs.io/en/master/intro.html), [S28](https://eslint.org/docs/latest/rules/complexity), [S29](https://typescript-eslint.io/rules/no-unsafe-assignment/), [S37](https://github.com/sverweij/dependency-cruiser), [S38](https://git-scm.com/docs/git-log). Retrieved 2026-10-15.


### R18 — Make evidence and filtering consistent across explorer and reports
**Disposition:** adopt. **Initiative group:** I02.

**Observed baseline:** Color stops reuse CCN units for bytes/text; filters can change tree children without recomputing metrics, and scope navigation can leave the metric panel on the original scope prop.

**Proposal:** Use unit-appropriate, explained color scales; neutral missing states; one declared cohort across map/list/report; current selected-scope evidence; stable finding IDs and explicit triage states. Local snapshot deltas are a later extension.

**First proof:** A selected nested scope shows its own evidence; the same filtered cohort matches everywhere; equal values retain equal semantic color and unknown data never looks healthy.

**Rejection / cut:** Reject impressive visualizations without source evidence or a graph/treemap redesign that ignores the existing light-mode focus workflow.

Code evidence: [`client/src/viz/treemap/utils/colors.ts:19–72`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/viz/treemap/utils/colors.ts#L19-L72); [`client/src/utils/dataProcessing.ts:31–159`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/dataProcessing.ts#L31-L159); [`client/src/components/CodeModal/MetricsSidebar.tsx:34–40`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/CodeModal/MetricsSidebar.tsx#L34-L40); [`server/app/services/reporting.py:316–397`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L316-L397).

Primary research: [S04](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition), [S32](https://www.jetbrains.com/help/qodana/ui-overview.html). Retrieved 2026-10-15.


## Proposed initiative shapes

These are inputs for Codex's independent initiative process. No issue, branch, pull request, skill artifact or repository file was created by this research.

### I01 — Metric semantics and trustworthy availability
**Recommendations:** R01, R02, R03, R04, R07. **Dependencies:** none.

**Visible first proof:** Gold fixture grid across real functions, display scopes, synthetic imports/bodies and all supported analyzer families. Assert exact units, ownership, maxima, denominators and N/A.

**Cost / appetite:** M for a bounded proof; full corrections may be L. Split representation/units from optional language-specific enrichment. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** Keep source-compatible values plus explicit support metadata while migrating consumers.

**Rejection rule:** Reject cosmetic label changes that leave inconsistent arithmetic. Cut nonessential TS propagation instead of inventing support.

**Below the cut line:** No new metric family, no coverage join, no replacement analyzer engine in the first proof.


### I02 — One explainable explorer/report contract
**Recommendations:** R05, R06, R08, R18. **Dependencies:** I01.

**Visible first proof:** Use one manually specified cohort to prove monotonic scoring, UI/report parity, stable identities, missing states, filter consistency and source-linked selected-scope evidence.

**Cost / appetite:** M; reuse existing Solid components, source modal and report artifacts. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** Single-metric/lens ranking remains usable; optional composite is withheld until invariant tests pass.

**Rejection rule:** Reject a new opaque quality score. Stop additional charts until the same question has the same answer in list, map and JSON.

**Below the cut line:** No hosted dashboards, trend database, global graph renderer or visual redesign.


### I03 — Portfolio evidence and selection
**Recommendations:** R09, R17. **Dependencies:** I01, I02.

**Visible first proof:** Three-repository pilot with pinned commits, stratified metric table, size-conditioned comparisons and blinded action review; only then expand to twelve.

**Cost / appetite:** M pilot; broader adjudication/data collection may be L. Human review cost is part of the budget. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** All legacy raw metrics remain in diagnostics; proposed defaults are reversible.

**Rejection rule:** The compact portfolio can lose. Reject a candidate or a removal if complementary useful decisions disappear; no correlation-only elimination.

**Below the cut line:** No defect prediction model, automatic feature selection or new aggregate before basic decision-value evidence.


### I04 — Architecture evidence on the existing dependency view
**Recommendations:** R11. **Dependencies:** I01, I02.

**Visible first proof:** Original import witnesses survive barrel/symbol projection; config-only changes invalidate resolution; TS/Python cycle/type-only/lazy/unresolved fixtures preserve view budget and geometry.

**Cost / appetite:** M after reading the existing dependency-view work; optional boundary rules are S after the graph contract. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** Existing focus rendering stays; new evidence can remain disabled when completeness is insufficient.

**Rejection rule:** Reject new dependency-view initiatives duplicating shipped work, runtime claims from projected edges, and popularity-as-badness.

**Below the cut line:** No call graph, whole-repository hairball, continuous semantic zoom or replacement layout.


### I05 — Bounded local Git activity
**Recommendations:** R10. **Dependencies:** I01, I02, I03.

**Visible first proof:** Manually verified file histories plus a blind CCN/LOC versus activity-aware triage comparison. Rename, merge and bulk-change policies are visible.

**Cost / appetite:** M; one window and file-level history first. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** History is optional and absence is N/A; source-only exploration still works.

**Rejection rule:** Reject default adoption when no useful new prioritization appears or shallow/history policy gaps dominate. Co-change is a later gated extension.

**Below the cut line:** No ticket integration, author score, always-on service or function history reconstruction.


### I06 — Clone family evidence import
**Recommendations:** R12. **Dependencies:** I01, I02, I03.

**Visible first proof:** One pinned artifact format provides matched peers, stable family IDs and unioned extents; intentional duplication is visibly retained as a legitimate outcome.

**Cost / appetite:** M for one adapter and bounded peer comparison. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** No artifact means no clone assessment; old literal repetition stays neutral.

**Rejection rule:** Reject automatic extraction advice and a custom clone engine if imported evidence has not improved decisions.

**Below the cut line:** No near-miss/embedding engine or all-history repeated scans in the first proof.


### I07 — Coverage joins and test-confidence diagnostics
**Recommendations:** R14, R15, R16. **Dependencies:** I01, I02, I03.

**Visible first proof:** One file-level coverage format first: stale/missing/excluded/zero-opportunity data abstains correctly. Method joins and CRAP edge cases are a separate second gate.

**Cost / appetite:** M file-level proof; reliable multi-language method/source-map joins can be L. Mutation execution is explicitly excluded. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** File-level coverage remains useful even if method CRAP is rejected; component-only view is the default.

**Rejection rule:** Reject zero-imputation and ambiguous notebook/source-map matching. Keep mutation import deferred and CRAP optional unless it changes decisions.

**Below the cut line:** No test runners, mutation runners or CRAP-first feature work inside a normal scan.


### I08 — Authorized static-finding import
**Recommendations:** R13. **Dependencies:** I01, I02, I03.

**Visible first proof:** One project's existing typed diagnostics join to source, deduplicate across tools and distinguish expected-error tests, suppressed and new findings.

**Cost / appetite:** M one format; avoid building a general analyzer marketplace. These are rough human engineering planning bands, not measured runtimes or promised delivery dates.

**Valid intermediate state:** Findings are separate evidence with their own status, not a replacement quality scalar.

**Rejection rule:** Reject imports lacking source/config provenance or dominated by style noise; restricted vendor rules are not bundled.

**Below the cut line:** No remote platform, untrusted project configuration execution or redistribution of rule packs without appropriate rights.


## Existing dependency-view initiative: preserve its decisions

Read `docs/intent/dependency-view/{intent-brief,shape-brief,implementation-plan}.md` and `initiative-map.json` together with the current `client/src/viz/deps/` and `server/app/services/deps/` code. The map records all five implementation milestones completed while review/merge status and some narrative descriptions retain older state. The attached baseline—not those older descriptions—shows the new graph, Python support, symbol projection, cached graph and URL focus.

The requested old `client/src/components/DependencyGraph.tsx` is absent from the manifest; its replacement is directly imported by `Treemap.tsx`. This is an identifiable superseded path, not missing metric code or a reason to reinvent it. Keep bounded focus, uniform boxes, hierarchy-based rollup and the existing layout. Do not resurrect the discarded layout-engine approach. **I04 adds edge evidence and metrics to this architecture, not another dependency-view initiative.**

## Acceptance policy across initiatives

A first proof is allowed to reject a proposal. Use source-level correctness fixtures before ranking experiments. Do not publish measured correlations, time savings, precision or defect probabilities until they have actually been obtained. Runtime and attention budgets must be measured in a real checkout and recorded with configuration.

Metric upgrades change meanings, so reports need a versioned metric contract and comparable-source manifest. Retain raw old fields during migration when compatibility matters, but show corrected support. A new scalar is not a substitute for a missing source of evidence.

## Codex follow-through run sheet — not executed

Run only after Codex obtains the real checkout and independently reviews the changes. These are the prompt's prescribed validation commands, not tests run against the text packet:

```bash
# From the real repository root, after integration.
(cd server && uv run pytest)
(cd client && pnpm test)
(cd client && pnpm build)
```

Codex should independently verify the decisive source claims, disposition every R-ID, then create and validate the final Software Design Sleuth initiatives. This research does not open the review PR.
