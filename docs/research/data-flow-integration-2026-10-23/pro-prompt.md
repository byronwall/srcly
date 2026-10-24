# Srcly overview to exact value-flow investigation

## Repositories and mission

https://github.com/byronwall/srcly

Baseline: main at aea1015258f56dd45b8e175f7288e2fef3abc6cf.

https://github.com/byronwall/tsx-data-flow

Baseline: local main at b4f1ba4f0df402251f4b666cddf5312efa4a62be, three commits ahead of its tracked remote, plus substantial working edits. The supplied source snapshot is authoritative for these edits. Do not assume GitHub has them.

Mode: Design. Decide how Srcly should combine its repository overview with tsx-data-flow's deep semantic analysis. Produce a research packet and a buildable plan. Do not implement changes.

Byron's job: start with Srcly's whole-repository view, notice a useful preview or snippet, then hand off to a focused value investigation. Preserve orientation and the route back. Trace a concrete value through helpers, aliases, branches, components, fields, and transforms to terminal consumers. Inspect fallbacks, nulls, invalid values, lost type evidence, and unknown boundaries. Srcly gives him the better big picture. He likes tsx-data-flow's depth but has had trouble making its visuals useful. Do not solve this by putting the entire value graph on the repository map.

The originating chat was accidentally in explorEDA. Byron explicitly corrected this: analyze ONLY Srcly and tsx-data-flow. Do not propose explorEDA as a dependency or destination.

Act as a static-analysis and code-exploration product designer. Give candid tradeoffs and a recommendation. Favor an ambitious useful workflow with a small first proof. These are personal projects with one deployed version. Avoid a plugin platform, compatibility machinery, and speculative services.

## Access check

First verify both source trees in the attachment. Files are grouped by repository and include local edits. Prefer those bytes for code claims. GitHub links identify the projects and baselines. If decisive source is missing from both routes, stop and request the smallest missing input. State which code you actually inspected. Do not claim you ran the applications or tests unless you did.

## Reading route

Srcly, at minimum:

- AGENTS.md, README.md, docs/CODE_MAP.md, client/package.json, server/pyproject.toml.
- docs/intent/imported-quality-evidence/{intent-brief,shape-brief,implementation-plan}.md and docs/intent/unified-navigation/implementation-plan.md. These are earlier proposals, not proof of shipped behavior.
- server/app/models.py; services/analysis.py, analysis_types.py, metric_catalog.py, reporting.py, findings/, cache.py, scan_jobs.py; routers/files.py and scans.py. Prefix service paths with server/app/.
- client/src/App.tsx, navigation/{location,store,history,nodeActions}.ts, viz/deps/{contract,viewModel,layout,DependencyView}.tsx or .ts as present; code inspection components identified by docs/CODE_MAP.md; utils/metricsStore.tsx.
- Representative navigation, findings, metrics, dependency-view tests. Read implementation before treating a plan as shipped.

tsx-data-flow, at minimum:

- AGENTS.md, README.md, package.json, docs/application-structure.md, docs/data-trajectory-intent.md, docs/route-field-proof-acceptance.md, docs/performance-baseline.md.
- docs/analyzer.md: compare its early file-local limits against current source; do not repeat stale limits as current facts.
- docs/evaluations/evidence-loss-analysis-integration-options.md; docs/intent/field-trajectories-and-cleanup/; docs/product-pillars/; docs/feedback/20260724-context-driven-data-flow-transcript-decomposition.md.
- src/core.ts, types.ts, project/, analysis/report-builder.ts, analysis/program-evidence*.ts, analysis/evidence-relation-provider*.ts, analysis/route-totality-field-proof*.ts and field-transfer modules.
- src/api/contracts.ts, route-totality-field-lineage-contracts.ts, projections/route-totality-field-lineage.ts; src/server/{routes,analysis-service,cache}.ts.
- src/frontend/src/overview/{DataTrajectoriesWorkspace,RouteTotalityWorkspace,RouteTotalityGraph,RouteTotalityInspector}.tsx; trajectory-url-state.ts; route-totality display, layout, model, field inspector, and disclosure modules.
- scripts/accept-route-field-proof.ts and focused field-proof, null/defense, unknown-boundary, and frontend tests.

## Ranked questions

1. What exact overview → preview → investigation → return workflow should we build? Give concrete entry points from treemap, dependency view, hotspot/finding, and source expression. Decide what the preview contains, when analysis starts, what opens, what stays visible, and how history restores focus, expansion, filters, and selection. Compare a dedicated Srcly detail surface, a separate-tool deep link, and an embedded/shared implementation. Score them on user orientation, semantic fidelity, distribution cost, implementation effort, and visual tractability. Recommend one route, with rejected alternatives.

2. What can each analyzer prove today, and what cannot it prove? Separate legacy render-sink analysis from current route/source/field proof. Trace actual code paths and fixtures for local and imported helpers, callback parameter binding, nullish/falsy fallbacks, valid defaults, type-impossible guards, NaN/non-finite values, shape widening, collection membership, and terminals. Distinguish implemented behavior from intended behavior. A null check is not a general invalid-value proof. Explain typed nullability versus runtime truth and where static evidence must stop. Do not label every fallback a defect.

3. What is the smallest concrete integration boundary that preserves the analysis depth? Compare importing evidence artifacts, a Node CLI child process from Srcly's Python server, a long-lived analyzer process, a shared library, and merging tools. Account for Srcly's uvx/Python distribution and the TypeScript compiler requirement. Explain package/runtime installation, process ownership, refresh and cache costs. Define the minimum semantic result and handoff request with sample JSON: repository identity and revision/content match, file/span/symbol/source/field/terminal identity, provenance, proof status, unknown/frontier and budget state. Keep a repository import graph distinct from a proven value graph. Use existing contracts when adequate. Explain which data is cached at repo scope and which is queried on demand.

4. How should deep traces become readable? Compare a focused path/ledger, expandable branches, an evidence inspector, and a small graph with an overview locator. Define compression that cannot hide fallbacks, joins, uncertain edges, or terminal identity. Show low-fidelity annotated layouts for the preview and deep workspace. Explain long chains, fan-out, cycles, same-name fields, many terminals, incomplete proof, and keyboard navigation. Identify likely structural causes of current visual failure from source; distinguish those inferences from observed browser evidence. Cite strong tools and research from current primary sources (for example CodeQL path explanations, IDE data-flow inspection, slicing, overview/detail and progressive disclosure). Extract principles, not a gallery of products.

5. What first vertical slice would validate the design, and what comes next? Name actual modules in both repos. Include one representative real source chain from the supplied code, small positive and negative semantic fixtures, a wide/intermediate/narrow browser acceptance scenario, docs and a runnable example in each user-visible milestone, runtime/latency measurements to collect, and a stop/rethink criterion. Keep the plan to the fewest useful delivery boundaries. No implementation or test edits in this research run. Respect tsx-data-flow's deferred test-work and no-build agent rules.

## Evidence rules and scope

Cite repository paths and symbols for code claims. Cite current primary documentation, papers, or upstream source with URLs for external claims. Separate facts, inferences, and proposed design. If documents conflict with code, show the conflict. State unsupported syntax and proof limits. Treat local edits as an in-progress snapshot, not accepted finished behavior. No demand validation, enterprise scale architecture, complete interpreter, runtime instrumentation platform, new language coverage, or broad rewrite by default. Codex will verify decisive claims and own all repository changes.

## Deliverable contract

Attach downloadable Markdown files and link each in the final answer. Full inline content is acceptable if files are unavailable.

1. research-report.md: decision paragraph first; answers to the five questions; source-linked capability table; options and scores; annotated layouts; semantic handoff/result examples; risks and open decisions.
2. implementation-plan.md: a worker can start the first milestone. Each milestone names repository/files, user behavior, analysis/transport/UI changes, acceptance checks, docs page, runnable example, main risk, and why it is a separate boundary.
3. recommendations.md: stable IDs with Build, Explore, Defer, or Avoid and one-line reasons. Build means include in the plan, not permission to implement.

Use one research response and no requests for polish. Finish with access status, files read, what you checked versus proposed, deliverable links, and unresolved questions. Do not commit or push.
