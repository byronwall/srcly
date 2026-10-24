---
title: "Data flow robustness — research"
slug: "dataflow-robustness"
phase: shape
status: current
last_updated: "2026-10-24"
---

# Research record

Baseline: the stack top `claude/dataflow-anchor-menus` (`b164b3c`). The source claims were verified by reading the code. The numbers come from `docs/intent/tsx-dataflow-integration/measurements.md`. Nothing new was run for this page.

## Verified source facts

| Fact | Where | Consequence |
| --- | --- | --- |
| Every route-graph node and render edge takes `status = surface.status === "complete" ? "proven" : "partial"`. | `engine/src/srcly/ops/route-graph.ts:101`, render edges at `:224` | One partial corner marks the whole backbone partial. The status stroke carries no information per box (T1). |
| The surface has located `omissions[]` (`locations[]`), and the totality has `gaps[]` with `source` and a nullable `location`. | `engine/src/api/route-totality-contracts.ts:153`, `:242` | Per-box status can come from data the engine already emits. No analysis edit is needed. |
| Declaration anchors push `parameter`, `prop-read` and `returns` edges with `status: "proven", proof: []`. | `engine/src/srcly/ops/anchor-graph.ts:234`, `:240`, `:249` | A proven edge with no proof breaks the plan's rule that a `proven` edge's proof contains its span (T2). |
| Prop reads under a declaration are matched by a regex on the parameter's source text (`^name\??\.`). | `anchor-graph.ts:237-238` | Destructured props, renamed parameters and `props["x"]` are missed silently. |
| A declaration's outcome is `ok` when any parameter, return or use was drawn and nothing stopped. | `anchor-graph.ts:200-202` | "Drew something" is not "every run landed" (T2). |
| Upstream raises `disconnected` for an element with no continuing relation that is **not** a terminal role, and also for a seed missing from the index. | `engine/src/analysis/evidence-slice.ts:247-292` | The anchor graph's comment ("nothing continues from a render slot") is wrong: terminals never produce this gap. Dropping it hides real dead ends (T3). |
| Field lineage for a selected origin is unavailable unless the origin is a filesystem read. On solid-route, the records walk stops at `selectVisibleRecords`'s return. The test pins `destinations == []`. | `engine/test/srcly/route-graph-source.test.ts:32-41` | The headline interaction does nothing on the fixture's main origin (T4). This is an analysis change, now allowed under the fork rule. |
| A cross-call is followed only when the callee has exactly one call site, counted over the whole Program. | `engine/src/srcly/call-sites.ts`, `anchor-graph.ts:300-306`, `value-flow.ts` | A Program scoped to fewer files undercounts call sites, so a boundary becomes a false proven path. Scoping (T12) waits for call identity (T13). |
| The fake engine has one canned reply per op (`hello`, `status`, `routes`, `routeGraph`, `anchorGraph`), plus crash, hang and refuse flags. | `server/tests/fake_engine.py:48-108` | Python and client handling of `partial`, `unsupported`, `budget`, `stale` and protocol mismatch per op is untested (T5). |
| The client has no browser tests. | `client/package.json` has no Playwright | The menus, anchor flows and theme are proven only by PR screenshots (T6). |
| Mark colors are light-theme hex literals. | `client/src/viz/deps/flow/marks.ts:20-30` | The dark theme gets light colors (T21). |
| `navigation/` has `location.ts` and `history.ts`, but no `viewState.ts`. `investigation/` has only `selectionSpan` and `valueFlowInspector`. | `client/src/navigation`, `client/src/investigation` | Return restores URL state only: no camera, metric, filters or explorer (T17). |
| The stack #104–#117 (13 PRs; #113 is unrelated) is unmerged, on top of the docs PR #101. | `gh pr list` on 2026-10-24 | Every robustness PR adds to a stack that has to merge in order. |

## Performance today

| Measure | srcly `client/` (26K lines) | visual-notes `app/` (65K lines) |
| --- | ---: | ---: |
| Cold `hello` | 557 ms | 691 ms |
| Tier 1 (Program, identity index, routes) | 2.3 s | 10.4 s |
| First `routeGraph` (`/time-blocks`) | — | 34.7 s |
| Page load → first box through the UI | — | 68 s |
| Cold → first ledger | 11.9 s | not measured |
| Warm `valueFlow` p95 | 3 ms | not measured |
| RSS | 1.1 GB | 1.7 GB after tier 1 |
| `anchorGraph` on a declaration (one slice per parameter, return and use) | not measured | not measured |

The 10 s cold target therefore misses by 7× on visual-notes. Tier 1 alone is right at the limit, and the first route projection is more than three times over it. Nobody has profiled what `routeTotality.get` spends its 34 s on.

## Considered: ways to reach 10 s

Scored 0–10 on what matters here: cold gain on the first visit, proof safety, cost, and fit with a fork that improves over time.

| Approach | Cold first visit | Proof safety | Cost | Notes |
| --- | ---: | ---: | ---: | --- |
| A. Progressive route graph: send the occurrence backbone first, then bridges and lineage | 8 | 10 | 6 | The surface is cheaper than the full totality. If profiling shows it, the first box can land around tier 1 + surface. |
| B. Profile-led performance edits in `engine/src/analysis` | 7? | 8 | 5 | The gain is unknown until profiling. Fixture output must be byte-identical. |
| C. Disk cache of tier-1 facts and route projections by `programHash` | 1 | 9 | 5 | Helps only on reopen and restart. Invalidation is exact, since the hash covers files, tsconfig and versions. |
| D. A Program scoped to the route's or anchor's import closure | 7 | 3 now, 8 after T13 | 6 | It undercounts call sites, so it waits for call identity. |
| E. Warm at scan time | 9 | 10 | 2 | Declined by the maintainer: memory and CPU on every scan. |
| F. Route projections in parallel worker threads | 3 | 10 | 4 | Doesn't help the first route. Memory doubles. |

**Chosen:** measure (T8), then A (T9) and B (T10) as the main path, C (T11) for reopening, and D (T12) only after T13. This is a hybrid that improves over time, as the maintainer asked. The stop rule is that no speedup may change a fixture's proven set.

## Adjacent work

- **Python data flow** has its own session and stack (the Python engine brief). It shares the contracts, outcomes and the `fake_engine.py` seam. T5 changes the fake engine, so whichever PR lands second rebases on the other.
- **`dependency-graph-legibility`** also touches the canvas layout and labels. T22's label placement coordinates with it.
