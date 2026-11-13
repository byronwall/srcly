# Recommendation dispositions — effects, async boundaries, and test seams

This register belongs to the effects/async/test-seams mission. It is separate from the neighboring general value-flow investigation. IDs are stable within this mission; later decisions should preserve an ID and record a changed disposition rather than silently renumbering.

**Build** means the work is included in [implementation-plan.md](implementation-plan.md), not that implementation is approved. **Explore** means a named uncertainty deserves a bounded experiment before committing. **Defer** means potentially useful later, unnecessary for the first delivery. **Avoid** means the approach would undermine this mission's evidence or scope.

Evidence and tradeoffs are in [research-report.md](research-report.md). All recommendations use the attached authoritative source and local edits; no application/build/test execution or source changes were performed.

## Dispositions

| ID | Disposition and recommendation | One-line reason |
| --- | --- | --- |
| **EAT-001** | **Build · M1 — TSX-owned function-effects pass** | Existing compiler/project machinery is the closest semantic foundation; Srcly should not recreate TypeScript binding in Python. |
| **EAT-002** | **Build · M1 — Exact supported call occurrences and target frontiers** | Real call sites, aliases and target completeness are necessary because current Srcly symbol edges are imports/usages. |
| **EAT-003** | **Build · M1 — Fact summaries plus independent coverage/assumptions** | Known effects, ambient reads and uncertainty must coexist instead of collapsing into a purity boolean. |
| **EAT-004** | **Build · M1 — Bounded origins and parameter substitution** | Fresh local writes and input/borrowed writes need different classifications without a whole-heap framework. |
| **EAT-005** | **Build · M1 — Activation channels and promise dispositions** | Closure creation, eager invocation, deferred triggering and await/return/discard have different consequences. |
| **EAT-006** | **Build · M1 — SCC fixed points and bounded source witnesses** | Recursive effects must converge while explanations remain short and tied to actual call sites. |
| **EAT-007** | **Build · M1 — Direct API, one-shot JSON CLI and one Srcly adapter** | A concrete Python-to-TypeScript boundary delivers value without a mandatory resident service or shared package. |
| **EAT-008** | **Build · M1 — CodeModal Effects panel** | Existing code/marker UI can expose useful facts and unknowns before a new graph is justified. |
| **EAT-009** | **Build · M1 — Exact source spans and stale-source checks** | An evidence witness is misleading if name heuristics, UTF-16 mismatch or changed source open the wrong code. |
| **EAT-010** | **Build · M1 — Three real anchors, compact trap fixture and runnable docs** | One closed leaf plus ambient/network partial chains demonstrates useful precision and honest limits. |
| **EAT-011** | **Build · M2 — Bounded typed execution slice** | Callback branching and cleanup need a dedicated relation model once the simpler inspector has proved useful. |
| **EAT-012** | **Build · M2 — watchScan lifecycle and promise coordination models** | EventSource/timers and all/allSettled/race/forEach provide concrete starts, triggers, joins and cleanup cases. |
| **EAT-013** | **Build · M1 — Keep categories separate from metrics and preserve N/A** | Effect sets are neither additive risk measures nor runtime execution counts. |
| **EAT-014** | **Build · M1 — Scope, model and module-initialization disclosure** | A closed function body does not establish safe import setup or complete project/dependency coverage. |
| **EAT-015** | **Build · M1 — Evidence-led test-seam walkthrough** | Transform, contract and lifecycle seams protect different behavior; stateful controllers can be excellent test targets. |
| **EAT-016** | **Explore — Version-pinned Solid models** | Initial memo/resource/effect activation and overloads differ; a concrete installed-version example should drive the model. |
| **EAT-017** | **Explore — Node worker/request lifecycle evidence** | The TSX service offers a valuable case, but message correlation, shared buffers and cooperative cancellation exceed M1. |
| **EAT-018** | **Explore — Python thread/process semantic adapter** | Srcly's supervisor deserves language-specific evidence; TS syntax counts cannot supply Python execution semantics. |
| **EAT-019** | **Explore — Narrow container-element and escaping-origin precision** | rankHotSpots wrapper mutation can motivate a bounded origin rule after useful partial summaries exist. |
| **EAT-020** | **Explore — Jelly/CodeQL comparison on selected unresolved targets** | External tools can benchmark precision tradeoffs without becoming required deployment dependencies. |
| **EAT-021** | **Explore — Explainable tangle signals** | Shared-state crossings, resource ownership and stateful SCCs are inspectable reasons; their usefulness needs user review. |
| **EAT-022** | **Defer — Optional observed runtime trace overlay** | Static evidence serves the mission without instrumentation; observed paths later add causality but cannot prove absence. |
| **EAT-023** | **Defer — Resident service, reusable semantic cache and incremental invalidation** | Measure one-shot latency first, then choose the single smallest improvement that addresses an observed cost. |
| **EAT-024** | **Defer — Shared semantic kernel/package** | Cross-repository packaging and generic abstractions are unnecessary before a concrete reusable boundary emerges. |
| **EAT-025** | **Defer — Whole dependency graph analysis and general heap/path proof** | Native/library behavior, reflection and path-sensitive ownership would overwhelm the personal first slice. |
| **EAT-026** | **Defer — Value-flow UI integration beyond identity/source mechanics** | Effect/activation questions must remain independently answerable rather than becoming a route-field lineage project. |
| **EAT-027** | **Avoid — Purity/testability/risk score or unconditional “safe” badge** | A scalar would conceal ambient dependence, partial analysis, lifecycle obligations and harness assumptions. |
| **EAT-028** | **Avoid — Name-only host models or reusing opaque/proven labels as effect proof** | Shadowed fetch, user methods, callback timing and heuristic boundaries can otherwise produce false certainty. |
| **EAT-029** | **Avoid — Relabeling dependency edges or using folder rollups as execution** | Import usage and merged folder relationships lose the occurrence and temporal semantics this mission requires. |
| **EAT-030** | **Avoid — Automated mass refactoring or treating every effect as a defect** | The desired outcome is an inspectable architectural/testing decision, including the decision to leave good ownership intact. |

## Build-to-plan map

| Delivery | Build IDs | Reviewable result |
| --- | --- | --- |
| **M1 — default first delivery** | EAT-001–010, EAT-013–015 | TSX summary/CLI, Srcly inspector, exact witnesses, honest coverage, fixture and walkthrough |
| **M2 — after M1 review** | EAT-011–012 | Typed bounded lifecycle slice for watchScan and promise coordination |

No Explore, Defer or Avoid item is an unlisted Build dependency. In particular, Solid completeness, Python effects, a shared kernel, a resident service, tracing and route-field UI integration must not block M1.

## Decision defaults and reconsideration triggers

- **Default:** configured first-party TS/TSX, ordinary-data/intrinsic assumptions, explicit unsupported frontiers, no reusable cache in M1.
- **Reconsider process lifetime** only after measured repeated startup cost obstructs the inspector.
- **Reconsider heap precision** when a named useful function remains partial specifically because of a small reproducible origin gap.
- **Reconsider a new view** when code plus witness list cannot explain a chosen lifecycle; M2 supplies that concrete boundary.
- **Reconsider tracing** when an actual observed ordering question cannot be answered statically and the user wants an instrumented experiment.
- **Reconsider Python coverage** with a specific thread/process lifecycle question and a Python-appropriate target/activation model.

The central quality gate is unchanged across future decisions: preserve known evidence, preserve unknowns, distinguish activation from result handling, and make each claim navigable to the authoritative source.
