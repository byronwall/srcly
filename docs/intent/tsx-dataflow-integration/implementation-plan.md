---
title: "Bring tsx-data-flow into srcly — implementation plan"
slug: "tsx-dataflow-integration"
phase: plan
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly — implementation plan

**Status:** proposed. Implementation starts only on explicit approval.

## Plan at a glance

M1 moves the engine into `engine/` and proves srcly's server can query it. After that, four tracks run in parallel. They share only the engine process and the evidence states.

| Track | Milestones |
| --- | --- |
| A, route graph | M2, then M4 (which also needs M3) |
| B, ledger | M3, then M5 |
| C, effects | M6 |
| D, supporting evidence | M7 |

M8 bundles the engine into the wheel. Until then, a released wheel shows data flow as N/A, so every milestone can ship.

#102 proposed an HTTP child on a loopback port. Because everything is in one repository, this plan uses a stdio JSON-lines child instead. It needs no port discovery and no open socket, and Python owns its whole lifetime. Inside the child, the existing worker and cache are reused.

## Implementation strategy

- **Primary seam:** `server/app/services/dataflow/engine.py` is the only code that starts, queries, cancels, or stops Node. A fake engine script speaks the same protocol for tests.
- **Fast local loop:** `cd engine && pnpm vitest run test/srcly`. These are contract tests against `examples/solid-route` and srcly's `client/`. The Python side is `cd server && uv run pytest tests/test_dataflow_engine.py`.
- **Proof ladder:**
  1. A fake engine for lifecycle failures: crash, hang, late reply, missing node.
  2. The real engine from `engine/`.
  3. The bundled engine in a clean-venv wheel (M8).
- **Rollback:** data flow appears only when the engine answers. Each milestone reverts as one PR.
- **Evidence states:** proven, partial, not analyzed, unsupported, stale, cancelled, budget. They are one enum, shared by the engine contract and the Python models.
- **Targets on srcly `client/`, measured in M3 and M4:** preview and return p95 ≤ 150 ms, progress ≤ 250 ms, warm first row ≤ 750 ms, cold ≤ 10 s. The base scan time must not regress.

## Milestone 1: Engine in srcly answers one query

- **Change — Move the engine into `engine/`.**
  - Land tsx-data-flow PRs 1–4 and its local route-proof edits first, then copy from that pinned SHA.
  - Bring over `src/analysis`, `src/project`, `src/api`, the analysis service, worker, and cache, plus examples and tests.
  - Leave behind `src/frontend`, the HTTP routes, the Markdown views (M7 restores the useful ones), and the serve CLI.
  - Add `engine/` to the pnpm workspace. Its tests and typecheck must pass unchanged.
- **Change — `engine/bin/srcly-engine.ts`.**
  - Protocol: `{id, op, params}` → `{id, ok, result|error}`, plus `cancel`.
  - Ops: `status`, and `routes` (via `createAnalyzer` → `buildRouteDataInventory`). Results carry `{generation, programHash, tsconfig}`.
  - A non-strict tsconfig is a named error.
- **Change — `services/dataflow/engine.py` and `routers/dataflow.py`.**
  - One lazy child per scan root. Replies are matched by id, late replies are dropped, and superseded requests are cancelled.
  - On shutdown or Ctrl+C, kill the process group.
  - Named N/A reasons: `node-not-found`, `no-tsconfig`, `non-strict-tsconfig`, `no-ts-files`, `engine-crashed`, `timed-out`.
  - Endpoints: `GET /api/dataflow/status` and `GET /api/dataflow/routes`.
  - Fake-engine lifecycle tests, plus one real smoke test that skips when there is no Node.
- **Change — Docs:** `docs/CODE_MAP.md` rows, and an `engine/` section in `AGENTS.md`.

### Desired end state

- `/api/dataflow/routes` lists the routes of `solid-route`.
- A scan without Node behaves exactly as today, with the reason shown.

## Milestone 2: Route graph in the dependency view

- **Change — Engine op `routeGraph {route}`.**
  - It projects `routeTotalityForRoute` → `projectRouteTotality` → a data-flow contract.
  - Nodes: `route`, `occurrence`, `control`, `field`, `terminal`, `frontier`, each with a parent and a span.
  - Edges: `render`, `handoff`, `field`, each with a proof status.
  - UI primitives are marked `collapsedByDefault`.
  - Contract tests on `solid-route`.
- **Change — Server:** `GET /api/dataflow/route-graph`, with a Pydantic model next to `DepGraph`.
- **Change — Client `viz/deps` Data flow mode.**
  - A toolbar mode switch, `flow=` in `navigation/location.ts`, and routes in the go-to palette.
  - A contract adapter into the existing `viewModel`. Field reach uses isolate. Nodes open through `openAt`.
  - Its own legend, and no import edges.
  - Vitest for the adapter.
- **Spike — Layout fit.**
  - Decision required: keep the existing packing, or add a route layout rule.
  - Evidence to gather: screenshots of `solid-route` and `/time-blocks` at 1440 and 1024 wide.
  - Fallback: one top-down rule in `layout.ts`, scoped to this mode and coordinated with `dependency-graph-legibility`.

### Desired end state

- Selecting a field lights its proven destinations. Nodes open the code viewer at their line. The layout decision is recorded.

## Milestone 3: Value ledger from the code viewer

- **Change — Engine: `expression-selection.ts`, `value-investigation.ts`, and op `valueFlow`.**
  - Input is a span (1-based lines, UTF-16 columns, exclusive end) plus its text. It resolves to one AST occurrence, or returns AST choices when ambiguous.
  - Supported transfers: static identifier and property reads, intrinsic JSX slots, and `??` / `||`.
  - Output is ordered rows with element and relation ids, frontiers, and budgets.
  - Fixtures: direct flow, a same-name negative, and a null-versus-finite negative.
- **Change — Server:** `POST /api/dataflow/value-flow`. It checks containment, compares against the expected generation, and returns `stale` when they differ.
- **Change — Client `investigation/`.**
  - "Inspect value flow" on a selection in the code viewer opens a pinned preview, then the workspace: header, locator, ledger, and inspector.
  - `navigation/investigation.ts` stores the return snapshot. Back, Forward, and Return restore it.
  - Keyboard navigation for the rows.
- **Acceptance:**
  - `HotSpotItem.tsx:135` reaches its JSX slot.
  - Line 134 stays distinct.
  - Line 130 keeps zero.
  - Line 145 is partial.
  - `value()!` is not treated as a check.
  - A changed imported helper marks the result stale.

### Desired end state

- From srcly scanning itself, the ledger is correct and Return restores the treemap. It works at 1440 and 1024 wide and by keyboard alone.
- If the line 135 proof isn't exact, the engine is fixed before any further UI work.

## Milestone 4: One path explanation from the graph

- **Change — Engine op `routePath {route, field, terminal}`.** It returns route lineage as ledger rows. A missing ordered fact becomes a frontier row, never an invented step.
- **Change — Client.** A graph destination opens the ledger, and Return restores the route, field, and camera.

### Desired end state

- On `/time-blocks`, field → destination → ledger shows the proven operations, their owners, and the frontiers.

## Milestone 5: Cross-file invocation identity

- **Change — Engine.**
  - Pair arguments, parameters, and returns per invocation in `program-value-summary*`, `program-callback-return.ts`, and `evidence-slice.ts`.
  - Support `For` over `shown()` with two callback parameters, and plain `node={node}` handoffs.
- **Change — Client.** Helper frames and branch expansion. Fallbacks, joins, and terminals stay explicit.

### Desired end state

- `HotSpotList.tsx:88` is proven through `row` to `HotSpotItem.tsx:135`, and line 109 stays isolated.
- Two-call identity-helper and returns-other-argument fixtures pass.

## Milestone 6: Effects panel

- **Change — Engine effects pass, op `functionEffects`.**
  - Built on the shared Program.
  - Call occurrences, transitive effects with argument substitution, and finite recursive summaries.
  - Activation channels, result handling, and coverage.
- **Change — `CodeModal/EffectsPanel.tsx`** in the metrics rail. Known and Partial show together. Witnesses open their spans. Marks are neutral.

### Desired end state

- `extractFilePath` is shown as a closed candidate, with its assumptions.
- `rankHotSpots` shows its catalog read.
- `startScan` shows its network witness and how its await and returned promise are handled.

## Milestone 7: Supporting evidence in srcly's pipelines

- **Change — Engine batch op `fileSignals`:** per-file metrics and finding spans.
- **Change — Server.**
  - A `dataflow` tool in `services/findings/`.
  - Catalog entries for burden, defenses, impossible defenses, relay, and fan-out/in, following the AGENTS.md metric rules.
  - Markers from finding spans.
  - A `dataflow.md` work-packets artifact.
  - The agent skill merged into `skills/srcly-code-quality`.
  - Compare picks these up through the catalog.

### Desired end state

- The treemap colors by impossible defenses, the code viewer marks the lines behind each count, and `srcly report` includes the work packets.

## Milestone 8: Engine ships in the wheel

- **Change — `build-srcly.sh`:** an esbuild bundle in `server/app/engine/`, with a fallback copy of `typescript`. The project's own `typescript` is preferred when present.
- **Change — Release check:** record the wheel size before and after, and run a `uvx` smoke test in a clean venv on `solid-route`.

### Desired end state

- With Node 18+ installed, users get every data-flow feature with no npm step. Without Node, they get a named N/A.

## Open decisions and spikes

- **Resident vs per-query process.**
  - Evidence: M3 cold and warm timings.
  - Fallback: spawn one child per query over the same protocol. Only `engine.py` changes.
- **Layout fit:** the M2 spike above.
- **Branch graph beside the ledger:** add one only if an M5 path reads worse as rows.

## Below the cut line

- The async execution view (`watchScan`, #103 M2), and turning a path or effects result into a work packet.
- Links from import-graph files to the routes they feed.
- Python effects, runtime traces, incremental invalidation, and saved evidence artifacts.
- Narrow layouts beyond keeping the source, Return, and status visible.
