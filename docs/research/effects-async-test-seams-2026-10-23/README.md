# Effects, async boundaries, and useful test seams

Build a small function-effects pass in tsx-data-flow. Show its evidence in Srcly's code inspector. Start with exact calls, transitive effects, async result handling, and explicit unknowns. Add an execution view after the inspector proves useful.

This is a design proposal. It implements no analyzer or UI changes. The [implementation plan](../../intent/effects-async-test-seams/implementation-plan.md) defines the first delivery. The [recommendation register](recommendations.md) records all 30 dispositions. [Verification](verification.md) explains the source checks and limits.

The [Pro conversation](https://chatgpt.com/c/6adc0dbe-1934-83e9-ae3e-99777939ff03) contains the full research report, detailed plan, and downloads. The review used Srcly `aea1015` and tsx-data-flow `b4f1ba4`, including its supplied local edits. Original downloads remain in ignored `tmp/pro/effects-async-test-seams/collected/`.

## Think in behavior, activation, and evidence

“Simple,” “pure,” and “easy to test” answer different questions.

| Question | Useful evidence | Limit |
| --- | --- | --- |
| Is it simple? | Size, branches, nesting, local control flow | A one-line network request can start substantial work. |
| Is it isolated? | Explicit inputs, ambient reads, mutation targets, transitive effects | An unresolved call prevents an absence claim. |
| Is it deterministic? | Clocks, randomness, environment, shared state, input contract | Write-free code can still depend on changing state. |
| Is it a good test seam? | Observable contract and controllable dependencies | Stateful controllers can have excellent seams. |
| What happens when called? | Call occurrences, activation rules, result dependencies | A static path is a possibility, not an observed stack. |

Use an effect summary with separate coverage. Derive badges from those facts. Do not store a single `pure` boolean or combine them into a risk score.

The summary should distinguish these facts:

- External behavior: network, filesystem, output, DOM, storage, scheduling, and resource ownership.
- Ambient inputs: module state, captured mutable state, clocks, environment, and reactive reads.
- Writes: input/receiver state, shared state, fresh local storage, or an unknown target.
- Other facets: allocation, returned identity, throws/rejections, and unestablished termination.
- Analysis limits: unresolved calls, unsupported operations, omitted source, and required assumptions.

Known effects and unknown behavior can coexist. Show “Network · Partial” when both apply. Never erase a network witness because another call is unresolved.

Use **Transformation candidate** only for a closed supported model without active external effects or ambient reads. Display its assumptions. Ordinary records and standard intrinsics are assumptions, even when TypeScript accepts the code. TypeScript explicitly permits some unsound operations. [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#a-note-on-soundness).

Local mutation does not automatically disqualify a useful transformation. Sorting a private scratch array differs from sorting the caller's array. A shallow copy owns its outer object; it can still reference borrowed children. Passing storage to an unknown call can invalidate a private-ownership assumption.

Throws also need separate treatment. A validator can be isolated and deliberately reject invalid input. Recursion can have no modeled effects while termination remains unestablished.

## Calls, callbacks, and async work

Index each callable body separately. Containing an arrow function does not execute it.

```ts
function factory() {
  return () => console.log("later");
}
function immediate() {
  (() => console.log("now"))();
}
function scheduled() {
  setTimeout(() => console.log("when triggered"), 0);
}
```

`factory` returns latent behavior. `immediate` invokes its callback. `scheduled` starts scheduling during invocation; its output depends on a later trigger.

Track two effect channels:

| Channel | Meaning |
| --- | --- |
| Invocation-caused | Possible effects of calling the function, including its own async continuations |
| Deferred-triggered | Possible effects of separately registered or scheduled callbacks |

These channels describe activation origin. Invocation-caused does not mean “before return.” A called async function retains possible later effects when its promise is discarded.

Record result handling independently: awaited, returned/adopted, chained, aggregated, discarded, or unknown. `await` is a result dependency and suspension site. It does not call the producer a second time. A Promise executor runs eagerly. Promise combinators aggregate results from work already started by their input expressions. [ECMAScript promise algorithms](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-constructor).

`void task()` does not handle rejection. This distinction must survive any display of intentionally discarded results. [typescript-eslint guidance](https://typescript-eslint.io/rules/no-floating-promises/#ignorevoid).

| Operation | Required interpretation |
| --- | --- |
| `async` declaration | Promise result; no automatic worker or parallel thread |
| `Promise.all` | All fulfillment needed for success; rejection can settle early |
| `Promise.allSettled` | Wait for all settlements |
| `Promise.race` | First settlement; remaining work can continue |
| `forEach(async ...)` | Eager callbacks with ignored promises; no outer completion join |
| Timer/listener registration | Trigger-dependent work; registration is not callback execution |
| Cancel request | Ask participating work to stop; completion is not established |
| Close/remove/terminate | Specific resource operation; show its actual scope |

A static call graph answers which targets may run. A control-flow graph answers which branches may follow. Data flow follows values. A causal model links starts, triggers, waits, and cleanup. A runtime stack shows one execution's current nesting. An async trace records observed causality. Keep these meanings distinct.

Start with static evidence. It works without running target code and can expose untested paths. Runtime tracing can later add observed paths. It cannot prove that unobserved paths are impossible.

## What exists in the two repositories

| Foundation | Current source fact | Work still needed |
| --- | --- | --- |
| Srcly dependency graph | `deps/typescript_deps.py::collect_ts_usages` walks imported-name uses, including type uses | Real call-site records and target coverage |
| Srcly symbol aggregation | `deps/common.py::emit_symbol_edges` retains unused imports and skips same-file edges | Local calls, repeated occurrences, nested callable identity |
| Srcly code inspector | CodeModal shows source, metrics, findings, and marks | Categorical effects, exact cross-file witnesses, stale-source handling |
| Srcly metric system | Zero and N/A differ; witnesses explain max metrics | Keep effect categories outside numeric risk ranking |
| TSX compiler machinery | `src/project/typescript.ts::buildProgram` loads configured programs | Reuse loading below render-report construction; expose diagnostics |
| TSX call evidence | `program-evidence-collector-call-support.ts::processCall` records calls and some resolved targets | Complete supported-target policy and effect propagation |
| TSX boundary labels | `program-evidence-boundary-support.ts` includes name-based classification | Identity-checked models; host labels are not purity proofs |
| TSX field/route evidence | Current local edits carry precise lineage records | Keep this separate from effects and callback activation |

Srcly's dependency arrows cannot become execution arrows through relabeling. The occurrence and activation information is absent. TSX's existing “proven” relation labels also do not establish general purity.

Use tsx-data-flow for semantic analysis and Srcly for inspection. A direct TSX API plus a one-shot JSON command is the first integration boundary. Srcly's Python backend invokes it and validates the result. A resident service, shared package, and new persistence layer add no necessary first-slice value.

The alternative is a second TypeScript analyzer owned by Srcly. That can work, but duplicates project and compiler work. Extending tree-sitter alone is useful for syntax facts; it does not provide TS binding or arbitrary runtime targets.

CodeQL's documented target uncertainty is a useful contract model. Jelly offers a later comparison for unresolved JS/TS targets. Neither is a required deployment dependency. [CodeQL call graph](https://codeql.github.com/docs/codeql-language-guides/codeql-library-for-javascript/#call-graph), [Jelly](https://github.com/cs-au-dk/jelly).

## Source-grounded spot checks

### A small transformation

`client/src/utils/dataProcessing.ts::extractFilePath` accepts primitive strings. It returns null for missing/folder paths and removes a `::` scope suffix. Under the primitive-string and standard-intrinsic assumptions, this is a good first closed transformation candidate.

The same file also contains `filterNoise`, which assigns input children and metrics. `filterTree` builds changed branches and reuses others. Similar helper names do not establish similar mutation behavior.

TSX's `examples/node-cli/src/records.ts` already separates validation, selection, and packing from file/output operations. This is an existing functional core. Its throwing validators remain useful seams. Do not split it further merely because several calls appear in a trace.

### Ranking has an ambient dependency

```text
rankHotSpots(nodes, metric)
  calls metricDef(metric)
    reads module-level byId Map
```

`hotSpotRanking.ts::rankHotSpots` constructs fresh arrays and ranking wrappers. However, `metricsStore.tsx::metricDef` reads a catalog that `setMetricCatalog` replaces. Ranking therefore depends on more than its explicit parameters.

Require that transitive read witness in the first analyzer. Leave wrapper ownership or unsupported library methods partial. Do not expand the model list only to make the whole function appear closed.

Existing tests cover descending order, ties, zero, N/A, neutral metrics, and server parity. A future explicit-direction parameter can reduce catalog setup if it becomes troublesome. That change is optional; the ambient dependency itself is not a defect.

### Scan orchestration needs lifecycle tests

`services/scanJobs.ts::startScan` has one direct await at `fetch`. It returns the promise from `expectJson`. That helper has two JSON await sites on alternative branches and an explicit async throw. Do not count those awaits as direct `startScan` awaits.

The larger source path is:

```text
scanStore.start -> startScan -> watchScan
  event/poll trigger -> accept -> terminal stop -> finish
    await result -> wait for frame -> obtain paint promise
      setData -> await paint -> onComplete
```

`scanStore.cancel` requests server cancellation while observation remains active. Disposal and supersession invalidate the request token and stop observation. `watchScan.stop` closes EventSource and clears its timer. It does not abort an already running fetch.

Useful tests control responses, events, timers, and paint promises. Assert stale-result suppression, cleanup, and completion order. Avoid wall-clock sleeps as the primary control.

### Stateful code can already have a good seam

`viz/deps/interaction.ts::createClickIntent` accepts scheduler and cancel functions. Its tests use a manual clock. They protect delayed focus, double-click opening, modified clicks, and cancellation. Captured state is appropriate here. The action is to use the seam, not remove its effects.

### Concurrency can hide behind a synchronous API

TSX's `src/server/analysis-service.ts::request` is not declared async. Its eager Promise executor records pending requests and posts worker messages. Cancellation uses shared atomic state. Closing terminates the worker. Useful seams concern correlation, late replies, coalescing, shutdown, and ownership.

Srcly's Python `run_file_analyses` synchronously supervises concurrent child processes. Existing tests inject an analysis function to exercise crashes, timeouts, cancellation, and cleanup. Preserve that supervisor/worker contract. The first TS/TSX effects pass must report Python as unavailable.

## From evidence to architecture

Find a useful dependency cut rather than a folder with a pleasing shape. A pure region can cross files. An imperative shell should retain state and cleanup with their owner.

| Evidence | Review question | Useful seam |
| --- | --- | --- |
| Ambient read inside a calculation chain | Would explicit input reduce setup? | Transformation unit/property test |
| Network/file boundary | What shape and failures does the boundary promise? | Contract or focused integration test |
| Timer/event/worker owner | Who starts, cancels, ignores late results, and cleans up? | Controlled lifecycle test |
| Dispersed shared-state access | Is ownership clear? | State transition or invariant test |
| Stateful recursive group | Which effect and state cross the cycle? | Inspect a bounded witness before refactoring |

Long paths, fan-out, recursion, and side effects are not defects by themselves. “Tangled” should mean a specific burden: unclear shared-state ownership, many activation changes, or cleanup spread across scopes. Show the evidence and the question. Defer a universal tangle score.

## Where to start

Deliver one Effects panel for three real anchors: `extractFilePath`, `rankHotSpots`, and `startScan`. Show facts, coverage, assumptions, callers/callees, and one exact witness. Known effects need neutral marks, not automatic warning colors.

Compute finite summaries over recursive call groups. Propagate direct seeds through supported calls with argument-origin substitution. Keep unknowns alongside facts. Retrieve bounded witness paths after propagation. A display limit must not change analysis completeness.

After reviewing that panel, add a bounded execution slice for `watchScan` and promise coordination. Keep imports, calls, data, scheduling, waits, and cleanup as distinct relations. Defer full Solid models, Python effects, runtime tracing, general heap analysis, and service infrastructure.

The [implementation plan](../../intent/effects-async-test-seams/implementation-plan.md) provides the contract, acceptance cases, and delivery gates.
