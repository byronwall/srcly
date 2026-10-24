---
title: "Bring tsx-data-flow into srcly — detailed plan"
slug: "tsx-dataflow-integration"
phase: plan
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly — detailed plan

**Status:** proposed. Implementation starts only on explicit approval.

This page is the implementation-level companion to [implementation-plan.md](implementation-plan.md). It keeps the same milestones (M1 to M8) and the same priorities (route graph, ledger, effects, supporting evidence). It adds what an implementer needs: the exact files, contracts, sequencing, tests, and the corrections that reading both codebases forced on the outline plan.

Everything below was checked against srcly at `b3117e3` (this branch) and tsx-data-flow at `b4f1ba4` plus its uncommitted route-proof edits, on 2026-10-23. Two measurements were taken; everything else is read from source.

## 1. Review of the outline plan

The outline plan has the right shape. Its problems are in the places where it assumed something about one codebase that is not true. Each item below changes a milestone, and each is picked up in that milestone's section.

### 1.1 Corrections that change the work

| # | Outline assumption | What the code says | Consequence |
| --- | --- | --- | --- |
| R1 | "Add `engine/` to the pnpm workspace." | srcly has no root `package.json` or workspace. `client/` is a standalone package with its own `pnpm-lock.yaml`. tsx-data-flow's `pnpm-workspace.yaml` is also not a workspace (it only holds `allowBuilds`). | `engine/` is a second standalone package beside `client/`, with its own lockfile. CI (`release.yml`) gets an engine install, test and bundle step. See M1 and M8. |
| R2 | "Land tsx-data-flow PRs 1–4 and its local route-proof edits first." | There are seven open PRs (1 to 7), a linear dead-code cleanup stack of about −10.5K lines. The uncommitted edits are 49 files, +2738/−692, and overlap the stack heavily. | Decide the port base before copying (decision D1). Default: commit the route-proof edits on `main`, port that, and drop the cleanup stack. Its frontend deletions become moot once `src/frontend` is left behind, and its engine deletions (about 3.2K lines) can be redone inside `engine/` with the audit script the stack also adds. |
| R3 | "A non-strict tsconfig is a named error." | `resolveProjectConfigs` only warns on a loose config and prefers strict ones. Nothing refuses. | The refusal is new code in the engine's session layer (M1). It must also handle solution files: srcly's own `client/tsconfig.json` is a solution file that points at `tsconfig.app.json`. The existing expansion handles that. |
| R4 | The route graph is proved on `examples/solid-route` and on `/time-blocks`. | Routes are discovered by path convention only (`/routes/` in the path, `route-discovery.ts`). srcly's own client has no routes, so Data flow mode is N/A on srcly itself. `/time-blocks` is `visual-notes/app/src/routes/time-blocks.tsx`: 18 routes, about 65K lines, strict, `~/*` paths. | Name both targets in M2. `visual-notes/app` is the realistic proof, including the per-config program routing that `paths` triggers. The outline's "render srcly's `client/`" is only valid for the ledger and effects tracks. |
| R5 | "Cold ≤ 10 s" with the engine's existing cache. | `createAnalysisCache.ensureBuilt()` builds the Program, then the full legacy report (`analyzer.report()`), then a review report, before answering anything. A full report on srcly's `client/` (26K lines) took 133 s wall. `analyzeRouteData` runs inside `buildReport`, and the totality session is registered in a `WeakMap` keyed by that report. | M1 adds a two-tier session. Tier 1 builds Program, identity index, lazy evidence provider and route discovery, and answers route, value and effects queries. Tier 2 builds the legacy report only for M7's batch signals. The measured split is in section 9. This is composition code, not analysis changes, so "the analysis moves intact" still holds. |
| R6 | One shared enum: proven, partial, not analyzed, unsupported, stale, cancelled, budget. | The engine has three vocabularies: `EvidenceStatus` (proven, partial, unsupported) on elements and relations; `complete / partial / unavailable` on totality and lineage; and typed frontier and gap reasons. | Keep two layers (section 3.4): an *evidence status* per node, edge and row, and a *query outcome* per response. Folding them into one enum would lose the frontier reasons the UI needs. |
| R7 | "Call identity is kept. Two calls to one helper never merge." (must be true) | `argument-binding` and `function-return` relations are shared per callee, and the slice walk has no invocation stack. Two call sites can join today. | Until M5 lands, the ledger must refuse to walk through a callee with more than one call site and emit a frontier row (`unproven-handoff`) instead. That rule is specified in M3 so M3 never shows a false proof. |
| R8 | "Inspect value flow on a selection in the code viewer." | The code viewer never reads text selections. Source is injected as Shiki HTML (`innerHTML`), common indentation is stripped by default (`reduceCommonIndent`), and a selected scope renders only a slice of lines. DOM columns are not source columns. | M3 specifies the mapping from a DOM `Range` to a source span (line, UTF-16 column) through the `span.line` index, the display slice offset and the per-line indent that was removed. The engine resolves the span to AST candidates, so an imprecise selection is recoverable through a picker instead of a wrong answer. |
| R9 | "Return restores filters, metric, expansion, selection and camera." | Camera lives only in d3's zoom state on the SVG, `CanvasApi` has no get/set transform, every new layout refits, graph selection is a local signal, the metric is a context signal, graph filters are a module signal, and Explorer state is local to `Explorer.tsx`. Nothing captures them. | M3 adds a capture/restore registry (`navigation/viewState.ts`) that each owner joins, plus `CanvasApi.getTransform / setTransform` and a fit-suppression flag. Without this, Return cannot be exact. |
| R10 | Data-flow metrics "follow the AGENTS.md metric rules". | Those rules are for analyzer-computed metrics copied in `attach_file_metrics`. The engine runs beside the scan, so its metrics must be *overlay* metrics like activity and findings (`OVERLAY_METRICS`, `result_json_overlaid`, `apply_to_tree`). Two catalog tests pin today's witnessed set and profile leads. | M7 adds a `dataflow` overlay family and updates those two tests deliberately. |
| R11 | Zod contracts in the engine, Pydantic in Python, TS types in the client. | The client has no `zod`, and nothing links the three. | Generate from the Zod source of truth: JSON Schema for Python validation and a `.generated.ts` types file for the client, checked by a currency test like the catalog snapshot (section 7.1). |
| R12 | Bundle the engine with `esbuild`. | The engine resolves the target project's `typescript` at runtime and threads it as `ts`, but about 30 analysis files also `import * as TypeScript from "typescript"` and some call it as a value. Two TypeScript instances with different versions disagree on `SyntaxKind`. | Decision D4: the Program is built with the engine's bundled TypeScript unless the project's version has the same major and minor. The fallback copy ships as a real directory, not inlined, so `lib.*.d.ts` resolution works. |
| R13 | Markers "from finding spans" via `collect_markers`. | `collect_markers` re-runs a tree-sitter analyzer per file; `tests/test_markers.py` asserts marker count equals metric value. | The merge point is `routers/files.py:get_file_markers`, where findings markers are already merged in. Data-flow markers come from the cached batch result, not from re-analysis, and the count test gets a fake-engine case. |
| R14 | Protocol over stdout JSON lines. | The engine warns through `console.warn` (stderr, fine) but any stray `console.log` in analysis code would corrupt the channel. Worker progress is `postMessage`. | The bin entry rebinds `console.log` to stderr and keeps the worker-thread service for cancellation (`SharedArrayBuffer`), so a long query can be cancelled without killing the child. |

### 1.2 Stale facts in the repository this PR should also fix

- `docs/CODE_MAP.md` names `GET /api/analysis/dependencies`; the route is `/api/analysis/dependency-graph` (`routers/analysis.py:66`).
- The AGENTS.md metric checklist points at `server/app/services/tree_sitter_analysis.py`, which does not exist; the analyzer is `services/typescript/typescript_analysis.py`.
- The outline plan's anchors say `components/HotSpots/`; the files are `client/src/components/HotSpotItem.tsx` and `HotSpotList.tsx`. The line numbers (130, 134, 135, 145; 88, 109) hold on this branch.
- tsx-data-flow's `test/route-totality-field-proof.test.ts` and `test/route-totality-schedule-field-proof.test.ts` hard-code `/Users/byronwall/Projects/soccer-schedule/app` with no skip guard. They cannot move as-is (M1).

### 1.3 What the outline gets right and this plan keeps

- The engine supplies evidence and srcly draws it. No canvas, layout or SPA code moves.
- One lazy stdio child per scan root, owned by Python.
- Data flow mode uses its own contract and never relabels import edges.
- The ledger carries operation order; the graph shows reach.
- Every milestone is a revertible slice, and a released wheel without the bundle shows N/A.
- No purity score, no confidence percentage, N/A is never 0.

## 2. Architecture

```text
engine/                         Node ≥ 18, TypeScript, Zod            (tsx-data-flow analysis, moved intact)
  bin/srcly-engine.ts           stdio JSON-lines protocol, one worker thread, cancellation
  src/srcly/session.ts          tier 1: Program + identity index + lazy evidence provider + routes
  src/srcly/ops/*.ts            status · routes · routeGraph · selectExpression · valueFlow · routePath
                                functionEffects · fileSignals · workPackets
  src/srcly/contracts/*.ts      Zod schemas → emit JSON Schema + client .d.ts
           │ stdin/stdout, {id, op, params} ↔ {id, ok, result | error} + progress frames
server/app/services/dataflow/   Python owns the child: spawn, locate node, reply matching, timeouts, kill
  engine.py · models.py · availability.py · overlay.py · jobs.py
server/app/routers/dataflow.py  /api/dataflow/*   (status, routes, route-graph, select, value-flow,
                                route-path, function-effects, file-signals)
server/app/services/findings/dataflow.py   finding spans as a findings Tool (markers, file findings)
server/app/services/reporting.py           dataflow.md work packets artifact
           │ fetch
client/src/dataflow/            contract.generated.ts · api.ts · availability store · outcome labels
client/src/viz/deps/flow/       Data flow mode: contract → ViewModel adapter, legend, URL (flow, field, dest)
client/src/investigation/       pinned preview, ledger, inspector, Return (viewState snapshots)
client/src/components/CodeModal/EffectsPanel.tsx
client/src/navigation/viewState.ts   capture/restore registry every surface joins
```

Three invariants hold across every layer:

1. **The base scan never waits.** The engine starts on first explicit use (opening Data flow mode, Inspect value flow, the Effects panel, or `srcly report --dataflow`). The treemap, explorer and import graph are unchanged with or without Node.
2. **Evidence is bound to a generation.** Every result carries `{generation, programHash, tsconfig, typescript}`. Python compares `expectedGeneration` and returns `stale` instead of a mixed answer. The client refuses to overlay stale rows on current source.
3. **Not analyzed is never 0.** Every surface renders the query outcome by name. Metrics are `None` with an `na_reason`, never zero.

## 3. Engine package (`engine/`)

### 3.1 What moves, what stays, what is new

The move is a copy at a pinned SHA (decision D1), recorded in `engine/UPSTREAM.md` with the repository, SHA and the list below. History is not imported; `git subtree` would bring the frontend and 405 scratch directories with it.

| From tsx-data-flow | To `engine/` | Notes |
| --- | --- | --- |
| `src/analysis/**` (151 files, 37K lines) | `src/analysis/**` | Intact. `evidence-slice-cli.ts` is the only file that imports `cli/args`; it stays because tests use it. |
| `src/project/**` | `src/project/**` | `typescript.ts:packageDir` is recomputed for the bundle (M8). |
| `src/api/**` (contracts, projections, validators) | `src/api/**` | Intact. `report-views.ts` duplicates `REPORT_VIEWS`; leave it. |
| `src/types.ts`, `src/core.ts`, `src/cli/args.ts` | same paths | `core.ts` keeps `analyzeProject` for tier 2 and tests. |
| `src/reports/**` | `src/reports/**` | `format-helpers.ts` and `overview-selectors.ts` are imported by analysis and projections. The Markdown views are tier 2 input for M7 (`work-packets`, `defensive-ledger`, `prop-relay`, `fan-out`, `fan-in`). |
| `src/server/cache.ts`, `source-excerpts.ts`, `analysis-service.ts`, `analysis-worker.ts` | `src/service/**` | Reused for the worker thread and source excerpts. `cache.ts` is split (section 3.3). |
| `examples/solid-route`, `examples/compact-field-proof`, `examples/bad-ish-solid` (+ `reports/` goldens) | `examples/**` | The other examples (`node-cli`, `http-service`, `serverless-handler`, `solid-full-stack`) go only if a test needs them after the port base is settled. |
| `test/**` minus `test/frontend`, `test/server-*.test.ts`, `test/helpers/{http,server-test-context}.ts` | `test/**` | The two soccer-schedule tests are rewritten against `examples/compact-field-proof` or skipped with a reason (R-1.2). |
| `scripts/accept-route-field-proof.ts`, `scripts/route-field-proof-obligations.json`, `scripts/dead-code-audit.ts` | `scripts/**` | The acceptance runner stays the authority for named field proof. |
| `skills/render-path-dataflow-work/SKILL.md` | folded into `skills/srcly-code-quality/SKILL.md` in M7 | Only the Markdown-reading guidance; the rest describes the retired CLI. |
| `docs/analyzer.md`, `CONCEPTS.md`, `docs/route-field-proof-acceptance.md` | `engine/docs/` | Linked from srcly's `docs/CODE_MAP.md`. |

Left behind: `src/frontend/**`, `src/server.ts`, `src/server-cli.ts`, `src/server/{routes,responses,api-*}.ts`, `src/cli/{help,server-flags}.ts`, `bin/tsx-dataflow-serve.ts`, `vite.frontend.config.ts`, `eslint-plugin-solid`, `@solidjs/testing-library`, `jsdom`, `solid-js` as a dependency, and `tsx` as a runtime dependency (it becomes a devDependency; the bundle never needs it).

New in `engine/`:

```text
engine/
  package.json            name "@srcly/engine", private, type module; deps: typescript, zod; dev: esbuild, vitest, tsx, typescript-eslint
  pnpm-lock.yaml          own lockfile, like client/
  tsconfig.json           from tsconfig.server.json, include src/** bin/** scripts/**
  vitest.config.ts        plain node environment (no solid plugin)
  bin/srcly-engine.ts     protocol loop (section 3.2)
  bin/engine-worker.ts    imports src/service/analysis-worker
  src/srcly/session.ts    tier 1 / tier 2 session (section 3.3)
  src/srcly/protocol.ts   frame types, error codes, progress
  src/srcly/ops/          status.ts routes.ts route-graph.ts select-expression.ts value-flow.ts route-path.ts
                          function-effects.ts file-signals.ts work-packets.ts
  src/srcly/contracts/    dataflow-*.ts  (Zod, one file per op; shared primitives re-exported from src/api)
  scripts/emit-contracts.ts   writes server/app/services/dataflow/contracts/*.schema.json and
                              client/src/dataflow/contract.generated.ts
  scripts/bundle.mjs      esbuild → server/app/engine/ (M8)
  test/srcly/             contract tests per op against examples/solid-route and ../client
```

### 3.2 Protocol

One request per line on stdin, one reply per line on stdout. Frames are UTF-8 JSON, no embedded newlines. The bin entry rebinds `console.log` and `console.info` to stderr before importing any analysis module (R14).

```text
→ {"id": 1, "op": "hello",   "params": {"protocol": 1, "root": "...", "source": "src", "tsconfig": "tsconfig.app.json"}}
← {"id": 1, "ok": true, "result": {"protocol": 1, "engine": "<srcly version>", "node": "v22.21.1", "typescript": "5.9.3",
                                    "typescriptFrom": "project" | "bundled"}}
→ {"id": 2, "op": "routes",  "params": {}}
← {"id": 2, "progress": {"phase": "program", "message": "Building TypeScript program for 487 files", "completed": 0, "total": 487}}
← {"id": 2, "progress": {"phase": "identity", ...}}
← {"id": 2, "ok": true, "result": {"generation": 1, "programHash": "…", "tsconfig": "…", "routes": [...]}}
→ {"op": "cancel", "params": {"id": 7}}
← {"id": 7, "ok": false, "error": {"code": "cancelled", "message": "Analysis request was cancelled"}}
```

Rules:

- `id` is a positive integer chosen by Python. Replies carry the request `id`. Progress frames carry it too and may arrive any number of times before the reply.
- `cancel` has no `id` of its own and no reply. It sets the worker's `SharedArrayBuffer` flag exactly as `createAnalysisService.cancel` does today.
- Error codes (one string enum in `protocol.ts`, mirrored in Python): `invalid-request`, `no-tsconfig`, `non-strict-tsconfig`, `no-ts-files`, `typescript-not-found`, `stale-generation`, `not-found`, `unsupported-selection`, `ambiguous-selection`, `cancelled`, `budget-exhausted`, `internal`.
- The child exits on stdin EOF. Python kills the process group after 2 s if it has not.
- One request runs at a time inside the child (the worker is serial), but Python may pipeline requests; the child answers in completion order.
- Payload size is bounded per op (route graph ≤ 8 MiB, ledger ≤ 2 MiB). Over the bound the op returns `budget-exhausted` with the counts it did compute, never a truncated JSON line.

The existing `analysis-service.ts` request and cancel code is reused as the in-process layer between the protocol loop and the worker. Its `AnalysisOperation` union gains the new op kinds; `workspace`, `file`, `report`, `markdown` and `route-data` remain for tier 2 and tests.

### 3.3 Session tiers

`createAnalysisCache.ensureBuilt()` cannot be the engine's entry point, because it builds the full legacy report before answering (R5). `src/srcly/session.ts` replaces it with two tiers that share one Program:

```ts
export function createEngineSession(args: AnalyzerArgs, progress: AnalyzerProgressReporter) {
  // tier 1, built on first query
  const analyzer = createAnalyzer(args, progress);            // buildProgram + buildIdentityIndex (existing)
  const provider = createLazyProgramEvidenceProvider(analyzer.ts, analyzer.program, args.root);
  const routes = discoverRoutes(analyzer);                     // discoverRoute() per source file under /routes/
  const candidates = discoverSolidRouteCandidates(...);
  const totality = createRouteDataTotalitySession(ts, program, root, routes, provider, candidates, /* findings */ []);
  const generation = { id: 1, programHash: hashProgram(program, args) };
  // tier 2, built lazily by fileSignals / workPackets only
  let report: AnalysisReport | null = null;
  const fullReport = () => (report ??= analyzer.report());
  return { analyzer, provider, routes, totality, generation, fullReport, refresh };
}
```

- Tier 1 answers `routes`, `routeGraph`, `routePath`, `selectExpression`, `valueFlow` and `functionEffects`. Findings attachments on route nodes are empty in tier 1; they are tier 2 data and arrive in M7.
- Tier 2 answers `fileSignals` and `workPackets`. It is the legacy sink tracer and ranking, and it is slow (section 9). It runs only for the batch job, with its own timeout.
- `routes` lists `routes.map(r => ({key, pathPattern, file, parameters}))` straight from discovery. It must not call `buildRouteDataInventory`: on visual-notes that call alone costs 17.5 s because it builds an exhaustive path graph per route.
- `programHash` is a stable hash over the sorted `(fileName, size, mtimeMs)` of the Program's non-declaration source files, the text of every governing tsconfig, the TypeScript version and the engine version. It is cheap (one `stat` per file) and is recomputed by `status` so Python can detect staleness without rebuilding. A rebuild bumps `generation.id`.
- `refresh` drops both tiers. There is no incremental invalidation (below the cut line).
- The strict refusal (R3) lives here: after `resolveProjectConfigs`, if the primary config has `strictNullChecks` false and no governing config is strict, the session throws `non-strict-tsconfig` with the configs tried. Strict configs beside a loose one keep working as they do today.

### 3.4 Evidence vocabulary (two layers)

**Query outcome**, one per reply, in the `result.outcome` field and mirrored by Python and the client:

| Outcome | Meaning | Shown as |
| --- | --- | --- |
| `ok` | Every requested fact was computed. | normal |
| `partial` | Some facts stop at frontiers or gaps. The result says which. | "Partial" badge plus the frontier rows |
| `not-analyzed` | The engine has no Program for this root (no Node, no tsconfig, non-strict, no TS files, crashed, timed out). `reason` names which. | "Data flow N/A: <reason>" |
| `unsupported` | The selection or route is outside what the analysis handles. | the reason text |
| `stale` | The caller's generation is older than the session's. | "Source changed. Refresh." |
| `cancelled` | Superseded or cancelled by the caller. | nothing; the next result replaces it |
| `budget` | A traversal budget or payload bound stopped the walk. Counts are included. | "Stopped at budget: N of M" |

**Evidence status**, one per node, edge and ledger row: `proven | partial | unsupported`, exactly the engine's `EvidenceStatus`. Frontier nodes and rows also carry the engine's typed reason (`partial-proof`, `budget-exhausted`, `identity-lost`, `ambiguous-target`, `unsupported-relation`, `unsupported-transform`, `dynamic-index`, `renamed-prop`, `multiple-origins`, `evidence-truncated`, `unmapped-occurrence`, `unmapped-terminal`, plus the gap reasons `unsupported-syntax`, `dynamic-dispatch`, `external-code`, `unresolved-symbol`, `runtime-only`, `disconnected`, `unsupported-boundary`, `unproven-handoff`).

Nothing collapses these into a score or a percentage.

### 3.5 Source positions

All contracts use 1-based lines, 1-based UTF-16 columns and exclusive end columns, which is what `sourceLocationSchema` already does. Python and the client never convert; the client's selection mapping (M3) produces these numbers directly from the DOM. Tree-sitter byte offsets (srcly's own markers) are never mixed with engine spans.

## 4. Python server (`server/app/services/dataflow/`)

### 4.1 Files

| File | Responsibility |
| --- | --- |
| `engine.py` | `EngineProcess`: spawn, handshake, reader thread, pending futures keyed by id, per-request timeouts, cancel, kill. `EngineRegistry`: one process per resolved scan root, lazy, idle shutdown, cap. |
| `availability.py` | `locate_node()`, `locate_bundle()`, `probe(root) -> Availability` with the N/A reasons. Pure functions, no process. |
| `models.py` | Pydantic models mirrored from the generated JSON Schema (section 7.1). `Outcome` enum, `EvidenceStatus` enum. |
| `overlay.py` (M7) | `apply_to_tree(tree, signals)` like `findings/overlay.py`: per-file values, folder sums, `na_reasons`, root info. |
| `jobs.py` (M7) | `DataflowJob` per `(root, fingerprint)` like `FindingsJob`; runs `fileSignals` in batches with its own timeout. |
| `../findings/dataflow.py` (M7) | `DataflowTool(Tool)` whose `check()` turns finding spans into `Finding` records so markers and file findings work through the existing overlay. |
| `../../routers/dataflow.py` | The endpoints (4.3). |

### 4.2 Process ownership

```python
class EngineProcess:
    def __init__(self, root: Path, source: str, tsconfig: str | None, *, node: str, entry: Path): ...
    def request(self, op: str, params: dict, *, timeout: float, expected_generation: int | None = None,
                on_progress: Callable[[dict], None] | None = None) -> dict: ...
    def cancel(self, request_id: int) -> None: ...
    def close(self, grace: float = 2.0) -> None: ...
```

- Spawn: `Popen([node, entry, "--root", root, ...], stdin=PIPE, stdout=PIPE, stderr=PIPE, start_new_session=True, env={..., "NO_COLOR": "1"})`, the same flags `findings/tools.py:run_process` uses. stderr is drained to a ring buffer of the last 64 lines and included in `engine-crashed` reasons.
- A reader thread parses lines and resolves futures. A progress frame updates `EngineProcess.latest_progress`, which `/api/dataflow/status` serves.
- Timeouts: `hello` 10 s; tier-1 build is part of the first query, so first-query timeouts are `program_timeout = max(60, 0.25 s × source files)` and later queries 30 s; `fileSignals` batches 300 s. All are overridable with `SRCLY_DATAFLOW_TIMEOUT`.
- On timeout Python sends `cancel`; if no `cancelled` reply arrives within 2 s it kills the process group and marks the root `engine-crashed` until the next explicit retry.
- `EngineRegistry` keeps at most two live processes (measured RSS is about 2 GB per Program, section 9). Starting a third closes the least recently used. A process idle for 15 minutes is closed; the next query restarts it, and the client shows the progress UI again.
- Shutdown: `main.py:lifespan` gains `dataflow.engine.registry.close_all()` beside `cancel_all_scans()`, and the SIGINT chain cancels in-flight engine requests first. Today findings subprocesses outlive Ctrl+C until their own timeout; the engine must not.
- Dev mode: `locate_bundle()` prefers `resources.files("app") / "engine" / "srcly-engine.mjs"` (M8), then the repository's `engine/dist/srcly-engine.mjs`, then, when `SRCLY_ENGINE_DEV=1`, runs `engine/bin/srcly-engine.ts` through `engine/node_modules/.bin/tsx`. The dev path is what M1 to M7 use.

### 4.3 Endpoints

All handlers are plain `def` (threadpool), return `Response(content=bytes)` for large bodies, and take `path` (the scan root) like `/api/analysis/dependency-graph`. File paths in bodies must resolve inside `path`; otherwise 400. (`/api/files/content` has no such check today; the dataflow endpoints should not copy that.)

| Endpoint | Milestone | Request | Response |
| --- | --- | --- | --- |
| `GET /api/dataflow/status?path=` | M1 | | `{available, reason?, node?, engine?, generation?, programHash?, progress?}`. Never starts the child. 200 always. |
| `POST /api/dataflow/start` | M1 | `{path}` | Starts the child and tier 1 in the background; returns status. The client polls `status` every 250 ms while `progress` is present. |
| `GET /api/dataflow/routes?path=` | M1 | | `{outcome, generation, routes: [{key, pathPattern, file, absPath, parameters}]}` |
| `GET /api/dataflow/route-graph?path=&route=&source=` | M2 | | the route graph contract (M2) |
| `POST /api/dataflow/select` | M3 | `{path, file, span, text}` | `{outcome, candidates: [{kind, label, span}]}` |
| `POST /api/dataflow/value-flow` | M3 | `{path, file, span, text, direction, expectedGeneration}` | the ledger contract (M3) |
| `GET /api/dataflow/route-path?path=&route=&field=&terminal=` | M4 | | the ledger contract |
| `POST /api/dataflow/function-effects` | M6 | `{path, file, line, column, expectedGeneration}` | the effects contract (M6) |
| `GET /api/scans/{id}/dataflow` | M7 | | batch job status, like `/findings` |
| `DELETE /api/dataflow?path=` | M1 | | closes the child (used by tests and the folder menu's rescan) |

Status codes: 200 with `outcome` for every analysis state, including `not-analyzed` and `stale`. 400 for bad input or a path outside the root. 404 only for an unknown `route`, `field` or `terminal` id. 503 when the engine crashed and the request was the one that crashed it.

### 4.4 Tests

- `tests/fake_engine.py`: a Python script that speaks the protocol (`hello`, `status`, `routes`, scripted delays, a crash flag, a hang flag, a late-reply flag). `EngineProcess` is constructed with `node=sys.executable, entry=fake_engine.py`, so the lifecycle tests need no Node.
- `tests/test_dataflow_engine.py`: handshake, reply matching with out-of-order replies, late reply dropped after timeout, cancel then kill, crash → `engine-crashed` with stderr tail, EOF → child exits, registry cap and idle close, lifespan close.
- `tests/test_dataflow_router.py`: `TestClient(app)` against the fake engine; path containment; `status` never spawns; `stale` on generation mismatch.
- `tests/test_dataflow_smoke.py`: real engine on `engine/examples/solid-route`, skipped when `shutil.which("node")` is None or `engine/node_modules` is missing. Runs in CI (Node 24 is installed there).

## 5. Client

### 5.1 Shared module `client/src/dataflow/`

| File | Responsibility |
| --- | --- |
| `contract.generated.ts` | Types emitted from the engine's Zod contracts. Never hand-edited; a vitest asserts it matches `engine/scripts/emit-contracts.ts` output. |
| `api.ts` | `fetchDataflowStatus`, `startDataflow`, `fetchRoutes`, `fetchRouteGraph`, `selectExpression`, `fetchValueFlow`, `fetchRoutePath`, `fetchFunctionEffects`, each taking `signal`, in the style of `services/fileContent.ts`. |
| `availability.ts` | A per-root store: `availability()` (`unknown \| starting \| ready \| na`), `reason`, `progress`, `generation`; `ensureStarted(root)` posts `start` once and polls `status` at 250 ms until ready or N/A. Lives in `state/` style, outlives views like `scanStore`. |
| `outcome.ts` | `labelFor(outcome, reason)` and `toneFor(status)`: the one place the vocabulary of section 3.4 becomes text and color. |

### 5.2 Where each surface lives

| Surface | Files | Entry point |
| --- | --- | --- |
| Data flow mode (M2, M4) | `viz/deps/flow/{adapter.ts, model.ts, FlowLegend.tsx, FlowTools.tsx, RoutePicker.tsx}`; mode switch in `DependencyView.tsx` through `<ViewTools>`; URL params in `navigation/location.ts` | Graph view toolbar: "Imports / Data flow" segmented switch beside Detail −/+ |
| Investigation workspace (M3, M4, M5) | `investigation/{InvestigationView.tsx, PinnedPreview.tsx, EvidenceLedger.tsx, EvidenceInspector.tsx, ledgerModel.ts, selectionSpan.ts}`; `navigation/viewState.ts`; `navigation/investigation.ts` | "Inspect value flow" from the code viewer's selection; a destination click in Data flow mode |
| Effects panel (M6) | `components/CodeModal/EffectsPanel.tsx`, `hooks/useFunctionEffects.ts` | A section in `MetricsSidebar` under Findings, keyed on the selected scope |
| Metrics, markers, findings (M7) | nothing new; the catalog and overlay drive `MetricPicker`, `explorerColumns`, treemap color, `useMetricMarkers`, `FileFindings` | |

### 5.3 View-state capture and restore (`navigation/viewState.ts`)

Return must restore filters, metric, expansion, selection and camera, and today none of those is captured (R9). The registry is small:

```ts
export type ViewStateSnapshot = { location: Location; search: string; parts: Record<string, unknown> };
export function registerViewState(key: string, owner: { capture(): unknown; restore(state: unknown): void }): () => void;
export function captureViewState(): ViewStateSnapshot;
export function restoreViewState(snap: ViewStateSnapshot): Promise<void>;
```

Owners that register, and what they capture:

| Key | Owner | Captures |
| --- | --- | --- |
| `metrics` | `MetricsStoreProvider` | `metric`, `excludedPaths` |
| `graph.filters` | `navigation/store.ts` | `graphFilters` |
| `graph.view` | `DependencyView` | `selected`, `expanded` (already in URL), camera transform from a new `CanvasApi.getTransform()`; restore calls `setTransform` and sets `suppressFitOnce` so the next layout does not refit |
| `explorer` | `Explorer.tsx` | tab, sort, columns, expanded ids, scroll top, cohort |
| `treemap` | `Treemap.tsx` | extension filter, maxLoc |
| `code` | `AppContent` + `CodeModal` | open file, scope path, line range, scroll top, active metric overlay |
| `flow` | Data flow mode | route, selected field, destination (also in URL) |

Snapshots are stored in `sessionStorage` under `srcly-inv-<token>` with the token in the URL (`?inv=<token>`), so Back and Forward through the browser history restore them and a copied URL without the token still opens the investigation with defaults. `HistoryRing` is left alone; it is a recent-places list, not a history stack.

## 6. Milestones in detail

Each milestone is one or more stacked PRs with a Conventional Commit title. "Proof" is what must be true before the next PR in the track starts. "Rollback" is one revert.

### M1 — Engine in srcly answers one query

**Outcome.** `GET /api/dataflow/routes?path=<engine/examples/solid-route>` returns `/records` through a lazy stdio child. A scan without Node behaves exactly as today and `status` names the reason.

**Prerequisites in tsx-data-flow (decision D1).**

1. Commit the 49-file route-proof WIP on `main` behind its own test run (`pnpm verify`). The two soccer-schedule tests get `describe.skipIf(!fs.existsSync(soccerAppRoot))`.
2. Tag the SHA `srcly-port-base`.
3. Leave PRs 1 to 7 open. Record in `engine/UPSTREAM.md` that they were not ported and why. Run `scripts/dead-code-audit.ts` inside `engine/` as the last M1 PR and delete what the frontend removal orphaned (expected: `route-shadow-evidence*`, the non-Solid scope adapters, `program-evidence-loading.ts`, `component-occurrence-identity*`, about 3K lines). Tests must stay green through the deletion.

**PR 1 — `build(engine): move the tsx-data-flow analysis into engine/`.**

- Copy per the table in 3.1. `pnpm install` in `engine/`, commit the lockfile.
- `engine/package.json` scripts: `test` (vitest run), `typecheck` (tsc -p tsconfig.json), `lint`, `emit-contracts`, `bundle` (M8).
- Fix the cwd-dependent test (`route-totality-generic-field-proof.test.ts` resolves `examples/compact-field-proof` from cwd) to resolve from `import.meta.url`.
- Golden snapshot: keep the `tsx-dataflow` strings in Markdown output for now; renaming is M7's job when those views are re-exposed.
- `.github/workflows/release.yml`: add `pnpm install --frozen-lockfile` and `pnpm test` in `engine/` beside the client steps; add `engine/pnpm-lock.yaml` to `cache-dependency-path`.
- Proof: `cd engine && pnpm test && pnpm typecheck` pass unchanged (minus the removed frontend and server tests).

**PR 2 — `feat(engine): stdio protocol and tier-1 session`.**

- `src/srcly/protocol.ts`, `session.ts`, `ops/status.ts`, `ops/routes.ts`, `bin/srcly-engine.ts`, `bin/engine-worker.ts`.
- `analysis-service.ts` gains the new op kinds and is driven by the protocol loop instead of HTTP. The worker's `perform()` gains `status` and `routes` branches that use the session, not `cache.ensureBuilt()`.
- The strict refusal (3.3) and the `console.log` rebinding (3.2).
- `scripts/emit-contracts.ts` and the first two contracts (`hello`, `routes`).
- Tests `test/srcly/protocol.test.ts` (spawn the bin with `tsx`, drive it over pipes: hello, routes on solid-route, cancel during program build, EOF exit, non-strict refusal on a temp project, no-tsconfig refusal) and `test/srcly/session.test.ts` (tier 1 never calls `report()`; `programHash` changes when a file's mtime changes).

**PR 3 — `feat(server): python owns a lazy data-flow engine child`.**

- `services/dataflow/{engine,availability,models}.py`, `routers/dataflow.py` with `status`, `start`, `routes`, `DELETE`.
- `main.py`: register the router before the SPA mount; `lifespan` closes the registry.
- N/A reasons (`availability.py`): `node-not-found` (no `node` on PATH and no `SRCLY_NODE`), `engine-missing` (no bundle and no dev entry), `no-tsconfig`, `non-strict-tsconfig`, `no-ts-files`, `typescript-not-found`, `engine-crashed`, `timed-out`. The first three are decided without spawning; the rest come from the child.
- Tests per 4.4. The real smoke test runs in CI.
- Docs: `docs/CODE_MAP.md` gets a "Data flow (engine)" section with rows for every file above and fixes the stale `dependencies` row; `AGENTS.md` gets an "Engine" section: how to run it (`SRCLY_ENGINE_DEV=1`), how to add an op (contract → emit → Python model → router → client api), and the rule that analysis modules are not edited for srcly-specific recognition.

**Measurements recorded in `docs/intent/tsx-dataflow-integration/measurements.md`** (started in M1, appended by every milestone): cold `hello` + tier-1 time, RSS after tier 1, for solid-route, srcly `client/` and visual-notes `app/`.

**Rollback.** Remove `engine/`, `services/dataflow/`, `routers/dataflow.py`, the CI steps.

### M2 — Route graph in the dependency view

**Outcome.** With `?view=graph&flow=<routeKey>`, the graph canvas shows the route's component backbone down to terminals. Selecting an origin lights its proven destinations. Any node opens the code viewer at its line. The layout decision (D2) is recorded with screenshots.

**Engine op `routeGraph {route, source?}`** (`ops/route-graph.ts`, contract `contracts/dataflow-route-graph.ts`). It calls `routeTotalityForRoute(session, routeKey, selectedSource)` then `projectRouteTotality`, and projects the validated `RouteTotality` into srcly's graph style:

```ts
type FlowNodeKind = "route" | "occurrence" | "control" | "origin" | "field" | "terminal" | "frontier";
type FlowNode = { id; kind; label; parent: string | null; file: string; absPath: string; line: number; span;
                 status: EvidenceStatus; collapsedByDefault: boolean; repetition?: "single"|"conditional"|"collection"|"unknown";
                 external?: boolean; reason?: FrontierReason };
type FlowEdgeKind = "render" | "handoff" | "field";
type FlowEdge = { id; source; target; kind; status: EvidenceStatus; proof: EvidenceProof[]; pathIds?: {elements: string[]; relations: string[]} };
type RouteGraph = { outcome; generation; route: {key, pathPattern, file}; status: "complete"|"partial"|"unavailable";
                   nodes: FlowNode[]; edges: FlowEdge[]; origins: {elementId, role, label, status}[];
                   selectedSource: string | null; counts; gaps: {reason, label, location}[] };
```

Mapping from `RouteTotality`:

| Source | Node or edge |
| --- | --- |
| `route` | the `route` node, root of the hierarchy |
| `occurrenceSurface.occurrences[]` | `occurrence` nodes; `parent = renderParentId ?? parentOccurrenceId ?? route`; `collapsedByDefault = definition.external \|\| hiddenComponentPolicy hides it` |
| `occurrenceSurface.frameworkBoundaries[]` (`portal`, `control-flow`, `collection`, `suspense-async`, `unsupported-ownership`) | `control` nodes with the condition outcome in the label |
| `occurrenceSurface.terminals[]` (`jsx-text`, `dom-attribute`, `style`, `render-expression`) | `terminal` nodes, parent = `ownerOccurrenceId` |
| `occurrenceSurface.renderEdges[]` (`render`, `framework-boundary`, `slot-forward`, `transparent-splice`) | `render` edges, status from the surface (`proven` unless the occurrence surface is `partial`) |
| `bridges[]` | `handoff` edges |
| `occurrenceSurface.origins[]` / `evidenceSlice.origins[]` | `origin` nodes under the route (the pickable sources) |
| `fieldLineage.attachments[]` (only with a `source`) | `field` edges from the origin's `field` node to the consumer's terminal, `pathIds` = `evidencePathElementIds` / `RelationIds` |
| `fieldLineage.frontiers[]` | `frontier` nodes at `stoppedAtElementId`'s location with `reason` |
| `omissions[]`, `gaps[]`, `truncation` | `counts` and `gaps`; the client shows "N occurrences omitted (budget)" on the route node |

The graph is reach, not order. Nothing in this op invents a step; order lives in M4's ledger.

Contract tests on `examples/solid-route`: one `RouteFrame` occurrence owns the children, `MetricCard` has one definition and two occurrences, `ViewerCard` never receives records (no `field` edge from the records origin reaches it), and `For` in `RecordTable` is a `control` node of kind collection.

**Server.** `GET /api/dataflow/route-graph`, model `RouteGraph` in `models.py`. First call per route is slow on real apps (totality is lazy per route, with the per-route `selectedSource` cache); the client shows progress from `status`.

**Client.**

- `navigation/location.ts`: `flow?: string` (route key), `field?: string` (origin element id), `dest?: string` (terminal id). `view=graph` stays the view; `flow` switches the graph's mode. `samePlace` ignores `field` and `dest` like it ignores `open`.
- `viz/deps/flow/adapter.ts`: `routeGraphToViewModel(graph, {selectedField, collapsed}) : ViewModel`. Nodes become `ViewNode`s with `region = "center"`, `group = {id: parentOccurrenceId, label}`, so `assignGroups` draws each occurrence as an opened frame with its terminals inside, which is what the existing expand-in-place path already renders. Collapsed-by-default primitives roll into their parent frame's `memberCount`. `field` edges are only emitted for the selected field, as `ViewEdge`s with `weight = 1`, `faint = status !== "proven"`.
- `DependencyView.tsx`: when `location().flow` is set, the resource fetches `route-graph` instead of `dependency-graph`; filters X/T/Y are hidden; the legend swaps to `FlowLegend` (render = solid, handoff = dashed, field = accent, frontier = hatched box, collapsed primitive = dotted outline). Click = select origin or node; double-click / `o` = `props.onOpen(absPath, line)` which reaches `App.openAt` through a new overload that takes an absolute path and a line (today it takes a graph id). Shift-click on a collapsed frame expands it, the same gesture as today.
- `FlowTools.tsx` in `<ViewTools>`: the mode switch (Imports / Data flow), the route picker (`RoutePicker.tsx`, built on `DialogShell` like `GoToPalette`, lists `routes` and opens on `/` when in flow mode), and an origin picker for the selected route.
- `availability.ensureStarted(root)` runs when the mode is switched on; until `ready`, the canvas shows `ScanProgress`-style progress from `status.progress` (phase, completed/total). This is the "progress within 250 ms" requirement; the poll interval is 250 ms.
- Vitest: `flow/adapter.test.ts` on a checked-in `routeGraph` fixture captured from solid-route (`engine/test/srcly/__fixtures__/solid-route.route-graph.json`, regenerated by a script like `scripts/capture-dep-graph.sh`).

**Spike — layout fit (decision D2).** Render solid-route and `/time-blocks` through the adapter with today's `layoutWithHubs` at 1440 and 1024 wide. Record four screenshots in `measurements.md`. Decide: keep the packing (frames per occurrence) or add one top-down rule. The fallback is a `direction: "down"` option on `layoutComponent` that orders levels by hierarchy depth instead of in/center/out, used only when `vm.flow` is set, and coordinated with `dependency-graph-legibility` because both touch `layout.ts`.

**Proof.** solid-route and `/time-blocks` render; selecting the records origin lights `RecordTable` row terminals and not `ViewerCard`; every node opens the right line; the spike decision is written down.

**Rollback.** Revert the mode switch, the adapter and the `routeGraph` op.

### M3 — Value ledger from the code viewer

**Outcome.** Select `props.node.name` on `HotSpotItem.tsx:135`, choose "Inspect value flow", read an ordered ledger that reaches the JSX text slot, open any row's code, press Return, and be back on the same treemap with the same metric, filters, sidebar state and scroll.

**Engine: `ops/select-expression.ts`.** Input `{file, span, text}`. It finds the smallest AST node whose `[getStart, getEnd)` covers the span, in the file's `SourceFile` from the session's Program (or the routed program when `paths` apply). It walks up while the parent is one of the supported expression kinds and has the same text; it walks down when the span is wider than one expression and the text matches a child. Supported kinds in M3: `Identifier`, `PropertyAccessExpression`, `ElementAccessExpression` with a literal index, `CallExpression` whose callee is a Solid accessor (zero-argument call of a signal, memo or resource), `JsxExpression`, `BinaryExpression` with `??` or `||`, `ConditionalExpression`, `NonNullExpression`, `ParenthesizedExpression`. Anything else is `unsupported-selection` with the kind name. It returns `candidates` (the covering node and its supported ancestors, innermost first) so the client can show a picker when more than one fits the span exactly; `text` must equal the candidate's source text or the candidate is dropped (this is the "shared source spans keep distinct call context" rule from the research).

**Engine: `ops/value-flow.ts`.** Input `{file, span, text, direction: "forward", expectedGeneration}`.

1. Resolve the selection as above. Reject `stale-generation` first.
2. Find the proven program element for the AST node: the same lookup `RouteTotalityFieldProofIndex.element(node, kind)` does, generalised: ask `provider.facts.fileCandidates(file)` for a fact whose location key equals the node's `file:startLine:startCol:endLine:endCol` and whose kind is in `{field-read, value, alias, call-result, parameter, jsx-occurrence}`. If none: `unsupported-selection` with reason `no-evidence-element` (the collector did not see this expression; name it, do not guess).
3. Run `queryEvidenceSlice(provider, {seed: element.id, direction: "forward", boundaryPolicy: DEFAULT_BOUNDARY_POLICY, terminalPolicy: {roles: ["render", "component-occurrence", "side-effect", "return"], ...}})`.
4. Order the slice into rows: a depth-first walk from the seed over `relations` grouped by `from`, following relation kinds in this order of preference `field-input, consumer-value, alias, references, for-element, for-callback-parameter, show-when, show-render-parameter, component-prop, component-prop-binding, render-terminal, renders, performs, pack-field, map-*, filter-result, find-result, includes-membership, join-source, accessor-call`. Cross-call kinds (`invokes`, `argument`, `argument-binding`, `function-call`, `function-return`, `return-value`, `callback-parameter`) are followed only when the callee has exactly one `invokes` relation in the provider (one call site); otherwise the walk stops with a `boundary` row, reason `unproven-handoff` (R7). M5 replaces this rule with invocation pairing.
5. Row kinds: `input` (the seed), `transfer` (alias, field-read, references, consumer-value), `fallback` (an element with `operationKind: "default"` or a `??`/`||` binary), `branch` (`show-when`, `type-narrow`, conditional), `transform` (map, filter, pack, pick, parse, validate, serialize, selection), `terminal` (an element with a `terminalRoles` entry), `boundary` (a gap or a refused cross-call), each with `{id, kind, label, file, absPath, span, status, elementId, relationId, proof, typeText?, note?}`. `typeText` comes from `checker.typeToString` at the element's node, so the inspector can show "`string | undefined` → `string`" across a fallback.
6. Value properties stay separate from connectivity: a `fallback` row says what `??` keeps (`0`, `""`) and `||` replaces; a `branch` row from `NonNullExpression` is labelled "assertion, not a check".
7. Budgets and counts come from `slice.coverage` and go into `outcome: "budget"` when exhausted.

Output contract `contracts/dataflow-value-flow.ts`:

```ts
type Ledger = { outcome; generation; programHash; selection: {file, span, text, kind};
                rows: LedgerRow[]; frontiers: {rowId, reason, label, location}[];
                terminals: string[]; coverage: {elements, relations, budget: {limit, used, exhausted}};
                bindings: {tsconfig, typescript, sourceFingerprints: {file, size, mtimeMs}[]} };
```

Fixtures in `engine/examples/value-flow-basics/` (strict tsconfig, Solid JSX): `direct-property.tsx` (a prop read reaches a JSX text slot), `same-name-negative.tsx` (two bindings with a `name` field; only the selected one reaches its slot), `null-vs-finite.tsx` (`x ?? 0` keeps zero; a null check proves nothing about finiteness; `v!` is not a check), `two-call-helper.tsx` (the same helper called twice; M3 expects a `boundary` row, M5 expects two distinct paths).

**Server.** `POST /api/dataflow/select` and `POST /api/dataflow/value-flow` with path containment and `expectedGeneration`. `models.py` gains `Ledger`, `LedgerRow`.

**Client: selection in the code viewer (`investigation/selectionSpan.ts`).** A `selectionchange` listener scoped to `.code-modal-content` maps the DOM `Range` to a source span:

- line = `displayStartLine() + index of the span.line ancestor`;
- column = 1 + the removed indent for that line + the UTF-16 offset of the range boundary inside the line's text content. `reduceCommonIndent` must return the per-line removed width (today it returns only the text), a small pure change with a test;
- the selected `text` is taken from `rawCode()` at that span, not from the DOM, and the two must match or the selection is rejected with "Selection crosses markup".
- When the selection is empty (a click), the span is the caret; the engine's candidates give the innermost expression under it.

The code viewer header gets an "Inspect value flow" button, enabled when a selection exists and `availability()` is not `na`. Pressing it calls `select`; one candidate opens the investigation, several open a small `Popover` listing them with their text and kind.

**Client: investigation workspace.** `InvestigationView.tsx` replaces the main area (treemap/graph) while `?inv=<token>` is in the URL; the header keeps the location bar. Layout at 1440: pinned preview (source lines around the selection, `CodePane` in read-only slice mode) on the left, ledger in the middle, inspector on the right; at 1024 the inspector collapses under the ledger. Keyboard: ↑/↓ rows, Enter opens the row's code in `CodeModal`, Space toggles the inspector, Esc returns focus to the ledger, `Backspace` = Return. The status line names the outcome (3.4) and the generation.

- `ledgerModel.ts`: pure; groups consecutive `transfer` rows that are plain aliases into one row with an expand toggle; never groups fallbacks, branches, joins, terminals or boundaries.
- `EvidenceInspector.tsx`: span, `typeText`, proof list (kind, detail, locations as links), assumptions, stop reason, and the bindings block (tsconfig, TypeScript version, generation).
- `navigation/investigation.ts`: `openInvestigation(request)` captures `captureViewState()`, stores it under a token, pushes `?inv=<token>`; `returnFromInvestigation()` pops and calls `restoreViewState`. Back and Forward go through popstate and the same restore.
- Staleness: the result's `sourceFingerprints` are compared against `/api/files/content` headers (`Last-Modified` is not enough; add `X-Srcly-Size` and `X-Srcly-Mtime` to that endpoint) before marking rows on the preview; on mismatch the ledger shows "Source changed. Refresh." and offers `refresh`.

**Acceptance (anchors on this branch).**

| Selection | Expected |
| --- | --- |
| `HotSpotItem.tsx:135` `props.node.name` | input → `props.node` field read → JSX text slot (`terminal`, proven) |
| `HotSpotItem.tsx:134` `title={props.node.name}` | its own ledger ends at a `dom-attribute` terminal; it does not appear in the line-135 ledger |
| `HotSpotItem.tsx:130` `props.rank ?? "–"` | a `fallback` row: `??` keeps `0`; status proven |
| `HotSpotItem.tsx:145` the metric expression | `partial`: `formatMetricWithUnit` is a cross-call with many call sites → `boundary` (`unproven-handoff`); `value()!` is labelled an assertion |
| `HotSpotList.tsx:88` `item.node` | M3 result: `boundary` at `row(...)` because `row` has two call sites (lines 88 and 109). This is the negative that M5 turns positive. |
| A changed imported helper with the selected file untouched | `stale` after `status` reports a new `programHash` |

Journey: start from a non-default metric, filters, expanded explorer and a zoomed treemap; inspect; open a row; Return. Everything restores. Repeat with the graph view and a camera transform.

**Proof.** The 135 ledger is exact. If it is not, the engine is fixed before any further UI work (the shape brief's rule).

**Rollback.** Revert `investigation/`, `viewState.ts`, the two ops.

### M4 — One path explanation from the graph

**Engine op `routePath {route, field, terminal}`** (`ops/route-path.ts`). Find the attachment in `fieldLineage.attachments` whose `origin.elementId` is `field` and whose `terminalIds[0]` is `terminal`. Its `evidencePathElementIds` and `evidencePathRelationIds` are already ordered; map them through the slice's elements and relations into the same `LedgerRow`s as M3, reusing the row classifier. `transformationIds` become `transform` rows with their `kind`. A frontier for that origin becomes a `boundary` row at the end. If no attachment exists for the pair, the reply is `not-found`, never a guessed path.

**Client.** In Data flow mode, clicking a lit destination (or pressing Enter on it) calls `openInvestigation({kind: "route-path", route, field, terminal})`. The investigation header shows "Route /time-blocks · field … → terminal …" and Return restores `flow`, `field`, `dest`, selection and camera through the same snapshot.

**Proof.** On `/time-blocks`, origin → destination → ledger shows the proven operations in order with their owners, and frontiers where the lineage stops. The ledger and the graph agree on status for every edge.

### M5 — Cross-file invocation identity

**Problem.** `argument-binding` ties every argument of every call site to the same parameter element, and `function-return` ties the parameter's result back to every `call-result`. A forward walk from line 88 therefore also reaches line 109's `HotSpotItem`. `For` recognition requires `each` to be a property access and the callback to have one parameter; `shown()` is a call and the callback has two. `componentPropValueMode` returns null for a plain identifier (`node={node}`).

**Engine changes (the only analysis-module edits in the whole program, each with a negative fixture):**

1. `program-evidence-collector-call-support.ts:processCall`: record the call id on `argument-binding` and `function-return` relations (`attributes.callId`). Existing proofs are unchanged.
2. `evidence-slice.ts` traversal: carry an invocation stack. Entering a callee through an `argument-binding` with `callId = C` pushes `C`; a `function-return` or `return-value` relation is followed only to the `call-result` of the top of the stack, which pops it. This is 1-CFA on the slice walk, bounded by `maxDepth`. Relations without `callId` (older facts) keep the M3 rule: follow only when the callee has one call site.
3. `connectSolidFor`: accept `each` as any expression that resolves to a proven element (a call like `shown()` has a `call-result` element) and a callback with one or two parameters; the second (`index`) gets a `for-callback-parameter` relation too so index reads are not frontiers.
4. `componentPropValueMode`: a plain `Identifier` initializer whose symbol resolves to a parameter or a `const` becomes a new mode `"identifier-alias"`, handled by the component binding verifier like `scalar-alias` without a `sourceFieldName`.

Each change keeps the acceptance runner green on `examples/compact-field-proof` (G01 to G20) and adds fixtures: `two-call-identity-helper.tsx` (two calls of `id(x)`; paths stay separate), `returns-other-argument.tsx` (`pick(a, b)` returns `b`; `a` must not reach the slot), `for-over-call-two-params.tsx`, `plain-identifier-prop.tsx`.

**Client.** `ledgerModel.ts` renders a cross-call as a helper frame: a collapsed row "through `row` (HotSpotList.tsx:61)" that expands to the callee's rows with the invocation marked. Branch expansion shows both `Show` arms as sibling groups when the slice has them.

**Acceptance.** `HotSpotList.tsx:88` `item.node` → `row(item.node, …)` → parameter `node` → `<HotSpotItem node={node}>` → `props.node` → `props.node.name` (135) → JSX text, every row proven. Line 109's call to `row` does not appear. The upstream `rankHotSpots` chain stays a frontier.

**Decision D3 (branch graph beside the ledger).** Only if an M5 path reads worse as rows than as a small graph. Evidence: the two-arm `Show` fixture rendered both ways.

### M6 — Effects panel

**Engine.** New modules under `src/analysis/effects/` following the research plan: `contract.ts` (records: scope, callable, call site, evidence, summary, relation, witness, projection), `collect.ts` (callables, exact call occurrences with their resolved targets or an incomplete-target reason, direct facts, bounded origins), `models.ts` (the short list of modelled intrinsics: `String.prototype.split`, array `slice` / `sort`, canonical `console.*`, canonical `fetch`, `setTimeout` with a literal callback, the `Promise` constructor with a literal executor, no-argument `Promise.resolve`; identity-checked through the checker, never by name), `propagate.ts` (SCC order, finite monotone union over `family × region × activation`, witnesses by bounded BFS). Op `functionEffects {file, line, column}` resolves the enclosing callable in the session's Program and reports `{callable, facts, frontiers, coverage: "complete-for-supported-scope" | "partial" | "not-analyzed", activation, resultHandling, witnesses, assumptions}`. It reuses `processProgramCallBoundary`'s classification for network, filesystem, stdout and exit, and treats its labels as evidence only when the callee identity is compiler-resolved.

Fixture `engine/examples/effects-basics/` with the 21 cases from the research table (closed leaf, imported leaf reference, direct and alias calls, fresh slice then sort, input alias then sort, transitive parameter write, fresh-then-borrowed child write as a partial frontier, latent returned arrow, IIFE, timer, Promise executor, async log after await, discarded / awaited / returned promise, local arrow named `fetch`, parameter named `fetch`, log then unknown callback, mutual recursion with and without a seed). The fixture includes an astral character before a call and CRLF and BOM variants, and asserts the selected substring, not only offsets.

**Server.** `POST /api/dataflow/function-effects` with `expectedGeneration`; model `FunctionEffects`.

**Client.** `EffectsPanel.tsx` as a `MetricsSidebar` section under Findings, keyed on the selected scope's start line. It shows Known (facts grouped by family: external behaviour, ambient inputs, writes by target class, allocation, throws) and Partial (frontiers with reasons) together, the activation channel and result handling per call, and assumptions always visible. A witness row opens its span in the pane with a neutral mark (not the metric overlay's hot tone). Historical `gitRef` content shows "Effects unavailable at a ref".

**Acceptance (lines on this branch).** `client/src/utils/dataProcessing.ts:81 extractFilePath`: a closed primitive-transformation candidate under standard-intrinsic assumptions, split site named. `client/src/utils/hotSpotRanking.ts:57 rankHotSpots`: a call to `metricDef` and a transitive read of the module-level `byId`; library operations may stay partial. `client/src/services/scanJobs.ts:88 startScan`: a network witness through `fetch`, one direct await, the returned promise adopted from `expectJson` (`:70`). `expectJson`: two alternative JSON await sites and an explicit throw in an async body; neither branch is claimed to execute.

**Rollback.** Revert `effects/`, the op and the panel.

### M7 — Supporting evidence in srcly's pipelines

**Engine op `fileSignals {files?: string[]}`** (tier 2). Builds `fullReport()` once, then per file: metric sums over `report.sinks` in that file and finding spans. Op `workPackets {}` renders `renderMarkdownView(report, {view: "work-packets"})` plus `defensive-ledger`, `prop-relay`, `fan-out` and `fan-in`, with the `tsx-dataflow` strings replaced by `srcly` and the regen footer replaced by the `srcly report` command.

**Metrics (overlay family `DATAFLOW_METRICS` in `analysis_types.py`, added to `OVERLAY_METRICS`):**

| Metric id | From `SinkMetrics` | Catalog |
| --- | --- | --- |
| `dataflow_impossible_defenses` | Σ `impossibleDefenseCount` | group Data flow, `higher-worse`, sum, `witness=True` (the worst sink), `color_domain (0, 1, 5)`, weights `frontend 1.0, typescript 1.0` |
| `dataflow_defensive_ops` | Σ `actionableDefensiveOperationCount` | `higher-worse`, sum, `color_domain (0, 5, 20)`, no weights |
| `dataflow_path_depth` | max `maximumPathDepth` | `higher-worse`, max (`_MAX_ROLLUP`), `witness=True` |
| `dataflow_representation_changes` | Σ `representationChurn` | `higher-worse`, sum |
| `dataflow_relay_hops` | Σ `helperHops` over sinks whose path crosses a component boundary | `higher-worse`, sum |
| `dataflow_fan_out` | `reachableSinks` of the file's widest value | `neutral`, Detail group (size-like) |

`MetricSpec.languages` special-cases `DATAFLOW_METRICS` to `["ts", "tsx"]` like it does `FINDINGS_METRICS`. `tests/test_metric_catalog.py::test_witnessed_metrics_are_complexity_and_components` is widened to include the two witnessed data-flow metrics, and `test_profile_lead_is_the_heaviest_weight` is checked: `frontend` keeps `component_loc` as its lead, so the weights above stay below it.

**Overlay.** `dataflow/jobs.py:DataflowJob(root, fingerprint)` starts beside `start_findings()` in `ScanJob.run` and `from_cache` only when `availability.probe(root)` says the engine can run and the user has opened a data-flow surface at least once in this session or passed `--dataflow` (decision D5: never by default, because tier 2 costs minutes). `scan_jobs.result_json_overlaid` adds the job identity to its cache signature. `dataflow/overlay.apply_to_tree` sets the six metrics per file, folder sums or maxes, and `na_reasons` ("Data flow not analyzed: <reason>") on every TS/TSX file when the job is N/A. Non-TS files get the ordinary "Not measured for Python files" reason through the catalog's `languages`.

**Findings and markers.** `findings/dataflow.py:DataflowTool` runs only when the job result exists (it never starts the engine). Its `check()` turns each finding span into a `Finding(path, line, end_line, column, rule, message, severity="warning", tool="dataflow")` with rules `impossible-defense`, `repeated-fork`, `context-relay`, `broad-prop-bundle`. Markers for the six metrics come from the same spans and are merged in `routers/files.py:get_file_markers` from the cached job (never by re-running the engine per file). `tests/test_markers.py` gets a fake-engine case asserting the marker count equals the metric value.

**Report.** `reporting.scan_tree` gains `dataflow=` (off by default; `srcly report --dataflow`), `write_report` writes `dataflow.md` (work packets) and lists it in `enrich_manifest_with_artifacts` with `agent_load: top_n`. `build_metrics_schema` already picks the catalog up. `skills/srcly-code-quality/SKILL.md` gets a "Data flow" section with the reading order from `render-path-dataflow-work`.

**Compare.** `compare/diff.COMPARE_METRICS` derives from the catalog, so the six metrics appear with their direction once `compare/snapshots._with_checks` applies the overlay for a side. Compare uses portable tools only, so this is gated on the same `--dataflow` opt-in and shows N/A otherwise.

**Proof.** The treemap colors by impossible defenses on `examples/bad-ish-solid`; the code viewer marks the lines behind each count; `srcly report --dataflow` writes `dataflow.md`; snapshots regenerated with `SRCLY_UPDATE_SNAPSHOTS=1`.

### M8 — Engine ships in the wheel

- `engine/scripts/bundle.mjs`: `esbuild bin/srcly-engine.ts bin/engine-worker.ts --bundle --platform=node --format=esm --packages=external --outdir=../server/app/engine --sourcemap=external --minify-syntax`, then copy a trimmed `typescript` (`package.json`, `lib/typescript.js`, `lib/lib.*.d.ts`) to `server/app/engine/node_modules/typescript/` and write `server/app/engine/VERSION.json` `{engine, typescript, builtAt}`. `zod` is bundled (`--packages=external` is dropped for everything except `typescript`).
- `project/typescript.ts:loadTypescript`: the fallback base becomes `path.join(bundleDir, "node_modules")` resolved from `import.meta.url`, and D4's version rule picks project vs bundled.
- `server/app/.gitignore`: add `engine` beside `static`. The hatch `include = ["app/**"]` already ships it.
- `build-srcly.sh`: `cd engine && pnpm install (if needed) && pnpm bundle` before `uv build`.
- `release.yml`: the engine steps from M1 plus `scripts/test_package.py` additions: the bundle exists, `VERSION.json` parses, and a clean-venv smoke runs `srcly`'s Python `EngineProcess` against a copy of `engine/examples/solid-route` and gets `/records`.
- Record wheel size before and after in `measurements.md`. Expected: the trimmed TypeScript is about 15 MB uncompressed, 3 to 4 MB in the wheel.
- README: "Data flow needs Node 18 or newer on PATH. Without it the feature shows N/A and nothing else changes."

**Rollback.** Drop the bundle step; wheels show N/A again.

## 7. Cross-cutting concerns

### 7.1 One contract, three languages

The Zod schemas in `engine/src/srcly/contracts/` are the source of truth. `engine/scripts/emit-contracts.ts` runs `z.toJSONSchema` (Zod 4) per op and writes:

- `server/app/services/dataflow/contracts/<op>.schema.json`, loaded by `models.py` tests to assert that every Pydantic model's field set equals the schema's `properties` (the Pydantic models are hand-written for readability; the test keeps them honest).
- `client/src/dataflow/contract.generated.ts`, produced from `z.infer` through a small type printer (or `json-schema-to-typescript` as a dev dependency of `engine/`).

`engine/test/srcly/contracts-current.test.ts` regenerates both into a temp dir and diffs them against the committed files, the same discipline as `tests/test_metric_catalog.py::test_client_catalog_snapshot_is_current`. The regenerate command is `cd engine && pnpm emit-contracts`, recorded in AGENTS.md.

Contracts are versioned by `protocol` in `hello`. Python refuses a child whose protocol differs and reports `engine-protocol-mismatch`; there is no coexistence layer.

### 7.2 Identity and staleness, end to end

| Layer | Carries | Checks |
| --- | --- | --- |
| Engine | `generation.id`, `programHash`, per-result `sourceFingerprints` | `expectedGeneration` on every tier-1 query; `status` recomputes `programHash` with `stat` only |
| Python | passes `expectedGeneration` through; caches nothing semantic | returns `stale` when the child says so; closes the child when the scan root's fingerprint (`cache.fingerprint`) changes and a surface is open |
| Client | `generation` on every displayed result; `sourceFingerprints` vs `/api/files/content` size and mtime headers | refuses to mark stale rows on current source; offers Refresh, which posts `DELETE /api/dataflow` then `start` |

A rescan from the folder menu closes the child for that root. Compare's worktree checkouts never start an engine unless `--dataflow` is set.

### 7.3 Performance plan

Targets from the shape brief, with what this plan does about each:

| Target | Mechanism |
| --- | --- |
| Progress within 250 ms | `status` is answered from Python memory; the client polls at 250 ms and renders the engine's last progress frame. The child emits a progress frame at every `AnalyzerProgressReporter` step. |
| Base scan time unchanged | The engine starts only on explicit use; tier 2 is opt-in (D5). `ScanJob.run` never awaits it. |
| Cold first result ≤ 10 s | Tier 1 is 3 s on srcly's client and 14 s on visual-notes (section 9). The first `routeGraph` on a real route adds the totality build for that route, unmeasured until M2. The 10 s target holds for srcly-sized apps and is a stated miss for 65K-line apps; the plan reports it honestly in the UI (progress with phase names) rather than hiding it. |
| Warm first row ≤ 750 ms | Tier-1 queries on a built session reuse the lazy provider's fact index; measured in M3. |
| Preview and Return ≤ 150 ms p95 | Return is a client-only restore from `sessionStorage`; no request. The pinned preview reuses the already fetched file content. |
| Memory | About 2 GB RSS per Program (section 9). Registry cap of two processes and a 15-minute idle close. The status endpoint reports RSS from `process.memoryUsage()` so the measurement stays visible. |

Tier 2 (`fileSignals`) is the known slow path: 130 s on srcly's client and 44 s on visual-notes for the full report. It runs only in the batch job with a 300 s timeout, so a user never waits on it interactively, and the metrics are N/A with "still analyzing" until it completes (the same pattern as findings).

### 7.4 Security and containment

- The child reads only files the Program owns under `root`, which `cache.ts:resolveSourcePath` already enforces for excerpts (realpath, no `..`, size cap); `selectExpression` and `valueFlow` use the same resolver.
- Python validates every `file` parameter resolves under the scan root before it reaches the child.
- The child runs with `start_new_session=True` and is killed as a group. No shell, no user-supplied argv: `node`, the entry path and fixed flags only.
- The engine never executes target code; it only parses and type-checks it.

### 7.5 Documentation that lands with the code

- `docs/CODE_MAP.md`: a "Data flow (engine)" section (rows per file in sections 3 to 5) and the API table rows; fix the stale `dependencies` row in M1.
- `AGENTS.md`: an "Engine" section (run, test, add an op, regenerate contracts, never add srcly-specific recognition rules to analysis modules, bundle only in `build-srcly.sh`); fix the stale `tree_sitter_analysis.py` path.
- `engine/UPSTREAM.md`, `engine/README.md` (how the protocol works, how to run the acceptance runner), moved `docs/analyzer.md` and `CONCEPTS.md`.
- `docs/intent/tsx-dataflow-integration/measurements.md`: every number this program records.
- `README.md`: the Node requirement and the N/A behaviour (M8).

## 8. Decision log

| Id | Decision | Default | Evidence that would change it |
| --- | --- | --- | --- |
| D1 | Port base in tsx-data-flow | Commit the route-proof WIP on `main`, tag `srcly-port-base`, port that, drop the seven cleanup PRs, re-run the dead-code audit inside `engine/` | If `pnpm verify` fails on the WIP for reasons that take more than a day, port `main` at `b4f1ba4` instead and re-apply the WIP inside `engine/` as the first engine PR |
| D2 | Route layout | Existing packing with occurrence frames | The M2 screenshots: if terminals of one occurrence land in different columns, add the `direction: "down"` rule |
| D3 | Branch graph beside the ledger | Rows with expansion | An M5 two-arm path that is misread in a review |
| D4 | TypeScript instance | Bundled TypeScript for the Program; the project's copy only when its major.minor matches the bundled one | A real project that fails to parse with the bundled version (then prefer the project's and record the mismatch in `hello`) |
| D5 | Tier 2 batch job | Opt-in: a data-flow surface opened this session, or `--dataflow` | Tier 2 under 10 s on a 50K-line app after the engine's own performance work (out of scope here) |
| D6 | Resident vs per-query process | Resident, idle close at 15 minutes, cap 2 | Tier 1 under 2 s on realistic apps would make per-query spawn viable; measured RSS above 3 GB would force a cap of 1 |
| D7 | Investigation URL | `?inv=<token>` with the verbose snapshot in `sessionStorage` | Nothing expected; a shareable URL restores semantic focus with defaults by design |
| D8 | Progress transport | Polling `status` at 250 ms | If polling shows up in profiles, add an SSE endpoint like `/api/scans/{id}/events` |

## 9. Measurements taken for this plan

Machine: the development Mac, Node v22.21.1, tsx-data-flow at `b4f1ba4` plus WIP, TypeScript 5.9.3 resolved from the target project. One cold run each; no warm numbers yet.

| Target | Source files | Program build | Identity index | Full legacy report | Route inventory | RSS after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| srcly `client/` (26K lines) | 126 | 1.2 s | 1.8 s | 130.0 s | 2 ms (no routes) | 2.4 GB |
| visual-notes `app/` (65K lines, 43 routes) | 487 | 4.3 s | 9.5 s | 44.2 s | 17.5 s | 2.0 GB |

What these numbers decide:

- Tier 1 (program + identity index) is 3.0 s and 13.9 s. That is the cold cost a user sees before the first route list or ledger. It meets the 10 s target for srcly-sized apps and misses it for visual-notes; the UI shows phased progress either way.
- The full report is the wrong entry point for interactive queries (R5). srcly's client, which is finding-dense, is three times slower than an app two and a half times its size.
- `buildRouteDataInventory` must not be on the `routes` path (3.3).
- Memory is the binding constraint for a resident child (D6).

Still to measure, by milestone: first `routeGraph` per route on visual-notes (M2); warm `valueFlow` p95 over 20 queries and cold `hello` to first row (M3); `functionEffects` on the three anchors (M6); tier 2 on `examples/bad-ish-solid` and the wheel size (M7, M8).

## 10. Sequencing and parallel work

```text
M1 ──┬── Track A: M2 (route graph) ──── M4 (route path; needs M3's ledger UI)
     ├── Track B: M3 (ledger) ────────── M5 (invocation identity)
     ├── Track C: M6 (effects)
     └── Track D: M7 (signals, metrics, markers, report)   M8 (wheel) after any track has a user-visible result
```

- M1 is three PRs in one worktree, merged in order. Nothing else starts before PR 3 is on `main`, because every track needs `EngineProcess` and the contract emitter.
- Tracks A to D are separate worktrees. They touch disjoint files except: `location.ts` (A and B both add params; B adds `inv`, A adds `flow`, `field`, `dest`), `analysis-service.ts` op union (every track adds a kind), `models.py` and `routers/dataflow.py` (every track adds a model and a route), `docs/CODE_MAP.md` and `AGENTS.md`. Each track adds its own lines; rebases are mechanical.
- M4 needs M3's `InvestigationView` and `ledgerModel`; it is track A's second PR but waits for M3's first PR to merge.
- M5 edits analysis modules. No other track edits them, so M5 cannot conflict; its fixtures gate it.
- M8 can start as soon as M1 is in, as a parallel track, because the bundle is independent of the ops. Releasing it before M2 would ship a wheel whose only visible feature is `status`, which is harmless; but the plan ships M8 after the first user-visible track to keep the wheel-size cost tied to a benefit.
- PR screenshots: every PR that changes UI attaches before/after screenshots with `gh pr edit --attach` from an ignored `tmp/` folder, per the user's global instructions. Suggested engine fixture renders go in `measurements.md`, not the repo tree.

Relative sizes, for planning only: M1 large (the move plus two new layers), M2 large (adapter, mode, spike), M3 extra large (two engine ops, selection mapping, workspace, view-state registry), M4 small, M5 medium (analysis edits with fixtures), M6 extra large (a new analysis pass), M7 large (six integration points), M8 medium.

## 11. Risks and stop rules

| Risk | Signal | Response |
| --- | --- | --- |
| Generic value evidence cannot prove the line-135 slot exactly | The M3 acceptance table has a wrong row | Stop UI work in track B; fix the collector or the walk; a toy-only fixture passing does not count |
| False attachment across shared helpers before M5 | A ledger shows a `proven` row through a callee with more than one call site | The M3 rule in step 4 is a bug, fix before merging |
| Cold time on large apps makes Data flow mode feel broken | Tier 1 over 30 s on a target the user cares about | Scope the Program: honour `--source` as a sub-folder of `src`, or offer a per-route `tsconfig` pick; never silently fall back to a loose config |
| Memory: two 2 GB children on a laptop | RSS reported by `status` above 3 GB total | Cap one process; close on `DELETE` when the user leaves the surface |
| TypeScript version skew (D4) | `hello.typescriptFrom` is `bundled` while the project pins a newer TypeScript and parse diagnostics appear | Prefer the project's copy for that major and record the decision |
| Two-instance SyntaxKind mismatch | Any `TypeScript.isX` on a node from the other instance | The M1 audit of the ~30 static imports routes every value use through the loaded `ts`; the dead-code audit removes `program-evidence-loading.ts` |
| Protocol corruption | A non-JSON stdout line | The bin rebinds `console.log`; Python logs the line to stderr capture and reports `engine-crashed` with it |
| Wheel size | More than 10 MB added | Trim `lib.*.d.ts` to the ES2022 and DOM set the engine needs, or make the fallback an optional download; record either way |
| Layout churn with `dependency-graph-legibility` | Both change `layout.ts` | The D2 rule is a new option, not a change to existing packing; coordinate the PR order with that initiative |
| The outline's "analysis moves intact" vs the M5 edits | Any edit to `src/analysis` outside M5's four named changes | Reject in review; recognition rules for srcly's own code never go into analysis modules |

Stop and correct immediately on: a false host match in effects, a lost async effect, a flattened latent closure, an incorrect private-mutation claim, an erased unknown, a non-converging recursive summary, a `proven` edge whose proof locations do not contain the span, or any surface that shows `0` for a not-analyzed value.

## 12. Acceptance summary

| Milestone | Must be true |
| --- | --- |
| M1 | `routes` on solid-route lists `/records`; no Node → identical scan and `status.reason = node-not-found`; fake-engine lifecycle tests pass; engine tests pass unchanged |
| M2 | solid-route and `/time-blocks` render in Data flow mode; the records origin lights `RecordTable` terminals and not `ViewerCard`; nodes open the right lines; D2 recorded with screenshots |
| M3 | The six-row acceptance table in M3 holds; Return restores metric, filters, explorer, treemap, graph camera and selection; keyboard-only journey works at 1440 and 1024 |
| M4 | On `/time-blocks`, origin → destination → ledger agrees with the graph edge status; a missing attachment is `not-found` |
| M5 | Line 88 → line 135 proven through `row`; line 109 absent; the four new fixtures and the compact-field-proof obligations pass |
| M6 | The three anchors show the research's required evidence and acceptable unknowns; the 21-case fixture passes; Known and Partial render together |
| M7 | Six catalog metrics appear in Color (and Rank by where rankable); treemap colors by impossible defenses on bad-ish-solid; markers equal counts; `dataflow.md` is written; snapshots regenerated |
| M8 | Clean-venv `uvx` smoke on a solid-route copy answers `/records`; wheel size recorded; README states the Node requirement |

See also the [intent](intent-brief.md), [shape](shape-brief.md), [outline plan](implementation-plan.md), [research](research.md) and [initiative-map.json](initiative-map.json).
