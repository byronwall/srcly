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

## 2026-10-24 — T1: per-box status in `routeGraph`

Same machine and Node. Engine `routeGraph` called in process right after tier 1, counting boxes by status before and after `route-graph.ts` gave each box its own status (`markPartialBoxes`).

| Target · route | Boxes | Proven before | Partial before | Proven after | Partial after | Located gaps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| solid-route `/records` | 33 | 33 | 0 | 32 | 1 (the route box: `external-code` in `data/*.ts`) | 2 of 2 |
| visual-notes `/time-blocks` | 418 | 1 | 417 | 207 | 211 | 303 of 303 |

Before, every box on `/time-blocks` took the surface's `partial` status (only the origin kept its own). After, the 211 partial boxes are the ones that own a located gap or omission: 97 `unresolved-symbol`, 96 `external-code`, 16 `budget-exhausted`, 1 `unsupported-ownership`, plus the route box for the incomplete surface. Every gap had a location, so the R14 fallback (the occurrence's own omissions) was not needed. On `/records` the route's two gaps sit in `data/records.ts` and `data/viewer.ts`, outside every drawn box, so they belong to the route box and all 32 component boxes read proven.

## 2026-10-24 — T8: where the time goes (`engine/scripts/time-phases.ts`)

Same machine and Node, in process (`pnpm time-phases --root ~/Projects/visual-notes/app --route /time-blocks --route /tasks --anchor …`). The engine's own test suite ran beside this measurement, so the absolute numbers are higher than M1/M2 (tier 1 was 10.4 s there); the shares are what this run is for.

| Target | Tier 1 | Provider fact collection | Facts | RSS |
| --- | ---: | ---: | ---: | ---: |
| solid-route | 437 ms | 68 ms | 380 | 399 MB |
| visual-notes `app/` | 19,768 ms | 16,567 ms | 110,990 | 1,673 MB |

Per route on visual-notes (`/tasks` first, so it pays every warm-up; `/time-blocks` second):

| Route | candidate | surface | context | slice | bridges | lineage | other | totality | project | nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/tasks` | 2 | 54 | 1,790 | 8,133 | 3 | 0 | 1,807 | 11,789 | 12 | 327 |
| `/time-blocks` | 0 | 23 | 321 | 180 | 2 | 0 | 6 | 533 | 9 | 418 |

`other` is the finding attachment after the record is built. `anchorGraph` on five visual-notes anchors is 3–28 ms each once the facts exist (the TimeBlockEditorDialog `props.block` anchor draws 83 boxes in 28 ms).

**What this decides (the T8 → T9/T10 question).** The cold path to a first box is tier 1 (≈10 s on a quiet machine), then the provider's fact collection (16.6 s, every file in the program, before any route), then the first route's slice (8.1 s) and context continuity (1.8 s). Fact collection is over half of the time after tier 1, and the route backbone itself (surface 54 ms) cannot start before it: route candidates come from the fact index. So T10 goes first, on fact collection and then the slice, and T9 follows. The budget R4 (10 s cold) needs tier 1 plus facts plus a surface under 10 s; today tier 1 alone is near it, so the disk cache (T11) is the lever for reopen and T10 for the cold path.

## 2026-10-24 — T10: profile-led edits to fact collection and the slice

Same machine, in process (`pnpm time-phases --root ~/Projects/visual-notes/app --route /tasks --route /time-blocks`), a quiet machine this time. The CPU profile behind the edits (`node --cpu-prof` over the same script) put 43% of the run in the TypeScript checker, 20% in garbage collection, and inside the engine's own code: `locationFor` 4.7 s (of which `path.relative`/`path.resolve` 4.4 s), `safeType` 6.3 s (3.8 s of it hydrating facts for the HTTP-bridge pass, which never reads type text; 2.6 s in `isHandlerLike` asking every parameter), `getFullyQualifiedName` 2.1 s, the identity index 5.2 s of tier 1 (its own `relative` per expression).

| Phase (visual-notes) | Before (T8) | After T10 |
| --- | ---: | ---: |
| Tier 1 | 10,115 ms | 8,038 ms |
| Provider fact collection (110,990 facts) | 15,109 ms | 6,703 ms |
| `/tasks` first: slice | 9,322 ms | 3,912 ms |
| `/tasks` first: context continuity | 1,741 ms | 2,251 ms |
| `/tasks` first: whole totality | 12,901 ms | 7,967 ms |
| `/time-blocks` second: whole totality | 533 ms | 512 ms |
| Cold path to the first `/tasks` box (tier 1 + facts + totality) | 38.1 s | 22.7 s |

Every result is byte-identical before and after (route graphs for `/time-blocks` and `/tasks`, two anchor graphs and a ledger on visual-notes; `/records`, an anchor and a ledger on solid-route; two anchors and two ledgers on srcly `client/`), and the engine suite with G01–G20 passes. The edits are listed in `engine/UPSTREAM.md`.

**What is left on the cold path.** Tier 1 (8 s, the TypeScript program and the identity index) and fact collection (6.7 s, the checker's `getSymbolAtLocation` for every identifier) are now the two halves; the first slice (3.9 s) re-walks every file once to collect relations (`ProgramEvidenceRelationFrontierLoader.relationSource`). The next T10 round is that relation source, per file on demand; T11's cache serves a reopen without any of it.

## 2026-10-24 — T9: the backbone first

In process (`pnpm time-phases`, after tier 1): `/time-blocks` surface 134 ms (687 boxes before folding), `/tasks` 358 ms, from facts collected for the route file alone plus the occurrence surface, before the program-wide provider (6.7 s) and the slice.

Through the UI on visual-notes `/time-blocks`, cold (saved scan, engine start, tier 1, then the backbone; a Playwright page timing from navigation):

| | Before (M2) | After T9 |
| --- | ---: | ---: |
| First drawn box | 68 s | 10.9–11.4 s (the backbone, "tracing evidence…") |
| Complete graph (origins, handoffs, gaps) | 68 s | 25.7 s |
| Warm reopen, first box | — | 3.9 s |

Found on the way: the flow view's start effect read the recorded status and so posted `/start` again on every status write, hundreds of times a second while the engine started; and `routes` was asked again on every poll. Both fixed here (one `/start`, one `routes`, one `route-surface`, one `route-graph` per cold load).

R4 asks for ≤ 10 s cold. The first box is now at the edge of it on this machine; tier 1 (8 s) is what is left in front of the backbone, and T11's cache answers a reopen without it.

## To record next

| Milestone | Numbers |
| --- | --- |
| M1 | cold `hello` plus tier 1 on solid-route, srcly `client/`, visual-notes `app/`; RSS after tier 1 |
| M2 | first `routeGraph` per route on visual-notes (`/time-blocks`, `/tasks`); payload sizes; four layout screenshots at 1440 and 1024 |
| M3 | warm `valueFlow` p95 over 20 queries; cold `hello` to first ledger row; Return p95 over 20 returns |
| M6 | `functionEffects` on the three anchors |
| M7 | tier 2 on `examples/bad-ish-solid` and on srcly `client/` from the batch job |
| M8 | wheel size before and after; clean-venv smoke time |
