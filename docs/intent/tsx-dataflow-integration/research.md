# Research record

This page condenses two Pro research runs from 2026-10-23, originally PRs #102 (value investigation) and #103 (function effects). The full reports stay in their Pro conversations. This page keeps only what changes the plan.

- Value investigation: [Pro conversation](https://chatgpt.com/c/6adc0a99-0844-83e9-b309-74996708456a), branch `codex/data-flow-integration-research`.
- Function effects: [Pro conversation](https://chatgpt.com/c/6adc0dbe-1934-83e9-ae3e-99777939ff03), branch `codex/effects-async-test-seams-research`.
- Baselines: srcly `aea1015`, tsx-data-flow `b4f1ba4` plus its local route-proof edits. No code, tests, builds, or browser journeys ran. The source claims below were verified by reading the code; latency and usability are unmeasured.

## Verified source facts

| Fact | Where | Consequence |
| --- | --- | --- |
| The route canvas returns empty evidence-node and evidence-edge arrays. It projects component surfaces, not operation order. | tsx `route-totality-display-layout.ts` | Path order lives in the ledger, not on the graph. |
| Exact selected-file proof requires a proven `node:fs/promises.readFile` source at an exact location. | tsx `route-totality-field-proof-index.ts` | Arbitrary expressions need a new selection API. |
| Some carrier rules check named functions and source paths. | tsx `program-evidence-carrier.ts` | Don't present them as generic support. |
| Generic call edges share parameter and return facts, and slice traversal has no invocation stack. | tsx `program-evidence-collector-jsx-support.ts`, `evidence-slice.ts` | Calls to the same helper can join. This is an inference, so M5 needs a negative fixture. |
| `For` handling needs a property-access `each` and one plain callback parameter. Plain `node={node}` falls outside value-mode recognition. | tsx `connectSolidFor`, `componentPropValueMode` | The `HotSpotList` → `HotSpotItem` path needs new support (M5). |
| The cache builds the full report before answering, and reads source separately from the Program. | tsx `server/cache.ts` | Queries need setup without the report, and excerpts taken from the Program's own text. |
| The CLI prints the requested port, not the bound port. | tsx `server-cli.ts` | This is moot with a stdio child. |
| Call occurrences are recorded. The fetch boundary is classified by name. | tsx `processCall`, `processProgramCallBoundary` | Effects can build on call records, but name labels never certify purity. |
| The worker `request` is promise-returning without `async`. | tsx `analysis-service.ts` | The engine already has a correlation and cancellation pattern to reuse. |
| srcly's edges are import and usage edges: unused imports kept, same-file edges skipped. | srcly `deps/typescript_deps.py`, `deps/common.py` | Never relabel them as data flow or execution. |
| Recent places don't store camera, filters, scroll, or focus. | srcly `navigation/location.ts`, `history.ts` | Ledger Return needs its own snapshot. |
| Lines 134 and 135 are separate name reads, with the rank default at 130 and the metric at 145. Lines 88 and 109 call the same `row` helper. | srcly `HotSpotItem.tsx`, `HotSpotList.tsx` | These are the M3 and M5 anchors. |
| `rankHotSpots` reads the module-level catalog through `metricDef`. `startScan` awaits once and adopts `expectJson`'s promise. | srcly `hotSpotRanking.ts`, `scanJobs.ts` | These are the M6 anchors. |

## Evidence semantics

**Value flow**
- Connectivity, coverage, and value properties are separate answers.
- `??` keeps 0 and `""`; `||` replaces them.
- Nullability is not finiteness, schema validity, or a domain rule.
- An assertion (`x!`) is not a runtime check.
- A target field's identity is separate from collection-membership dependencies.
- An accepted path links ordered adjacent element and relation ids to the exact terminal. Containment or references alone prove nothing.

**Effects**
- Facts and coverage are stored separately, as complete-for-supported-scope, partial, or not analyzed. There is never a `pure` boolean, a confidence percentage, or a risk score.
- The categories are external behavior, ambient inputs, writes (input, shared, fresh-local, unknown target), allocation and identity, throws, and analysis limits.
- There are two activation channels:
  - invocation-caused, which includes an async function's own continuations;
  - deferred-triggered, for registered or scheduled callbacks.
  A returned closure stays latent.
- Result handling is recorded separately: awaited, adopted, chained, aggregated, discarded, or unknown. `void p` does not handle rejection.
- `Promise.all`, `allSettled`, `race`, and `forEach(async)` keep their real meanings.
- Results are may-effects. There are no claims about determinism, termination, or race freedom.

## Recommendation dispositions

| Range | Disposition | Milestone |
| --- | --- | --- |
| REC-001–008, 011 | Build | M3 (workspace, pinned preview, binding to the Program, return state, lazy child, selection API, ledger, evidence states) |
| REC-009, 010 | Build | M5 (cross-file path, helper and branch expansion) |
| REC-012–014 | Explore | The process decision (P1), the branch graph (P3), and packaging (now M8) |
| REC-015 | Defer | New languages, runtime instrumentation |
| REC-016–018 | Avoid | Embedding an iframe or shared frontend, a semantic graph over import edges, a Python port |
| EAT-001–010, 013–015 | Build | M6 |
| EAT-011, 012 | Build, gated | Below the cut line (`watchScan` execution view) |
| EAT-016–021 | Explore | Solid activation models, the worker service, Python lifecycle, container precision, Jelly/CodeQL comparison, tangle signals |
| EAT-022–026 | Defer | Runtime traces, caching, a shared package, whole-heap proof, coupling to route UI |
| EAT-027–030 | Avoid | Purity or testability scores, name-only host rules, relabeled import edges, mass refactors |

Two changes come from this initiative's decisions, not from the research. The research said to keep the repositories separate and use a prepared checkout. The user chose one repository, so `engine/` lives in srcly. The research also proposed an HTTP child on a loopback port. With one repository, a stdio child is simpler.

## External references

[CodeQL path queries](https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/) · [CodeQL JS call graph](https://codeql.github.com/docs/codeql-language-guides/codeql-library-for-javascript/#call-graph) · [JetBrains data-flow inspection](https://www.jetbrains.com/help/idea/analyzing-data-flow.html) · [TypeScript soundness note](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#a-note-on-soundness) · [ECMAScript Promise constructor](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-constructor) · [typescript-eslint `ignoreVoid`](https://typescript-eslint.io/rules/no-floating-promises/#ignorevoid) · [uv tools](https://docs.astral.sh/uv/guides/tools/)
