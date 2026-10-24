# Upstream

`engine/` is a copy of the analysis half of [tsx-data-flow](https://github.com/byronwall/tsx-data-flow). History was not imported.

| | |
| --- | --- |
| Repository | `byronwall/tsx-data-flow` (local checkout `~/Projects/tsx-data-flow`) |
| Tag | `srcly-port-base` |
| SHA | `0a814cd8c282d8f83ebd598e48249aede3bcbb93` |
| Parent | `b4f1ba4` plus the uncommitted route field-proof edits, committed as the tagged SHA (decision D1) |
| Copied on | 2026-10-23 |

## What was copied

| From tsx-data-flow | To `engine/` |
| --- | --- |
| `src/analysis/**`, `src/project/**`, `src/api/**`, `src/reports/**` | same paths, unchanged |
| `src/types.ts`, `src/core.ts`, `src/cli/args.ts`, `src/cli/help.ts` | same paths, unchanged |
| `src/server/{cache,source-excerpts,analysis-service,analysis-worker}.ts` | `src/service/` (one path string in `analysis-service.ts` now names `src/service`) |
| `bin/tsx-dataflow.ts` (the analysis CLI) | `bin/tsx-dataflow.ts` |
| `examples/{solid-route,compact-field-proof,bad-ish-solid}` | `examples/` |
| `test/**` without `test/frontend`, `test/server-*.test.ts`, `test/helpers/{http,server-test-context}.ts`, `test/cli/server-flags.test.ts`, `test/api/workspace-comparison.test.ts` | `test/` |
| `scripts/accept-route-field-proof.ts`, `scripts/route-field-proof-*.json` | `scripts/` |
| `docs/analyzer.md`, `CONCEPTS.md`, `docs/route-field-proof-acceptance.md` | `docs/` |

`src/cli/help.ts` and `bin/tsx-dataflow.ts` came along because `test/integration/facade-exports.test.ts` and `test/cli/dataflow-output.test.ts` use them. Neither starts a server.

## Edits made after the copy

- `test/route-totality-generic-field-proof.test.ts` resolves its fixture from `import.meta.url` instead of the working directory.
- `scripts/accept-route-field-proof.ts` reads the selected evidence from the narrowed local, so `tsc` passes now that `scripts/` is typechecked.
- `src/analysis/route-data-totality.ts`: `observeRouteTotalityPhases` lets `scripts/time-phases.ts` time each phase of a route's build (candidate, surface, context, slice, bridges, lineage). A listener only; no result changes. Backportable as is.

### Performance edits (T10, 2026-10-24)

Each keeps every result byte-identical: checked on the solid-route, srcly `client/` and visual-notes route graphs, anchor graphs and ledgers (`scripts/_dump` diff), the four examples' fixtures and the full suite including the compact-field-proof obligations G01–G20.

| Edit | Files | Fixture / check | Backportable |
| --- | --- | --- | --- |
| `relative()` / `inside()` remembered per root and file (they were 4.4 s of fact collection on visual-notes: `path.resolve` + `path.relative` for every element location) | `src/analysis/program-evidence-support.ts`, `src/analysis/identity.ts` | byte-identity dumps; full suite | yes |
| `compilerSymbolId` remembered per symbol (`getFullyQualifiedName` was 2.1 s) and takes a resolved symbol; `symbolAtNode` | `src/analysis/program-evidence-support.ts` | same | yes |
| The collector resolves each node's symbol once for `symbolId` and `moduleFor` | `src/analysis/program-evidence-collector-support.ts` | same | yes |
| The HTTP-bridge pass hydrates facts without type text (`hydrateProgramFact(…, { typeText: false })`): it reads ids, kinds and attributes only; type text was 3.8 s | `src/analysis/program-evidence-collector-support.ts`, `src/analysis/program-evidence-hydration.ts` | same; `http-bridge-evidence.ts` reads `element.id`, `kind`, `attributes` | yes |
| `safeType` remembered per checker and node (`isHandlerLike` asked for every parameter's type text) | `src/analysis/program-evidence-support.ts` | same | yes |

### Call identity (T13, 2026-10-24)

| Edit | Files | Fixture | Backportable |
| --- | --- | --- | --- |
| The slice walk carries an invocation stack (1-CFA): forward, an `argument-binding` whose argument belongs to call C pushes C (the call is found through the argument's own `argument` relation) and a `return-value` is followed only to the call on top, which pops it; backward the roles swap; an empty stack keeps every call site as before. Visited and queued keys include the stack. A first-party callee is walked through its parameter and return: the bare `argument` link to the call is skipped when a binding exists, so an argument the callee never returns cannot "reach" the call's result. A return inside a callee the walk entered through a call is not a terminal. | `src/analysis/evidence-slice.ts`, `src/analysis/evidence-slice-support.ts` (generic dequeue) | `examples/value-flow-basics/src/{two-call-identity-helper,returns-other-argument}.tsx`; `test/srcly/{anchor-graph,value-flow}.test.ts`; G01–G20 | yes; the relation kinds and proofs are unchanged |

Recognition rules for srcly's own code never go under `src/analysis`; see srcly's `AGENTS.md`. Every analysis edit is listed above with what it changes, so it can be ported back.

## Left behind

`src/frontend/**`, `src/server.ts`, `src/server-cli.ts`, `src/server/{routes,responses,api-*}.ts`, `src/cli/server-flags.ts`, `bin/tsx-dataflow-serve.ts`, `bin/analysis-worker.ts`, `vite.frontend.config.ts`, the other examples (`node-cli`, `http-service`, `serverless-handler`, `solid-full-stack`), and the frontend, server and HTTP tests.

`solid-js` is a devDependency here, not a dependency: the examples resolve Solid's types through it.

## Not ported

The seven open cleanup PRs in tsx-data-flow (PRs 1 to 7, a dead-code stack of about −10.5K lines) were not merged or ported. They overlap the route-proof edits, and most of their deletions were frontend code that srcly leaves behind anyway. Their engine-side deletions can be redone inside `engine/` with a dead-code audit once the port settles.

## `pnpm verify` at the tagged SHA

Both typechecks and ESLint pass. Vitest fails only in `test/frontend` (mid-flight frontend work that is not ported) and, before the guard, in the two soccer-schedule tests. Those now skip when `~/Projects/soccer-schedule/app` is missing or its pinned `readFile` source is no longer on line 96 (it moved to line 125 in that app).
