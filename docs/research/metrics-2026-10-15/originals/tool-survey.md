# Srcly tool and workflow survey
Research date: **2026-10-15**. Baseline for fit: **`83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4`**.

## Scope and evidence standard

Nineteen comparison entries cover more than twelve distinct tools, spanning structural metrics, semantic architecture, history, clones, static findings, coverage and mutation. Related products are grouped where this avoids quota padding. Every capability below is tied to primary documentation or public project sources. Definitions establish what a tool claims/computes; they do not establish comparative accuracy, Srcly usefulness or defect prediction.

**No product was installed or run.** Four official static UI images were visually inspected: two CodeScene views, the NDepend size-metric dropdown, and the CppDepend matrix. These are product examples, not independently measured results. All other presentation claims are documentation-only. “Current” means the retrieved documentation/public main branch, not a guarantee that every described capability is in the latest stable downloadable release.

The PMD page carries a development-snapshot/future-date caveat. Current jscpd main describes a Rust v5 implementation rather than the historical Node v4 API. Current scc documentation includes optional cognitive/history features, so it should not be reduced to a LOC-only comparator. See the individual sources and pin versions before integration.

## What to borrow, not what to clone

| User decision | Strong exemplars | Srcly proposal |
|---|---|---|
| What merits attention now? | CodeScene, scc | Show activity beside structure, with window and commit evidence; do not manufacture urgency without history. |
| Why is this node highlighted? | SonarQube, Qodana, ESLint | Metric/rule definition, contributing source and explicit support; one click to inspect, not a score-only queue. |
| What else changes with this? | CodeScene coupling, dependency-cruiser | Separate observed co-change from declared dependency edges; show peer evidence and confidence limits. |
| Can this module be separated? | NDepend/JArchitect, CppDepend, Understand | A cycle witness or bounded dependency focus first; a matrix only for a demonstrated larger-boundary task. |
| What testing evidence is missing? | coverage.py/nyc, Stryker/PIT | Keep execution gaps and mutation survivors separate; use matched external artifacts and show the exact source. |
| What duplication matters? | CPD, jscpd | Clone families and peer regions, not merely repeated words or an aggregate duplicate percentage. |

These are design proposals. They are not claims that one vendor's complete workflow should be implemented or that its scores have been validated for this repository.

## Comparative entries


### T01 — SonarQube Server; Cloud is the related hosted family
**Distinct contribution:** Quality dimensions and new-code triage.

**Documented capability:** Server documentation separates overall/new code and exposes measures and rule-derived ratings. Its project CC total is not Srcly's maximum function value.

**Workflow and inspection:** Inspect Measures or an issue, narrow to new code, then inspect source/rule detail. Server documentation only; Cloud feature parity was not separately exercised. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Reuse new-versus-existing evidence and clear denominator labels; do not copy a universal quality gate or technical-debt-hours forecast.

**Inputs, cost and licensing:** Multi-language support is analyzer/edition-dependent. Server/Cloud infrastructure is unnecessary for Srcly's local core; any imported results need version and scope.

Primary sources, retrieved 2026-10-15: [S04](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition).


### T02 — CodeScene
**Distinct contribution:** History-informed priority and deep drilldown.

**Documented capability:** Combines activity context with structural review; X-Ray drills into methods, and change-coupling views expose peers.

**Workflow and inspection:** Inspected official static hotspot and coupling screenshots: selected-file details beside the map, filters, source/X-Ray actions and a labelled coupling-source peer list. Evidence level: **official static screenshots inspected; no interactive session**.

**Recommendation for Srcly:** Reuse selected-item evidence plus activity context and an on-demand deeper view. Do not treat a vendor health score or benefit claim as calibrated Srcly risk.

**Inputs, cost and licensing:** Requires Git for activity; structural support varies by language. Commercial product, with additional analysis beyond Srcly's source snapshot. No engine was run.

Primary sources, retrieved 2026-10-15: [S08](https://docs.enterprise.codescene.io/latest/guides/technical/hotspots.html), [S09](https://docs.enterprise.codescene.io/latest/guides/technical/change-coupling.html), [S10](https://docs.enterprise.codescene.io/latest/guides/technical/xray.html), [S11](https://docs.enterprise.codescene.io/latest/_images/HotspotsContextMenu.png), [S12](https://docs.enterprise.codescene.io/latest/_images/changeCouplingSidebar.png).


### T03 — NDepend / JArchitect
**Distinct contribution:** Semantic metrics and coordinated exploration.

**Documented capability:** NDepend documents type-level coupling/cohesion and customizable treemap dimensions. JArchitect supplies a related Java metric reference.

**Workflow and inspection:** NDepend documentation links selection across metrics/code queries; only its size-metric dropdown screenshot was visually inspected, not a running full treemap. Evidence level: **one official control screenshot inspected; other workflows documentation-only**.

**Recommendation for Srcly:** Separate size from color and expose metric scope. Keep class cohesion optional rather than applying it to functional modules.

**Inputs, cost and licensing:** Commercial language-oriented products; semantic/build inputs differ from Srcly's syntax-only scan. A metric name shared across them does not prove identical semantics.

Primary sources, retrieved 2026-10-15: [S13](https://www.ndepend.com/docs/treemap-visualization-of-code-metrics), [S14](https://www.ndepend.com/docs/code-metrics), [S15](https://www.ndepend.com/Doc/Treemap/TreemapSizeMetrics.png), [S16](https://www.jarchitect.com/Metrics).


### T04 — CppDepend
**Distinct contribution:** Dependency-matrix architecture overview.

**Documented capability:** Current product page advertises C/C++, Java and Rust and architecture/query views; no cross-language feature parity is assumed.

**Workflow and inspection:** Inspected official matrix screenshot: hierarchical rows, numeric dependency cells and selected-type detail. Evidence level: **official static matrix screenshot inspected**.

**Recommendation for Srcly:** Borrow a boundary matrix only when focused graphs cannot answer the question; preserve the existing smaller Srcly focus interaction first.

**Inputs, cost and licensing:** Commercial product and deeper analysis model. Matrix cells and metrics need a declared relation kind, not an unexplained count.

Primary sources, retrieved 2026-10-15: [S17](https://www.cppdepend.com/), [S18](https://www.cppdepend.com/images/docs/matrix_dsm.png).


### T05 — SciTools Understand
**Distinct contribution:** Question-specific semantic graphs.

**Documented capability:** Official graph catalog supports selecting an analysis view by the relationship being investigated rather than reducing everything to a score.

**Workflow and inspection:** Graph catalog and product documentation were read; no live application or static graph screenshot was inspected. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Offer task-specific entry points such as dependents or a cycle witness; avoid an all-purpose graph hairball.

**Inputs, cost and licensing:** Commercial semantic tool. Setup and parsing needs are language-specific; query cost and completeness cannot be inferred from Srcly's current imports.

Primary sources, retrieved 2026-10-15: [S19](https://docs.scitools.com/help/reference/graph-catalog.html), [S20](https://scitools.com/understand).


### T06 — Lizard
**Distinct contribution:** Portable low-friction function structure.

**Documented capability:** Public implementation/documents expose function CCN, NLOC and parameter information without requiring a full project build.

**Workflow and inspection:** CLI-style function rows and configured threshold reports keep source locations close to measurements. Evidence level: **documentation/public-source inspection; not executed**.

**Recommendation for Srcly:** Use as an existing baseline comparator and document differences, not as a universal oracle for every custom AST analyzer.

**Inputs, cost and licensing:** Broad syntax-oriented language coverage; resolved version and extensions matter. Srcly's dependency lower bound is not a pinned installed version.

Primary sources, retrieved 2026-10-15: [S21](https://github.com/terryyin/lizard).


### T07 — Radon
**Distinct contribution:** Explicit Python definitions and composite caution.

**Documented capability:** Documents Python decision counting plus Halstead and multiple maintainability-index formulations, with a caution about MI.

**Workflow and inspection:** Metric-specific CLI/reporting orientation makes formulas and eligibility important. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Use named Python fixtures as comparisons; reject a silent claim that two CC implementations are interchangeable.

**Inputs, cost and licensing:** Python-specific AST model. A local static analysis can be small, but adding token composites does not automatically add useful information.

Primary sources, retrieved 2026-10-15: [S22](https://radon.readthedocs.io/en/master/intro.html).


### T08 — Xenon
**Distinct contribution:** Enforcement workflow rather than a new signal.

**Documented capability:** Wraps Radon with configurable block, module and overall complexity limits.

**Workflow and inspection:** An explicit threshold policy produces a local/CI pass-fail outcome. Evidence level: **documentation/public-source inspection; not executed**.

**Recommendation for Srcly:** Keep exploratory priority distinct from a project-authorized gate. This is included for workflow contrast, not as another independent metric source.

**Inputs, cost and licensing:** Python/Radon dependency; MIT repository. Threshold choices remain policy decisions, not universal defect boundaries.

Primary sources, retrieved 2026-10-15: [S23](https://github.com/rubik/xenon).


### T09 — scc
**Distinct contribution:** Lightweight counting with optional richer modes.

**Documented capability:** Current main documents optional approximate cognitive complexity and Git hotspot/change-coupling capabilities as well as line counting.

**Workflow and inspection:** Machine-readable/CLI outputs suit local comparison and headless use. Evidence level: **documentation/public-source inspection; not executed**.

**Recommendation for Srcly:** Do not describe it as only a LOC counter. Compare its optional modes under a pinned version; an approximation is not Sonar cognitive parity.

**Inputs, cost and licensing:** Source counting and Git-history modes have different costs. Disabled optional values require support metadata; no benchmark was run.

Primary sources, retrieved 2026-10-15: [S24](https://github.com/boyter/scc).


### T10 — PMD / CPD
**Distinct contribution:** Configurable token clones.

**Documented capability:** CPD finds repeated token sequences with a minimum size; identifier/literal normalization options vary by language.

**Workflow and inspection:** Reports matched source regions; configuration determines exact versus normalized matches. Evidence level: **documentation-only; development-version caveat**.

**Recommendation for Srcly:** Adopt an artifact-first clone-family proof, but do not automatically follow every recommendation to extract duplication.

**Inputs, cost and licensing:** Java-based external tool. The inspected rolling page is a future-dated development snapshot; established workflow only, not a claimed current stable release.

Primary sources, retrieved 2026-10-15: [S25](https://pmd.github.io/pmd/pmd_userdocs_cpd.html).


### T11 — jscpd
**Distinct contribution:** Clone evidence and baseline artifacts.

**Documented capability:** Current main describes Rust v5 and retains legacy Node v4 separately; output/baseline workflows can support imported clone evidence.

**Workflow and inspection:** Read documented artifact workflows, not a running HTML UI. Evidence level: **documentation/public-source inspection; not executed**.

**Recommendation for Srcly:** Choose one pinned JSON schema and retain detector configuration and region identities. Do not embed an assumed v4 Node API into a v5 plan.

**Inputs, cost and licensing:** MIT repository; language/tokenization coverage is version-specific. Optional broader detection/history modes add cost and noise.

Primary sources, retrieved 2026-10-15: [S26](https://github.com/kucherenko/jscpd), [S27](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md).


### T12 — ESLint / typescript-eslint
**Distinct contribution:** Syntax rules versus semantic unsafe flows.

**Documented capability:** ESLint's CC rule documents JS-specific branch counting and variants; typed unsafe-assignment rules use project type information.

**Workflow and inspection:** Source-linked rule diagnostics make a specific review action possible instead of only ranking token counts. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Import relevant existing project findings; preserve rule and configuration. Explicit any tokens and propagated unsafe values are different evidence.

**Inputs, cost and licensing:** JavaScript/TypeScript; type-aware linting adds project setup/runtime. Do not run arbitrary project configuration during an untrusted scan.

Primary sources, retrieved 2026-10-15: [S28](https://eslint.org/docs/latest/rules/complexity), [S29](https://typescript-eslint.io/rules/no-unsafe-assignment/).


### T13 — Semgrep CE / Semgrep Code
**Distinct contribution:** Rule findings and triage.

**Documented capability:** Official documentation distinguishes engine capabilities, triage workflows and separate licensing for the engine versus maintained rule packs.

**Workflow and inspection:** Read finding triage/remediation documentation; no live AppSec Platform session was inspected. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Import authorized findings with provenance. Do not bundle Semgrep-maintained rules into a competing product merely because the engine is open source.

**Inputs, cost and licensing:** CE is LGPL-2.1; maintained rules have separate restrictive terms, and proprietary features are separate. Exact reuse needs license review.

Primary sources, retrieved 2026-10-15: [S30](https://docs.semgrep.dev/licensing), [S31](https://docs.semgrep.dev/semgrep-code/triage-remediation).


### T14 — Qodana
**Distinct contribution:** Source evidence and explicit backlog handling.

**Documented capability:** Current UI documentation separates problems, baseline problems and inspection views, and distinguishes personal hiding, analysis exclusion and baseline demotion.

**Workflow and inspection:** Documentation describes source fragments, rule detail and report export; no live or screenshot inspection claimed. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Use separate accepted/hidden/excluded states and stable finding identities; never treat hiding a row as improving measured code.

**Inputs, cost and licensing:** Analyzer/edition/configuration dependent; hosted service is not required for the proposed local artifact workflow.

Primary sources, retrieved 2026-10-15: [S32](https://www.jetbrains.com/help/qodana/ui-overview.html).


### T15 — coverage.py
**Distinct contribution:** Execution gaps with line/branch detail.

**Documented capability:** Tracks executable lines and branch destinations; partial branches and exclusions have explicit semantics.

**Workflow and inspection:** HTML annotations lead from a percentage to missing branch evidence. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Import covered/total opportunities and source witnesses; a combined coverage percentage must not be mislabeled pure branch coverage.

**Inputs, cost and licensing:** Python test execution is external to Srcly. Source code itself does not supply coverage; no test suite was run.

Primary sources, retrieved 2026-10-15: [S33](https://coverage.readthedocs.io/en/latest/branch.html).


### T16 — Istanbul / nyc
**Distinct contribution:** JavaScript coverage and source-map joining.

**Documented capability:** Provides several coverage kinds and source-map support; default reporting need not include every unvisited eligible file.

**Workflow and inspection:** File/source coverage reports are meaningful only with all-files and exclusion settings. Evidence level: **documentation/public-source inspection; not executed**.

**Recommendation for Srcly:** Preserve source-map and eligibility metadata; an absent file must remain unknown unless the artifact proves it was eligible and unexecuted.

**Inputs, cost and licensing:** JavaScript/TypeScript tooling; ISC repository. Transpilation and test configuration are external dependencies, not a cheap AST-derived metric.

Primary sources, retrieved 2026-10-15: [S34](https://github.com/istanbuljs/nyc).


### T17 — Stryker
**Distinct contribution:** Mutation outcome evidence.

**Documented capability:** Defines detected, undetected and invalid/pending/ignored mutant states with explicit scoring denominators.

**Workflow and inspection:** Mutation reports enable inspecting the altered behavior rather than just a coverage total. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Import targeted survivor evidence; keep timeout contribution visible and do not call every survivor a defect.

**Inputs, cost and licensing:** Framework/language implementation-specific execution cost; much more expensive than reading a report. No mutations were executed.

Primary sources, retrieved 2026-10-15: [S35](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/).


### T18 — PIT
**Distinct contribution:** Java mutation workflow.

**Documented capability:** Documents bytecode mutation, relevant-test selection and the equivalent-mutant problem.

**Workflow and inspection:** Inspect a surviving meaningful mutation and the test that should observe it. Evidence level: **documentation-only**.

**Recommendation for Srcly:** Use as a complementary oracle-strength exemplar; do not silently impose Stryker's score convention on PIT artifacts.

**Inputs, cost and licensing:** Java/JVM and build/test/debug information required. Whole-suite mutation belongs below Srcly's default scan cut line.

Primary sources, retrieved 2026-10-15: [S36](https://pitest.org/quickstart/basic_concepts/).


### T19 — dependency-cruiser
**Distinct contribution:** Architecture intent and violation evidence.

**Documented capability:** Validates dependencies against project rules, including cycle and production/test constraints, with text and graphical reporters.

**Workflow and inspection:** Declare a named constraint, inspect its violating edge, then review the corresponding module relationship. Evidence level: **documentation/public-source inspection; not executed**.

**Recommendation for Srcly:** Reuse the principle of explicit architectural intent and edge witnesses in Srcly's existing graph, not a new enterprise architecture platform.

**Inputs, cost and licensing:** MIT; JS/TS ecosystem resolution and configuration matter. Imported graph/rule results still require source matching and completeness reporting.

Primary sources, retrieved 2026-10-15: [S37](https://github.com/sverweij/dependency-cruiser).


## Static UI inspection log

| Inspected item | Actually visible | Limits |
|---|---|---|
| CodeScene hotspot details, [S11](https://docs.enterprise.codescene.io/latest/_images/HotspotsContextMenu.png) | Selected-file measures, filters, map context, source/review/X-Ray entry points and detail tabs. | Static example only. Its coverage/commit/LOC numbers are illustrative, not observations about Srcly. |
| CodeScene change coupling, [S12](https://docs.enterprise.codescene.io/latest/_images/changeCouplingSidebar.png) | Peer list, relationship highlighting and explicit coupling-source label. | No interaction or underlying calculations tested. |
| NDepend menu, [S15](https://www.ndepend.com/Doc/Treemap/TreemapSizeMetrics.png) | Method-level context and several size metrics in a dropdown. | This is not evidence of inspecting a complete running treemap; linked-view behavior is documented separately. |
| CppDepend matrix, [S18](https://www.cppdepend.com/images/docs/matrix_dsm.png) | Hierarchical module/type rows, numeric cells and selected-item information. | The underlying project, edge semantics and calculations were not independently verified. |

## Workflows deliberately not copied

A treemap gives spatial inventory and drilldown, but tiny severe regions may be visually lost: retain a matching list. A scatterplot can reveal tradeoffs between size, structure, activity or test evidence without adding them. A dependency focus can explain one obligation better than a global graph. A trend requires stable identities and comparable analysis settings. These are Srcly design inferences, not measured usability results.

Do not copy remediation-hour estimates, universal thresholds, proprietary health formulas, developer leaderboards or all-history analysis merely to match a product checkbox. Do not imply that a security “hotspot” and Srcly's metric-ranked hotspot are the same kind of finding. The retrieved Sonar page itself describes changing treatment of Security Hotspots; naming and product workflow must be verified for the selected version.

A local first implementation should choose **one** additional evidence source after semantic correctness: Git activity is the recommended first prioritization proof, while declared-edge/witness repair is the prerequisite for trustworthy cycle analysis. Clone and test artifacts remain separate bounded additions. The ranking in `candidate-metrics.json` and initiative cut lines in `recommendations.md` govern those choices.

## Source register

All links above were retrieved on 2026-10-15. `sources.json` records the exact URLs, evidence types and access limitations. Vendor documentation is strong evidence of intended capabilities, not independent evidence of effect sizes or scientific validity. No comparative performance rankings, measured correlations or paid-edition price claims are made.
