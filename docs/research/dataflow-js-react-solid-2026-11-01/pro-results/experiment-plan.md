# Experiment plan — srcly across actual JavaScript, React, and SolidJS

**Status:** research design at baseline `e07cc510087b5c028273cad785b97ee36c6c3b35`, checked 2026-11-01. **Six native controls were executed; all sixteen srcly/framework/browser cases below are unexecuted.** No repository changes are part of this deliverable. [research-report.md](research-report.md) supplies the complete source audit; [implementation-plan.md](implementation-plan.md) maps the cases to shippable work.

## 1. Questions and experimental units

The unit is a **specified semantic claim under a pinned configuration**, not a green endpoint. Each case has a positive witness, a negative or never-executed control, labelled source/destination expressions, forward and backward checks where meaningful, and a direct runtime assertion. Test these three artifacts separately:

1. **A — Static oracle:** annotated source plus emitted relation and graph/ledger assertions. This detects wrong paths, missing paths, wrong endpoint kinds, wrong fields/channels/instances, and proof inflation.
2. **B — Direct semantic assertions:** pinned runtime library with explicit equality, derivation, state, exception, event-count, and sequence checks. This determines the finite counterexample's actual behavior.
3. **C — B plus optional observation record:** identical source/input/actions and explicit event/identity/condition records. This tests whether a packet adds a justified review decision beyond B. It is not a different test with more coverage silently added.

A runtime fact about one input never deletes a general static may-flow merely because the callback did not execute. A negative **value-channel** assertion also does not forbid a correctly labelled control-dependence edge. For example, a query's completion can affect `status`; its secret payload is not the same value as the string `'success'`. The oracle must distinguish those claims rather than ban every influence edge.

## 2. Exact version and environment manifest

| Component | Pin and evidence | Required preflight / boundary |
| --- | --- | --- |
| Srcly | Baseline `e07cc510087b5c028273cad785b97ee36c6c3b35`; proposal head `66804541fedb70ce91886c68e7dba3cb61c6f214` | Keep immutable baseline and later implementation revision separately; hash model files, fixture source, configs and emitted contract. The supplied ZIP is not a buildable checkout. |
| Node | **24.22.1**, actual sandbox native-control runtime | Record `process.version`, OS, architecture; fail rather than silently run another version for a claimed reproduction. Node is orchestration/native control, not a surrogate browser. |
| TypeScript | **5.9.3**, exact baseline engine package/lock | Use this checker in every static comparison. Record allowJs/checkJs/strictNullChecks, module/resolution/conditions, JSX, selected roots, diagnostics, package/declaration paths. |
| Browser runner | **@playwright/test 1.62.0 → playwright 1.62.0 → playwright-core 1.62.0**, baseline client pin and official manifests | Bundled **Chromium headless shell revision 1234, version 151.0.7922.34**. Check executable version/revision/OS; no arbitrary system browser substitution. [Official browser manifest](https://github.com/microsoft/playwright/blob/v1.62.0/packages/playwright-core/browsers.json), blob `25e42eae2b73a0a4211be65cacf51bb5b173ab8d`. |
| React | **react 19.3.0**, **react-dom 19.3.0** | Exact tagged source/manifests and [official release](https://react.dev/blog/2026/09/09/react-19-3) checked. Browser `react-dom/client`, development mode, StrictMode off for primary counts, React Compiler off. SSR separate via `react-dom/server`; RSC is not implied. |
| React declarations | Proposed exact **@types/react 19.3.0**, **@types/react-dom 19.3.0** for typed lane | Current package listings indicate this line; tarball integrity was not verified here. Verify exact resolved manifests/integrity before typed TSX tests; if unavailable, mark declaration lane blocked rather than substitute silently. Plain runtime JS probes do not depend on these types. |
| TanStack React Query | **@tanstack/react-query 5.105.0**, **@tanstack/query-core 5.105.0** | Exact tagged useMutation/package sources checked. Create a fresh QueryClient per scenario; retries off; no network; capture scheduled observer notifications. [Pinned implementation](https://github.com/TanStack/query/blob/@tanstack/react-query@5.105.0/packages/react-query/src/useMutation.ts). |
| Solid | **solid-js 1.9.17**, baseline exact lock version | Required integrity + browser/server entry verification before any run. Tag 1.9.17 was inaccessible through GitHub; current official docs and inspected **v1.9.9** source corroborate contracts but are not 1.9.17 runtime evidence. Do not silently substitute versions. [Baseline lock](https://github.com/byronwall/srcly/blob/e07cc510087b5c028273cad785b97ee36c6c3b35/engine/pnpm-lock.yaml). |
| Runtime adapters / transforms | Plain JS native probes; React `createElement`; Solid explicit API/getter/DOM adapters. **No JSX transform in primary runtime probes.** | Browser bundles, where needed for React package loading, use baseline-locked **esbuild 0.28.2**, platform browser, recorded conditions and development define. JSX source mirrors remain distinct static inputs. Any later compiled JSX run must pin compiler and generated-source mapping separately. |

The pins are reproducibility targets, not a claim that every version was installed or run. No dependencies were installed for this mission. Future implementation owners use `pnpm` and the repository's lock/bootstrap process. Never use a floating symlink to an unrelated application's dependencies as evidence for a package version.

### Static input lanes — JavaScript is not a renamed TS test

For each finite semantic fixture, maintain actual `.js` (or `.jsx`) and a separately authored strict `.ts`/`.tsx` control. First run actual JavaScript under an explicit supported `tsconfig.json` with `allowJs:true`; toggle `checkJs` without changing source. Repeat no-JSDoc and JSDoc forms where inference affects the path. The admission case V1 additionally covers jsconfig, no config, loose null checks, `.mjs`, `.cjs`, CJS/ESM and conditional exports. A refused root is `not-analyzed` with its reason, not a zero-flow success.

React static mirrors use `jsx:react-jsx`; Solid uses `jsx:preserve`, `jsxImportSource:'solid-js'`. SH-01 must parameterize the fixture harness with strict `allowJs:true`, `noEmit:true` per-lane configs or isolated roots: the existing basics config does not admit JS and uses Solid JSX. Assert actual Program membership before grading. Keep counterparts in isolated roots or distinct basenames to prevent same-name `.ts` from shadowing `.js`. Runtime `createElement` or explicit Solid APIs cannot prove JSX collector behavior; their records identify different source forms. If comparing compiled JSX later, record source maps and generated adapter digest. Do not analyze `.tsx` and report the result as `.jsx` coverage.

### Browser/root/owner setup

Use one fresh local test document and explicit fixture container per case; no remote page or private project. React creates a root, sets `globalThis.IS_REACT_ACT_ENVIRONMENT=true`, and wraps mount/update/click/unmount in awaited `act`. Exact event counts use StrictMode off; a separate declared stress variant can enable it. Use committed probes (layout effect or explicit test callback) to capture values without invoking callbacks during registration. [React createElement](https://react.dev/reference/react/createElement), [act](https://react.dev/reference/react/act).

Solid constructs the root and every owned computation/resource synchronously in `createRoot` or a renderer-owned component. Preserve owner across setup; do not create owned computations after an unbound await. Explicitly dispose each root after the marked observation window, with cleanup events separately labelled. The supplied [solid-browser-adapters.mjs](solid-browser-adapters.mjs) implements E-S4/E-S5 as **unexecuted** no-JSX browser adapters. Import maps or a verified browser bundle must resolve core/store to the **same** Solid core instance. Do not assume Node `--conditions=browser` proves selection of browser exports.

### Windows and completion

Each browser case has a **five-second hard deadline**. Synchronous phases end at the declared marker, not an arbitrary sleep. Solid resource microtask-only cases allow at most ten explicit checkpoints; exceeding the bound records a timing/settlement failure, not proof of no flow. React cases wait for the requested commit. **TanStack Query requires a committed observer-state predicate with bounded runner polling:** its exact-version notification manager schedules tasks, so `act` plus microtasks alone is not a completion guarantee. Do not replace its scheduler unless both B/C runs declare the same substitution. [Pinned notifyManager](https://github.com/TanStack/query/blob/@tanstack/react-query@5.105.0/packages/query-core/src/notifyManager.ts), [useBaseQuery](https://github.com/TanStack/query/blob/@tanstack/react-query@5.105.0/packages/react-query/src/useBaseQuery.ts).

No-click, no-dispatch, no-disposal, unused wrapper, and disabled-source windows close **before** hygiene cleanup or a later enabling action. Record those later events separately. SSR runs use separate entry/condition manifests and fresh owners; do not combine server no-op observations with client executions. All event counts refer only to the declared actions.

## 3. Exact static assertion contract

Use existing `@trace`, exhaustive `@reaches`/`@stop`, `@visits` and `@never-reaches` now. `SH-01` adds labelled source/destination matching to edge assertions: current `@edge`/`@no-edge` matches anywhere and cannot test the exact bad edge. Until that extension ships, add a focused relation-level assertion in a test **alongside** required annotated language fixtures, not as a replacement for them.

**Proposed assertion record (not an existing parser syntax):**

```json
{
  "fromLabel": "mutation-payload",
  "toLabel": "mutate-return",
  "direction": "forward",
  "expect": "absent",
  "semantics": "value",
  "fieldPath": [],
  "completion": "normal",
  "invocation": "mutation-A",
  "proofBasis": "framework-model"
}
```

Do not paste that record into comments until the parser supports it. Labels resolve to unique AST spans and fail if missing/ambiguous. Every graph test records emitted facts **and** projected edges, so slicing cannot hide a collector defect and projection cannot invent proof. Capture both the graph and forward ledger outcome for the same anchor/generation where supported. Backward queries use anchorGraph, not the currently forward-only ledger endpoint.

For exact simple fixtures, `ok` means a finished trace with the required ends and no unsupported step; library/framework legs still carry **modelled** basis. `assumed` is acceptable only where the case explicitly uses an unresolved external behavior. `partial` requires the exact named frontier and claim it prevents; a vague partial result does not satisfy a missing positive-path oracle. `not-analyzed` remains separate from all three. New uncertainty names in this design are proposals requiring contract/UI work; existing `framework-runtime`, unresolved, and budget reasons must be preserved where applicable.

### Per-case endpoint and outcome targets

These are **desired oracle targets after the mapped milestone**, not observed baseline outcomes. Each static mirror isolates the target read in a labelled `return` or intrinsic render, avoiding a catch-all returned aggregate. Negative assertions constrain value channels; a separate labelled control relation may be allowed where stated.

| Case | Exact endpoint/relation target | Outcome and forbidden claim |
| --- | --- | --- |
| V1 | Identity argument→matching labelled `return`; backward return→its argument only; product membership inventory | Current refusals recorded exactly. After JS-01, accepted finite cases `ok`; unsupported binding remains named. No second-call crossover. |
| V2 | Token→copied[0] and mutated[0] labelled returns via correct field/receiver roles | `ok`/modelled for ordinary unmodified native arrays after JS-02. No token-value path to dropped/kept empty array elements; no object-identity claim for length. |
| V3 | Replacement→then fulfillment; seed→finally fulfillment; failure→reject/catch channel | `ok` for finite built-in chains after JS-03; unresolved thenable separately partial. Never return normal finalizer payload through prior fulfillment; recovery catch remains allowed. |
| V4 | Token→first cell/key-x return, other→second/key-y return; setter argument enters correct instance | `ok` for bounded disjoint allocations after JS-04/SH-05. Unknown key/receiver explicitly partial; no exact cross-instance/key identity. |
| V5 | Text assignment→`external-effect`; kept selector result→return; dropped selector→unused/discarded call end, not page-write | Correct finite read/write classification `ok`. Event eligibility may remain partial/time-unproven; no proof callback ran in W0. |
| R-EXP01 | Token→memo data render; callback result→explicit invocation; effect return has no cleanup data edge | `ok` for finite value channels after RE-01/SH-02. Dependency-only control must not be called data identity. |
| R-EXP02 | Future state→later render; ref write→`.current` read; immediate captured n remains render-snapshot role | Preserve time-unproven limitation. `ok` landing allowed only with temporal limitation visible; exact epoch query partial if unresolved. No ref-write-is-render-trigger claim. |
| R-EXP03 | Action.name→reducer parameter1→reducer return→render, direct and lifted | `ok` for finite value path after RE-02. Constant reducer excludes action data; function action is not auto-invoked. |
| R-EXP04 | Captures→setup/cleanup body sinks as possible activation; no cleanup→hook result | Body endpoints `ok` if represented; exact lifecycle/commit query partial if unresolved. No server effect-execution claim. |
| R-EXP05 | Mutation payload→awaited mutateAsync; select return→query `.data` render | `ok` for selected finite channels after RE-04; cache/dynamic options may be partial. No mutation payload→mutate-return, no raw-payload identity→metadata. |
| R-EXP06 | Resolved nearest provider/default→matching reader render; shorthand provider is not DOM terminal | `ok` for closed resolved trees after RE-03; unknown ancestry explicitly partial candidate set. Exclude definitely unrelated provider. |
| E-S1 | Source→memo accessor value; key/source→derived selector boolean; positive batch callback→outer result | `ok` with correct modelled roles after SO-01. No memo factory/predicate result equal to source object by assumption. |
| E-S2 | onCleanup argument→same returned callable; explicit invocation→callback result; effect result void | `ok` for return roles; owner/recurrence timing partial if unresolved. No callback payload→void effect/onMount result. |
| E-S3 | on construction→new callable; source→callback input only when wrapper invoked; callback output→that invocation | `ok` for explicit finite wrapper value path; subscription/scheduling precision stated. No never-invoked wrapper reported executed. |
| E-S4 | Included/winning prop→correct render; store value→selected field only | `ok` for literal partition/override/path after SO-03/04. Unknown key partial; no excluded prop or sibling field data edge. |
| E-S5 | Fetcher return→data accessor field; source→fetcher input; resource actions have own return slots | Preserve named `framework-runtime` boundary when async/ownership remains unresolved. No consumed-but-not-returned JSON as payload; no error as successful accessor data. |

## 4. Vanilla JavaScript cases

Source keys J01–J16 refer to the pinned evidence ledger in [research-report.md](research-report.md). Native counterexamples assume ordinary arrays and unmodified native methods; overridden methods, getters, proxies, and species hooks get separate unknown/override controls, not blanket pure-operation assumptions.



### V1 — Project acceptance, not just compiler syntax

**Source:** J01–J05, J13. **Purpose:** expose denial/membership/model-resolution differences before scoring value flows.

Use one tiny `identity(value) { return value; }` module with two disjoint object arguments and local consumers. Materialize it as `entry.js`, `entry.jsx` (with one intrinsic `<span>` control), `entry.mjs`, and `entry.cjs` in separate synthetic roots. Use explicit ESM export/import versus `module.exports.identity`/`require('./helper.cjs')`. Never run all roots in parallel.

Cases: (a) strict allowJs tsconfig; (b) same with checkJs true; (c) same without JSDoc; (d) jsconfig-only; (e) no config; (f) loose allowJs config; (g) `.mjs` only root; (h) `.mjs` imported from admitted `.js`; (i) only `tsconfig.app.json`; (j) `.cjs` requires node:fs stubbed only for *analysis* and never reads a real file; (k) mixed sibling configs with different conditional exports. For the conditional-export experiment, author a local tiny package with node/browser entries and divergent marker constants; this is original fixture code, not a downloaded program.

**Exact assertions:** record product `available/reason/language`, selected root files, Program source files, chosen options/version, resolved target declaration, model key, request outcome, every stop and target endpoint. On accepted identity cases, forward from first argument reaches first consumer only; backward first consumer reaches first argument only. Same syntax in `.js` must be included in harness inventory and counts. Existing baseline predictions are the admission matrix above, not promised measured outcomes. A rejected case is `not-analyzed`, not zero-flow success.

**After-build target:** jsconfig and inferred JS modes enter with recorded null-proof capability false when required; `.mjs` roots appear; CommonJS and ESM resolve the same helper and named builtin model where semantic identities match. CheckJs toggling should change diagnostics without manufacturing new source or sink identities. Missing types may reduce justified precision, and those edges must retain a named uncertainty.

**Packet increment:** almost none. A structured config/membership record and ordinary fixture assertion are enough. Do not build dynamic instrumentation to discover a static acceptance defect.

### V2 — Mutation, identity and derivation are separate

**Source:** J06–J08; existing `external-calls.tsx` and `receiver-writes.ts` are useful but omit the discriminating inverse cases.

```js
export function inspect(token) {
  const dropped = [];
  dropped.concat([token]);
  const kept = [];
  const copied = kept.concat([token]);
  const mutated = [];
  const length = mutated.push(token);
  return { dropped, kept, copied, mutated, length };
}
```

Use fresh frozen token `{ id: 'T' }`. Exact native assertions: `dropped.length===0`; `kept.length===0`; `copied!==kept`; `copied[0]===token`; `mutated[0]===token`; `length===1`; `copied!==mutated`. A second token with different fields produces the same `length`, demonstrating count derivation rather than payload identity. Mutation of the array is valid even when the return is retained.

**Static pairs/directions:** forward token must reach `copied[0]` and `mutated[0]`, never a value element of `dropped`/`kept`. Backward those positive reads reach token; backward `.length` must not claim token's object identity. Existing baseline likely adds dropped-concat receiver flow and omits retained-push receiver flow because of J07; assert emitted receiver relations as well as graph endpoints to distinguish walker masking. Returning a whole object is not an adequate end assertion: anchor individual fields in separate consumers.

**Expected corrected srcly result:** native methods have explicit `preserves-element`, `new-container`, `writes-receiver`, and scalar derivation roles (these names are proposed semantics, not existing relation enum names). Correct modeled data flow can land without assumed library steps. If the analyzer cannot separate field/identity, keep a named partial/unknown rather than upgrade the edge. Ordinary method argument passing is not itself object identity. No receiver mutation is allowed solely because a return is discarded.

**Packet increment:** object tokens plus before/after receiver states could make the mistaken review obvious, but direct equality and array-state assertions contain the same evidence. Count this as no added packet value unless a reviewer identifies a specific previously missed identity claim.

### V3 — Promise completion, finalization and a never-fired branch

**Source:** J06/J08; the `resolved` fixture covers resolve only. Use different object tokens `seed`, `replacement`, and `failure`.

```js
export async function channels(seed, replacement, failure, rejectInput) {
  const events = [];
  const viaThen = await Promise.resolve(seed).then(value => {
    events.push('then');
    return replacement;
  });
  const viaFinally = await Promise.resolve(seed).finally(() => {
    events.push('finally');
    return replacement;
  });
  let caught;
  try {
    await new Promise((resolve, reject) => {
      events.push('executor');
      reject(failure);
    });
  } catch (error) {
    events.push('catch');
    caught = error;
  }
  let optionalCalls = 0;
  const optional = await (rejectInput
    ? Promise.reject(failure)
    : Promise.resolve(seed)).catch(error => {
      optionalCalls += 1;
      return error;
    });
  return { viaThen, viaFinally, caught, optional, optionalCalls, events };
}
```

Exact assertions for `rejectInput=false`: `viaThen===replacement`, `viaFinally===seed`, `caught===failure`, `optional===seed`, `optionalCalls===0`, events exactly `['then','finally','executor','catch']`. For `true`, only `optional===failure`, `optionalCalls===1` change. Add a separate finalizer `finally(()=>{throw failure;})`: final await rejects with the exact failure; it never fulfills with replacement. Observation window ends after all awaited chains settle, max one second/hard fail; no external I/O, no timers needed.

**Static pairs/directions:** replacement→then's fulfillment yes; replacement→normal-finally fulfillment no; seed→normal-finally fulfillment yes; failure→constructor rejected completion/catch yes; failure→that constructor's fulfillment no. Both optional branches remain possible when anchored at function inputs; zero optional callback observations in one run do not refute its static may-flow. Backward from normal-finally value must reach seed and exclude normal callback return as that value. Distinguish callback side effects from normal return data even when both use the same token.

**Expected corrected srcly relation/outcome:** keep call/return pairing, but carry completion channel (`fulfill`, `reject`) and callback role. These are proposed additions; current generic `return-value` cannot express all distinctions. Exact available channels can be modeled; unmodeled thenable assimilation/throws retain named uncertainty. A landed request or discarded promise is not a substitute for value/channel assertions.

**Packet increment:** ordered callback records and named unexecuted branch are useful reviewer context; direct assertions already prove equality/count/order for this input. If packet review merely restates them, reject packets as a required CI artifact. Never upgrade all Promise rows based on this run.

### V4 — Instance/field identity, setter entry and JS constructor functions

**Source:** J09–J11; `member-state.ts` currently uses one instance and `v-setter` begins at the setter's input instead of exercising a property assignment.

```js
export class Cell {
  constructor() { this.value = null; }
  set(item) { this.value = item; }
  get() { return this.value; }
  set current(item) { this.value = item; }
  get current() { return this.value; }
}
export function cells(token, other) {
  const first = new Cell();
  const second = new Cell();
  first.set(token);
  const initialSecond = second.get();
  second.current = other;
  return { first: first.get(), second: second.current, initialSecond };
}
```

Exact native assertions: first is token, second is other, initialSecond is null. Distinct-token forward traces must not cross first/second; backward first read excludes other. Setter property assignment must enter setter with the specific object and argument. Direct method control exists to isolate setter dispatch from member state. Add an original constructor-function counterpart `function Cell0(value){this.value=value}` plus `Cell0.prototype.get=function(){return this.value}` and compare behavior to class constructor; TypeScript's `.js` inference understands this pattern, while srcly's constructorTarget path excludes it. Add literal-key `bag['x']=token` / `bag.y=other` and dynamic-key variant as separate controls; literal key x must exclude y, unknown key must be explicitly widened.

**Static target:** receiver-sensitive member-state facts should retain an allocation or bounded object context. An alias of first legitimately shares its values; two unrelated allocations do not. Where allocation identity is unknown, conservative may-alias is allowed but must not assert unique/proven identity. These are independent from existing function-call pairing; dropping the call stack to make the test pass is forbidden.

**Packet increment:** bounded object IDs aid review, but equality/negative-path fixtures expose the core error without a generic boundary instrumenter. Distinct two-object negatives are mandatory before claiming a getter model correct.

### V5 — Browser read vs write; registration without invocation; abort/removal

**Source:** J12/J16. Browser plain-JS fixture, no React/Solid; one fresh detached root appended to a test-owned container, disposed afterward. Exact browser build/conditions recorded from runner lockfile. No site visits or private data.

Set `root.innerHTML='<button id="button">before</button>'`; keep node identity `button`. Call `root.querySelector('#button')` both as a kept result and a discarded expression. Assert root's serialized subtree unchanged after both and kept result is button. Then `button.textContent='after'` changes exactly its text. `querySelector` input is a selector/control input, not text written to DOM.

Register one named listener with `{signal:controller.signal}`, record registration, and close window W0 **without dispatching**. Expected callback count 0; relation remains static may-callback. In W1 dispatch a CustomEvent with an object detail token; expect listener count1 and `event.detail===token`, `event.currentTarget===button`. Abort controller, dispatch again in W2: count stays1. Add second listener on second target and same event name; it must not receive first target's dispatch. Add mismatched removal callback as negative: removing a fresh function object does not remove the original. Dispose container and abort all signals after final window. A mutation observer may count only actual test writes; drain one microtask after DOM mutations, avoid timing guesses. Timeout one second, max two dispatches per listener scenario.

**Static target/end:** discarded querySelector is unused read/call endpoint, never `external-effect` “page write.” Text assignment is a DOM write endpoint even when receiver is a local parameter. Payload→event detail may-flow should pair target/type/listener identity; cancellation metadata can suppress paths only when modeled with proven ordering, otherwise named lifecycle uncertainty. No observation before dispatch is not a refutation. Retain DOM host versus user-object `addEventListener` spelling negative.

**Packet increment:** this is the strongest vanilla candidate for a small event/lifecycle attachment because a fixed equality assert alone can omit registration/cancellation phases. Compare against ordinary assertions augmented with exact sequence/call counts on the same fixture. If both carry identical coverage information, the packet is presentation, not new semantic evidence. Do not expand this case into product runtime capture.

## 5. React cases

Source keys R-MODELS/R-CALL/R-JSX/R-OPTIONS and related keys resolve in the React evidence ledger in research-report.md. The shared exact environment manifest above overrides no local defaults: all cases use those declared pins and conditions.

### R-EXP01 — identity, derivation and effect return are three different channels

**Target:** R-MODELS useMemo/useCallback/useEffect; R-CALL `connectExternalCallbacks`. **Inputs:** `token={label:'alpha'}` and a separate sentinel object. In one component define `same=useMemo(()=>token,[token])`, `copy=useMemo(()=>({label:token.label}),[token])`, `callback=useCallback(()=>{ callbackCalls++; return token; },[token])`, and `effectResult=useEffect(()=>{events.push('setup'); return cleanup;},[token])`. Use a test-owned callbackCalls counter initialized to zero for each component instance. A layout-effect test probe captures the local results after commit; it must not call `callback` implicitly. `cleanup` is a named function that records one event.

**Direct assertions:** after initial act, `same===token`, `copy!==token`, `copy.label==='alpha'`, `typeof callback==='function'`, `effectResult===undefined`, callback invocation count 0; setup count 1, cleanup count 0. Invoke the captured callback once outside registration and assert return `===token`; count becomes 1. Unmount and assert cleanup count 1. Positive/negative pair: replace memo body `()=>token` with `()=>sentinel` while leaving `[token]`; token must no longer contribute data to memo result, although it controls recomputation. Add a second component instance with different token and ensure identities do not cross.

**Static assertions:** forward token→same result/render is modelled value flow; token.label→copy.label is derivation, not same-object identity; callback-body return goes to the *callback invocation*, not `useCallback` registration; cleanup return must have no value edge to effectResult. Backward effectResult must not identify cleanup or token as returned data. A useMemo dependency alone must be at most control/recomputation evidence, never exact returned-value identity. Annotated positive end should be the deliberately rendered `same.label`; negative `@never-reaches` points to unrelated sentinel/render. Required edge-specific test must name source and destination, since today's `@no-edge` is global by kind/status only.

**Interpretation and packet delta:** source already identifies wrong effect return. Runtime identity controls corroborate which clause is wrong; they cannot prove all useMemo results preserve identity or all callbacks fire. Packet adds value only if it identifies the callback registration/invocation mix-up or second-instance crossover omitted by ordinary assertions. The scalar/identity assertions alone otherwise suffice.

### R-EXP02 — render snapshot versus mutable ref and a never-clicked handler

**Target:** R-CALL stateElement, R-JSX pending references, R-OPTIONS field assignment; current `r-ref-counter` broad alternatives. **Component:** `const [n,setN]=useState(0); const r=useRef(0); const click=()=>{const before=n; setN(n+1); r.current=n+1; events.push([before,n,r.current]);};` Render `n` and keep the first render's `click` reference in the test's committed snapshot. A distinct later handler returns `r.current` to a test callback but is not a JSX render expression.

**Direct assertions/actions:** mount → text `'0'`; close a **no-click window**: no click log and ref current 0. Click once → event tuple `[0,0,1]`; after act rendered text `'1'`. Call saved first-render `click` again → tuple `[0,0,1]` again; it still captures old state. Invoke latest-render handler → `[1,1,2]`, rendered text `'2'`. A separate ref-only-write variant logs new `.current` but leaves rendered state text unchanged. Unmount.

**Static assertions:** model setter-to-future-state relation as possible/time-unproven; do not call it assignment to the handler's captured `n`. Backward from immediate logged `n` must retain snapshot uncertainty if the graph cannot separate epochs. Forward `.current` write must not itself be a render-trigger relation. A handler body is still a potential path in the no-click run; zero observed executions does **not** authorize removing it. Outcome may remain `ok` under existing landed semantics if all paths are modeled, but must carry the explicit temporal limitation rather than claiming execution.

**Packet delta:** event/commit sequence materially distinguishes same closure, later render and ref mutation; an endpoint-only fixture cannot. An ordinary test already asserting these tuples is equally strong for this bounded scenario. Keep packets only if they make the closure identity evidence independently reviewable at reasonable cost.

### R-EXP03 — direct reducer versus dispatch passed through context

**Target:** R-CALL 265–269 versus R-JSX 529–535. **Positive pair:** string state `'old'`, reducer `(_state,action)=>action.name`, action `{name:'new',ignored:'secret'}`; dispatch directly in one fixture and through a context value in its mechanically equivalent twin. **Negative pair:** same inputs but reducer returns `'fixed'` and never reads action. Optional initializer control: `useReducer(reducer,{name:'seed'},arg=>arg.name)` must start at `'seed'`, not object or function. Function-action control: reducer accepts `action:()=>string` but returns `'fixed'` without invoking it; pass `()=>{calls++;return 'secret'}` as the action.

**Direct assertions:** positive twins display `'old'` then `'new'` after one click, ignored field never displayed; negative twins display `'old'` then `'fixed'`; function-action body count is 0. `dispatch(...)` return is undefined. Capture state immediately after dispatch in the same handler: still `'old'`. Unmount all roots.

**Static assertions:** both dispatch forms enter the same reducer action parameter, with handler/provider identity retained. The action-name path reaches render only through the positive reducer return. Negative action secret must not reach state/render or be treated as a state replacement. Backward from `'fixed'` state must identify reducer return, not action fields. A reducer function-valued action is not a setState updater unless reducer explicitly calls it. New state→reducer previous-state input edge and init argument→init parameter→state must be tested separately, not inferred from positive output.

**Interpretation:** a graph difference between direct and context equivalent cases exposes adapter semantics; both wrong implicates common state model. A packet showing action enters reducer and return differs is useful triage, but exact runtime and static negative assertions already settle this finite counterexample. Packet absence is not needed to reject the current shortcut.

### R-EXP04 — cleanup registration, dependency replacement, unmount and SSR

**Target:** effects row and lifecycle model. **Fixture:** `Effect({id})` with passive effect logging `setup:${id}` and returning named closure logging `cleanup:${id}`. It exposes hook result to the committed test probe; button event logger is registered but never clicked. Render id `'A'`, update id `'B'`, end window, then unmount outside/inside a separately marked disposal window. Include `useLayoutEffect` in an independent variant, not an ordering race against passive effects.

**Direct expected sequence (StrictMode off):** after mount `['setup:A']`; after changed-dependency update `['setup:A','cleanup:A','setup:B']`; pre-disposal window has cleanup B count 0 and click count 0; unmount adds `'cleanup:B'`. Rerender with same primitive `'B'` before disposal adds no setup/cleanup. `effectResult===undefined` at both committed snapshots. SSR `renderToString` control has setup count 0, cleanup count 0; returned markup may still contain render data.

**Static assertions:** registration/use sites may connect captured id to effect body sinks and cleanup body sinks but must label activation possibility. No cleanup→hook-return value edge; no claim of setup or cleanup actually executing merely because source registers it. Backward cleanup-B log can identify source capture B only in a temporal/instance-specific experimental model; current may-flow should name uncertainty, not pretend exact event order. SSR condition must not inherit a browser proof of effect execution.

**Packet delta:** before-disposal zero count and explicit pending cleanup prevent the TASER-style trap of interpreting missing observations as no flow. Lifecycle phase sequence adds review value beyond the old body-end fixture; no added value beyond a complete direct sequence assertion unless capture identity/environment provenance matters.

### R-EXP05 — mutation void versus promise, query data versus metadata

**Target:** R-OPTIONS 515–530; query/mutation rows. **Pin:** TanStack 5.105.0, QueryClientProvider with retries off and deterministic local promise, separate QueryClient per subcase. Mutation `async (input)=>({payload:input})`; query `queryFn:()=>Promise.resolve({secret:'S',public:'P'})`, `select:r=>r.public`, stable key `['probe']`, staleTime Infinity, retry false, gcTime Infinity for test window. Use controlled deferred resolution to distinguish registration from invocation.

**Direct assertions:** creating useMutation does not call mutationFn; before action count0. `m.mutate('A')` returns undefined immediately; after resolution hook data has payload A and function call count1. `await m.mutateAsync('B')` gives `{payload:'B'}`; it is not the mutation-result wrapper object. Query successful result `.data==='P'`, `.status==='success'`, `.error===null`; `.data` is not the original object, and neither status nor error equals `'S'`. Enabled-false twin with a fresh empty cache starts without automatically calling queryFn; wait for an explicitly committed observer-state predicate with bounded polling, because notification tasks are not settled by microtasks alone; no observed result is not evidence queryFn can never run in other actions/configurations.

**Static assertions:** mutation input binds its own mutationFn parameter in both APIs; only mutateAsync's awaited result carries returned payload. `@never-reaches` from payload to `mutate` return variable; backward `mutate` return excludes callback's payload. Query data must go through select to `.data`; secret must not flow as a **value identity** to status/error; control effects of successful resolution on status can remain a separate derived/control relation. The successful hook wrapper remains distinct from payload. Unresolved caches/options/queries retain named unknowns. In the fresh empty-cache enabled:false window assert data===undefined, status==='pending', fetchStatus==='idle', and zero automatic calls. Then explicitly refetch and wait for a committed observer predicate; assert queryFnCalls===1, data==='P', status==='success', fetchStatus==='idle'; cached data and future/manual execution remain valid possible paths.

**Interpretation:** existing row/code contradicts the immediate mutate return regardless of final whole-trace outcome. Query wrapper precision is a source-derived hypothesis requiring a graph run. Packet can expose the exact boundary and call identity, but automatic proof upgrades are disallowed; compare same input with ordinary exact assertions first.

### R-EXP06 — context ancestry, React 19 shorthand, default, sibling negative

**Target:** R-JSX provider capture/context map. **Tree:** Context C default `'D'`; outer provider `'O'`; inside it a nested provider `'I'` wrapping `InnerRead`; an `OuterRead` sibling of nested provider; `DefaultRead` outside both. Give reader functions distinct symbols to avoid conflating distinct component instances in the first control. Use both `<C.Provider>` and React19 `<C>` syntax in equivalent files. Create different context D with same default value to control identity. Add unrelated sibling provider `'X'` whose child does not contain any reader under test.

**Direct assertions:** committed text is `InnerRead='I'`, `OuterRead='O'`, `DefaultRead='D'`; unrelated context/provider never affects C readers. Repeat shorthand twin: exact same result. Change `'X'`→`'Y'`: reader values unchanged. Two createContext calls must have distinct reference identities despite equal defaults. Unmount.

**Static assertions:** shorthand must be recognized as provider, not DOM attribute sink. Backward from each closed-tree reader includes its nearest applicable provider/default, excludes definitely unrelated sibling X. Where reusable components/render call graphs prevent proving ancestry, report a candidate set with uncertainty rather than exact `context-value` provenance. Forward X must not reach closed-tree unrelated reader with a proof of exact provider selection. Absence of a provider must reach documented default, not generic unknown import if local createContext is known.

**Packet delta:** if runtime records only `useContext` returned scalar it cannot explain which equal-valued provider supplied it; named provider occurrence identity is extra evidence. However wrapper instrumentation that changes component hierarchy invalidates this comparison. Prefer explicit test-owned provider IDs and source maps; no generic proxy of React internals.

## 6. SolidJS cases

Source keys SM/FF/CS/SP/PB/FT/JSX/BP/CA/VO resolve in the Solid evidence ledger in research-report.md. All stateful cases use the shared synchronous owner setup, verified browser entry and separately marked disposal window.

### E-S1. Memo identity, new derivation, selector boolean

**Source hypothesis:** SM:11–30 and CS:177–181, 629–632 collapse callable factory/result shapes. Existing `ff-memo`/`selector` only validates eventual rendering.

**Runnable semantic body:**

```js
createRoot(dispose => {
  const token = { id: 'a' };
  const [value, setValue] = createSignal(token);
  const memo = createMemo(() => value());
  const clone = createMemo(() => ({ id: value().id }));
  const selected = createSelector(value);
  console.log('E-S1', typeof memo, typeof selected);
  assert.equal(memo(), token);
  assert.notEqual(clone(), token);
  assert.equal(clone().id, 'a');
  assert.equal(selected(token), true);
  assert.equal(selected({ id: 'a' }), false);
  const replacement = { id: 'b' };
  setValue(replacement);
  assert.equal(memo(), replacement);
  assert.equal(selected(token), false);
  assert.equal(selected(replacement), true);
  dispose();
});
```

**Exact static oracle:** forward token may reach memo **accessor result** and clone's `id` derivation; never claim clone identity or factory-return object identity. Selector call returns boolean with source/key derivation; backward selected(token) includes key and source, not an identity-preserving source return. Render mirrors use separate labelled `<output>`s so selector bool cannot land at unrelated output. Add custom comparator `(key, source)=>key.id===source.id` and same-fields/different-reference tokens: expected true there, false with default comparator. Positive callback result `batch(()=>token)===token` controls ordinary callback result without accessor.

**Interpretation:** wrong computed-value→factory equality description establishes summary-channel bug. A legitimate derived source→boolean edge is not false simply because identity differs. Endpoint-only green does not settle. A packet adds review value only if it reveals the callable/returned object/boolean distinction absent from direct assertions; with assertions above it largely duplicates evidence.

### E-S2. Effect result, cleanup identity, refresh and closed window

**Source hypothesis:** SM:85–129 and CS:629–632 create impossible callback-return→void-call paths and mishandle cleanup result. Existing registration fixture does not inspect lifecycle.

**Actions and exact expectations:** under one root create `signal('a')`, one `createEffect(prev => { const v=signal(); events.push(['setup',v,prev]); onCleanup(()=>events.push(['cleanup',v])); return v; }, 'seed')`, capturing its return into `outer`. Immediately after root setup/initial effect flush, `outer===undefined` and setup record is `['setup','a','seed']`. Update signal to `'b'`; sequence for this **single** effect is setup-a, cleanup-a, setup-b with prev `'a'`; disposing appends cleanup-b. A separate root sets `registered=onCleanup(cleanupFn)` with cleanupFn returning token. Before disposal `registered===cleanupFn` and callback count zero; disposal makes count one, its token result ignored. In separate positive variant, explicitly calling registered() returns token and then disposal calls it again; identities/order must distinguish those invocations.

**Never-executed control:** close observation window before disposal in registration-only variant; record registration, zero callback entries, pending cleanup. Hygiene disposal occurs outside window. Also create onCleanup outside owner under dev entry: return fn identity still holds, no owner cleanup registration; capture warning only as secondary evidence. Do not treat zero observations as removal of possible callback flow.

**Static oracle:** no callback return→createEffect/onMount call result in either direction. Recurrence from callback result to next previous-value parameter is state-modelled and timing unknown; callback's logged/captured values can reach cleanup body. onCleanup return is callback callable, and explicit invocation enters that callback with invocation pairing; disposal is a lifecycle registration relation, not a returned token. If ownership cannot be resolved, show named partial owner boundary rather than certainty. SSR control (separate node/server entry) expects no createEffect or onMount callback execution, unlike browser; don't transfer browser evidence to server model. Separate immediate createComputed/createRenderEffect controls assert execution occurs before following synchronous marker, with no assumed ordering among other effects.

**Packet comparison:** direct identity/order/count checks already expose contradiction. Packet might add useful source-to-owner and window documentation; no universal proof upgrade follows. Stop instrumenting if event counts differ.

### E-S3. `on` wrapper, defer, tracking, batch

**Source hypothesis:** SM:59–68 incorrectly says `on` call result is callback result; FF:28–29/CS:629–636 immediately summarize this shape.

**Actions:** create a signal 2 and `fn=on(value, (v, prevInput, prevResult)=>{events.push([v,prevInput,prevResult]);return v+1;})` without passing it to an effect. Assert `typeof fn==='function'`, zero events. Call `fn(undefined)`: result3, first event `[2,undefined,undefined]`. Set signal3 and call `fn(3)`: result4, event `[3,2,3]`. A fresh `deferred=on(value, cb, {defer:true})` returns a function with zero cb calls; first invocation returns its previous-result argument unchanged and does not run cb; next invocation after changing source executes cb. Treat behavior under node/server as separate: v1.9.9 server source keeps deferred callback suppressed; baseline1.9.17 source must be checked before asserting equivalence.

**Tracking contrast:** within one effect read `a()` and `untrack(()=>b())`; updating only b must not trigger that effect, although the read's value can still flow to a log or result on a later a-triggered run. No data-flow edge should be deleted solely because read is untracked. **Batch contrast:** outside an effect capture state 0, do batch(() => { setN(1); setN(2); return token; }); assert returned token identity and one downstream effect with final2 after initial run, with a separate async callback asserting batching is not one transaction across await. Exact cross-effect schedule is not promised.

**Static oracle:** wrapper construction returns callable, cb result reaches explicit fn invocation only; never-used wrapper retains possible future callback invocation if the wrapper is later called, without claiming registration or execution at construction. `on` source accessor return binds cb first input; array source form binds corresponding elements, previous input/result distinct. `untrack`/batch direct callback return valid, subscription/scheduling channel separate. Forward/backward explicit wrapper call should preserve invocation identity for two `on` wrappers with disjoint tokens.

**Interpretation:** static source→callback may-flow remains valid even in never-invoked run; callback-return→wrapper value equality is wrong. Packet absence is neutral; same-case direct assertions likely suffice, with packet retaining window and wrapper invocation identity.

### E-S4. Prop partitions, override precedence, store path exclusion

**Source hypothesis:** PB:162–190 tags split outputs as whole views; CS:271–275 and 594–604 aggregate store path functions/keys. Existing controls test successful displayed fields, not excluded fields.

**Actions:** render a component receiving distinct `label='alpha'`, `kind='primary'`. Compute `[local,rest]=splitProps(props,['label'])`; assert local.label is alpha, rest.kind is primary, `Reflect.get(rest,'label')===undefined`, `Reflect.get(local,'kind')===undefined`. Merge `mergeProps(props,{label:'fixed'})`; assert merged.label fixed; `mergeProps(props,{label:undefined}).label==='alpha'`; the call itself returns a merged object. Reactive getter control increments a read counter only when evaluated: creation/recording packet does not increment it; reading selected winning getter increments once; reading overridden field need not read loser. Update parent signal; split view updates whereas a destructured scalar capture stays previous snapshot.

**Store actions:** createStore({left:{title:'L'},right:{title:'R'},items:[{id:1,label:'a'},{id:2,label:'b'}]}); call setStore('left','title',_=>'N'). Assert left.title N, right.title R, all item labels unchanged. Then path predicate selects id2, final updater returns 'z': only second label changes; predicate boolean is not stored. Repeat same final updater via named `const updater=()=> 'N'` versus inline function to test lexical-shape invariance.

**Static oracle:** forward caller alpha reaches local.label and undefined-fallback merged label; never the excluded rest.label or constant-overridden output. Backward fixed output is fixed literal only, not alpha. Store written token reaches selected title only; selected field, not whole root, binds updater prev param. Unknown dynamic keys may union destinations but must be partial with unknown selection, not exact proven sibling writes. Add `@never-reaches` and endpoint-specific `@no-edge` assertions; current global-any-edge annotations need shared harness strengthening.

**Interpretation:** a failure of negative field controls with expected runtime outputs is useful false-path evidence. Getter/proxy read differences invalidate packet run; do not perturb value access to collect a comprehensive object snapshot. Ordinary assertions plus srcly path controls catch the main defects; packet may explain which getter actually ran but only in this execution.

### E-S5. Resource no-source overload, discarded JSON, controls and disabled source

**Source hypothesis:** CS:125 and CA:337 ignore no-source overload; CA:327–352 assumes any sole loader `.json()` is its return; CS:121–124 broadly maps tuple bindings.

**Actions and exact runtime assertions:** under one owner, use synthetic promises and no network. Lane A `createResource(async (source,info)=>token)` must call fetcher with source true, yield token through data accessor after settlement, and expose loading false/error undefined/state ready. Lane B `createResource(()=>key(),namedFetcher)` initially source false: fetch count0; after set key 'k', fetch count1 and returned payload token; then `controls.mutate(replacement)===replacement` and data becomes replacement without incrementing fetch count. `controls.refetch('manual')` delivers 'manual' to fetcher's info.refetching and current source 'k' to first parameter. Distinct result/status/error channels remain separately asserted; a rejecting variant with `E = new Error(...)` has `.error===E` and the settled data accessor throws that same E; catch/assert that throw rather than reading it unguarded. For the specified noncoalesced asynchronous refetch, also assert its awaited return is the payload; other refetch states may return a direct value or undefined. Maximum10 microtask checkpoints; fail/mark timing unknown if not settled in bound rather than waiting indefinitely.

**Discarded-payload pair:** loader has one source-local `fakeResponse.json()` returning `{secret:'observed'}`; consume/log that value, then return fixed `{title:'fixed'}`. Positive twin returns the json value. The fake response body is a known in-project async function to keep execution self-contained; for srcly-specific carrier test annotate a declaration-typed response with identical `.json()` shape to trigger same collector branch. Assert negative data is fixed and no secret field; positive data is original parsed object. Reverse trace from negative displayed fixed title must not name the discarded JSON as payload origin; forward JSON may reach the log but not data. This tests precise source location CA:339–351, not merely a missing API name.

**Static oracle:** overload discriminator identifies fetcher slot without treating options as function; source→fetcher input separate from payload; payload→accessor().field, not `.error`, `.loading`, `.state`, `refetch` callback handle or refetch metadata. Preserve framework-runtime boundary where asynchronous ordering is unresolved, but do not hide a wrong carrier under green modelled proof. False source is a never-executed control: no observation cannot remove may-flow for later true values. Store source enable/disable branch record.

**Packet comparison:** extra packet can record overload resolution, fetcher entry argument true/key, refetch tag and completion version; direct assertions already falsify JSON carrier and overload shape. Packet useful only if linked events alter a specific review verdict; it is not a replacement fixture or automatic model acquisition.

## 7. Comparison protocol, verdicts, and stopping rules

### Run order and reproducibility

1. Validate package bytes, runtime/compiler/browser pins, export conditions, fixtures, input labels and configuration. Save a manifest containing resolved paths and hashes, not just package names. If a required artifact is inaccessible, mark that lane blocked; independent lanes continue.
2. Establish baseline static results **before** expected-output edits. Open each actual JS project through product availability and engine session. Record source membership, refusal reason, generation/program hash, facts, graph/ledger, endpoints and stops. Do not silently make a failing JS project strict TS.
3. Run B direct semantic assertions on original synthetic fixtures. All baseline expectations are input-specific; fail a case on assertion mismatch and inspect version/entry/fixture before judging srcly.
4. Run C with exactly the same source/input/actions, adding only explicit observation records. Repeat B/C once to catch unstable setup; this is a determinism check, not a coverage estimate. Compare all values, reference identities, exception identity, counts and declared ordering. A perturbation invalidates C.
5. Review A against B with packets hidden, then review A/B/C. Have a second reviewer independently classify disputed findings when available. Record whether C added an actual missing witness, changed a justified verdict, merely repeated assertions, or misled review. Do not invent review-time measurements: record them only if an actual comparison is performed.
6. After a proposed implementation, rerun the same finite oracle and semantic mutations; inspect every new/deleted edge and proof-basis move. Run the required survey gate separately for performance/outcome regressions, with reasons in `Survey moves:`. A better landing count cannot excuse a forbidden edge.

**Possible review verdicts:** contradicted channel/identity claim; corroborated bounded behavior; missed supported path; legitimate conservative may-flow; unresolved applicability/identity; invalid setup/perturbation; incomplete execution. “No event observed” is not a standalone contradicted verdict. “Everything passed” is not universal proof.

### Minimal optional observation record

Keep it a case-local review artifact, not a product ingestion format. It contains: case ID; srcly/library/runtime/config/model/fixture hashes; browser/server condition and actual entry; source labels; explicit owner/root/invocation IDs; monotonically numbered events; selected scalar values and nontraversing reference tokens; declared actions; positive/negative assertions; window start/end; pending and never-entered callbacks; and uncertainty/perturbation checks. Function return, hook/factory result, accessor result, stored field, cleanup registration and callback invocation each have distinct roles.

Do not monkey-patch all APIs, proxy framework internals, inspect arbitrary getters, capture user projects, infer a sanitizer from its name, emit/install model rows automatically, or change proof strength from observations. No network or filesystem source/sink capture is needed: all data is authored synthetic tokens. Any public API package execution is future implementation work, not authorized execution of downloaded programs during this research mission.

### Stop rules

- **Wrong environment or hash:** stop that lane, record mismatch, do not substitute a package/browser/version silently.
- **Refused or incomplete project:** record named `not-analyzed`, selected/skipped files, and the gating reason. Do not grade missing traces as correct.
- **Invalid labels, missing dependencies, stale generation, parser error:** stop the case before comparing graph semantics. Keep attempted counts.
- **Perturbation:** reject instrumented C if it changes counts, identity, getter activity, exceptions, or required order. Direct B can still support the finite semantic result.
- **Budget/timeout:** record explicit incomplete outcome, window and pending work. Do not treat an unfinished negative path as proven absent. Do not increase the cap until a concrete remaining risk justifies it.
- **No incremental packet benefit:** after the specified sixteen cases, if C produces no new justified verdict or explanatory identity/condition witness beyond the direct assertions, stop packet implementation and keep concise assertion reports. There is no automatic expansion to a generic instrumenter.
- **Framework scheduling ambiguity:** assert only specified order within the same lifecycle/owner. Do not invent a global ordering among independent effects. Bounded polling targets a declared committed state, not arbitrary elapsed time.

### Finite suite coverage, not a synthetic percentage of the ecosystem

Report counts by environment, real JS versus strict TS, config mode, package/condition, case, direction, completed assertion, forbidden edge, and unresolved reason. Separately report expected failures that demonstrate a baseline defect. Do not collapse accepted projects, all attempted projects, and successful traces into one denominator. A case with ten parameter variants remains one semantic family; many similar successful outputs do not replace a missing rejection/never-fired/second-instance control.

## 8. Implementation-owner commands and resource limits

These are commands for a future complete checkout with its dependencies already bootstrapped under AGENTS.md. They were **not run here**. Existing commands are distinguished from proposed test files. Do not run downloaded framework programs in this mission simply because commands are supplied.

```bash
cd engine
pnpm exec vitest run test/srcly/fixture-annotations.test.ts test/srcly/library-models.test.ts
pnpm typecheck
pnpm lint
pnpm exec node --max-old-space-size=4096 --import tsx scripts/pattern-catalog.ts --json /tmp/srcly-pattern-catalog.json
pnpm survey-gate
```

Before `pnpm survey-gate`, `SH-01` changes its explicit child heap argument from 3072 to **4096**. For any real-repository Program measurement, use **one process at a time across sessions**, one repository per process, `node --max-old-space-size=4096`; never fan out repositories via workers or parallel subprocesses. Framework semantic probes are separate from real-repository measurements, but keep this suite sequential for reproducible setup and cleanup.

Proposed browser runner test after implementation: a single `library-semantics.spec.ts` under the repository's existing browser-test structure, `pnpm exec playwright test <new-test-path> --workers=1`, using the exact locked browser. The path is deliberately not presented as an existing file. Version/entry manifest creation and package resolution are prerequisites. SSR controls run serially in Node under their declared server condition. Shared contracts, when changed, use `pnpm emit-contracts`; server validation uses `uv run pytest` and client checks use `pnpm` as detailed in the implementation plan.

## 9. Actual sandbox observations — separate from the designed suite

Ran original [native-controls.mjs](native-controls.mjs) with the installed Node runtime; output is [native-observations.json](native-observations.json). Timestamp **2026-11-01T04:22:19.432Z**, Node **v24.22.1**, Linux x64. Six cases, **21 assertions passed**:

| ID | Executed assertion group | What it does not establish |
| --- | --- | --- |
| N01 | Ordinary concat leaves source empty, creates a different array, preserves inserted element identity; discarded concat remains nonmutating. | No srcly receiver relation was generated or examined. |
| N02 | Used push result is length 1 and receiver contains the identical token. | No before/after engine regression result. |
| N03 | Map binds value/index/original-array separately; forEach returns undefined; sort returns and reorders its receiver. | No callback channel or sorting model was validated. |
| N04 | Finally creates a distinct promise and preserves normal payload; then changes payload; throwing finalizer rejects; rejection skips fulfillment and retains reason identity. | No unexecuted Promise branch was ruled out; no automatic model proof. |
| N05 | Two Cell instances remain disjoint after a write to the first. | No srcly heap crossover was reproduced. |
| N06 | Node EventTarget registration window has zero callbacks; removed listener stays uncalled; positive dispatch calls once. | This is **Node EventTarget**, not browser DOM, React, or Solid. |

No React/Solid/browser/packet execution, source-repository survey, or package installation occurred. The generated Solid adapters were syntax-reviewed designs, not passed framework tests. All sixteen primary cases above still require the pinned implementation-owner execution and review protocol.

## 10. Source references and traceability

All repository evidence IDs resolve in [research-report.md](research-report.md); the per-case source hypothesis names the exact collector/model location. Primary semantic references are listed in that report's source appendix. These plans deliberately separate current implementation facts, API contracts, original fixture expectations, and unexecuted graph hypotheses. The next implementation change is reviewable without assuming a packet exists or treating historical catalog scores as proof.



## Appendix — Loading the supplied unexecuted Solid browser adapters

`solid-browser-adapters.mjs` supplies original runnable-design bodies for E-S4/E-S5, with no JSX compiler. The future runner serves this file and integrity-verified Solid 1.9.17 browser files from a local fixture server. Verify export targets and shared core identity first; the paths below are conditional on matching the verified package layout, not a claim that dependencies are bundled in this research archive.

```html
<script type="importmap">
{"imports":{
  "solid-js":"/vendor/solid-js-1.9.17/dist/solid.js",
  "solid-js/store":"/vendor/solid-js-1.9.17/store/dist/store.js"
}}
</script>
<main id="fixture"></main>
<script type="module">
import { runS4, runS5 } from './solid-browser-adapters.mjs';
const host = document.getElementById('fixture');
try {
  globalThis.caseResults = [runS4(host), await runS5(host)];
  globalThis.caseStatus = 'passed';
} catch (error) {
  globalThis.caseStatus = 'failed';
  globalThis.caseError = String(error?.stack ?? error);
}
</script>
```

The parent runner imposes the five-second deadline. This HTML is setup design, not an executed result. The adapter does not log/serialize arbitrary proxies, does not create owned resources after await, and disposes each owner in finally. It records direct assertions only; optional packet instrumentation is a separate B/C comparison. Keep the JSX/TSX static mirrors because explicit API adapters do not exercise the JSX collector.
