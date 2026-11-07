# Pro research mission: dependency analysis and investigation UI

Repository: https://github.com/byronwall/srcly
Prepared: October 28, 2026
Baseline: `ee8a771ce94fb59573492445d0f5fa2411ad83c8` on main.
Status: research assignment; findings and experiments are not yet completed.
origin: repo-reading-brief
Stable topic ID: `srcly.dependency-analysis-tool-ui-deep-dive.v1`

## Mission

Investigate how IDEs and other source-analysis tools compute, explain, and let developers navigate dependencies. Produce a deep primary-source study and a concrete design handoff for Srcly. Give analysis semantics and the user interface equal weight. Go beyond a gallery of graph screenshots: reconstruct the interaction from a developer's question through selection, query, result, evidence, expansion, and return to code.

The user requests a broad investigation of IDEs and other tools, attached to Srcly. Thin Slicing is the motivating reading, not a predetermined answer. Recommend the smallest useful first slice, with alternatives and rejection criteria. This is a personal local developer tool; enterprise infrastructure is not a default requirement.

## Origin and current evidence

Source edition: [October 28 reading brief, section 3](https://chatgpt.com/space/page_892fe1c3f46081919af32c827335b1b2).
Original paper: Sridharan, Fink, and Bodík, [Thin Slicing, PLDI 2007](https://manu.sridharan.net/files/pldi07.pdf).

The brief asks which dependency kinds deserve the first screen, with explicit expansion into execution conditions and alias/object identity. Re-read the paper, especially sections 2–6. Its reported reductions concern simulated breadth-first statement inspection, not measured developer speedups. A thin slice is not an executable extracted program. Do not transfer Java pointer assumptions to JavaScript without justification.

[Merged #255](https://github.com/byronwall/srcly/pull/255) added the [TSX audit](../tsx-dataflow-audit-2026-10/README.md). Its author-scored rubric improved from 47 to 77 of 112; Focus remained 7/16. The audit reports 555 values across 74 functions for one route and action-wrapper dead ends for a save payload. These are historical audit observations, not measurements reproduced for this assignment.

The current audit backlog already owns component folding, repeated gap messages, action-parameter traversal, branch vocabulary, and first-query latency. Read the corresponding Product Grid context before proposing work. Research should explain what other tools teach us beyond those existing tasks.

Preparation inspected root instructions, README, code map, audit PR, `anchorAdapter.ts`, and `kinds.ts`. At the baseline, the adapter has a 40-box function-fold budget, maps raw nodes to displayed boxes, and deduplicates displayed edges by endpoints. The kinds registry distinguishes structural relationships, cross-call pairing, some control/transform roles, and proof strengths. Those facts do not establish that Srcly already records every dependence needed by a thin-slicing presentation. Pro must audit the full path.

## Ranked questions

1. Which developer questions need import/module, symbol-reference, call, value/data, control, alias/heap, effect, framework/reactive, or runtime dependencies? Define the distinctions and their guarantees before comparing products.
2. How do strong IDEs turn these into usable workflows? Study the entry point, default scope, direction, call context, stopping rule, source preview, expansion, history, and handling of incomplete analysis.
3. How do specialized analysis tools expose paths, witnesses, uncertainty, and large results? Which mechanisms transfer to Srcly, and which rely on different language semantics, whole-program assumptions, or runtime instrumentation?
4. What should Srcly show first for “where does this value come from?”, “where does it go?”, “what permits this write?”, “what does this function touch?”, and “what could this change affect?” Compare a graph with a source-first tree/list and an ordered evidence ledger.
5. What is the smallest buildable improvement, what evidence must the engine preserve for it, and what experiment could show that keeping the current UI is better?

## Repository reading route and access

Read `AGENTS.md`, `README.md`, `DESIGN.md`, and `docs/CODE_MAP.md` first. Follow the code map to actual files; do not infer behavior from path names.

Read at minimum:

- `docs/research/tsx-dataflow-audit-2026-10/README.md` and `docs/research/python-dataflow-audit-2026-10/README.md`, including their screenshots and limitations.
- `docs/intent/dependency-view/`, `docs/intent/dataflow-robustness/`, `docs/intent/tsx-dataflow-integration/`, and relevant existing value-flow/effects research. Old plans are context, not current implementation proof.
- `pgm/data`: current open tasks, especially `area-data-flow-tsx-usability-audit-2026-10`. Distinguish implemented behavior, open work, and older unmerged research.
- Import graph collection under `server/app/services/deps/` and the dependency UI under `client/src/viz/deps/`.
- `engine/src/srcly/kinds.ts`, `anchor-slice.ts`, `anchor-words.ts`, `ops/anchor-graph.ts`, and `contracts/anchor-graph.ts`; follow their actual collector, traversal, call-context, model, proof, and frontier dependencies.
- `client/src/viz/deps/flow/anchorAdapter.ts`, `FlowInspector.tsx`, other flow adapters, view models, layout and selection state; source selection and navigation integration.
- Engine-to-server-to-client contracts and tests, `engine/examples/value-flow-basics/src/`, annotated fixture runner, adapter tests, and relevant browser tests.

Identify the source-to-query-to-projection-to-display route with precise symbols and line links at the pinned commit. Audit losses at scope folding, reference removal, edge deduplication, multi-anchor merge, and path emphasis. A visible path must retain a compatible underlying witness; joining unrelated invocation contexts is not a valid value-flow explanation.

The embedded `engine/` is now Srcly's engine; read `engine/UPSTREAM.md` before assuming a separate tsx-data-flow checkout is authoritative. If an attached source packet exists, report its baseline, completeness, and local edits. None is supplied by this PR. Do not claim it contains a runnable snapshot or private local code.

Proceed when the pinned source and external primary research are available. If critical code or product UI is unavailable, name the gap, continue supported parts, and limit conclusions. Do not substitute a generic tool essay for the Srcly audit or claim hands-on use from documentation alone.

## Comparative coverage

Survey at least 12 distinct tools across the categories below, with at least six detailed workflow case studies, including three IDE families and three specialized tools. Breadth should discover alternatives; depth should drive recommendations. If a candidate is obsolete, inaccessible, redundant, or lacks the relevant feature, record that and choose a better exemplar. Verify current capabilities and versions; this is a candidate list, not a feature claim.

| Category | Candidate leads | Questions to investigate |
| --- | --- | --- |
| JetBrains IDEs | IntelliJ IDEA, WebStorm, PyCharm, Rider | Analyze Data Flow to/from Here, caller/callee trees, dependency analysis, scopes and source previews; verify per-language availability |
| Editor and language services | VS Code with TypeScript/Pylance, rust-analyzer | references, call/type hierarchies, peek, incremental indexing, query cancellation and unsupported operations |
| Other IDE traditions | Eclipse JDT, Visual Studio | call hierarchy, reference/code maps, slicing or debugger views where actually supported |
| Semantic code navigation | Sourcegraph, SciTools Understand, Sourcetrail historical design | navigation/search versus semantic flow, graph locality, history, source linkage and evidence |
| Security/data-flow tools | CodeQL path queries, Semgrep data flow, Joern | source/sink paths, path explanations, library models, constraints, false positives and trace limitations |
| Architecture/dependency tools | NDepend, Structure101, dependency-cruiser, Madge | cycles, matrices, hierarchy, impact, aggregation and rule violations |
| Runtime or research exemplars | debugger data breakpoints, dynamic slicing, Thin Slicing and subsequent work | observed versus possible flow, execution conditions, why/why-not explanations and relevance ordering |

For IDE features, do not count products sharing one mechanism as independent evidence. Include TS/TSX and Python relevance. Study strong Java/C#/C++ designs even where their algorithms do not transfer.

For each tool, record version/date, supported language, analysis input, precise dependency meaning, granularity, query direction, context/field/flow sensitivity where documented, library/framework modelling, completeness limits, setup and query costs, and license/access constraints relevant to adoption. Mark undocumented internals unknown.

For each deep case, provide a reproducible click/command sequence and annotated screenshot or official UI figure when accessible. Label evidence as personally exercised, inspected official demo/screenshot, documentation-only, source inspection, or inference. Include exact source URLs and retrieval dates. Prefer official docs, public implementation, original papers, and maintainer design accounts. Vendor claims are not independent usability evidence.

## UI investigation checklist

Analyze these dimensions together rather than as isolated feature checkboxes:

- Entry and question: exact expression versus symbol/file/route, what is selected, defaults and scope.
- First answer: relevance ranking, one path versus all paths, graph/tree/list/ledger/matrix, meaningful labels and source preview.
- Expansion: producers, execution conditions, object identity, callers, library internals and framework boundaries; how hidden evidence is signalled and restored.
- Orientation: stable layout during selection/expansion, direction changes, keyboard interaction, breadcrumbs, history, undo, deep links and return to originating code.
- Honesty: possible versus observed, modelled versus proven versus assumed, partial/unsupported/budget/stale outcomes, and the distinction between no path found and proof of no dependency.
- Scale: cycles, recursion, multiple call sites, many aliases, large fan-out, repeated gaps, lazy queries, caching and cancellation. Separate rendering savings from analysis cost.
- Practical readability: source names, field paths, branch labels, terminal summaries, colors without relying on color alone, keyboard access, dense desktop and narrower screens.

Include mechanisms that failed or were abandoned where primary evidence exists. Explain when each representation is a poor fit. “Fewer boxes” is not itself a success criterion.

## Semantic design constraints

Maintain separate contracts for import reachability, calls/references, and value dependence. A call graph is not a data-flow proof; syntactic references are not all runtime uses. Static possibility is not observed execution.

Investigate producer-first explanation with explicit control/alias expansion against alternatives. Never silently drop a branch condition and imply a write is unconditional. A callback can both carry a value and control its execution. Distinguish identity/alias evidence from producer evidence without inventing precision the engine lacks.

Trace proof/provenance through every UI projection. For each proposed collapsed edge or summary, specify raw witnesses, invocation context, hidden nodes/relations, status, and expansion behavior. Preserve named unsupported boundaries and generation consistency. Missing analysis is never zero.

Any new analysis requirement must identify the missing fact, its producer, contract change, consumer, annotated negative fixture, and cost. Prefer reuse where evidence is sufficient. Do not assume UI filtering can repair absent engine facts or that a graph library solves semantic relevance.

## Bounded evaluation

Use the current folded UI as the baseline. Reuse the audit's four TSX questions and representative Python tasks. At minimum, specify three small fixtures: a resource callback passing a value, a closure storing and returning a value, and a branch-controlled save. Add a two-call-site negative case and an unsupported-library boundary.

Hand-label ground-truth answers for both “where from/to?” and “under what condition?”. Compare:

1. Current function/component folding and inspector.
2. Producer-first explanation with explicit condition/identity expansion.
3. Source-first dependency tree or ordered ledger with optional graph.

Provide task scripts, expected witnesses, required context, and mock screen states for initial result, expansion, source inspection and return. Record answer correctness, false unconditional claims, unrelated-context paths, relationships inspected, expansions, time to a correct explanation, orientation errors, and cold/warm latency separately.

Reuse the audit's rubric where suitable. Small qualitative tests do not establish universal speedups. Report executed experiments separately from proposed ones. Reject an approach if it conceals material conditions or unsupported boundaries, invents paths, loses source anchoring, or costs more interaction without improving correct answers. Recommend keeping the baseline if evidence does not support a change.

## Deliverable contract

Return complete standalone Markdown/JSON companions and a ZIP when available:

- `research-report.md`: synthesis, taxonomy, Srcly architecture/semantic audit, detailed case studies, tradeoffs, and ranked conclusions.
- `tool-survey.md`: compact comparisons plus deep workflow walkthroughs and sourced UI evidence.
- `ui-patterns.md`: transferable patterns, counterexamples, annotated mock states and at least three coherent alternatives.
- `srcly-gap-map.json`: stable IDs, current evidence/path/symbol, existing backlog overlap, missing semantic/UI capability, candidate mechanism, confidence and proposed disposition.
- `evaluation-plan.md`: fixtures, tasks, oracles, baseline, measurements, rejection gates, and explicit run status.
- `recommendations.md`: stable recommendation IDs; adopt/investigate/defer/reject proposals, evidence, prerequisites, relative cost and smallest first proof.
- `handoff.md`: one preferred first slice, affected files/contracts, rollout cut line, acceptance criteria, unresolved decisions and verification instructions.
- `sources.md`: primary links, versions/dates, access/evidence mode, source limitations and claim mapping.

Deliver findings, not just this prompt rewritten. Every consequential recommendation must connect an observed Srcly limitation to an external mechanism and a testable decision. Give overlapping backlog items an explicit reuse/extend/already-owned disposition. Separate repository facts, externally documented facts, inferences and proposals. Include at least one substantive rejection and reasons the preferred approach might lose.

## Authority and provenance

Pro's assignment is read-only research and planning. Do not change application code, open another PR or issue, merge, deploy, or alter settings. Codex will independently verify decisive claims and integrate the results. Recommendations are proposals, not approved product decisions.

This PR prepares the assignment only. No external comparative study, proposed usability experiment, application test, or runtime benchmark has been executed as part of preparation. External tool names above are research leads, not verified feature findings.

Assistant-generated research. Exclude this PR, branch, document and derivative assistant research from future substantive-activity ranking. They are not independent product progress or demand.
