# Srcly: distinctive code quality signals and explorer research

https://github.com/byronwall/srcly

## Mission

Review Srcly's full metric portfolio and survey the code quality tool field. Recommend the smallest strong set of complementary signals and exploration workflows that maximizes useful, UNIQUE information per metric. Support a later Software Design Sleuth initiative plan, not application implementation. Be ambitious about insight and disciplined about cost and redundancy.

Baseline: commit `83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4`. Codex integration branch: `codex/metrics-research`. The attached selected-source snapshot comes from that commit. Local research documents are separate additions. The packet is authoritative for baseline code when GitHub indexing is stale. It is not a runnable checkout.

Byron's goal: the best code quality explorer, with metrics that reveal different things. Many highly correlated numbers provide little information. This is a personal project. Favor direct local workflows and small implementations. Do not mistake “best” for a requirement to build an enterprise service or copy every competitor feature.

## Ranked questions

1. What does EVERY existing metric actually measure? Trace computation, node propagation, aggregation, ranking, and display. Which are correct, misleading, redundant, framework-specific, descriptive only, or valuable quality signals? Give each a keep/change/demote/remove/investigate disposition. Cover fields absent from selectors and distinguish operational metadata from quality metrics.
2. Which additional signals provide distinct actionable information after existing signals and code size are accounted for? Compare against a broad, current tool survey. Recommend a compact default portfolio, optional diagnostic metrics, and deferred candidates.
3. How should Srcly establish incremental information empirically? Define a feasible multi-repository, multi-language evaluation with stratification by node scope, language, size, generated/test code, and missing support. Consider Spearman/rank overlap, residual information after size adjustment, collinearity, nonlinear relationships, and complementary failure cases. Correlation alone must not disqualify a useful metric. Separate conceptual overlap, measured correlation, and unique decision value. Do not fabricate measured correlations or predictive validity.
4. How do leading tools PRESENT and explain these signals? Study actual workflows, drilldown, treemaps, hotspots, trends, scatterplots, source evidence, dependency graphs, finding triage, and combined scoring. Recommend useful exploration interactions, honest uncertainty, and missing-data handling for Srcly's UI and headless reports.
5. What staged, repo-grounded initiatives should Codex shape from the findings? Separate semantic correctness, portfolio selection/evaluation, and new data sources or UX when justified. Propose a first proof, rejection rule, cost, dependencies, and cut line for each. Codex will own final skill artifacts.

## Access and stop gates

GO only when this repository and baseline are identifiable, the metric source files are readable, and web research is available. Read the packet's manifest and explain its limits. GitHub access is optional when the packet supplies the necessary code.

NO-GO for an exhaustive audit if required code is unavailable in both sources, repository identity differs, or external research cannot run. Report the missing source and smallest unblock action. Partial findings may be returned with explicit gaps. Do not silently substitute a generic metric essay or claim a complete survey from memory.

You have a read-only research assignment. Do not change repositories, open issues/PRs, install tools, run untrusted programs, or deploy. If file creation is available, write deliverables in your sandbox; otherwise return complete Markdown and JSON inline. State whether files were created. No writable checkout is required.

Stop researching when the main tool categories and metric families are covered and added sources no longer change decisions. Prefer depth on strong exemplars over a huge feature list. Mark genuine product choices as proposals, not blockers that require speculative assumptions.

## Repository reading route

Read at minimum:

1. `AGENTS.md`, `README.md`, `docs/CODE_MAP.md`, `DESIGN.md`, `server/pyproject.toml`, `client/package.json`.
2. `server/app/models.py`, `server/app/services/analysis_types.py`, `server/app/services/analysis.py`.
3. All analyzers under `server/app/services/typescript/`, `python/`, `css/`, `markdown/`, and `ipynb/`; analyzer dispatch and Lizard use in `analysis.py`.
4. `server/app/services/reporting.py`: `METRIC_DEFINITIONS`, `PROFILE_WEIGHTS`, `rank_nodes`, `build_findings` and schema output.
5. `client/src/utils/metricsStore.tsx`, `client/src/components/Explorer.tsx`, `MetricPicker.tsx`, `HotSpotItem.tsx`, `Treemap.tsx`, `DependencyGraph.tsx`; `client/src/viz/treemap/utils/colors.ts`; scope metric sidebar and tooltips.
6. Dependency services under `server/app/services/deps/` and the existing `docs/intent/dependency-view/` initiative. Identify reuse and avoid overlapping plans that ignore it.
7. Tests: `server/tests/test_complexity_semantics.py`, `test_reporting.py`, `test_synthetic_scopes.py`, `test_tree_sitter_analysis.py`, `test_ts_analysis.py`, `test_tsx_metrics.py`, `test_python_analysis.py`, `test_function_body_loc.py`, and dependency tests. Prior notes under `docs/analysis/` are context, not proof of current behavior.

Actual local commands for Codex follow-through: `cd server && uv run pytest`; `cd client && pnpm test`; `cd client && pnpm build`. Do not claim to execute these from a selected-source text snapshot.

## Verified baseline leads; re-check against code

- FastAPI/Python backend with Lizard and tree-sitter; SolidJS/TypeScript client; local CLI reports and browser explorer.
- 22 selectable hotspot metrics; 27 report metric definitions; the API has additional operational fields.
- `complexity` now means maximum CCN across functions/scopes for files and folders. `complexity_avg` is separate. README still describes file complexity as average: do not use README as the final semantic authority.
- UI sums selected metrics after max normalization. Reports use weighted normalized metrics and profiles. Audit mixed scopes, relative thresholds, outliers, duplicated evidence, and disagreement between paths.
- API numeric defaults are zero, including language-specific fields. Determine when unsupported/missing analysis can be confused with measured zero.
- TSX counters include React-specific useEffect, but the client is SolidJS. Do not assume framework-neutral meaning.
- Recent fixes exclude synthetic import scopes from function counts. Nested scopes and code fragments need careful denominator and aggregation rules.

## Research coverage

Use primary sources: official metric definitions, public code, original papers, vendor documentation, and visible product examples. Seek at least 12 relevant tools spanning complementary categories, unless access limits justify fewer. Strong candidates: SonarQube/SonarCloud, CodeScene, NDepend/JArchitect, SciTools Understand, CppDepend, Lizard, Radon/Xenon, scc, PMD/CPD, jscpd, ESLint/typescript-eslint, Semgrep, Qodana, coverage.py/Istanbul, Stryker/PIT, and architecture/dependency tools such as dependency-cruiser. Verify current names and capabilities. State why each selected exemplar matters; avoid quota padding.

Explicitly cover cyclomatic and cognitive complexity; nesting; size; duplication and clone topology; coupling/cohesion and dependency cycles; churn/change hotspots and temporal coupling; coverage and mutation testing; type safety and static findings; maintainability indices and composite scores. Distinguish source-only, Git-history, coverage-import, semantic/type-checker, and external-tool requirements. Include language portability, licensing constraints where relevant, runtime cost, noise, gaming, and evidence quality.

Include CRAP (Change Risk Anti-Patterns). The user associates it with Uncle Bob: verify origin and attribution from primary sources instead of repeating that attribution. Explain exact formula, coverage scale and kind, function scope, edge cases, threshold evidence, whether high complexity is counted twice, and whether it adds unique information conditional on complexity and coverage. Compare displaying its components against the composite. Do not equate missing coverage with zero coverage. Do not claim CRAP predicts defects without supporting evidence.

For each candidate give definition/formula, scope, rollup, required inputs, unsupported behavior, distinct question answered, likely overlap, false positives, action, implementation fit, and recommendation. A risk heuristic is not a quality fact. A count of imports, comments, types, props, or exports does not automatically establish poor code.

## Evidence rules

Separate observed repository facts, external documented facts, inferences, and proposals. Cite source paths with symbols/line anchors and external direct URLs with retrieval date. Verify important formulas, thresholds and attribution. Note vendor claims and uncertain validity. No invented empirical results. Every recommendation must connect repository evidence to the user decision it improves.

Do not optimize for mathematical independence alone: the goal is unique, actionable insight. Compare small complementary portfolios with a “keep everything but organize it” counterproposal. Explain rejected alternatives. Propose a practical evaluation gate before permanent portfolio removal or an opaque new aggregate score.

## Deliverable contract

Create a downloadable `srcly-metrics-research.zip` plus standalone companions:

- `research-report.md`: concise executive recommendation, full current metric audit, competitor survey with presentation patterns, CRAP analysis, redundancy evaluation design, ranked candidate portfolio, proposed initiatives, and sources.
- `current-metrics.json`: exhaustive API/report/selector inventory with real identifiers, observed semantics, scope/support/rollup, code evidence, risk interpretation, overlap, and disposition.
- `candidate-metrics.json`: ranked candidates with definitions, dependencies, unique decision value, overlap, evidence strength, proposed proof and rejection gates, and implementation cost.
- `tool-survey.md`: supported feature and UX comparisons with primary links; distinguish inspected UI from documentation-only claims.
- `recommendations.md`: stable recommendation IDs, adopt/investigate/defer/reject proposals, rationale, initiative grouping and relevant code paths. Include existing metric corrections, removals/demotions, scoring, missing data, and UI/report presentation.

If archive production is unavailable, return complete standalone deliverables. Do not provide only a summary. Avoid executing any generated scripts; illustrative evaluation code is optional and clearly unrun.

Success checks: inventory reconciles all API fields, all 27 report definitions and all 22 selector entries; no current metric disappears without a disposition; at least one candidate/metric is rejected or deferred on substantive grounds; every proposed default earns its place; primary sources support consequential claims; CRAP gets a complete treatment; measured and hypothesized redundancy remain distinct; initiatives have a visible first proof that can reject the approach. Unknowns stay explicit.

End with a short summary of files, inspected baseline, top decisions, important uncertainty, and any contract gaps. Codex will download originals, independently verify decisive claims, give each recommendation a final disposition, run Software Design Sleuth, validate the initiatives, and open a review PR. This assignment authorizes research and planning only.
