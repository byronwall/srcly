# Data-flow engine: design

srcly's data-flow features come from one engine: the tsx-data-flow analysis, moved into `engine/` and run as one lazy Node child per scan root. This page keeps the design rules and the decisions behind them. For where each file lives, read the "Data flow (engine)" section of `docs/CODE_MAP.md`. For what each rule covers, read `docs/dataflow-coverage.md`. For commands, read the "Engine" section of `AGENTS.md`.

## Shape

```text
engine/                         Node 18+, TypeScript, Zod (the analysis, moved intact)
  bin/srcly-engine.ts           stdio JSON lines: {id, op, params} -> {id, ok, result | error}, progress frames
  src/srcly/session.ts          tier 1 session; tier 2 report on demand
  src/srcly/ops/*.ts            one file per op
  src/srcly/contracts/*.ts      Zod schemas, the source of truth for every payload
server/app/services/dataflow/   Python owns the child: spawn, reply matching, timeouts, kill
server/app/routers/dataflow.py  /api/dataflow/*
client/src/dataflow/            generated contract types, API calls, outcome labels
```

Three surfaces read the engine: the route graph in the dependency view, the value ledger from the code viewer, and the effects panel. srcly's batch pipelines (metrics, findings, marks, reports, compare) read it through `fileSignals` and `flowSignature`.

## Invariants

1. **The base scan never waits.** The engine starts on first explicit use: Data flow mode, Inspect value flow, the effects panel, or a `--dataflow` CLI flag. The treemap, explorer and import graph are the same with or without Node.
2. **Evidence is bound to a generation.** Every result carries `generation` and `programHash`. A query with an older `expectedGeneration` gets `stale`, and the client does not draw stale rows over current source.
3. **Not analyzed is never 0.** Each surface shows the query outcome by name. A metric the engine did not measure is `None` with an `na_reason`.

## Session tiers

The legacy entry point built the full legacy report before it answered anything: 130 s on srcly's `client/`. So the session has two tiers that share one Program.

- **Tier 1** builds the primary Program and a lazy evidence provider, and finds routes. It answers `routes`, `routeGraph`, `routePath`, `selectExpression`, `valueFlow`, `functionEffects`, `flowSignature` and the anchor ops. `routes` never calls `buildRouteDataInventory`, which alone costs 17.5 s on visual-notes.
- **Tier 2** is the legacy report (`fullReport()`), built only by `fileSignals`. It is slow, so only a batch caller asks for it: `srcly report --dataflow` and `srcly compare --dataflow`.
- `programHash` hashes the sorted `(file, size, mtime)` of the Program's source files, every governing tsconfig, the TypeScript version and the engine version. `status` recomputes it with `stat` calls only. A rebuild bumps `generation`.
- Refresh drops both tiers. There is no incremental invalidation.

## Outcomes and positions

Each reply has one outcome: `ok`, `partial` (stops at named frontiers), `not-analyzed` (with a reason: no Node, no config, crash, timeout, memory limit), `unsupported`, `stale`, `cancelled` or `budget` (with counts). Each node, edge and ledger row has an evidence status: `proven`, `partial` or `unsupported`, with the engine's typed reason. Nothing turns these into a score or a percentage.

All contracts use 1-based lines, 1-based UTF-16 columns and exclusive end columns. Python and the client never convert them. Tree-sitter byte offsets (srcly's own markers) are never mixed with engine spans.

## One contract, three languages

The Zod schemas in `engine/src/srcly/contracts/` are the source of truth. `pnpm emit-contracts` writes JSON Schema for Python and `client/src/dataflow/contract.generated.ts`. The Pydantic models are hand-written, and a test checks their fields against the schema. `contracts-current.test.ts` fails when the emitted files drift. Python refuses a child whose protocol version differs; there is no coexistence layer.

## Containment

- The child reads only files that the Program owns under the root. Python checks that every `file` parameter resolves under the scan root before it reaches the child.
- The child runs in its own process group and is killed as a group. Its argv is fixed: `node`, the entry path and fixed flags. There is no shell.
- The engine never runs target code. It only parses and type-checks it.

## Batch evidence (`fileSignals`)

`fileSignals` builds the tier 2 report once and returns:

- per TS/TSX file: impossible defenses, relay hops, fan-out, shape changes and path depth. Python adds repeated forks from the findings. These are the six `dataflow_*` catalog metrics (`server/app/services/dataflow/signals.py`), overlay metrics like findings and activity.
- findings, one per site:
  - `impossible-defense`: a `??` or `?.` whose guarded type is never null or undefined;
  - `repeated-fork`: a component that tests one discriminant at several sibling branch sites;
  - `context-relay`: a parent that reads a context hook and passes context-like props (`settings`, `selection`, `on*`, …) to a child in the same feature;
  - `broad-prop-bundle`: the same, with three or more plain props.
- `dataflow.md`: the legacy CLI's work packets, defensive ledger, repeated forks, prop relay, context relay and fan-out views.

The last result per root is saved on disk. The app colors the treemap and marks code-viewer lines from it while the file is unchanged. The app never starts tier 2 itself.

## Decisions

| Decision | Choice | What would change it |
| --- | --- | --- |
| TypeScript instance | The bundled TypeScript; the project's copy only when its major.minor matches | A real project that does not parse with the bundled version |
| Tier 2 | Opt-in through `--dataflow` only | Tier 2 under 10 s on a 50K-line app |
| Process | Resident child, closed after 15 idle minutes, at most two alive | Tier 1 under 2 s (per-query spawn), or RSS above 3 GB (a cap of one) |
| Back and Return | A view-state registry (`client/src/navigation/viewState.ts`): snapshots in `sessionStorage` under a token in `history.state`, so a copied URL opens plain | Nothing expected |
| Progress | The client polls `status` every 250 ms | Polling that shows up in profiles (then an SSE endpoint) |

These were dropped from the plan:

- `dataflow_defensive_ops`: the legacy count is per sink, and one guard feeds many sinks, so a sum per file counts a guard many times. `dataflow.md`'s defensive ledger lists the guards.
- A `findings/dataflow.py` tool: data-flow findings go to `report.md` and code-viewer marks from the saved `fileSignals` result. They are not in the file-findings panel.

## Measurements

Development Mac, Node 22, TypeScript 5.9.3, one cold run each (2026-10-23 and 2026-10-24).

| Target | Tier 1 | Full legacy report | RSS |
| --- | ---: | ---: | ---: |
| srcly `client/` (26K lines, 126 files) | 3.0 s | 130 s | 2.4 GB |
| visual-notes `app/` (65K lines, 487 files, 43 routes) | 13.9 s | 44 s | 2.0 GB |

- Cold `hello` is about 0.6 s. A warm `valueFlow` on srcly's client is 1 ms at p50 and 3 ms at p95.
- After the backbone-first work, the first drawn route box on visual-notes `/tasks` takes about 11 s cold and 3.4 s on reopen from the result cache.
- Memory is the binding limit for a resident child. `SRCLY_DATAFLOW_MEMORY_MB` and `pnpm memory-probe` (see `AGENTS.md`) keep it measured.
