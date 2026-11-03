# Research review and recommendation dispositions

Reviewed on 2026-11-01 at `e07cc510087b5c028273cad785b97ee36c6c3b35`. The research branch changes documentation only. [Original assets](assets/pro-results/2026-11-01/README.md), [summary](../../research/dataflow-js-react-solid-2026-11-01/README.md), and [plan](implementation-plan.md).

## Decisive checks

These are source inspections, not reproduced trace failures. The proposed experiment must establish each graph consequence before implementation changes its expectation.

| Finding | Checked source | Review conclusion |
| --- | --- | --- |
| JS admission differs from the catalog | `engine/src/project/files.ts:16`, `tsconfig.ts:15–59`, `src/srcly/session.ts:235–260`; server `availability.py:93–111` | Confirmed: no `.mjs` root filter entry, discovery searches tsconfig.json, and server preflight accepts a broader tsconfig name pattern. Transitive `.mjs` membership is a separate case. |
| Coverage can miss a wrong path | `engine/scripts/pattern-catalog.ts:27–79`; `engine/test/srcly/fixture-annotations.test.ts:41–139` | Confirmed: TS/TSX scanners, missing-dependency skips, any allowed end accepted. The annotation harness already has exhaustive ends/stops and forbidden boxes. Extend it instead of replacing it. |
| Effect returns are misdescribed | `engine/models/react.json`, `solid.json`; `framework-flows.ts:24–33`; `collector-call-support.ts:618–638` | Confirmed callback-return relation emitter. Official React/Solid contracts distinguish void effects, cleanup identity, selectors, and wrappers. Exact displayed consequences need a trial. |
| Mutation results share one connector | `collector-boundary-processing.ts:502–530` | Confirmed both `mutate` and `mutateAsync` take the return link. Query option parsing accepts direct objects. Result fields and Solid accessor options need separate controls. |
| Lifted dispatch bypasses reducer handling | `collector-jsx-support.ts:513–552` | Confirmed setter shortcut forwards argument to state. Use a reducer that ignores its action to test false provenance. Preserve existing invocation pairing. |
| Resource payload is inferred from a JSON call | `program-evidence-carrier.ts:327–352`; resource loader handling in `collector-call-support.ts` | Confirmed argument-1 lookup and no returned-expression check in this carrier. Determine which live operation consumes it before fixing that operation. |
| Props views lack key selection | `collector-component-binding.ts:162–190` | Confirmed symbol set includes every destructured view without split key membership or merge order. Test excluded/overridden values, not only successful included fields. |
| Native mutation depends on result use | `collector-call-support.ts:469–519`; `collector-declarations.ts:237–239` | Confirmed discarded-call gate and broad library proof. Retained push and discarded concat are discriminating controls. A native method declaration alone does not prove its effects. |
| DOM read can become page effect | `program-evidence-support.ts:579–585` | Confirmed DOM-declared method plus discarded result is sufficient. Test query versus write and fake-host names. |
| Witness/cache identity can omit evidence | `ops/anchor-graph.ts:703–725`; `result-cache.ts:141–165`; `fingerprint.ts`; `library-models.ts` | Confirmed first edge per box pair and fingerprint omissions. Lost displayed evidence and stale cache results are not reproduced here. |
| Survey child heap differs from repository rule | `engine/scripts/survey-gate.ts:143` | Confirmed 3072 MiB child flag. Proposed implementation checks use the required 4096 MiB and serial processes. No survey ran. |

Analysis module names above are under `engine/src/analysis/` unless a full path is given.

Primary-source spot checks: [React effect return](https://react.dev/reference/react/useEffect), [TanStack mutation API](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useMutation), [Solid cleanup](https://docs.solidjs.com/reference/lifecycle/on-cleanup), [Solid selector](https://docs.solidjs.com/reference/secondary-primitives/create-selector), [React versions](https://react.dev/versions), and [TASER author page](https://cs.au.dk/~amoeller/papers/taser/). The report preserves its broader source register.

## Dispositions

Build means include in the reviewed plan, not approve implementation. IDs refer to Pro's original recommendations. Each row records the local disposition and destination.

| ID | Disposition | Reason and plan destination |
| --- | --- | --- |
| SH-01 | Build | Extend precise/forbidden assertions and expose omitted cohorts. Stage 1. |
| SH-02 | Build | Add only return/callback roles needed by a demonstrated case. Stage 2; no universal model language. |
| SH-03 | Build | Preserve witnesses and distinguish completed traversal from evidence basis. Stage 4. |
| SH-04 | Build | Include effective model inputs in cache identity; expand package inputs after a concrete invalidation case. Stage 4. |
| SH-05 | Explore | Broad allocation/owner analysis needs a bounded prototype and cost check. Stage 5. Targeted key/field fixes can proceed. |
| JS-01 | Build | Real JS admission and membership have direct source evidence. Stage 2. Loose/inferred mode must retain null-proof limits. |
| JS-02 | Build | Correct native mutation and callback roles using paired controls. Stages 2–3. |
| JS-03 | Build | Separate Promise fulfillment, rejection, and finalization. Stage 3. |
| JS-04 | Build | Ship computed writes, setters, and call adapters in small slices. Stage 3; full heap precision depends on SH-05 findings. |
| JS-05 | Build | Correct DOM end kinds first; add finite event identity next. Stage 3. |
| RE-01 | Build | Correct impossible effect and mutation return channels. Stage 2. |
| RE-02 | Build | Remove lifted reducer shortcuts and function-action confusion. Stage 3. |
| RE-03 | Build | Provider shorthand/defaults first; exact ancestry only for resolvable trees. Stages 3 and 5. |
| RE-04 | Build | Query data/selector/error/handle roles need finite field summaries. Stage 3. |
| RE-05 | Build | Add ref and snapshot roles while naming temporal limits. Stage 5. Full scheduler simulation is deferred. |
| RE-06 | Explore | Review current API-specific cases before promising the full modern React inventory. Stage 5; independent finite slices can become Build. |
| SO-01 | Build | Correct existing result shapes and import identity. Stage 2. |
| SO-02 | Build | Test resource overloads, actual returns, and control channels. Stage 3. |
| SO-03 | Build | Preserve split membership and merge precedence. Stage 3. |
| SO-04 | Build | Separate store paths, predicates, and selected-value updaters. Stage 3. |
| SO-05 | Build | Correct render callback roles; disclose unresolved owner ancestry. Stages 3 and 5. |
| SO-06 | Build | Add versioned accessor-option and result-slot adapters after shared field support. Stage 5. |
| EX-01 | Explore | Compare packets with identical direct assertions; stop without added review value. Stage 6. |
| EX-02 | Explore | Try dynamic hints only for a remaining concrete key/target miss. Stage 6. |
| DF-01 | Defer | Complete scheduler/proxy/eval/heap analysis exceeds this plan. Keep uncertainty named. |
| DF-02 | Defer | Runtime capture and complete RSC/router transport need separate product scope. |
| AV-01 | Avoid | Observations cannot authorize automatic model installation or universal proof upgrades. |
| AV-02 | Avoid | Endpoint percentages, forced strictness, and API-name lists conceal correctness gaps. |

This yields 20 Build, four Explore, two Defer, and two Avoid dispositions. SH-05 and RE-06 differ from Pro's Build classification.

## Adjustments and limits

- Migrate the affected built-in rows and consumers together. Pro's old-row compatibility suggestion is not adopted. One deployed version needs no coexistence layer.
- Start with current annotations and minimal new assertions. A new harness or general access-path language is not a prerequisite.
- A static influence edge need not assert reference equality. Keep legitimate derived/control paths while rejecting false value/result descriptions.
- Context unions can be conservative may-flow. Claim exact provider selection only when ancestry is resolved.
- Keep package pins and entry checks local to each runtime lane. Solid 1.9.17 runtime validation remains open; older source corroboration is not that validation.
- No Pro program was executed locally. Native results remain Pro-attributed. All framework and srcly graph experiments remain unexecuted.
- The existing library-model and robustness plans retain their ownership. This adds no second registry, automatic installer, runtime capture feature, or duplicate implementation backlog.

Existing grid tasks already cover [proof strength in contracts](../../../pgm/data/projects/srcly-backlog/nodes/task-send-proof-strength-to-the-client-through-the-contract.md), [checker-resolved matching](../../../pgm/data/projects/srcly-backlog/nodes/task-step-7-checker-resolved-matching-everywhere.md), and [passes-through/consumes rows](../../../pgm/data/projects/srcly-backlog/nodes/task-step-5-passes-through-and-consumes-rows.md). Reuse their ownership for SH-02/03. Refresh their dated context against code before execution. The [survey recount](../../../pgm/data/projects/srcly-backlog/nodes/task-recount-the-survey-after-the-open-prs-land.md) remains separate; this research did not run it.
