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

No file under `src/analysis` was edited. Recognition rules for srcly's own code never go there; see srcly's `AGENTS.md`.

## Left behind

`src/frontend/**`, `src/server.ts`, `src/server-cli.ts`, `src/server/{routes,responses,api-*}.ts`, `src/cli/server-flags.ts`, `bin/tsx-dataflow-serve.ts`, `bin/analysis-worker.ts`, `vite.frontend.config.ts`, the other examples (`node-cli`, `http-service`, `serverless-handler`, `solid-full-stack`), and the frontend, server and HTTP tests.

`solid-js` is a devDependency here, not a dependency: the examples resolve Solid's types through it.

## Not ported

The seven open cleanup PRs in tsx-data-flow (PRs 1 to 7, a dead-code stack of about −10.5K lines) were not merged or ported. They overlap the route-proof edits, and most of their deletions were frontend code that srcly leaves behind anyway. Their engine-side deletions can be redone inside `engine/` with a dead-code audit once the port settles.

## `pnpm verify` at the tagged SHA

Both typechecks and ESLint pass. Vitest fails only in `test/frontend` (mid-flight frontend work that is not ported) and, before the guard, in the two soccer-schedule tests. Those now skip when `~/Projects/soccer-schedule/app` is missing or its pinned `readFile` source is no longer on line 96 (it moved to line 125 in that app).
