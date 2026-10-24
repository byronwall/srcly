---
title: "Data flow robustness — backlog"
slug: "dataflow-robustness"
phase: plan
status: current
last_updated: "2026-10-24"
---

# Backlog

Seeds in priority order (R13, R7). Each has **evidence** for why it matters, a **proof** that shows it is done, and a **stop rule**: the signal to stop, shrink or rethink it. The ticket graph and the implementation-ready detail for T1–T3 are in [implementation-plan.md](implementation-plan.md).

## E1 Never wrong

**T1 · Per-box status in `routeGraph`.**
- Evidence: `route-graph.ts:101` gives every node and render edge the surface's status.
- Proof: the partial boxes on `/records` and `/time-blocks` are exactly the ones owning a located gap or omission.
- Stop rule: if most gaps have no location, use the occurrence's own omissions (R14). Never fall back to the route's status.

**T2 · Declaration anchors draw only what they proved.**
- Evidence: `anchor-graph.ts:234-249` adds `proven` edges with `proof: []`, prop reads are matched by regex, and `landed` means "drew anything".
- Proof: no fixture edge is `proven` with empty proof, and a component whose prop walk stops reads `partial`.
- Stop rule: if `structural` needs more than one new client stroke and one legend line, the contract is wrong. Rethink it before spreading it.

**T3 · `disconnected` split into a natural start and a dead end.**
- Evidence: upstream raises it only at non-terminals (`evidence-slice.ts:283`), and the anchor graph drops it (`:335`).
- Proof: on the corpus anchors, every path end is a terminal, an origin, a literal start or a frontier.
- Stop rule: if more than a third of the new frontiers on srcly `client/` are patterns the maintainer calls normal, extend the natural-start list with fixtures before merging.

**T4 · Field lineage from non-filesystem origins.**
- Evidence: the records origin on solid-route lights nothing (`route-graph-source.test.ts:32-41`). Lineage starts only at `readFile`, and the slice stops at `selectVisibleRecords`'s return.
- Proof: the records origin lights `RecordTable` row terminals and not `ViewerCard`. G01–G20 stay green, and the test's `destinations == []` flips to the real set.
- Stop rule: an analysis edit is allowed (R9), but if it needs srcly-specific recognition, or makes any compact-field-proof obligation fail, stop and show the frontier instead.

## E2 Never broken

**T5 · The fake engine answers in every outcome shape.**
- Evidence: `fake_engine.py` has one reply per op.
- Proof: parametrized router and client tests for `ok`, `partial`, `unsupported`, `budget`, `stale`, `not-analyzed`, protocol mismatch and a mid-op crash, for `routeGraph`, `anchorGraph` and `valueFlow`. The Python session's ops plug into the same table.
- Stop rule: shapes come from the emitted JSON Schemas, never hand-written. If the fake drifts from the schema, the test fails.

**T6 · Playwright smoke for Data flow.**
- Evidence: there are no browser tests. Menus and anchor flows are checked only by PR screenshots.
- Proof: one CI job against solid-route with the real engine covers the route picker, origin select, reach (`R`), the inspector (`I`), anchor from the code viewer, the import-graph and treemap menus, and dark mode. It writes screenshots to `tmp/`.
- Stop rule: the job stays under 3 minutes. Anything slower moves to a local-only script.

**T7 · Stale end to end.**
- Evidence: generation checks exist per op, but no test covers an edit made while a canvas is open.
- Proof: edit a solid-route file in a test, and the open graph shows "Source changed. Refresh." Refresh rebuilds, and two generations never mix on one canvas.
- Stop rule: none beyond the proof. This is a correctness gate.

## E3 Fast (≤ 10 s cold on visual-notes, R4)

**T8 · Phase profiler and anchor timings.**
- Evidence: the 34.7 s first `routeGraph` is unprofiled, and declaration anchors run one slice per parameter, return and use, unmeasured.
- Proof: `engine/scripts/time-phases.ts` records tier 1, surface, slice, bridges and lineage per route, plus `anchorGraph` on five visual-notes anchors, in `measurements.md`.
- Stop rule: one session of work. It measures and changes nothing.

**T9 · Progressive route graph.**
- Evidence: the backbone (the occurrence surface) is a prefix of the totality.
- Proof: the first box on cold `/time-blocks` arrives within 10 s, and lineage fills in without a re-layout jump.
- Stop rule: if the surface alone is over 10 s after tier 1, T9 can't meet R4 alone. Go to T10.

**T10 · Profile-led performance edits in the analysis.**
- Evidence: T8.
- Proof: the named phase gets faster with byte-identical fixture output on all four examples and the srcly `client/` acceptance anchors. Each edit is recorded in `UPSTREAM.md`.
- Stop rule: any change to a proven set reverts the edit.

**T11 · Disk cache keyed by `programHash`.**
- Evidence: every restart repeats tier 1, and the 15-minute idle close drops it.
- Proof: a reopen with the hash unchanged reaches its first box in under 3 s on visual-notes. A changed hash rebuilds.
- Stop rule: if the cache is over 500 MB, or deserializing is over half the cold build time, drop it.

**T12 · Scoped Program.**
- Evidence: tier 1 grows with the whole tsconfig.
- Proof: a route's import closure builds within budget, and call-site-sensitive results match the full Program on the corpus.
- Stop rule: blocked until T13. If any result differs from the full Program, scoping is off for that query.

## E4 Call identity (R3)

**T13 · `callId` on relations and an invocation stack in the slice walk.**
- Evidence: the R7 one-call-site boundary, and `HotSpotList.tsx:88` versus `:109`.
- Proof: the `two-call-identity-helper` and `returns-other-argument` fixtures pass, and line 109 never appears in line 88's walk.
- Stop rule: only edits 1–2. If line 88 → 135 still needs the `For` or identifier-prop edits, leave a named frontier.

## E5 Effects (M6, first after the core)

**T14 · `functionEffects`.**
- Evidence: the plan's M6 and the research's EAT-001–015.
- Proof: the 21-case fixture passes. `extractFilePath`, `rankHotSpots` and `startScan` show the required evidence.
- Stop rule: the earlier plan's stop-and-correct list (false host match, lost async effect, and the rest).

**T15 · Effects in the UI.**
- Evidence: the graph is primary (R1).
- Proof: effects appear on a function's box in anchor mode and in the code viewer rail, with Known and Partial together.
- Stop rule: never a purity score, a percentage or a "clean" badge.

## E6 Graph surface (after T6)

**T16 · Explain an edge (M4, `routePath`).**
- Evidence: field edges carry `pathIds`, but no ordered explanation exists.
- Proof: on `/time-blocks`, clicking a lit edge lists its ordered steps in the edge card and inspector, and its status agrees with the edge.
- Stop rule: a missing attachment is `not-found`. Steps are never invented.
- Done (PR 16 of the stack): `routePath` op, `GET /api/dataflow/route-path`, click a field or handoff edge → "Selected edge" in the inspector with the rows in order; each row opens its line; Esc clears it. On visual-notes no origin has a lit edge (see measurements), so the proof ran on the examples.

**T17 · Back and Return through a view-state registry.**
- Evidence: R8. There is no `viewState.ts`.
- Proof: anchor → anchor → Return restores the camera, selection, metric and filters, with p95 ≤ 150 ms.
- Stop rule: only the owners the graph needs (`graph.view`, `graph.filters`, `metrics`, `flow`). The explorer and treemap come later.
- Done (PR 17 of the stack): `client/src/navigation/viewState.ts`, owners `graph.view`, `metrics`, `graph.filters` (`flow` is the URL itself: route, origin, destination and opened frames are already restored by the browser). Return button and Alt+← in the data-flow graph; Alt+→ is Forward. p95 61 ms over 20 returns (see measurements). The explorer and treemap are not owners yet.

**T18 · Anchor history.**
- Evidence: R11.
- Proof: a recent-anchors list in the toolbar, with Back and Forward walking it.
- Stop rule: sessionStorage only. No persistence.
- Done (PR 18 of the stack): the Recent menu in the data-flow toolbar lists the anchors (name or span, file, direction) and routes traced in this tab from the visit ring, newest first, up to 12; a row is a new Back step, and Return and Forward (Alt+←, Alt+→) walk the same browser history. The header History menu names data-flow places by anchor or route too. Nothing is persisted beyond sessionStorage.

**T19 · File and folder anchors.**
- Evidence: R11. Files can't be traced today.
- Proof: the spike in the plan, then one box per export with expansion.
- Stop rule: a folder over 50 exports shows counts and asks before it traces.

**T20 · Multiple anchors.**
- Evidence: R11.
- Proof: two anchors on one canvas, with shared boxes marked where their flows meet.
- Stop rule: at most three anchors. Each is its own query, and results join only within one generation.

**T21 · Dark-theme mark tokens.**
- Evidence: hex colors in `marks.ts:20-30`.
- Proof: the T6 screenshots in light and dark pass a contrast check.
- Stop rule: reuse srcly's existing tokens. No new palette.

**T22 · Field labels never cover boxes.**
- Evidence: labels overlap boxes on `/time-blocks`.
- Proof: no label rectangle intersects a box rectangle in the T6 screenshots, checked by a test.
- Stop rule: coordinate with `dependency-graph-legibility`. If placement needs a layout change, hide the labels behind hover instead.

## E7 Ship

**T23 · Engine in the wheel (M8).**
- Evidence: a released wheel shows N/A.
- Proof: a clean-venv `uvx` smoke on solid-route, with the wheel size recorded.
- Stop rule: more than 10 MB added means trimming the `lib.*.d.ts` files first.

**T24 · Metrics, findings, packets (M7).**
- Evidence: the earlier plan's M7. Tier 2 costs 44–130 s.
- Proof: as in the earlier plan's M7 acceptance.
- Stop rule: opt-in only (D5). Never on by default.

## E8 Engine hygiene

**T25 · `UPSTREAM.md` as the fork ledger.**
- Evidence: R9.
- Proof: a table with one row per analysis edit (ticket, files, fixture, whether it could be backported). Close or annotate tsx-data-flow's seven cleanup PRs, with the maintainer's OK.
- Stop rule: lands with T4, the first analysis edit.

**T26 · Registry under many roots.**
- Evidence: cap 2 and the 15-minute idle close are tested with the fake engine only. Python roots add a second kind of child.
- Proof: a test opens four roots in turn, and the least recently used one closes and restarts cleanly with its progress shown.
- Stop rule: coordinate with the Python session's registry changes. Whoever lands second rebases.
