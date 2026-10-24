# Effects, async boundaries, and test seams across Srcly and TSX Data Flow

https://github.com/byronwall/srcly

Source commit: `aea1015258f56dd45b8e175f7288e2fef3abc6cf`.

https://github.com/byronwall/tsx-data-flow

Source commit: `b4f1ba4f0df402251f4b666cddf5312efa4a62be`, plus the supplied local edits.

Mode: Design, with an algorithm and static-analysis methods deep dive.

## Primary mission

What should Srcly add so Byron can inspect a function, see its transitive effects and async boundaries, find useful test seams, and understand tangled execution paths? Decide how Srcly and tsx-data-flow should share this work. End with a buildable first slice and a staged direction.

Byron wants to spot-check logic that is simple and isolated, follow chains of pure transformations, and distinguish these from stateful orchestration and concurrency. He wants to understand flows and call stacks, then identify better architectural boundaries. He is a personal developer. Useful evidence and inspectable examples matter more than a general enterprise analysis platform.

Act as a programming-languages and static-analysis researcher who has shipped developer tools. Give candid tradeoffs and rejected options. Research deeply, but keep the proposed implementation direct.

## Access check

First confirm access to the attached source packet. It is authoritative for the recorded snapshot, including uncommitted tsx-data-flow edits. Its two directories are separate repositories. `SNAPSHOT.md` records file selection and status. Do not treat an older design document as current capability. If decisive files are missing from both packet and connected GitHub, stop and name the smallest missing input. Do not claim a complete repository audit from partial access. You may inspect source and tests; do not run applications, builds, or test suites.

## Reading route

Read at minimum:

1. Both `AGENTS.md`, `README.md`, and package manifests. Srcly: `docs/CODE_MAP.md` and `docs/intent/dependency-view/implementation-plan.md`. TSX: `docs/analyzer.md`, `docs/product-pillars/02-current-capability-audit.md`, `03-core-semantic-primitives.md`, and `docs/plans/major-rewrite/README.md`. Verify historical claims against source.
2. Srcly: `server/app/services/deps/{common,graph,typescript_deps,python_deps,tsconfig}.py`, `server/app/models.py`, `server/app/services/focus_overlay.py`, `server/app/services/typescript/typescript_analysis.py`, `analysis_types.py`, `metric_catalog.py`, and `markers.py`.
3. Srcly: `client/src/viz/deps/{contract,hierarchy,viewModel,layout,DependencyView,DependencyCanvas}.tsx` or `.ts` as present; `client/src/components/CodeModal/`, `client/src/navigation/`, and `client/src/utils/hotSpotRanking.ts`. Trace the actual graph endpoint in `server/app/routers/analysis.py`.
4. TSX: `src/types.ts`, `src/core.ts`, `src/analysis/source-call-classification.ts`, `program-evidence.ts`, `program-evidence-collector.ts`, `program-evidence-collector-call-support.ts`, `program-evidence-boundary-support.ts`, `program-evidence-support.ts`, `program-callback-return.ts`, and related evidence, call, boundary, relation, and helper modules. Inspect route/field evidence only where useful. Distinguish semantic proof from heuristic labels.
5. Representative real examples: Srcly `client/src/utils/{hotSpotRanking,dataProcessing}.ts`, `client/src/state/scanStore.ts`, `client/src/services/scanJobs.ts`, `server/app/services/{scan_jobs,scan_workers,analysis}.py`; TSX `src/server/analysis-service.ts`, `src/analysis/program-evidence-loading.ts`, and checked-in `examples/`. Choose short chains that expose meaningful differences.
6. Srcly `server/tests/test_dependency_graph_*.py`, metric/marker tests, and dependency-view tests. TSX `test/` fixtures relevant to call resolution, helper boundaries, program evidence, and resources. Report assertions actually present, not only proposed tests.

## Ranked questions

### 1. What can “pure”, “simple”, and “safe to test” honestly mean here?

Give a precise practical taxonomy. Separate determinism, observable effects, ambient reads, input mutation, local mutation, throws, allocation, termination, resource ownership, and unknown calls. Explain why low complexity and purity are different. Distinguish direct and transitive effects; constructing a callback from invoking it; effectful closure capture from inert capture; synchronous invocation from later execution.

Compare binary labels, conservative multi-state labels, and effect summaries. Recommend a model that supports useful pure chains without falsely proving purity. Address aliases, fresh versus escaping objects, getters/proxies, higher-order callbacks, dynamic dispatch, recursion/SCCs, third-party code, lazy iterators, and import-time code. Define explicit unknown and partial-analysis states. Explain what can be practical now versus research-level proof.

### 2. How should sync, async, and concurrency boundaries be modeled?

Separate `async` declarations, promise-returning calls, suspension at `await`, promise chains, scheduling, callbacks, parallel starts, joins, cancellation, and resource cleanup. Include `Promise.all/allSettled/race`, floating promises, `forEach(async ...)`, timers, listeners, Solid signals/memos/effects/resources, Node workers, and Python threads/process workers where the current code makes these relevant.

Explain the difference between static call graphs, control flow, data flow, causal/event flow, an actual runtime call stack, and an async trace. State what static analysis cannot establish about execution order or races. Compare a static-first design with optional runtime tracing later. Give useful visual semantics for “this may call”, “this schedules”, “this awaits”, “this joins”, and “unknown”.

### 3. What can we reuse, and where should the semantic engine live?

Audit both repos against these goals with a capability/gap table. Verify whether Srcly's symbol edges are usage/import relationships or real call-site relationships. Verify whether TSX's host-call categories actually describe effects. Compare extending Srcly's Python/tree-sitter analysis, adding a TypeScript compiler worker, using tsx-data-flow as a CLI/library/service, and extracting a small shared kernel. Score options on call-target accuracy, effect propagation, evidence quality, implementation effort, and maintenance for one developer. Recommend ownership of analysis, contracts, UI, and Python support. Do not demand a shared framework before a useful slice.

Use current primary sources from tools, research papers, and implementations. Consider relevant work such as effect systems, escape/alias analysis, abstract interpretation, interprocedural summaries, program slicing, CodeQL, WALA/OPAL or comparable call-graph tools, and JS/TS-specific tooling. Select only useful comparisons. Explain tooling licenses and deployment implications if they decide the recommendation.

### 4. How does this become a concrete testing and architecture workflow?

Work through at least three source-grounded chains across both repos: isolated transformation logic, stateful async orchestration, and a mixed or unresolved case. Include exact paths/symbols and short annotated excerpts. Show the classification, effect witness path, async boundary, analysis limits, recommended test seam, and what assertions belong there.

Distinguish unit, property, contract, integration, and concurrency/lifecycle tests by the behavior they protect. Do not recommend tests merely because a function exists. Explain pure-region extraction, imperative-shell/functional-core tradeoffs, dependency cuts, cycles, shared-state coupling, and fan-in/fan-out. Propose a few explainable tangle signals. Avoid presenting arbitrary scores, folder clusters, long traces, or every side effect as architectural defects.

### 5. What should Byron see in Srcly, and what should be built first?

Design a practical spot-check workflow: find a candidate, open code, see direct/transitive effects and their witnesses, follow callers/callees, inspect a bounded execution slice, locate a pure region or orchestration seam, and choose a testing/refactor action. Give example screens or compact text diagrams. Separate import edges, calls, data dependencies, and scheduling. Reuse existing graph, code-viewer, markers, metric catalog, and navigation where they fit. State where a new view is warranted.

Define the minimum useful data contract: function identity, call-site span and target resolution, summaries, effect evidence and propagation witnesses, async relationships, unknown frontier, and analysis scope. Distinguish categorical evidence from numeric metrics; specify valid rollups and N/A. Include pseudocode for the recommended propagation algorithm, recursion handling, and bounded witness traversal. Address realistic analysis cost and cache invalidation without inventing version coexistence infrastructure.

End with one small vertical proof using named real functions and a compact synthetic fixture. State exact expected classifications and edges for false-positive/false-negative cases. Follow with only the milestones needed for meaningful delivery boundaries. Name files/modules, runnable examples, acceptance checks, risks, and stop criteria. Prioritize what to add to Srcly now, what TSX must supply, and what to defer.

## Evidence and scope

- Cite repository paths and symbols for code claims. Mark facts, inferences, and proposals when unclear.
- Cite current primary-source URLs for decisive external claims. Say when evidence is missing.
- Focus on TS/TSX first; explain Python reach and gaps because Srcly has a Python backend. Do not imply language-neutral effect proof from syntax counts.
- Keep the neighboring “Srcly overview to precise value-flow investigation” mission separate. This mission concerns effect propagation, async behavior, and test seams. Explain overlap without replacing this question with a general lineage viewer.
- Do not commit, push, modify source, or implement the proposed feature. Codex will review and integrate the research.
- Use pnpm for JS/TS commands and uv for Python commands. Plan few meaningful tests. No enterprise platform, automated mass refactor, new persistence system, or default runtime instrumentation.

## Deliverables

Attach downloadable Markdown files and link each in your final answer:

1. `research-report.md`: a decision paragraph first, then the deep dive answering all five ranked questions. Include the capability table, alternatives, worked chains, algorithms, UI examples, sources, and known limits. Depth is welcome when it changes the design.
2. `implementation-plan.md`: a worker-ready first vertical slice, followed by justified milestones. Include files, exact fixture expectations, acceptance checks, main risks, and the documentation/runnable example each slice needs.
3. `recommendations.md`: stable IDs with Build, Explore, Defer, or Avoid and a one-line reason. Build means include in the plan; it does not approve implementation.

A ZIP containing these files is optional. Do not generate manifests or hash files. If attachments cannot be made, give complete content inline. End with access status, files read, what you checked versus proposed, download links, and essential open questions.
