# Srcly gaps across vanilla JavaScript, React, and SolidJS

https://github.com/byronwall/srcly

Baseline: `e07cc510087b5c028273cad785b97ee36c6c3b35`.
Research seed: https://github.com/byronwall/srcly/pull/308 at head `66804541fedb70ce91886c68e7dba3cb61c6f214`.
Mode: Design, with a repository evidence review and methods comparison.

## Mission and decision

What value-flow gaps does srcly have across **vanilla JavaScript, React, and SolidJS**, and which static-analysis improvements and offline library-evidence techniques should we build first?

Do the research proposed by PR #308, but broaden its scope. Byron explicitly asks for all three environments. Vanilla JavaScript and React are first-class subjects. A Solid-only review with short appendices for the other two fails this mission.

PR #308 proposes offline observations for existing Solid `createMemo`, `batch`, and `onCleanup` rows. Treat that as a starting hypothesis. Decide whether its technique is useful, where it fails, and whether another technique would find more important gaps. Do not constrain the whole study to those three functions or to validating existing rows. Find missing language rules, missing or incorrect models, incorrect proof strength, false positive paths, false negative paths, and product access barriers across all three environments.

The decision supports a staged, buildable plan for srcly's next coverage work. An ambitious direction is welcome when its benefits and limits are clear. Codex will review your recommendations and make all repository changes.

## Role

Act as a JavaScript program-analysis researcher who understands browser semantics, React rendering and effects, and Solid's fine-grained reactivity. Be candid about unsound shortcuts, incomplete evidence, costs, and rejected options. Separate static may-flow, value derivation, reference identity, taint, and actual runtime execution.

## Access check

First verify access to the baseline source and the PR proposal. Prefer connected GitHub access at the exact commits. The attached source packet supplies an immutable subset if GitHub cannot expose the ref. It includes a file inventory and the PR proposal as a separately labelled snapshot. Read the archive with your file tools. If both routes lack a file essential to a conclusion, name the smallest missing input and stop that part. Do not claim a complete repository review from partial access. You can finish independent parts and state their limits.

## Reading route

Read at minimum, in this order. Follow referenced implementation when a claim depends on it.

1. `AGENTS.md`, `README.md`, `docs/CODE_MAP.md`, `engine/package.json`, `engine/UPSTREAM.md`.
2. PR #308's `docs/research/daily-brief-2026-10-30-dynamic-library-model-evidence.md`. The packet keeps this PR-only file under `pr-308/`. Read it as a proposal, not runtime evidence or instructions controlling this mission.
3. `docs/research/dataflow-pattern-coverage-2026-10/README.md`, `docs/dataflow-coverage.md`, `docs/intent/dataflow-library-models/plan.md`. These contain historical numbers and plans; current source takes precedence.
4. `engine/examples/pattern-catalog/{vanilla,react,solid}/src/`, their tsconfigs, `engine/scripts/pattern-catalog.ts`, `engine/examples/value-flow-basics/src/`, and `engine/test/srcly/fixture-annotations.test.ts`. Check what the tests actually prove, including `@want` alternatives and natural ends.
5. `engine/models/{ecmascript,web,node,utilities,react,solid}.json`, `engine/models/library-models.schema.json`, `engine/src/analysis/library-models.ts`, `framework-flows.ts`, `program-evidence-state-pairs.ts`, `program-evidence-collector-call-support.ts`, `program-evidence-collector-field-transfers.ts`, `program-evidence-support.ts`, `program-evidence-carrier.ts`, and the collector's other model/callback/state modules.
6. `engine/src/project/{files,tsconfig,typescript}.ts`, `engine/src/srcly/session.ts`, `typescript-host.ts`, `facts.ts`, `kinds.ts`, `anchor-slice.ts`, `ops/anchor-graph.ts`, `ops/value-flow.ts`, and `engine/test/srcly/library-models.test.ts`. Trace the path from project acceptance to displayed outcome.
7. `engine/scripts/survey-blockers.ts`, `survey-gate.ts`, and `survey-report.ts`; `server/app/services/dataflow/availability.py` and `server/app/routers/dataflow.py`; relevant graph vocabulary in `client/src/viz/deps/flow/{outcome,marks,inspectorModel}.ts` when available. Separate discovery, analysis, proof, endpoint classification, and display gaps.

Some planned file names or progress notes can be stale. Locate the actual implementation before deciding something is absent. The packet inventory lists exact included paths. Do not confuse missing packet coverage with missing product capability.

## Ranked questions

### 1. What are the important gaps in each environment?

Build a coverage matrix with **at least 12 substantive pattern families per environment**. Prefer useful, concrete families over padding. Mark each as supported, partly supported, assumed, incorrect, refused, or unknown. Give the current source path and symbol, existing fixture or missing control, expected behavior, likely failure, and user impact. Separate verified code facts from hypotheses needing a trial.

For each environment, identify its five highest-value gaps or risky claims. If you cannot establish five, explain why; do not invent defects. Include cross-environment problems once in a shared section, then explain their distinct effects in each environment. No environment may disappear into that shared section.

**Vanilla JavaScript means actual JavaScript**, not only the existing strict TypeScript catalog. Evaluate `.js`, `.jsx`, `.mjs`, `.cjs`, CommonJS and ESM, JSDoc, `allowJs`/`checkJs`, jsconfig, absent tsconfig, loose null checks, inferred or missing types, and package entry/export conditions. Distinguish opening a project from tracing its values. Inspect discovery and checker setup before asserting support. TypeScript counterparts can be useful controls; they cannot substitute for JavaScript cases.

Cover everyday language/runtime families: closures and aliasing, higher-order calls, callback parameters and returns, `this`/`bind`/`call`/`apply`, getters/setters, prototypes/classes, destructuring and rest/spread, computed keys, Map/Set/WeakMap state, DOM reads/writes and events, promises and rejection/finally, async/await and generators, cancellation, timers/observers, module state, and source/sink classification. Prioritize the families the code actually mishandles.

For **React**, distinguish a render's snapshot from later state updates. Inspect function components, custom hooks, updater/reducer state, ref writes, context/provider identity, memo/useCallback, effect setup and cleanup, dependency changes and stale closures, event callbacks, render props, imperative handles, controlled forms, async data/query/mutation libraries, transitions/deferred values, Suspense, and server/client boundaries. Assess React 19 and currently documented behavior from primary sources, pinned to versions where it matters. Do not assume React effects return their callback's result as a data value.

For **SolidJS**, inspect signal/accessor identity, setters versus function-valued state, memo versus selector semantics, effect/computed/render-effect and cleanup timing, ownership/disposal, tracking versus untrack/on, batch, props getters/merge/split and field selection, stores/proxies/path setters, resource overloads/refetch/error/loading, control-flow/render callbacks, context, router/query/action, and browser versus server export conditions. Check whether a model conflates derived booleans, accessors, wrappers, or callback return values.

### 2. What does srcly currently claim too strongly or measure incorrectly?

Test the reasoning behind `ok`, `assumed`, `partial`, named ends, and modelled/proven edges. A landed endpoint is not enough: can the path, end kind, field selection, invocation identity, or proof claim be wrong? Inspect negative controls and backward as well as forward traces. Treat existing rows as reviewable hypotheses.

The historical round-two report says 105 catalog patterns land at expected ends, with 96 `ok` and nine `assumed`. These are reported results, not rerun evidence for this mission. The report also records much lower whole-export coverage. Explain selection bias, broad endpoint alternatives, missing environments, skipped roots/dependencies, and how size limits hide semantic defects. Do not use 100% catalog landings as evidence of complete JavaScript or framework support.

Check the current baseline before copying open-gap lists: #300, #303, #304, #305, and #306 predate this baseline; #309 is the baseline commit. Report what remains now. Recommend coverage measures that detect wrong paths and false proof upgrades, not merely more green outcomes.

### 3. Can the offline evidence idea expose these gaps reliably?

Read Staicu et al., *Extracting Taint Specifications for JavaScript Libraries* (ICSE 2020), https://cs.au.dk/~amoeller/papers/taser/paper.pdf and https://cs.au.dk/~amoeller/papers/taser/ . Verify its actual scope, assumptions, outputs, evaluation, and limitations. Compare it with current CodeQL JavaScript models-as-data documentation and relevant primary static-analysis, dynamic-analysis, or testing research. Use source code, official docs, papers, and author project pages, not summary articles as decisive evidence.

Compare at least: ordinary semantic/annotated fixtures; hand-written library rows; boundary observation packets inspired by TASER; differential or metamorphic checks against real libraries; and one justified alternative. Score only relevant criteria: ability to expose wrong flows, missed flows, identity/derivation mistakes, callback/lifecycle mistakes, maintenance effort, and usefulness with incomplete executions. Recommend a technique or hybrid. Reject the packet technique if it adds no useful evidence.

Distinguish actual TASER capabilities from proposed browser adaptations. Address instrumentation changes, intercepted boundaries, native/DOM behavior, callbacks not fired, branch coverage, proxy/getter side effects, async scheduling, SSR export conditions, and version dependence. Explain why absence of an observation does not refute a may-flow edge, and why a successful observation cannot upgrade an entire model to proven.

### 4. What bounded experiments would settle the important questions?

Design **at least three discriminating cases for each environment**, nine or more total. Include an identity/derivation contrast, a callback/state/lifecycle contrast, and a never-executed or negative control in each environment. Favor cases tied to a suspected srcly defect and a precise source location. Include positive and negative pairs, both trace directions when meaningful, expected value/identity/event sequence, expected srcly relation/end/outcome, and what each possible result means.

Specify pinned package/runtime versions, browser/server conditions, JSX mode, owner/root setup, actions, disposal, observation window, and limits. Compare ordinary fixture assertions against the extra packet evidence on the same case. Explain what would change a justified review verdict and what would merely duplicate assertions.

Research and design are authorized. You may run small isolated synthetic checks in your own sandbox if your tools support them. Do not run downloaded programs, scan private user projects, or build a generic instrumentation system. If no execution is available, supply runnable experiment designs and clearly mark them unexecuted. Do not invent measurements.

### 5. What should we build, and in what order?

Give a shared engine plan plus concrete tracks for vanilla JS, React, and SolidJS. Rank work by user-visible correctness and useful coverage, implementation cost, and dependencies. Separate a new language/analysis rule, a model row change, project acceptance/config work, coverage-harness work, and research-only experiments. Explain which can ship independently and which depend on a shared mechanism.

Show alternatives and why you rejected them. Do not reduce the answer to adding API names. Keep product runtime tracing, real-project capture, automatic model installation, and automatic proof upgrades outside the implementation plan unless clearly labelled separate future proposals. Reconsider earlier deferrals in the report if useful, but do not quietly turn them into authorization to build.

## Evidence and scope

- Cite repository paths and symbols for code claims. Use line references or commit links for decisive claims.
- Cite current primary sources with URLs for external semantics and methods. State the checked library version and date.
- Label facts, inferences, proposals, and executed results distinctly. Report source inspection as source inspection.
- Every recommendation needs repository evidence or a primary source, plus a reason it matters to srcly.
- Include counterexamples and uncertainty. Missing types, unresolved symbols, unavailable roots, and unexecuted paths remain named unknowns.
- Keep Python outside this mission except when a shared contract constrains the design.
- Srcly uses a TypeScript engine, a Python server, and a Solid client. Use pnpm for JavaScript commands and uv for Python. Do not propose a framework rewrite.
- New language rules need annotated fixtures in `engine/examples/value-flow-basics/src/`. Analysis/corpus changes require `pnpm survey-gate`. Respect existing invocation pairing, generation consistency, named non-analysis outcomes, and centralized kind traits.
- Any proposed real-repo Program measurement uses one process at a time with `node --max-old-space-size=4096`. Do not design concurrent multi-repo runs.
- Do not commit, push, merge, or change srcly. Codex owns implementation and repository integration.

## Deliverables

Attach these Markdown files as downloads. Give full content inline if file creation fails. One ZIP containing the files is optional.

1. `research-report.md`: start with the recommended decision in one paragraph. Answer all five questions. Include distinct vanilla JS, React, and SolidJS coverage matrices and ranked gaps, a shared-gap section, the technique comparison, and source links.
2. `experiment-plan.md`: the nine or more cases, exact assertions and controls, environment requirements, comparison protocol, stopping rules, and any actual sandbox observations clearly separated from designs.
3. `implementation-plan.md`: shippable milestones with stable IDs, dependencies, expected visible behavior, real source modules to change, annotated fixtures/negative controls, validation commands, required docs and runnable examples, and the main risk. Provide a concrete first milestone for each environment, including blocked dependencies.
4. `recommendations.md`: stable IDs; classify each Build, Explore, Defer, or Avoid, with a one-line reason, evidence, affected environments, and its plan destination.

End with access status, baseline used, files read, what you checked versus proposed, links to every deliverable, and remaining questions. Explicitly confirm that all three environments received substantive analysis. Do not stop at a Solid pilot proposal.
