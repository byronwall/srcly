---
title: "Bring tsx-data-flow into srcly — implementation plan"
slug: "tsx-dataflow-integration"
phase: plan
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly — implementation plan

## Plan at a glance

First, one shared foundation: the engine moves into `engine/`, and srcly's server can ask it one question. After that, the route graph and the value ledger proceed in parallel as separate tracks, as you asked. They share only the engine process and the evidence rules. Effects and supporting evidence are further tracks that can start any time after M1.

Order and why:

1. **M1 Engine in srcly answers one query.** This proves the move, the process lifecycle, and the N/A states before any UI depends on them.
2. **M2 Route graph** (track A) and **M3 Value ledger** (track B) run at the same time. Each is a first proof with its own decision rule. A layout problem can't block an engine problem, and an engine problem can't block a layout problem.
3. **M4 One path explanation** joins the tracks: a graph destination opens the M3 ledger.
4. **M5 Cross-file invocation identity** is the hardest precision work. It is isolated so it can't silently corrupt M3.
5. **M6 Effects panel**, **M7 Supporting evidence**, and **M8 Wheel packaging** close the program.

Pushback on #102's runtime: it proposes reusing tsx-data-flow's HTTP server on a loopback port. With one repository, a stdio JSON-lines child is simpler. It needs no port discovery, no readiness record parsing, and no exposed socket, and srcly's Python layer owns its whole lifetime. Inside the child, the existing analysis worker and cache are reused.

Every milestone leaves srcly shippable. Until M8, a released wheel has no engine and shows data flow as N/A.

## Implementation strategy

- **First proof:** `GET /api/dataflow/routes` lists `examples/solid-route`'s routes through the engine child (M1). Then the two parallel proofs: the route graph rendered in the dependency canvas, and the `HotSpotItem.tsx:135` ledger.
- **Primary seam:** `server/app/services/dataflow/engine.py`. It is the only code that starts, talks to, cancels, or stops Node. A deterministic fake engine script implements the same protocol for tests.
- **Fast local loop:** `cd engine && pnpm vitest run test/srcly`. These are contract tests that run engine operations against `examples/solid-route` and srcly's own `client/`. On the Python side, `cd server && uv run pytest tests/test_dataflow_engine.py`, using the fake engine.
- **Local dependencies:** the system `node` and `engine/node_modules` in development. The fixtures are checked-in examples plus srcly's `client/`.
- **Live confirmation:** visual-notes `/time-blocks` for the route graph, and a browser journey on srcly scanning itself.
- **Rollout and rollback:** There is no flag. Data flow appears only when the engine answers, so removing `engine/` or the router returns srcly to today's behavior. Each milestone reverts as one PR.

### Material dependency proof strategy

The one material dependency is the Node and TypeScript runtime.

```text
fake engine script (lifecycle: crash, hang, late reply, missing node)
    → real engine from engine/ in dev (contract tests on fixtures)
    → bundled engine in a locally built wheel (M8 smoke, clean venv)
```

No provider or network is involved. The bundled-wheel rung waits until M8, because development runs from the checkout.

## Milestone 1: Engine in srcly answers one query

This milestone moves the code and proves the process. There is no new UI.

- **Change — Move the engine into `engine/`**
  - First, land tsx-data-flow PRs 1–4 (dead-code removal) and its uncommitted route-proof edits there. Then copy from that pinned commit, so the move is a known snapshot. Record the source SHA in `engine/README.md`.
  - Move `src/analysis`, `src/project`, `src/api` (contracts, projections), the analysis-side parts of `src/server` (analysis-service, analysis-worker, cache), `examples/`, and the analysis tests. Leave out `src/frontend`, the HTTP routes, the Markdown views (M7 brings back the ones that are needed), and `bin/tsx-dataflow-serve`.
  - Add `engine` to the pnpm workspace. `pnpm --filter engine test` and `typecheck` must pass unchanged.
- **Change — srcly protocol entry `engine/bin/srcly-engine.ts`**
  - stdio JSON lines carrying `{id, op, params}` and returning `{id, ok, result | error}`, plus `cancel {id}`. The first ops are `status` and `routes`.
  - `routes` uses `createAnalyzer`, then `buildRouteDataInventory`. Every result carries `{generation, programHash, tsconfig}`.
  - Reject a non-strict tsconfig with a named error, which keeps the existing rule.
- **Change — Server owner `services/dataflow/engine.py` + `routers/dataflow.py`**
  - Start the child lazily on the first data-flow request, one per scan root. Match replies by request id, drop late replies, and cancel superseded requests. Stop the child on lifespan shutdown and Ctrl+C (`main.py`), killing the process group.
  - Named N/A reasons: `node-not-found`, `no-tsconfig`, `non-strict-tsconfig`, `no-ts-files`, `engine-crashed`, `timed-out`. Endpoints: `GET /api/dataflow/status` and `GET /api/dataflow/routes?path=`.
  - pytest with a fake engine script covers crash, hang, missing node, a late reply after cancel, and shutdown with no orphan processes. One real-engine smoke test is skipped when `node` is absent.
- **Change — Docs:** add `engine/` and the dataflow rows to `docs/CODE_MAP.md`, and an `engine/` section to `AGENTS.md` (pnpm, test command).

### Desired end state

- `srcly examples/solid-route`, then `curl /api/dataflow/routes`, lists its routes with a generation.
- A scan without Node or TS files behaves exactly as today, and `status` names the reason.
- Python lifecycle tests and the engine's moved test suite pass.

## Milestone 2: Route graph in the dependency view (track A)

This milestone renders route reach with srcly's canvas. It shows no path order; that is M4.

- **Change — Engine op `routeGraph {route}`**
  - Project `routeTotalityForRoute` into `projectRouteTotality`, then into a data-flow contract (`engine/src/srcly/route-graph.ts`).
  - The contract has hierarchical nodes: `route`, `occurrence`, `control`, `field`, `terminal`, `frontier`, each with `parent`, `file`, `line`, and `span`. Edges are `render`, `handoff`, and `field`, each with a proof status. UI primitives are marked `collapsedByDefault`, not removed.
  - Contract tests on `examples/solid-route` check node and edge counts, that every terminal has a span, and that frontiers keep their cause.
- **Change — Server `GET /api/dataflow/route-graph?path=&route=`**, with a Pydantic model next to `DepGraph`.
- **Change — Data flow mode in `viz/deps`**
  - Add a mode switch in the view toolbar, and `flow=<routeKey>` in `navigation/location.ts`. List routes in the go-to palette.
  - Add an adapter from the data-flow contract to the existing `viewModel` inputs. Reuse focus, expand in place, hover, keyboard, and legend. Field selection lights destinations through the isolate path. Node actions use `openAt` with the file and line.
  - Import edges never appear in this mode. Show a separate legend for data-flow edge kinds.
  - Vitest for the adapter and the field-reach selection.
- **Spike — Layout fit**
  - Decision required: keep in/center/out packing, or add a route layout rule.
  - Evidence to gather: screenshots of `solid-route` and `/time-blocks` at 1440 and 1024 wide. Can a reader answer "where does this field go?"
  - Fallback: add one top-down route rule in `layout.ts` behind the mode, coordinated with `dependency-graph-legibility`. All interaction layers stay unchanged.

### Desired end state

- Graph → Data flow → a `solid-route` route shows its component backbone. Selecting a field lights its proven destinations, and clicking a node opens the code viewer at that line.
- The layout spike has a recorded decision with screenshots.

## Milestone 3: Value ledger from the code viewer (track B)

This milestone is #102's M1, done inside srcly. It runs alongside M2.

- **Change — Engine `expression-selection.ts` + `value-investigation.ts`, op `valueFlow`**
  - Resolve a span (1-based lines, UTF-16 columns, exclusive end) plus the exact text to one AST occurrence in its owning Program. Ambiguous spans return AST choices.
  - Verify the supported transfers: static identifier and property occurrences, intrinsic JSX slots, and `??`/`||`. Return ordered rows with element and relation ids, frontiers, and the budgets used.
  - Fixtures cover direct property flow, a same-name negative, and a null-versus-finite negative. Contract tests use the real anchor `client/src/components/HotSpotItem.tsx:135`.
- **Change — Server `POST /api/dataflow/value-flow`**: check that the file is inside the project, pass through the expected generation, and return `stale` when the Program changed.
- **Change — Client `investigation/`**
  - In the code viewer, selecting an expression offers "Inspect value flow". This opens a pinned preview, then the workspace, which has a header, compact locator, ledger, and evidence inspector.
  - `navigation/investigation.ts` saves a return snapshot: filters, metric, expansion, selection, and camera. Back, Forward, and Return restore it.
  - The ledger supports keyboard row navigation and Escape, and restores focus.
- **Acceptance (from #102):**
  - Line 135 reaches its JSX text slot, and the line 134 title stays distinct.
  - `props.rank ?? "–"` is a default that keeps zero.
  - The line 145 metric is partial.
  - `value()!` is not treated as a runtime check.
  - Unknown, unsupported, stale, cancelled, and budget-exhausted states each have their own name.
  - A changed imported helper marks the result stale.

### Desired end state

- From srcly scanning itself, inspecting `props.node.name` shows a correct ordered ledger, and Return restores the treemap exactly.
- Layout works at 1440×900 and 1024×768. Scope, rows, and the inspector work by keyboard alone.
- The decision rule ran: if generic evidence can't prove line 135 exactly, the engine gap is fixed before any more UI work.

## Milestone 4: One path explanation from the graph

This joins tracks A and B. It needs M2 and M3.

- **Change — Engine op `routePath {route, field, terminal}`.** It turns route field lineage into the same ledger rows `valueFlow` returns, keeping route occurrence and terminal ids. It never invents a step: a missing ordered fact becomes a frontier row.
- **Change — Client.** Selecting a destination in Data flow mode opens the investigation workspace with that path. Return goes back to the graph with the route, field, and camera restored.

### Desired end state

- A `/time-blocks` field → destination → ledger shows its proven operations, owners, and any frontier. Return lands on the same graph view.

## Milestone 5: Cross-file invocation identity

This is #102's M2. It is kept apart because false joins are the top precision risk.

- **Change — Engine.** Add argument, parameter, and return pairing by exact invocation in `program-value-summary*`, `program-callback-return.ts`, and `evidence-slice.ts`. Support `For` over `shown()` with two callback parameters, and plain `node={node}` handoffs.
- **Change — Client.** Add helper frames and branch expansion in the ledger. Fallbacks, joins, and terminals stay explicit.
- **Acceptance:**
  - `HotSpotList.tsx:88` `item.node` reaches `HotSpotItem.tsx:135` through `row`.
  - The line 109 N/A call never joins it.
  - A two-call identity-helper negative passes, as does a helper that returns another argument.

### Desired end state

- The line 88 path is proven, and line 109 stays isolated. Precision fixtures guard both.

## Milestone 6: Effects panel

This is #103's M1, and it can start any time after M1.

- **Change — Engine effects pass and op `functionEffects {file, line, column}`.** Build it over the shared Program. It reports call occurrences, transitive effects with argument substitution, finite recursive summaries, the two activation channels, result handling, and coverage alongside facts.
- **Change — `components/CodeModal/EffectsPanel.tsx`** in the metrics rail. Known plus Partial show together, each witness opens its exact span, marks are neutral, and missing runtime or configuration shows unavailable.
- **Acceptance:**
  - `extractFilePath` is a closed transformation candidate, with its assumptions shown.
  - `rankHotSpots` shows its transitive `metricDef` catalog read.
  - `startScan` shows the network call and how its awaits and returns are handled.

### Desired end state

- All three anchors render correct panels in srcly scanning itself. The compact semantic fixture passes.

## Milestone 7: Supporting evidence in srcly's pipelines

- **Change — Batch op `fileSignals`.** It returns per-file render-path metrics and findings with line ranges, keeping the same generation identity.
- **Change — Server.**
  - A `dataflow` findings tool in `services/findings/` (laid over the tree, cached by fingerprint plus engine version).
  - Catalog entries for burden, defenses, impossible defenses, relay, and fan-out/in, following the AGENTS.md metric rules, with markers from finding spans.
  - A work-packets `dataflow.md` artifact in `reporting.py`, with the agent skill merged into `skills/srcly-code-quality`.
- **Change — Compare** picks these metrics up through `COMPARE_METRICS` (portable when Node is available on both sides).

### Desired end state

- The treemap can color by impossible defenses, Hot Spots ranks by burden, the code viewer marks the lines behind each count, and `srcly report` includes data-flow work packets.

## Milestone 8: Engine ships in the wheel

- **Change — `build-srcly.sh`.** esbuild-bundle `engine/bin/srcly-engine.ts` into `server/app/engine/`, including a fallback `typescript` copy. `engine.py` uses the project's `typescript` first, then the bundled copy.
- **Change — Release check.** Record the wheel size before and after, and smoke-test `uvx` with the built wheel on `examples/solid-route` in a clean venv.

### Desired end state

- A user installing srcly with Node 18+ on PATH gets all data-flow features with no npm step. Without Node, they get named N/A.

## Cross-cutting verification

- **Performance targets** (record them per milestone, and profile misses instead of trimming evidence): preview and return p95 ≤ 150 ms, progress ≤ 250 ms, warm first row ≤ 750 ms, cold ≤ 10 s on srcly `client/`. Measure them in M3 and M4 alongside the base-scan time, which must not regress.
- **Evidence-state vocabulary**: proven, partial, not analyzed, unsupported, stale, cancelled, budget. One shared enum in the engine contract and the Python models, with tests in every track.

## Open decisions and spikes

- **Resident vs per-query process.** Decision: keep the M1 child resident, or spawn one per query as #103 starts. Evidence: cold versus warm timings from M3. Fallback: the per-query spawn reuses the same protocol, so only `engine.py` changes.
- **Layout fit** (M2 spike, above).
- **Branch graph beside the ledger.** Decision: add one only if an M5 path reads worse as rows. Fallback: rows with expansion.

## Below the cut line

- The bounded async execution view (`watchScan` lifecycle, #103 M2).
- A selected path or effects result → work packet or agent prompt.
- Linking import-graph files to the routes they feed.
- Python effects, runtime tracing, and incremental Program invalidation (rebuild the whole generation on refresh).
- Saved or historical evidence artifacts, and deep links to the retired tsx-dataflow-serve.
- Mobile or narrow layouts beyond keeping the source, Return, and status visible.
