# Function effects and test seams

Status: proposed. Research and planning only. Implementation requires a separate request.

Build a TSX function-effects pass and expose its evidence in Srcly's CodeModal. Start with TS/TSX. Show Python as unavailable. Keep the dependency graph and numeric metrics independent.

The [research summary](../../research/effects-async-test-seams-2026-10-23/README.md) explains the design. The [dispositions](../../research/effects-async-test-seams-2026-10-23/recommendations.md) cover EAT-001–030. The [Pro conversation](https://chatgpt.com/c/6adc0dbe-1934-83e9-ae3e-99777939ff03) retains the full report and detailed fixture.

`S/` means Srcly. `T/` means tsx-data-flow. Proposed paths below do not exist yet. Use the current full checkouts and preserve unrelated TSX edits.

## Delivery boundaries

| Delivery | User outcome | Gate |
| --- | --- | --- |
| M1 | Inspect three real functions, their known effects, unknowns, and exact witnesses | Review facts, navigation, and measured latency |
| M2 | Follow a bounded event/promise lifecycle around watchScan | Select this work after M1 proves useful |

M1 is the default first delivery. M2 adds different activation and visual semantics. Neither a shared package nor a resident service is required.

## M1 acceptance

| Selection | Required evidence | Acceptable unknowns |
| --- | --- | --- |
| `S/client/src/utils/dataProcessing.ts::extractFilePath` | Closed primitive transformation candidate; exact definition and split site | Import initialization disclosed separately; standard-intrinsic assumptions visible |
| `S/client/src/utils/hotSpotRanking.ts::rankHotSpots` | Call to metricDef and transitive read of module byId | Wrapper ownership and unmodeled library operations can remain partial |
| `S/client/src/services/scanJobs.ts::startScan` | Network witness; one direct await; returned promise from expectJson | Serialization, response-body operations, and exception escape can remain partial |
| `scanJobs.ts::expectJson` | Two alternative JSON await sites; explicit throw in an async body | Do not claim both branches execute or complete exception analysis |

The starting source lines are 81, 57, 88, and 70 respectively at Srcly `aea1015`. Re-derive spans after edits. Do not hard-code function names in analyzer rules.

The panel must display known effects and partial status together. Selecting a witness opens its actual file and span. Missing runtime/configuration shows unavailable with a reason. It never shows zero effects.

## Semantic contract

Keep one serializable contract beside the TSX pass. Mirror only required fields in Srcly. Reject an incompatible schema revision. Do not add version coexistence machinery.

| Record | Minimum content |
| --- | --- |
| Scope | Snapshot ID, root/config, compiler/model identity, inclusion/exclusion, diagnostics, assumptions |
| Callable | Snapshot-local ID, file/span, enclosing owner, kind, async/generator flags, display label |
| Call site | Exact occurrence, owner, known targets, incomplete-target reason, argument origins |
| Evidence | Direct operation, family, region, activation, source span, model/identity basis |
| Summary | Known facts, unknown frontiers, local mutation/allocation, completion facets, latent callable references |
| Relation | Call, eager callback, schedule, returned callable, await, adoption, join, cancel, or cleanup |
| Witness | Ordered actual site/evidence IDs, recursive-group note, truncation |
| Projection | Displayed/omitted counts, separate from semantic coverage |

Coverage is complete-for-supported-scope, partial, or not analyzed. Required assumptions remain visible even for closed results. Never replace this with a confidence percentage.

Use invocation and deferred activation channels. An async function's own continuations remain invocation-caused. Separately registered callbacks are deferred-triggered. Returned closures stay latent until a supported invocation activates them.

Track promise result disposition separately. Await, adoption, aggregation, and discard must not duplicate or remove call effects. Explicit throws in async functions imply possible rejection, not synchronous propagation to the immediate caller.

Do not claim general determinism, termination, race freedom, or complete runtime ordering. Report may-effects, not must-execute effects.

## Supported analysis

Resolve declarations, function expressions/arrows, imported bodies, stable const aliases, literal IIFEs, and identity-modeled callbacks. Skip nested callable bodies when collecting the enclosing body's executed operations. Index those bodies separately.

Keep mutable aliases, arbitrary property dispatch, bodyless external calls, generators, custom coercion, and unsupported framework activation as explicit frontiers. A checker signature does not establish every runtime target.

Use bounded origins: parameter/receiver roots, fresh allocation sites, module/captured cells, known host roots, and unknown. Bound field depth and origin alternatives. Substitute actual argument origins at each call.

Writes to fresh private storage are local mutation. Writes through input aliases are input mutation. Shallow freshness never establishes ownership of borrowed children. An unknown call can expose passed storage; widen the affected origins before later private-write claims.

Start with direct model functions, not a plugin registry:

| Model | Required behavior |
| --- | --- |
| Primitive String.split with string separator | Fresh result; support extractFilePath under standard-intrinsic assumptions |
| Ordinary numeric-array slice/sort | Fresh outer copy; sort writes its receiver and eagerly invokes comparator |
| Canonical console.log | Output evidence; reject shadowed identities |
| Canonical global fetch | Network evidence and promise result |
| Canonical setTimeout with literal callback | Invocation scheduling plus deferred callback effects |
| Canonical Promise constructor with literal executor | Eager executor; narrow resolve settlement behavior |
| Canonical no-argument Promise.resolve | Promise result for the small async fixture |

Do not model all Map, JSON, Response, and array methods to close the ranker or network anchor. Preserve useful partial results.

Analyze module initialization separately or disclose it as outside coverage. Calling a loaded function does not replay its module initialization. An isolated body does not establish safe test import setup.

## Propagation and witnesses

Use a finite fact domain: effect family × bounded region × activation. Keep unknown keys separately, including their effective activation. Direct seeds remain immutable.

```text
collect callable bodies, sites, direct facts, and frontiers
resolve supported propagation edges
find strongly connected components of those edges
initialize each summary with its direct facts/frontiers

visit components in callee-before-caller order:
  worklist = members
  while worklist is not empty:
    take caller
    for each propagation edge to callee:
      substitute arguments and activation into callee facts
      union facts and frontiers into caller
    if caller changed, enqueue affected callers in this component
```

Eager edges preserve activation. Scheduled edges lift facts to deferred. Reference and returned-callable edges do not propagate body effects. Recursive groups converge through finite monotone unions. Recursion alone does not create unknown effects or prove termination.

Retrieve witnesses after summaries converge. Use bounded breadth-first search over compatible transfer edges. Track visited `(callable, family, region, activation)` states. Prefer shortest paths, then source order. Keep each actual call site and substitution. Never enumerate all cycle paths.

A display cap can truncate witnesses without changing semantic coverage. A stopped analysis budget must mark coverage partial. Known facts survive either case.

## Files and work order

| Repository | Proposed files | Responsibility |
| --- | --- | --- |
| TSX | `src/analysis/function-effects-contract.ts` | Transport records and typed enums |
| TSX | `src/analysis/function-effects.ts` | Direct entry using configured compiler loading |
| TSX | `src/analysis/function-effects-collect.ts` | Callables, supported targets, direct facts, bounded origins |
| TSX | `src/analysis/function-effects-models.ts` | Small identity/precondition-checked model list |
| TSX | `src/analysis/function-effects-propagate.ts` | Recursive summaries and bounded explanations |
| TSX | `bin/tsx-effects.ts` | One-shot JSON command |
| Srcly | `server/app/services/function_effects.py` | Subprocess invocation, validation, cleanup |
| Srcly | `server/app/services/function_effects_models.py`, `routers/analysis.py` | Transport model and async endpoint |
| Srcly | `client/src/services/functionEffects.ts` | Typed request and selection lifecycle |
| Srcly | `components/CodeModal/EffectsPanel.tsx` | Facts, calls, assumptions, unknowns, witnesses |
| Srcly | CodeModal, CodePane, App open flow | Neutral evidence marks and exact source selection |

Keep these responsibilities direct. Combine small collection helpers until actual file size or responsibility warrants extraction. Reuse TSX project loading below `core.ts::analyzeProject`; do not build render reports for effect queries.

Implement scope/identity and a closed leaf first. Then prove activation, alias, unknown, and recursion behavior. Inspect the three real anchors. Connect the command and panel after the semantics hold. Update `docs/CODE_MAP.md` when implementation adds the feature files.

## Transport and source navigation

Proposed library entry:

```ts
analyzeFunctionEffects({
  root, tsconfig,
  selection: { file, line, column },
  witnessBudget: { maxNodes: 20, maxEdges: 30, maxDepth: 6, maxWitnesses: 2 }
})
```

The budgets are provisional display defaults. They do not bound effect closure. Never execute target code.

Add `POST /api/analysis/function-effects` with explicit root, project-relative config/file, and source position. For Srcly's client, use root `client/` and config `tsconfig.app.json`. Show ambiguity rather than silently falling back to a file walk. Do not build a new project-management system.

Use one locally configured executable/argv list. A developer invocation can use `pnpm --dir /Users/byronwall/Projects/tsx-data-flow exec tsx bin/tsx-effects.ts`. This command is proposed, not currently available. Do not accept browser-supplied shell commands or auto-install dependencies.

Validate project containment and the response shape at this boundary. Use async subprocess I/O, bounded output, timeout, and one cleanup path. Disconnect, supersession, timeout, or failure must reap the analysis process and descendants. Prefer a direct executable when available. Test the actual pnpm wrapper lifecycle if used. Reject obsolete client results.

Start with provisional limits of 30 seconds and 8 MiB. Report failure explicitly. Do not parse truncated JSON as success. Successful partial semantic analysis remains a valid response; invalid configuration and operational failure do not.

M1 retains only the displayed response. Measure startup before adding a reusable cache or service. A future semantic cache must include source/config/declaration/compiler/model inputs. Srcly's dependency metadata signature is insufficient.

Define exact positions over canonical display text: leading BOM removed, CRLF/CR converted to LF. Use 1-based UTF-16 columns and end-exclusive spans; offsets are 0-based UTF-16. Map compiler positions into that text once. Do not mix tree-sitter byte offsets with UTF-16.

Compare source revisions before applying marks or jumping. If text changed, show a refresh action. Do not pass exact semantic selections through fuzzy name/line matching. Historical `gitRef` content shows Effects unavailable in M1; never overlay current-worktree evidence on old source.

## Compact acceptance fixture

Create `T/examples/effects-basics/` only during authorized implementation. The full proposed fixture is in Pro's implementation-plan download. These cases define the acceptance contract:

| Case | Exact expectation |
| --- | --- |
| `leaf(x) { return x + 1 }` | Closed primitive candidate; no call or effect |
| Imported leaf reference | No invocation edge from an import or bare reference |
| Direct/const-alias calls | Exact target is leaf; alias creates no invented callable body |
| Fresh numeric slice then sort | Local receiver write; no input write; eager comparator |
| Input alias then sort | Parameter-zero write |
| Caller passes its input to mutator | Transitive parameter write after substitution |
| Caller passes fresh slice to mutator | Callee write becomes caller-local mutation |
| Fresh outer object with borrowed child write | Partial mutation-target frontier; never closed/local-only |
| Return logging arrow | Latent output on arrow; no factory output |
| Invoke logging IIFE | Invocation output; no deferred output |
| Timer logging arrow | Invocation schedule and deferred output |
| Logging Promise executor | Invocation output; executor is eager |
| Async log after await | One direct await; invocation-caused output |
| Discard that async call | Zero direct awaits in caller; transitive output remains |
| Await that async call | One direct await and one invocation, not two calls |
| Return that promise | Zero direct awaits; adoption relation; output remains |
| Local arrow named fetch | No network fact |
| Parameter named fetch | Unknown callback target; no network fact |
| Log then unknown callback | Known output and partial coverage together |
| Mutual recursion with one log seed | Both summaries contain output; finite convergence |
| Quiet mutual recursion | No modeled effects; termination remains unestablished |

Use strict ES2022, ESNext/Bundler resolution, DOM declarations, and `types: []` for the fixture. Include an astral character before a call and CRLF/BOM variants. Verify the exact selected substring, not only numeric offsets.

For missing/corrupt config, unsupported Python, changed source, and obsolete requests, assert explicit status. Never accept a false closed-empty result.

## Verification and documentation

Read current repository instructions before implementation. TSX's `docs/application-structure.md` and `bin/tsx-dataflow.ts` exist in the local checkout. Their absence from the research packet is resolved. Installed compiler versions and packaging remain implementation inputs.

TSX currently requires explicit approval before changing or running tests. This design task supplies specifications, not that approval. Use `pnpm lint` and `pnpm typecheck` during its implementation phase. Do not run TSX build scripts. After test authorization, its final gate is `pnpm verify`.

Keep verification to three meaningful boundaries:

1. One semantic fixture suite protects the table, recursive closure, unknown preservation, and source coordinates.
2. One Srcly transport suite protects response states and process cleanup, plus a real local command smoke check.
3. One panel scenario protects known-plus-partial display, exact witnesses, stale selection, and historical-source refusal.

Document the fixture and CLI under `T/examples/effects-basics/README.md` and `T/docs/function-effects.md`. Add the user walkthrough under this Srcly initiative. Explain the three anchors, assumptions, and test-seam decisions. This walkthrough does not require an automatic advice engine.

Record actual compiler/config, source snapshot, latency, scope counts, and unresolved frontiers during acceptance. Make no performance claims before measurement.

## M2: bounded lifecycle inspection

After M1 review, extend the same model for `watchScan`. Add EventSource creation/listeners/close, named timer callbacks and cancellation, promise reactions, and all/allSettled/race/forEach coordination.

Open a bounded execution slice from the Effects panel. Proposed files are `client/src/viz/effects/executionModel.ts` and `ExecutionSlice.tsx`. Reuse display helpers where suitable; do not route execution relations through dependency aggregation.

| Real behavior | Required explanation |
| --- | --- |
| EventSource unavailable | Immediate poll invocation, followed by conditional timer scheduling |
| Event listener registration | Callback depends on event; registration does not run it |
| Terminal accept branch | Stop before onDone if reached and preceding operations return normally |
| Returned stop closure | Reference only; returning it does not run cleanup |
| Stop during fetch | Observation can stop while fetch continues |
| Supplied handlers | Unresolved effects remain visible |
| Equal nonterminal versions | Only strictly older versions are rejected by current source |

The coordination fixture must show two job starts before each aggregate call. `all` joins success but can reject early. `allSettled` waits all settlements. `race` selects first settlement. None implies cancellation. `forEach(async ...)` ignores callback promises. `.then` callback activation and returned promise adoption remain separate relations.

Use labels and stroke styles for calls, schedules, waits, joins, and cleanup. Collapse recursive groups and show omitted counts. Never title a static slice an actual call stack or observed execution.

## Stop and defer

Stop expanding M1 when the three anchors, compact traps, transport, and exact navigation meet acceptance. Partial ranking analysis is acceptable.

Stop and correct any false host match, lost async effect, flattened latent closure, incorrect private mutation, erased unknown, or nonconverging recursive summary.

Defer full Solid timing, Node worker modeling, Python semantics, general heap/path proof, runtime traces, service/caching infrastructure, and shared packages. Each later expansion needs a named useful case. Keep the neighboring value-flow initiative independent.
