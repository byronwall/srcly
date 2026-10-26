---
title: "Data-flow library models as data — plan"
slug: "dataflow-library-models"
phase: plan
status: planned
last_updated: "2026-10-26"
---

# Library models as data

The engine knows what library code does in three different forms:

- TypeScript tables and predicates in the collector;
- Python tables in `engine/python/srcly_pyfacts.py`;
- relation kinds named after the methods they model.

Each new library means a code change in whichever form it falls under. This plan moves that knowledge into rows that share one format across both languages, which both collectors read. Only code that has to decompose a callback's body stays as code.

**Prior art.** CodeQL's [models as data](https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-javascript/) describes library behaviour in YAML data extensions. Each row is a tuple: `sourceModel`, `sinkModel`, `summaryModel` (input → output, `value` or `taint`), `neutralModel` or `typeModel`. Rows use access paths such as `Argument[0]`, `ReturnValue`, `Argument[this]` and `Argument[0].Parameter[0]`. A repository can ship its own extension pack. We take three ideas from it: a small fixed set of row kinds, access paths instead of positional code, and user packs merged with the built-in ones. We leave out its taint/value split, because srcly draws values, not taint.

## 1. Inventory: where library behaviour is recognised today

Paths are under `engine/`. "TS" is the TypeScript collector (`src/analysis/`); "PY" is `python/srcly_pyfacts.py`.

### Value-flow core (feeds anchor graph and value flow)

| # | Where | Keys on | Model it encodes |
| --- | --- | --- | --- |
| 1 | TS `program-evidence-support.ts` `callOperation` | dotted callee text: `JSON.parse`, `*.parse`, `JSON.stringify`, `validate*`/`is[A-Z]*`, bare `map`/`filter`/…, solid `createResource` | passes through (classified as `parse`/`serialization`/`validation`/`selection`; a `performs` relation makes it modelled, not assumed) |
| 2 | TS `…-support.ts` `functionOperation` | in-project function name prefixes | a naming convention, not a library (stays code) |
| 3 | TS `…-support.ts` `isResourceFactory` | solid `createResource`; bare `createQuery`/`useResource` | resource |
| 4 | TS `…-support.ts` `isFileOperation` | `fs`/`node:fs` + 6 read and 5 write names | origin `file-input` / terminal `file-write` |
| 5 | TS `…-support.ts` `isNetworkOperation`, `boundary-support.ts` global `fetch` | `http`/`https` `request`/`get`/`post`; `fetch` | origin `fetch-input` + network effect |
| 6 | TS `…-support.ts` `isFrameworkCall` | solid-js, 9 names | consumes, but not an external effect |
| 7 | TS `…-support.ts` `outputKind`, `isExit`, `isExitStatusAssignment` | `console.*` (5), `process.stdout/stderr.write`, `process.exit`, `process.exitCode =` | terminal stdout / exit-status |
| 8 | TS `…-support.ts` `isHttpResponse`, `responseReturnRole`; `call-support.ts` `new Response` | `Response.json`; receiver `res`/`response`/`reply` with 6 methods; `new Response` | terminal http-response |
| 9 | TS `…-support.ts` `isEffectName` | 8 last-segment names (`send`, `emit`, `spawn`, …) | terminal external-effect |
| 10 | TS `…-support.ts` `isKnownGlobal` | 10 globals | no `unresolved-symbol` gap (neutral) |
| 11 | TS `…-support.ts` `externalServiceCallKind` | bodiless interface method + 10 read / 7 message names | origin `external-read` / terminal `message` |
| 12 | TS `…-support.ts` `isHandlerLike`, `parameterOriginRole`; `program-fact-index.ts` and `evidence-slice-normalization.ts` (same rule twice) | handler names, parameter names and types (~21); `argv`/`env`/`cwd` | origin `request` / `event` / process |
| 13 | TS `boundary-processing.ts` | `process.env`, `import.meta.env`, `process.argv`, `process.stdin` | origin environment / process |
| 14 | TS `program-evidence-state-pairs.ts` `STATE_FACTORIES` | module + export: `createSignal`, `createStore`, `useState`, `useReducer` | state pair |
| 15 | TS `call-support.ts` resource relations | `isResourceFactory`; loader is `arguments[1]` | resource (`input-call`, `resource-loader`, `resource-result`) |
| 16 | TS `program-evidence-collector-field-transfers.ts` | `find`/`filter`/`map`/`includes` declared in `lib.es*.d.ts`; solid `For`/`Show`/`createMemo` by declaration path | calls back with element; passes through (filter, find, map); membership; render |
| 17 | TS `program-evidence-carrier.ts`, `http-bridge-evidence.ts` | `useContext`, `Provider value=`, `fetch` → `.json()`, `Response.json`, plus fixture-specific names | passes through (multi-statement patterns) |
| 18 | TS `effects/function-effects.ts` | 29 pure methods, 13 receiver writes, 3 ambient inputs, timers, `Promise.*`, 12 iteration methods | passes through; writes receiver; origin; calls back (now or later) |
| 19 | TS `call-support.ts` callee-consumed, `connectExternalCall` (#175), `connectExternalCallbacks` (#184) | any bodiless call; checker element type | fallback: consumes, assumed (`external-call`); receiver write; calls back with element |
| 20 | `src/srcly/anchor-slice.ts` `assumedThrough`; `facts.ts` `externalCallee` | any bodiless call without `invokes`/`performs`/`framework-state`/framework boundary | fallback: assumed, partial |
| 21 | PY `ORIGIN_CALLS` (33) | mypy fullname or prefix | origin: environment, stdin, file, subprocess, HTTP clients, sqlite, SQLAlchemy |
| 22 | PY `TERMINAL_CALLS` (31), `opens_for_writing` | mypy fullname | terminal: stdout, exit, logging, file write, FastAPI/Starlette/Flask responses |
| 23 | PY `ORIGIN_READS` (5) | `os.environ`, `sys.argv`, `sys.stdin`, `flask.request` | origin |
| 24 | PY `FASTAPI_PARAM_FUNCS` (9), `FASTAPI_REQUEST_TYPES` (3), `FASTAPI_RUNTIME_TYPES` (2) | parameter defaults and types | origin: request parameter |
| 25 | PY `MODEL_BASES` (6), `SETTINGS_BASES` (4), `MODEL_KEYWORD_CALLS` (2), field-instance classes | base class / MRO / call | packs fields (constructor); settings fields are environment origins |
| 26 | PY routing: `HTTP_METHODS`, route decorators, router constructors (4), `include_router`, `WRAPPER_DECORATORS` (15) | decorator and call names | route discovery; not value flow (stays out of scope) |
| 27 | PY generic fallback | any external call | fallback: every input → `call-result`, partial |

### Outside the value-flow core (out of scope for this plan)

- Route totality and route surface (`route-totality-*`, `route-occurrence-*`, `route-data-*`, `solid-symbols.ts`, about 18 sites): solid component names, `splitProps`/`mergeProps`, `createAsync`, `node:fs/promises` readFile. They feed the legacy route report.
- Scope adapters (5): entry discovery.
- The legacy source-trace pipeline (`source-call-classification.ts` and others, about 9 tables and 230 names).

These keep their code until the legacy report is retired.

**Counts.** Value-flow core: 27 sites. About 190 TypeScript entries (plus about 74 in function-effects) and about 140 Python entries. There are 14 relation kinds named after a method or component: `find-result`, `filter-result`, `map-element`, `map-callback-parameter`, `map-result`, `includes-membership`, `join-source`, `for-element`, `for-callback-parameter`, `show-when`, `show-render-parameter`, `accessor-call`, `resource-loader` and `resource-result`.

## 2. One row format

A row is JSON. TypeScript reads it natively, and Python reads it with the standard library, so the row files add no dependency.

```json
{ "language": "ts", "module": "solid-js", "name": "createSignal", "model": "state-pair", "args": "0", "note": "init seeds the state" }
{ "language": "py", "module": "requests", "member": "Session.get", "model": "origin", "role": "fetch-input" }
{ "language": "ts", "module": "lib", "member": "Array.find", "model": "calls-back", "args": "0", "with": "element", "returns": "element", "proof": "array-find-element" }
```

| Field | Meaning |
| --- | --- |
| `language` | `ts` or `py` |
| `module` | the import module (`solid-js`, `node:fs`), `lib` for TypeScript's built-in `lib.*.d.ts`, `global` for a bare global, or a Python package (`requests`) |
| `name` or `member` | an exported name (`createSignal`), or `Type.method` for a method on an instance (`Session.get`, `Array.find`). The checker resolves it: TypeScript by the declaration's symbol and file, Python by mypy fullname. A trailing `*` matches a prefix (Python's existing `requests.Session.`). |
| `model` | one of the types in §3 |
| `args` | which arguments the model is about: `"0"`, `"1"`, `"*"`, or `"this"` for the receiver. Default `"*"`. |
| `role`, `with`, `returns`, `proof` | the model's parameters. `role` is an origin or terminal role. `with` is what a callback receives (`element`, `receiver`, `awaited`). `returns` is what the call yields (`element`, `boolean`, `same`). `proof` names the proof kind, so existing proof names survive. |
| `note` | one line for the code map and for the proof detail |

Matching goes through the checker in both languages, never through callee text. This fixes the inventory's `calleeName` limit, where `fs.readFile` called through a namespace import is never matched.

## 3. Model types

There are seven, plus a fallback:

| Model | Says | Replaces |
| --- | --- | --- |
| `origin` | the call's result (or the read, for a member) is where a value enters, with `role` | 4, 5, 11–13, 18 ambient inputs, 21, 23, 24 |
| `terminal` | `args` leave the program here, with `role` | 4, 7–9, 11, 22 |
| `state-pair` | the result is `[getter, setter]`: `args` seed it, the setter's arguments reach every getter read (`framework-state`, partial) | 14 |
| `passes-through` | the result derives from `args` (or `this`): `parse`, `stringify`, `trim`, `slice`, `JSON.parse` | 1, 18 pure methods |
| `consumes` | `args` are used and the result is unrelated; with `writes: "this"` the receiver keeps them (`push`, `set`) | 6, 10, 18 receiver writes, #175 |
| `calls-back` | a callback in `args` receives `with`, and its return becomes `returns` (`map`, `find`, `filter`, `then`, `forEach`) | 16 (find, filter, map, includes), 18 iteration and timers, #184 by name |
| `resource` | the callback in `args` is a loader; the result's accessor reads what it returns | 3, 15 |

**Fallback, unchanged.** An unmodelled call with no body follows the assumed rule from #167, #175 and #184:
- the callee and arguments are consumed by the call (`references` and `argument`);
- a discarded result keeps the arguments in a receiver its function declares;
- a callback receives the receiver's element by the checker's types;
- every such step is `partial` with proof `external-call`, and `assumedThrough` names it.

A row only upgrades a call from assumed to modelled. It never removes the fallback.

## 4. How each collector consults the rows

- **One loader per language**, at session start. TypeScript: `src/analysis/library-models.ts` reads the built-in JSON and any user files into a map keyed by `module#name`. Python: the helper reads the same files and passes them on through its existing options.
- **One lookup at each call.** `processCall` (TS) and the Python call visitor resolve the callee to a declaration first: TS through `importModule` plus the symbol's declaration file, Python through mypy's fullname. They then look up one row and dispatch on `model` to one emitter per type. The emitters reuse today's relation code:
  - `origin`/`terminal` → `input-call`/`effect-input`
  - `state-pair` → `stateElement`
  - `calls-back` → `connectExternalCallbacks` with the row's `with`/`returns`, `proven` instead of `partial`
  - `resource` → the resource relations, with the loader taken from `args`
- **No row** → the fallback (§3). The walk (`assumedThrough`) never reads rows. It reads relation proof kinds, as it does after #196.

## 5. Method-named relation kinds

| Kind | Fate |
| --- | --- |
| `includes-membership`, `resource-loader`, `resource-result` | Become rows (`calls-back` with `returns: boolean`; `resource`). They keep their kind names, because route totality matches them. |
| `map-element`, `map-callback-parameter`, `map-result`, `find-result`, `filter-result`, `collection-element`, `predicate-return` | The row decides *that* `map`/`find`/`filter` call back with the element. The callback-body decomposition (`param.prop` returns, predicate reads joined by `&&`) stays code in `field-transfers.ts`, run when a `calls-back` row carries `proof: array-*`. |
| `show-when`, `show-render-parameter`, `accessor-call`, `for-element`, `for-callback-parameter` | Stay code. They parse a JSX component's attributes and a single render child, which a row can't express. A row only marks solid `Show`/`For` as `calls-back` components, so they stop being matched by declaration path. |
| `join-source` | Stays. Route totality synthesises it; the collector never emits it. |

Two constraints hold throughout the migration:
- Route totality's verifier matches exact (relation kind, proof kind, element kinds) tuples, so a migrated kind keeps its name and proof.
- The `^(map|filter|find|pack|includes|join)` "transform" regex in `anchor-graph.ts`, `value-flow.ts` and `route-path.ts` keys on kind names. Step 1 replaces it with a set exported beside the kinds.

## 6. Migration order

Each step is one PR. Each must pass `pnpm survey-gate` (#192) with **no moves**: same ok traces, same stops by kind, no new errors. The step is proof that the rows reproduce the code. The one exception is step 7, which fixes namespace matching and is expected to move the gate; its PR body explains the moves in a `Survey moves:` line.

1. **Loader, format and the transform set.** Add `library-models.ts`, the JSON schema and an empty built-in file. Replace the kind-name regex with an exported set. No behaviour change.
2. **Python origins and terminals.** `ORIGIN_CALLS`, `TERMINAL_CALLS` and `ORIGIN_READS` become rows. The helper reads rows instead of its dicts. This is the largest table and the simplest model.
3. **TypeScript origins and terminals.** Inventory items 4, 5, 7–9, 11 and 13 become rows; the predicates go. Keep `isHandlerLike` and parameter names as code: they are conventions, not library members.
4. **State pairs and resources.** `STATE_FACTORIES` and `isResourceFactory` become rows. The resource loader index comes from `args`, so `createResource(fetcher)` with one argument works too.
5. **`passes-through` and `consumes`.** `callOperation`'s library half, `isFrameworkCall`, `isKnownGlobal` and the function-effects tables become rows. functionEffects reads the same rows.
6. **`calls-back`.** `map`/`find`/`filter`/`includes`/`forEach`/`then` and timers become rows. The named ones turn #184's partial callback edges into proven ones. The decomposition code stays and is keyed by the row's `proof`.
7. **Checker-resolved matching everywhere.** Remove `calleeName` text matching. Namespace and default imports now match. This step moves the gate on purpose.
8. **User rows** (§7), once a srcly config exists.

**Risks**
- *A row matches more than the code did* (a prefix row, a namespace import): the survey gate catches ok and stop drift. Keep steps 2–6 exact-match only.
- *Proof names drift*: the route-totality verifier breaks. Its test suite runs in every step, and rows carry `proof` explicitly.
- *Python and TypeScript resolve names differently* (mypy fullnames vs. module + symbol): the row format keeps `module` + `member` and lets each loader build its own key, with a test that every built-in row resolves on a fixture.
- *Load cost*: about 400 rows parsed once per session is negligible next to the Program.

## 7. Where rows live, and user rows

- **Built-in:** `engine/models/*.json`, one file per ecosystem: `ecmascript.json`, `node.json`, `solid.json`, `react.json`, `python-stdlib.json`, `fastapi.json` and so on. The bundle copies them next to `srcly-engine` (`scripts/bundle.mjs`). The wheel ships them, as it does the Python helper.
- **User:** a repository adds rows for its own wrappers and internal libraries, such as a team `http()` client or a `useAppStore` state hook. PR #100's plan (`docs/intent/custom-metrics-and-repo-config/`) proposes one discovered `srcly.toml` at the worktree root, with paths resolved from the config's directory and explicit values overriding repository ones. Library models slot into it as one more section:

  ```toml
  [dataflow]
  models = [".srcly/models/*.json"]
  ```

  User rows load after the built-in ones and can override a built-in row with the same key. Overrides are listed in the session's status, so a trace's proof can say "modelled by `.srcly/models/app.json`". A row that names a module or member the checker can't resolve is reported, never silently ignored.
- Until #100 lands, `SRCLY_DATAFLOW_MODELS` (a path list) is enough for testing user rows. It is not documented as a feature.
