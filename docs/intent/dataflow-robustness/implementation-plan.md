---
title: "Data flow robustness — implementation plan"
slug: "dataflow-robustness"
phase: plan
status: current
last_updated: "2026-10-24"
---

# Data flow robustness: implementation plan

**Status:** proposed. T1–T3 are ready to implement. Later tickets are sized and ordered, and each gets its detail when it comes up. The full seed list, with evidence, proof and a stop rule for each, is in [backlog.md](backlog.md).

## Plan at a glance

Honesty comes first because it is the cheapest and the safest work. T1–T3 change only srcly's projection code (`engine/src/srcly/ops/`), not the analysis. They make the status strokes and outcomes that every later ticket relies on mean what they say. A test net (E2) follows, before anything touches speed or the analysis. Then the 10 s work (E3) starts with a profiler, not a guess. The progressive graph and profile-led performance edits are the main path, the cache helps on reopen, and the scoped Program waits for call identity (E4). Scoping before then would undercount call sites and turn boundaries into false proven paths.

After the core, the carried milestones land in the order the maintainer chose: effects (M6), then explaining an edge (M4), the wheel (M8), and metrics and findings (M7). The graph-surface tickets (E6) run alongside, once the browser smoke (T6) exists to catch regressions.

Every ticket is one PR stacked on the one before it, starting from `claude/dataflow-anchor-menus`. Each leaves the system runnable and reverts on its own.

## Implementation strategy

- **First proof:** T1. Per-box status on solid-route `/records` and visual-notes `/time-blocks`.
- **Primary seams:** the engine's srcly ops (`engine/src/srcly/ops/*`) for projection fixes, the analysis (`engine/src/analysis`) only for T4, T10 and T13, each recorded in `engine/UPSTREAM.md`, and `server/app/services/dataflow/engine.py` plus `server/tests/fake_engine.py` for lifecycle.
- **Fast local loop:** `cd engine && pnpm vitest run test/srcly`. For the server, `cd server && uv run pytest tests/test_dataflow_*.py`. For the client, `cd client && pnpm vitest run src/viz/deps/flow`.
- **Proof ladder:**
  1. Fixture contract tests.
  2. The fake engine in every outcome shape.
  3. The real engine on solid-route in Playwright.
  4. Local measurement on srcly `client/` and visual-notes `app/`, recorded in `../tsx-dataflow-integration/measurements.md`.
- **Rollback:** one revert per ticket. Performance tickets sit behind `SRCLY_DATAFLOW_*` switches until two measurements agree.

## Ticket graph

```text
E1 honesty            E2 test net             E3 speed                       E4 call identity
T1 ─┐                 T5 ─┐                   T8 ──┬── T9 ── T11               T13 ── T12 (scoped Program)
T2 ─┼── T4            T6 ─┼── (gates E6)       └── T10
T3 ─┘                 T7 ─┘
         └────────── E1 before E2 before E3 (R13) ──────────┘
                                       │
                 E5 effects (M6): T14 ── T15          ← first after the core (R7)
                 E6 graph surface: T16 (M4) · T17 ── T18 · T19 · T20 · T21 · T22   (after T6)
                 E7 ship: T23 (M8) ── T24 (M7, needs tier 2)
                 E8 hygiene: T25 (UPSTREAM.md ledger, with T4) · T26 (registry under many roots)
```

| Epic | Tickets | Size |
| --- | --- | --- |
| E1 Never wrong | T1 per-box status · T2 declaration-anchor honesty · T3 `disconnected` split · T4 non-filesystem field lineage | S · S · S · L |
| E2 Never broken | T5 fake engine shapes · T6 Playwright smoke · T7 stale end to end | M · M · M |
| E3 Fast | T8 profiler · T9 progressive route graph · T10 analysis perf edits · T11 disk cache · T12 scoped Program | S · L · L · M · L |
| E4 Call identity | T13 `callId` and invocation stack (M5 edits 1–2) | M |
| E5 Effects (M6) | T14 `functionEffects` op with the 21-case fixture · T15 effects in the code viewer and graph | XL · M |
| E6 Graph surface | T16 explain an edge (M4) · T17 view-state Return · T18 anchor history · T19 file and folder anchors · T20 multiple anchors · T21 dark-theme tokens · T22 label placement | M · M · S · L · L · S · M |
| E7 Ship | T23 wheel (M8) · T24 metrics, findings, packets (M7) | M · L |
| E8 Hygiene | T25 fork ledger · T26 registry stress | S · S |

## Milestone 1: E1 Never wrong: every box and edge claims only what it proved

T1–T3 change only srcly's projection ops, not the analysis, so they are the cheapest and safest work and come first. T4 is the first analysis edit and lands with the fork ledger (T25).

### T1: per-box status in `routeGraph`

`fix(engine): route graph status per box, not per route`

- **Change — `engine/src/srcly/ops/route-graph.ts`.**
  - Replace the single `status` (line 101) with a `statusFor(nodeId)` lookup built after all nodes are drawn.
  - Collect "partial marks": each location in `surface.omissions[].locations`, and each `totality.gaps[]` entry whose `location` is non-null and whose `source` is `occurrence-surface` or `evidence-slice`.
  - Attach each mark to the deepest drawn node whose own span contains it. That is the call site for occurrences and controls, or the definition span when a definition owns the file and the location falls inside it. Any mark that matches nothing goes to the route box.
  - A node with a mark is `partial`, and so is the route box when the surface `status !== "complete"`. Every other node is `proven`. Origins and frontiers keep their own status, as they do today.
  - A render edge takes its target node's status.
  - Each `partial` node carries `reason` from its first mark (an omission reason or a gap reason), so the inspector can say why.
- **Change — Tests.**
  - `engine/test/srcly/route-graph.test.ts` gains a case on solid-route `/records`. The set of `partial` nodes equals the set of nodes owning a mark, and at least one occurrence is `proven` when the route is `partial`.
  - Regenerate `solid-route.route-graph.json` with `pnpm capture-route-graph`. `client/src/viz/deps/flow/adapter.test.ts` reads it, so check that its stroke assertions still hold.
- **Change — Measure.** Count proven against partial boxes on `/time-blocks` before and after, and add one row to `measurements.md`.
- **Spike inside the ticket.** If more than half of the `/time-blocks` gaps have no location, record that and fall back to the occurrence's own omissions (R14). Never fall back to the route's status.

**Done when:**

- A partial route shows mostly proven strokes, with partial strokes only where the engine named a gap. Each partial box's inspector shows the gap's reason.
- `cd engine && pnpm test && pnpm typecheck && pnpm lint` pass. The client flow tests pass. The PR attaches before and after screenshots of `/records` at 1440.

### T2: declaration anchors draw only what they proved

`fix(engine): declaration anchors never mark found-by-syntax links proven`

- **Change — Contract `engine/src/srcly/contracts/anchor-graph.ts`.**
  - Edges take `anchorEdgeStatusSchema = evidenceStatusSchema.or(z.literal("structural"))`. The enum is defined in srcly's contracts, so `src/api` stays untouched (R15).
  - Run `pnpm emit-contracts` and mirror the change in `server/app/services/dataflow/models.py`. `tests/test_dataflow_models.py` checks the mirror.
- **Change — `anchor-graph.ts:declarationRuns`.**
  - The `parameter`, `prop-read` and `returns` edges become `status: "structural"`. A `structural` edge never makes the outcome `ok` on its own.
  - Prop reads come from the provider's own relations instead of the regex on source text. Follow `references` from the parameter element to its reads, then `field-input` (receiver → field read, `program-evidence-collector-field-transfers.ts:93`). Each edge keeps that relation's status and proof. If no such relation exists, there is no edge; nothing is guessed. Check destructured parameters (`{ viewer }`) in the fixture below. If the collector binds them some other way, follow that relation and name it in the PR.
  - `landed` for a declaration is true only when **every** run landed: a terminal for each down run, an origin for each up run. Otherwise the outcome is `partial`. Keep the budget rule.
- **Change — Client.**
  - `marks.ts` and `DependencyCanvas` draw `structural` as a thin dotted neutral stroke. The legend gets one line: "found by structure, not traced".
  - `reach.ts` walks `structural` edges but never counts them as proven reach.
  - `inspectorModel.ts` counts them separately.
- **Tests.**
  - Update `anchor-graph.test.ts`: on solid-route, a component anchor's parameter edges are `structural`, and its outcome is `partial` when one prop read stops.
  - Add a destructured-props case to `examples/value-flow-basics/`. The fake engine's `anchorGraph` reply gains one `structural` edge, and the client adapter test checks the stroke.

**Done when:**

- No edge in any anchor-graph fixture is `proven` with `proof: []`. Add an assertion over every edge in the fixture.
- A component anchor whose prop walks don't all land reads `partial`.

### T3: `disconnected` becomes a natural start or a dead end

`fix(engine): a dead end in an anchor walk is a frontier, not the end of a path`

- **Change — `anchor-graph.ts:gaps`.**
  - Replace `gap.reason === "disconnected" → skip` with a classifier on the element at `gap.from`.
  - It is a **natural start** (no box) when the element's node is a literal, a `const` initializer that is a literal or a template literal without substitutions, or an import whose module resolves outside the root.
  - Otherwise it is a **dead end**: a frontier box with `reason: "disconnected"`, labelled "dead end · nothing continues from here", and the outcome becomes `partial`.
  - A seed missing from the index keeps today's `unsupported`, `no-evidence-element`.
  - Fix the comment: upstream never raises `disconnected` at a terminal (`evidence-slice.ts:283`).
- **Change — The same rule in `value-flow.ts`** (the ledger's boundary rows), so the graph and the ledger agree.
- **Tests.**
  - Add `examples/value-flow-basics/src/dead-end.tsx`: a value assigned to a local that is never read, and a value passed to an untyped callback. Each draws a dead-end frontier.
  - Add `literal-start.tsx`: `const label = "x"` rendered. No frontier.
  - Regenerate `solid-route.anchor-graph.json`. List any new frontiers in the PR body, one line each, so a reviewer can judge the false-dead-end rate against R16.

**Done when:**

- On solid-route and on srcly `client/` (`HotSpotItem.tsx:135` backward and forward), every path that ends without a terminal or an origin either has a frontier or starts at a literal.
- The PR body lists the dead ends found on srcly `client/` for three anchors, and none is a pattern the maintainer reads as normal. If one is, add it to the natural-start list with a fixture.

### T4: field lineage from non-filesystem origins

Detailed when T1–T3 merge. The seed, evidence and stop rule are in [backlog.md](backlog.md#e1-never-wrong).

### Desired end state

- On solid-route and the corpus anchors, every `proven` stroke has proof, partial boxes are the ones the engine named, and every path end is a terminal, an origin, a literal start or a frontier.
- The records origin lights its rows (T4), or it shows a named frontier where lineage stops.

## Milestone 2: E2 Never broken: every failure named and caught before merge

T5 fake engine shapes generated from the emitted schemas, T6 Playwright smoke on solid-route with the real engine (light and dark), and T7 stale end to end. Detail is in [backlog.md](backlog.md#e2-never-broken).

### Desired end state

- Every op, in every outcome, has a router and client test. One CI browser job covers the menus and anchor flows in under 3 minutes.

## Milestone 3: E3 Fast: the first result within 10 s cold on visual-notes

T8 profiler first, then T9 progressive route graph and T10 profile-led analysis edits (order set by T8), T11 disk cache for reopening, and T12 scoped Program after Milestone 4.

### Desired end state

- Cold `/time-blocks` reaches its first box in ≤ 10 s, and a reopen in under 3 s. Proven sets on every fixture are byte-identical to before. `measurements.md` has the rows.

## Milestone 4: E4 Call identity: two calls of one helper never join

T13: M5 edits 1–2 (`callId` on `argument-binding` and `function-return`, and an invocation stack in `evidence-slice.ts`) with the two negative fixtures. Runs beside Milestone 3.

### Desired end state

- Line 88's walk passes through `row` without reaching line 109. Where line 135 still needs a recognition edit, the walk stops at a named frontier.

## Milestone 5: E5 Effects (M6): what a function touches

T14 `functionEffects` with the 21-case fixture, then T15 effects on a function's box in anchor mode and in the code viewer rail. This is first after the core (R7).

### Desired end state

- The earlier plan's three M6 anchors show their evidence, with Known and Partial together. There are no scores.

## Milestone 6: E6 Graph surface: explain, return, trace more, read clearly

T16 explain an edge (M4), T17 view-state Return, T18 anchor history, T19 file and folder anchors, T20 multiple anchors, T21 dark-theme tokens, and T22 label placement. Starts once T6 exists.

### Desired end state

- A lit edge explains itself in order, and Return restores the canvas. Files and pairs of anchors trace. The dark theme reads correctly, and no label covers a box.

## Milestone 7: E7 Ship: the wheel, then supporting evidence

T23 engine in the wheel (M8), then T24 metrics, findings and work packets (M7), opt-in on tier 2.

### Desired end state

- A clean-venv `uvx` install answers solid-route `/records`. The catalog metrics appear when tier 2 has run, and are named N/A otherwise.

## Milestone 8: E8 Engine hygiene

T25 `UPSTREAM.md` as the fork ledger (with T4), and T26 the registry under many roots (coordinated with the Python session).

### Desired end state

- Every analysis edit has a ledger row and a fixture. Four roots opened in turn never leave an orphaned child.

## Cross-cutting verification

- **Proof safety:** every ticket that touches the engine keeps `scripts/accept-route-field-proof.ts` (G01–G20) and the `value-flow.test.ts` acceptance table green.
- **Measurements:** each E3 ticket adds a dated row for both local corpus apps.
- **Docs:** each ticket updates its `docs/CODE_MAP.md` row in the same PR (AGENTS.md).

## Open decisions and spikes

- **T8 → T9 or T10 first.** The output is the profile of `routeTotality.get` on `/time-blocks`, by phase. If one analysis phase is over half the time, do T10 first. Otherwise do T9 first. Either way, both follow.
- **T19, the export anchor's meaning.** A file anchor could be the union of its exports' forward walks, or one box per export with lazy expansion. Decide on srcly `client/src/utils/` with a screenshot of each. The fallback is one box per export.

## Below the cut line

- M5's `For`-over-call and plain-identifier-prop recognition edits, and D3's branch graph beside the ledger.
- Name anchors beyond identifiers, and multi-line JSX scope anchors.
- Legend length and default state, the inspector's width at 1024, keyboard and screen-reader work.
- Warming the engine at scan time. Parallel route workers. An SSE progress transport (D8 still stands).
- Backporting fork edits upstream to tsx-data-flow.
