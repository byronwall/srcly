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

1. **The base scan never waits.** The engine starts on first explicit use: Data flow mode, Inspect value flow, the effects panel, Symbols mode and Show references, `srcly refs`, or a `--dataflow` CLI flag. The treemap, explorer and import graph are the same with or without Node.
2. **Evidence is bound to a generation.** Every result carries `generation` and `programHash`. A query with an older `expectedGeneration` gets `stale`, and the client does not draw stale rows over current source.
3. **Not analyzed is never 0.** Each surface shows the query outcome by name. A metric the engine did not measure is `None` with an `na_reason`.
4. **One answer per expression.** The anchor graph decides where a value goes, ends and stops. The value-flow ledger is that graph laid out as rows; it never walks a slice of its own or copies a stop rule (ESLint refuses both imports in `value-flow.ts`). A new end or stop rule goes in `anchor-graph.ts` only, and both views get it. `pnpm parity-probe` compares the two on every selectable expression in a fixture root; run it after any change to either op. Before this rule, the ledger's copied rules passed every fixture test and still differed on 145 of 6,032 selections.

## Session tiers

The legacy entry point built the full legacy report before it answered anything: 130 s on srcly's `client/`. So the session has two tiers that share one Program.

- **Tier 1** builds the primary Program and a lazy evidence provider, and finds routes. It answers `routes`, `routeGraph`, `routePath`, `selectExpression`, `valueFlow`, `functionEffects`, `flowSignature`, `symbolRefs` and the anchor ops. `routes` never calls `buildRouteDataInventory`, which alone costs 17.5 s on visual-notes.
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

## Symbol binding (`symbolRefs`)

srcly's symbol index (`srcly refs`, Symbols mode, Show references) takes its TypeScript references from the checker. Tree-sitter still makes every declaration and id (`file#Name`, `file#Class.member`, `file#Name@type`), so ids never depend on Node.

- `symbolRefs` walks every identifier of the Program's own files. For each one it reports the reference kind (from syntax), the enclosing named declaration, and the declaration the checker binds: file, name, name position and meaning. The meaning is `type` for an interface or type alias; `typeof x`, `implements` and a type-only clause follow their position. An import or export clause's name is a `clause`: it locates a symbol and makes no edge. A union's member reports each member type's declaration (`also`).
- The join is exact. A target joins the tree-sitter symbol whose name is at the same line and UTF-16 column (`Symbol.names`). A member with no symbol joins the type, class, enum or variable that holds it. A reference with no enclosing declaration is module code. Anything that joins nothing stays out of the graph; unbound names are counted by reason.
- Projects: a tsconfig whose module resolution differs from the primary's (`paths`, `baseUrl`, `moduleResolution`, conditions, JSX import source) binds in its own Program, built on first use. A workspace package imported through its built `.d.ts` is followed to its source: the declaration map, else `dist/x.d.ts` → `src/x.ts`. The checker then looks up the same export path there.
- One binder per file. Python files, and TypeScript files outside the Program (tests, configs), keep tree-sitter references and position lookup. Without Node, an engine or a tsconfig, the whole index is tree-sitter, and `binder`/`binderReason` say so.
- Freshness: the index cache key holds the source files and every `tsconfig*.json`/`jsconfig*.json`. Any change refreshes the engine before the next `symbolRefs`. A cached checker index holds while the engine's current program hash matches; a cached fallback holds while the engine is still missing.
- Proof at product scope: `cd server && SRCLY_ENGINE_DEV=1 uv run python scripts/compare_binders.py <root>` compares both binders on every TypeScript reference and buckets the differences. On 2026-11-28 it found 39,141 of srcly's 40,736 tree-sitter references and 47,451 of explorEDA's 49,092 in the checker index. The rest were mostly name guesses and JSX tags bound to locals. Cost: `cd engine && node --expose-gc --max-old-space-size=4096 --import tsx scripts/symbol-refs-probe.ts --root <repo>`.
- Known limits: a non-solution root tsconfig that includes an app's files hides the app's own config; the `dist` → `src` guess applies when a built package has no declaration map; after a recorded engine crash, Symbols stays on tree-sitter until the failure clears.

## Library models

What a library does is data: rows in `engine/models/*.json`, checked against `engine/models/library-models.schema.json`. The engine names no framework in code. The research behind this is in `docs/research/dataflow-library-models-2026-11/README.md`.

- A row names a member the checker resolves (a module and export, or `Type.method`) and one of nine models: `origin`, `terminal`, `passes-through`, `consumes`, `calls-back`, `wraps`, `cell`, `slot` and `keyed`.
- Rows say where values go with access paths (`Argument[0].Member[queryFn].ReturnValue -> ReturnValue.Member[data]`), as CodeQL's models-as-data write them. One emitter reads them.
- A `cell` (`createSignal`, zustand's `create`) makes one state per call. A cell made inside a function keeps one state per call of that function. A step the walk cannot pin to one call is assumed, never `ok`.
- A `keyed` store (a context, the query cache, `localStorage`) joins a write and a read under one key. A constant key joins as modelled; a computed key joins as assumed.
- A `slot` is a JSX component that calls a function it is given (`<For each>`).
- A package call that no row names is an assumed effect. Where its generic signature ties an argument or a callback's return to the result, the engine proposes that path as a `type-signature` hint: assumed, never `ok`.
- Labels come from rows too: `state` (what a binding's state is), `scopes` (a handed function's scope role, `fetcher` or `server`) and `input: "url"` (a router hook that reads the URL). A framework call is one a row names.
- The scan Program holds no dependency JavaScript. Reading library source inside the scan erased user types and doubled the heap. Library source can only inform rows written offline.

To support a library, add rows. If a library needs a new shape, add the shape to the schema and one reader, never a rule that names the package. `AGENTS.md` (Engine) has the intake steps.

## Decisions

| Decision | Choice | What would change it |
| --- | --- | --- |
| TypeScript instance | The bundled TypeScript; the project's copy only when its major.minor matches | A real project that does not parse with the bundled version |
| Tier 2 | Opt-in through `--dataflow` only | Tier 2 under 10 s on a 50K-line app |
| Process | Resident child, closed after 15 idle minutes, at most two alive | Tier 1 under 2 s (per-query spawn), or RSS above 3 GB (a cap of one) |
| Back and Return | A view-state registry (`client/src/navigation/viewState.ts`): snapshots in `sessionStorage` under a token in `history.state`, so a copied URL opens plain | Nothing expected |
| Progress | The client polls `status` every 250 ms | Polling that shows up in profiles (then an SSE endpoint) |
| Priority | Never wrong, then never broken, then fast. Fewer proven paths is acceptable; a wrong proven path is not | — |
| Primary surface | The graph. The ledger is detail opened from a box or an edge | Reviews where a path cannot be read from the graph and its edge card |
| Box status | Each box takes its own status from the gaps located inside it; unlocated gaps go to the route box. A render edge takes its target's status. No box inherits the route's status | — |
| Links found by syntax | A declaration's parameter, prop-read and return links are `structural`: their own stroke, walked by reach, never counted as proven | — |
| Path ends | A path with no continuing relation starts naturally only at a literal, a literal `const` or an external import. Anything else is a dead-end frontier, and the outcome is `partial` | A fixture where a common, correct pattern reads as a dead end |
| File and folder anchors | One box per export, each traced on demand; a folder over 50 exports shows its files first. Never the union of every export's walk | A reader who needs "everything this folder reaches" as one picture: then a union over the opened exports only |
| Speed levers | Backbone first, profile-led analysis edits, and a result cache keyed by `programHash`. A Program scoped to the route's imports was measured and left off: tier 1 gained nothing and one anchor differed | A profile where Program build dominates after call identity |

These were dropped from the plan:

- Warming the engine at scan time: memory and CPU on every scan. The engine starts only when someone opens a data-flow surface.
- A full-page investigation workspace and a pinned preview. Back and Return use the view-state registry instead.
- `dataflow_defensive_ops`: the legacy count is per sink, and one guard feeds many sinks, so a sum per file counts a guard many times. `dataflow.md`'s defensive ledger lists the guards.
- A `findings/dataflow.py` tool: data-flow findings go to `report.md` and code-viewer marks from the saved `fileSignals` result. They are not in the file-findings panel.

## Measurements

Development Mac, Node 22, TypeScript 5.9.3, one cold run each (2026-10-23 and 2026-10-24).

| Target | Tier 1 | Full legacy report | RSS |
| --- | ---: | ---: | ---: |
| srcly `client/` (26K lines, 126 files) | 3.0 s | 130 s | 2.4 GB |
| visual-notes `app/` (65K lines, 487 files, 43 routes) | 13.9 s | 44 s | 2.0 GB |

`symbolRefs`, one cold run each (2026-11-27), heap after a full GC: srcly 2.1 s build and 4.1 s walk, 783 MB; visual-notes 3.4 s and 5.0 s, 1,051 MB; explorEDA 3.0 s and 10.8 s, 1,389 MB (two extra Programs for its apps).

- Cold `hello` is about 0.6 s. A warm `valueFlow` on srcly's client is 1 ms at p50 and 3 ms at p95.
- After the backbone-first work, the first drawn route box on visual-notes `/tasks` takes about 11 s cold and 3.4 s on reopen from the result cache.
- Memory is the binding limit for a resident child. `SRCLY_DATAFLOW_MEMORY_MB` and `pnpm memory-probe` (see `AGENTS.md`) keep it measured.
