---
title: "Bring tsx-data-flow into srcly — measurements"
slug: "tsx-dataflow-integration"
phase: plan
status: current
last_updated: "2026-10-23"
---

# Measurements

Every number this initiative records. Append a dated row per milestone; never overwrite an earlier one.

## 2026-10-23 — planning baseline

Machine: development Mac. Node v22.21.1. tsx-data-flow `b4f1ba4` plus the uncommitted route-proof edits, run from its checkout with `node --import tsx`. TypeScript 5.9.3 resolved from each target project. One cold run per target, wall clock from `performance.now()`.

| Target | Source files | `buildProgram` | `buildIdentityIndex` | `analyzer.report()` (full legacy report) | `buildRouteDataInventory` | RSS after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| srcly `client/` (`tsconfig.app.json`, 26K lines) | 126 | 1,209 ms | 1,796 ms | 129,962 ms | 2 ms (0 routes) | 2,419 MB |
| visual-notes `app/` (`tsconfig.json`, 65K lines) | 487 | 4,323 ms | 9,542 ms | 44,166 ms | 17,494 ms (43 routes) | 2,023 MB |

A second run of the CLI end to end (`pnpm analyze --root srcly/client --source src --tsconfig tsconfig.app.json --view overview --format json`) took 2 min 13 s wall and wrote a 421 KB overview.

Routes discovered on visual-notes include `/time-blocks`, `/tasks`, `/canvas`, `/docs/[id]`, `/api/auth/[...solidauth]` and 38 others.

Script: a throwaway `time-phases.ts` that called `parseArgs`, `createAnalyzer`, `analyzer.report()` and `buildRouteDataInventory` in sequence and printed `process.memoryUsage().rss`. It is not checked in; M1 adds an equivalent `engine/scripts/time-phases.ts`.

## 2026-10-23 — M1: cold `hello` and tier 1 through the protocol

Machine: development Mac. Node v22.21.1. Engine at `srcly-port-base` (`0a814cd`) plus the PR 2 session. `engine/scripts/time-tier1.ts` spawns `bin/srcly-engine.ts` through `tsx`, sends `hello`, then `routes` (tier 1: Program, identity index, route discovery; no legacy report), then `status`. One cold run per target; RSS is the engine process (protocol thread plus worker) from `status`.

| Target | `hello` (spawn to reply) | `routes` (tier 1) | Routes | TypeScript | RSS after |
| --- | ---: | ---: | ---: | --- | ---: |
| `engine/examples/solid-route` | 568 ms | 942 ms | 1 | 5.9.3 bundled | 524 MB |
| srcly `client/` (`tsconfig.app.json`) | 557 ms | 2,265 ms | 0 | 5.9.3 bundled (no `client/node_modules` in this checkout) | 592 MB |
| visual-notes `app/` (`tsconfig.json`) | 691 ms | 10,392 ms | 43 | 5.9.3 project | 1,733 MB |

Tier 1 on visual-notes is 10.4 s against the 13.9 s the planning baseline summed for program plus identity index, and it misses the 10 s cold target by a little. RSS after tier 1 is below the baseline's because the legacy report never runs.

## 2026-10-24 — M2: first `routeGraph` per route, and decision D2

Same machine and Node. Engine `routeGraph` called in process right after tier 1 (cold totality for that route; `route-graph.ts` projection included).

| Target · route | tier 1 | first `routeGraph` | Payload | Nodes | Edges | Engine-omitted items |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| solid-route · `/records` | 461 ms | 172 ms | 24.7 KB | 33 | 13 | 0 |
| visual-notes · `/time-blocks` | 14,206 ms | 34,691 ms | 359 KB | 418 | 325 | 258 |
| visual-notes · `/tasks` | 10,186 ms | 31,432 ms | 270 KB | 327 | 250 | 184 |

Through the UI, a cold `/time-blocks` (saved scan, engine start, tier 1, first `routeGraph`) took 68 s from page load to the first drawn box; the progress panel showed each phase meanwhile.

Before the session aligned route identity, every visual-notes route came back `unavailable` ("No unique proven Solid route candidate matched"): route discovery records `export default Page;` at the identifier, the Solid scope adapter at the `const Page = () => …` declaration, and totality matches them by span. Upstream's full-report path fails the same way. `engine/src/srcly/route-identity.ts` aligns the span through the checker in the session; `src/analysis` is unchanged.

**D2 (route layout): keep today's packing with occurrence frames.** The adapter puts every flow node in the center region, makes its render parent its frame (`group.opened`), and adds hidden containment edges so columns follow hierarchy depth. In all four screenshots each frame's boxes stay together in one column block: ViewerCard's five terminals, RecordRow's four, and WeeklyTimeBlocksCalendar's thirteen children each read as one framed column. The packer folds adjacent depth levels into one column when the viewport is short, so a frame can share its parent's column, but no occurrence's terminals were split from each other. No `direction: "down"` rule and no `layout.ts` change. Screenshots (attached to the M2 PR, kept in the ignored `tmp/`): `d2-solid-route-1440.png`, `d2-solid-route-1024.png`, `d2-time-blocks-1440.png`, `d2-time-blocks-1024.png`.

## 2026-10-24 — M3: value-flow ledger on srcly `client/`

`engine/scripts/time-value-flow.ts` spawns the engine on srcly's `client/` (`tsconfig.app.json`), sends `hello`, then `valueFlow` on `HotSpotItem.tsx:135` (`props.node.name`), then 20 warm `valueFlow` queries cycling over the 135, 130, 145 and `HotSpotList.tsx:88` anchors.

| Measure | Value |
| --- | ---: |
| Cold spawn → `hello` → first ledger (tier 1 plus the lazy provider's fact index) | 11,877 ms |
| Warm `valueFlow` p50 / p95 / max over 20 | 1 / 3 / 24 ms |
| RSS after | 1,109 MB |

The cold number misses the 10 s target on srcly's own client: about 2.3 s is tier 1 and the rest is the evidence provider building its fact index on the first query that needs facts. Warm queries are far under the 750 ms first-row target.

Acceptance anchors (`engine/test/srcly/value-flow.test.ts`, located by text, not line number):

| Selection | Ledger |
| --- | --- |
| `HotSpotItem.tsx:135` `props.node.name` | `ok`: input `props.node.name` (proven) → transfer `props.node` (proven) → terminal "JSX render slot" (proven). Exact. |
| `HotSpotItem.tsx:134` `title={props.node.name}` | `ok`: its own ledger ending at a "DOM attribute or property" terminal; no row of it appears in the 135 ledger. |
| `HotSpotItem.tsx:130` `props.rank ?? "–"` | `ok`: a proven fallback row, "?? keeps 0, \"\" and false…". |
| `HotSpotItem.tsx:145` the metric expression | `ok`, not the plan's `partial`: `formatMetricWithUnit` has exactly one call site in the program on this branch (the plan assumed many), so it is a `transform` row. `value()!` is a branch row labelled "assertion, not a check". The boundary rule itself is exercised by line 88 and by `examples/value-flow-basics/src/two-call-helper.tsx`. |
| `HotSpotList.tsx:88` `item.node` | `partial`: one boundary row at `row(item.node, …)`, `unproven-handoff`, "row has 2 call sites (…:88, …:109)". |

Call sites are counted from the TypeScript program (calls resolving to the callee's symbol; a non-call reference makes the callers unknown), not from the lazy provider, which only knew `invokes` relations from files it had loaded and first reported `formatMetricWithUnit` correctly by accident.

## To record next

| Milestone | Numbers |
| --- | --- |
| M1 | cold `hello` plus tier 1 on solid-route, srcly `client/`, visual-notes `app/`; RSS after tier 1 |
| M2 | first `routeGraph` per route on visual-notes (`/time-blocks`, `/tasks`); payload sizes; four layout screenshots at 1440 and 1024 |
| M3 | warm `valueFlow` p95 over 20 queries; cold `hello` to first ledger row; Return p95 over 20 returns |
| M6 | `functionEffects` on the three anchors |
| M7 | tier 2 on `examples/bad-ish-solid` and on srcly `client/` from the batch job |
| M8 | wheel size before and after; clean-venv smoke time |
