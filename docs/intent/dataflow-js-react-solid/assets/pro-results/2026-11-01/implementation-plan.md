# Implementation plan — shared engine, vanilla JavaScript, React, and SolidJS

**Design only; no srcly repository changes were made.** Baseline: [`e07cc510087b5c028273cad785b97ee36c6c3b35`](https://github.com/byronwall/srcly/commit/e07cc510087b5c028273cad785b97ee36c6c3b35). Date: 2026-11-01. This is the complete staged plan supported by [research-report.md](research-report.md) and the sixteen cases in [experiment-plan.md](experiment-plan.md). [recommendations.md](recommendations.md) uses these same stable IDs.

## 1. Delivery rules and dependency order

Prioritize impossible value paths and denied JavaScript workflows first, then useful precise paths, then broader framework APIs. Cost bands **S/M/L** are relative implementation judgments, not time estimates. Split large milestones into reviewable slices while retaining their ID and exit criteria. The offline evidence comparison is independent research; all three Build tracks proceed even if packets add no value.

| Wave | Milestones and dependencies | Reviewable user-visible result |
| --- | --- | --- |
| 1 | SH-01; minimal SH-02; JS-01 discovery slice; RE-01; SO-01 | Actual JS roots are counted honestly; wrong effect/mutation/wrapper results stop appearing; regressions have exact positive and negative assertions. |
| 2 | SH-03/04/05; complete JS-01 capability mode; JS-02; RE-02/03; SO-02/03 | Proof/end wording and cache identity become reliable; reducers, resources and prop fields get precise paths. |
| 3 | JS-03/04/05; RE-04/05; SO-04/05 | Completion channels, receiver/key storage, browser events, query slots, refs/owners and render callback roles are implemented in bounded forms. |
| 4 | RE-06; SO-06; EX-01/02 in parallel with suitable fixtures | Contemporary framework support extends the shared mechanisms; optional research has an explicit retain/reject decision. |

**Architectural constraints:** TypeScript engine, existing Python server, existing Solid client. Keep semantic recognition in reusable analysis modules, not ad hoc UI rules. Preserve invocation pairing, bounded traversal, centralized `kinds.ts` traits, generation checks and named non-analysis outcomes. Do not edit generated schemas/types by hand. Python changes are only shared admission/contract/snapshot work. No framework rewrite, automatic package/model installation, runtime capture product, or universal proof claim.

**File-path convention:** existing paths below are repository-relative at the baseline. Paths labelled **new fixture/example/test** are proposed additions, not files claimed to exist. New language rules must have annotated fixtures in `engine/examples/value-flow-basics/src/` even when a focused relation test is also necessary. Every analysis or corpus change runs `pnpm survey-gate`; the gate's child heap flag must first be repaired by SH-01.

## 2. Shared engine milestones

### SH-01 — Exact semantic oracle and honest coverage denominator

**Type/cost:** coverage harness and survey correction / M. **Dependencies:** none. This is the shared first slice; it does not require runtime observation packets.

**Change/visible behavior:** retain existing exhaustive end/stop assertions; add uniquely labelled source/destination, field path, invocation, completion channel, proof basis and forbidden-path checks. Inventory `.js/.jsx/.mjs/.cjs` separately from `.ts/.tsx`. Missing dependency roots, unavailable configs and skipped files appear in attempted counts and fail a required cohort rather than silently improve percentages. Add forward/backward twins. Fix `survey-gate`'s explicit child argument from 3072 to 4096 MiB before any real-repository run; preserve serial execution.

**Existing modules:** `engine/test/srcly/fixture-annotations.test.ts`; `engine/examples/value-flow-basics/tsconfig.json`; `engine/scripts/pattern-catalog.ts`; `engine/scripts/survey-blockers.ts`, `survey-report.ts`, `survey-gate.ts`; existing test helpers that resolve anchors. Add explicit per-lane fixture configs (proposed `tsconfig.javascript.json`, `tsconfig.react-jsx.json`, `tsconfig.solid-jsx.json`) or isolated roots, with `allowJs:true`, `noEmit:true` for actual JS and the appropriate framework JSX options. The baseline basics config does not enable allowJs and is fixed to Solid JSX; scanner changes alone are insufficient. Keep JS/TS counterparts in isolated roots or distinct basenames so `.ts` cannot shadow same-name `.js`, and assert Program source membership before annotation grading. This strict-allowJs harness plumbing belongs here so JS-02/03 need not wait for the broader inferred-project JS-01. Keep the catalog's historical endpoint score as a labelled legacy measure, separate from the new semantic oracle.

**Fixtures/negative controls:** small parser tests for missing/duplicate labels; false edge with correct terminal kind; wrong field on same line; same endpoints with different proof witnesses; skipped React dependency; absent JS root; forward/backward two-call pairing. Preserve `two-call-identity-helper.tsx`, `this-methods.tsx`, `state-pairs.tsx`, `zustand-store.tsx` and their existing negatives. Add a deliberately wrong model mutation and require detection. The current reduce accumulator negative needs an additional recurrence fixture, not blind deletion of the old first-input control.

**Validation:** V-STATIC and V-GATE below; parser self-test must show a green endpoint with a wrong labelled path fails. **Docs/examples:** update `docs/dataflow-coverage.md`, `docs/CODE_MAP.md`, catalog README and historical-comparison notes; explain attempted versus accepted versus completed denominators. **Main risk:** overfitting AST line locations. Use stable labels mapped to exact spans and fail ambiguous matches. **Exit:** each environment has at least one positive and one forbidden-path test in both directions, and missing cohorts are explicit.

### SH-02 — Bounded transfer roles, binding identity and model provenance

**Type/cost:** shared analysis rule + model schema / M, staged. **Dependencies:** SH-01 endpoint assertions for full completion; initial targeted relation tests can unblock RE-01/SO-01.

**Change:** model callback invocation separately from call return. Add a discriminated disposition for void, argument/reference, callback result, returned callable, accessor result, derived scalar and structured output field. Add finite callback parameter bindings and normal/fulfilled/rejected roles as demanded by JS-03/RE-04/SO-02. A recognized void/registration rule must prevent generic fallback from recreating callback-return flow. Normalize exported callee identity through checker/import resolution, including named aliases; support CommonJS only when the resolution is justified. Declaration provenance alone does not prove behavior.

**Existing modules:** `engine/src/analysis/library-models.ts`, `framework-flows.ts`, `program-evidence-state-pairs.ts`, `program-evidence-support.ts` (`importedCallee`, `importModule`, library recognition), `program-evidence-collector-call-support.ts`, `program-evidence-collector-declarations.ts`; `engine/src/analysis/program-evidence.ts`; `engine/src/srcly/kinds.ts`; `engine/src/srcly/typescript-host.ts` state classification. Schema emitted through `engine/src/srcly/contracts/emit.ts` and `engine/scripts/emit-contracts.ts`.

**Migration:** retain old row reading where unambiguous, normalize to internal typed rules, reject incompatible combinations, and migrate affected rows with their fixtures. Store row ID/source, version/entry conditions, evidence links and unresolved applicability separately from proof strength. No arbitrary schema field is accepted until a collector consumes and tests it. The Python row set remains unchanged except for compatible shared serialization.

**Fixtures:** canonical/renamed/namespace/local alias and same-named user function controls; effect return void versus batch return value; callable versus called result; onCleanup identity versus its callback result; native numeric callback value/index distinction. **Validation:** V-STATIC, V-CONTRACT, V-GATE. **Docs/examples:** model contract in `docs/intent/dataflow-library-models/plan.md` and CODE_MAP, finite row examples and migration notes. **Main risk:** a large universal DSL or fallback regression. First ship the minimal result disposition consumed by RE-01/SO-01, then finite field/completion slots. **Exit:** a wrong result role cannot be emitted by either specialized or generic code for the selected cases.

### SH-03 — Preserve witnesses and align proof/outcome/display semantics

**Type/cost:** graph/ledger/contract/client correctness / M. **Dependencies:** SH-01; consumes SH-02 roles without blocking simple wording fixes.

**Change/visible behavior:** distinguish traversal completion, endpoint kind, model basis and remaining precision limits. Preserve all relation witnesses when endpoints coincide; no first-edge-wins loss of field/channel/invocation/proof. Review `assumedThrough` so one modeled leg cannot suppress uncertainty for unrelated arguments. Share the outcome reduction rules used by graph and ledger where their contracts overlap. Keep `ok/assumed/partial/not-analyzed/stale` wire meanings stable or version any change explicitly; present `ok` as completion, with modelled basis when applicable.

**Modules:** `engine/src/srcly/anchor-slice.ts`; `ops/anchor-graph.ts` (`addEdge`, `pushEdge`, outcome); `ops/value-flow.ts`; `facts.ts`; `kinds.ts`; contracts under `engine/src/srcly/contracts/`; `client/src/dataflow/outcome.ts`; `client/src/viz/deps/flow/{marks,inspectorModel}.ts`; Python mirrors only if wire fields change.

**Fixtures:** mixed modeled and unresolved arguments at one call; two proofs between same endpoints; branch-only, unused, throw, stdout, DOM write, return and scheduler endpoints; selected expression graph/ledger comparison; stale generation preserved. `ok` with modelled legs must remain distinguishable from compiler-only paths. **Validation:** V-STATIC, V-CONTRACT, V-CLIENT, V-GATE. **Docs:** endpoint glossary and evidence vocabulary in coverage/CODE_MAP; one runnable example showing a completed modeled trace and a named partial trace. **Main risk:** globally downgrading or upgrading without leg-specific evidence. **Exit:** contradictory proof/outcome displays fail tests; all end kinds have accurate wording.

### SH-04 — Model/config/package-sensitive cache and experiment identity

**Type/cost:** cache/config provenance / M. **Dependencies:** SH-02 model identity contract; can add JSON digest coverage independently.

**Change:** include effective model-set digest, selected package declarations/exports and version/lock inputs, governing config/options and condition profile in cached evidence identity. Refresh invalidates affected library model singleton/evidence; retain generation rejection of stale requests. Record declaration and runtime entry separately. Avoid hashing unrelated dependencies when an explicit resolution-input list is available.

**Modules:** `engine/src/srcly/fingerprint.ts`, `result-cache.ts`, `session.ts`; `engine/src/analysis/library-models.ts`; `program-evidence-loading.ts`; project TypeScript resolution. **Tests:** changing only a model JSON; changing export condition; changing dependency `.d.ts` or lock resolution; unchanged inputs cache hit; refresh old-generation query remains stale. Do not merely bump a fixed engine version and leave recurring omissions intact.

**Validation:** targeted cache/session tests, V-STATIC, V-CONTRACT if public metadata changes, V-GATE. **Docs/example:** model-version provenance and cache invalidation section; a small authored conditional-export package. **Main risk:** excessive hashing cost or missing transitive resolution inputs. Measure only after correctness, serially under V-GATE. **Exit:** all selected provenance changes invalidate the relevant result and are visible in the experimental manifest.

### SH-05 — Bounded receiver, field, state and owner identity

**Type/cost:** reusable analysis abstraction / L, independent slices. **Dependencies:** SH-01 and SH-02; SH-03 witness preservation.

**Change:** supplement declaration symbols with bounded allocation/factory/call/owner context and selected field/key paths. Exact aliases share a slot; separate proven allocations stay distinct. Literal keys and known props subsets/overrides are precise; unknown selection widens with named uncertainty. Preserve existing call/return pairing. Do not promise complete render epochs, arbitrary dynamic heaps or a universal component tree.

**Modules:** `program-evidence-collector-declarations.ts` (`memberWrites/memberReads`); `program-evidence-collector-jsx-support.ts` (`connectMemberState`, contexts, handlers); `program-evidence-state-pairs.ts`; `program-evidence-collector-component-binding.ts`; `program-evidence-collector-field-transfers.ts`; `engine/src/analysis/evidence-slice-fields.ts` and existing evidence slicing modules; `kinds.ts` for added traits.

**Fixtures:** two cells/two maps/two keys, alias positive, two hook/signal instances, two provider roots, excluded split prop and overridden merge prop, unknown key widening, same shape/different reference. **Validation:** V-STATIC/V-GATE and serialized size measurement only for concrete growth risk. **Docs/example:** bounded context policy, widening reasons and limits. **Main risk:** state-space growth and invalid provider pruning. **Exit:** selected disjoint controls separate without breaking existing two-call/state identity negatives; unresolved cases remain explicitly approximate.

## 3. Vanilla JavaScript track

### JS-01 — Actual JavaScript project admission and capabilities

**First vanilla milestone. Type/cost:** project/config + harness / M. **Dependencies:** SH-01 inventory; loose/inferred mode needs SH-03 capability wording. Strict `allowJs` extension/jsconfig fixes can ship first.

**Visible behavior:** users can open actual `.js/.jsx/.mjs/.cjs`, jsconfig-only and explicitly inferred no-config projects. The UI names skipped files/options and unsupported null-proof precision. `checkJs` diagnostics and basic value tracing are independent. No config file is silently written into the user's project and no loose project is silently forced strict.

**Modules:** `engine/src/project/{files,discovery,tsconfig,typescript}.ts`; `engine/src/srcly/session.ts`, `fingerprint.ts`; `server/app/services/dataflow/availability.py` (`has_tsconfig`, `probe`, source counting), `server/app/routers/dataflow.py` shared outcomes; harness loaders. Align server's `tsconfig*.json` availability with engine selection; ensure each analyzed file has a coherent governing option set rather than a misleading merged-config promise.

**Fixtures:** V1's thirteen admission shapes, actual source membership, ESM/CJS model identity, root-only/transitive `.mjs`, checkJs toggle, JSDoc/no JSDoc, loose/mixed configs and conditional exports. **New annotated fixture:** `javascript-identity.js`; synthetic project/session tests for configless/refusal cases outside the fixed basics config. **Validation:** V-STATIC, V-CONTRACT/server admission tests, V-GATE. **Docs/new runnable example:** `engine/examples/javascript-basics/` with `.js`, `.cjs`, `.mjs`, jsconfig and no-config instructions; coverage/CODE_MAP admission section. **Main risk:** type-dependent impossibility claims on loose JS. **Exit:** every V1 root has explicit inventory/outcome; accepted JS identity paths are tested, not inferred from TS controls.

### JS-02 — Native operation effects and callback positions

**Type/cost:** semantic rules + finite model rows / M. **Dependencies:** SH-02, SH-01; field precision improves with SH-05.

**Behavior:** retaining/discarding a return no longer changes mutation. Explicit rows/rules for map/filter/find/forEach/reduce/sort/concat/push and selected Map/Set/WeakMap primitives distinguish receiver, element, index, accumulator, callback result, control influence and ignored result. Standard declaration identity identifies the operation, not its behavior by itself. Overridden methods and unknown host behavior remain bounded/assumed.

**Modules:** `engine/models/ecmascript.json`; `library-models.ts`; collector call support (`connectExternalCall`, `connectExternalCallbacks`, `connectSuppliedCallbacks`), declarations (`libraryProof`), support (builtin identity), and both projection upgrade sites. **New fixtures:** `native-result-effects.js` plus typed counterpart, `native-callback-roles.js`; V2, N01–N03-inspired controls, numeric index/value, reduce second-iteration recurrence, nonvoid returns in forEach, constant comparator versus data output, same-named user method.

**Validation:** V-STATIC, finite pinned runtime assertions, V-GATE. **Docs/example:** supported operations with exact roles, upgrade/downgrade rationale and `Survey moves:`. **Main risk:** correct honesty downgrades look like regressions; do not preserve green scores with unjustified proof. **Exit:** concat/push result-use metamorphisms and callback-position/ignored-return negatives pass in both directions.

### JS-03 — Promise completion and registration channels

**Type/cost:** analysis rule + library summaries / M. **Dependencies:** JS-02/SH-02.

**Behavior:** resolve/fulfillment, reject/reason, catch recovery, finally pass-through/abrupt replacement and awaited value are separate channels. An abrupt/rejected finalizer replaces the preceding completion whether it was fulfilled or rejected. A recovery handler may legitimately fulfill with the same error object. Timers/observers register possible callbacks and return independent handles; no exact timeline is implied.

**Modules:** call support, carrier and boundary-processing modules; `engine/models/{ecmascript,web}.json`; `facts.ts` scheduling/discard ends; `program-evidence.ts`, `kinds.ts`, emitted contracts. **New fixtures:** `promise-completion.js`, `callback-registration.js`; V3 with normal/throwing finalizer, reject-without-recovery, catch recovery, unused callback, thenable unknown, timer callback returning a token distinct from handle. Both trace directions name exact completion.

**Validation:** V-STATIC, native/runtime finite assertions, V-CONTRACT, V-GATE. **Docs/example:** Promise channel diagram/table and scheduler uncertainty. **Main risk:** thenable assimilation and scheduling explosion. **Exit:** finite built-in channels are accurate; unresolved custom thenables stay named rather than being guessed.

### JS-04 — Receiver/key storage and JavaScript call shapes

**Type/cost:** language rules / L split into storage and call adapters. **Dependencies:** SH-05 for exact receiver/key tests; SH-02 binding identity.

**Behavior:** disjoint allocations/keys remain disjoint, aliases share, setters receive their assigned value, literal computed writes reach matching reads, and traditional JS constructor functions enter their bodies. Native `call/apply/bind` records target, receiver and leading arguments without changing arrow lexical `this`. Unknown prototype/proxy targets remain named limits.

**Modules:** collector declarations/JSX member state; boundary-processing `processFieldAssignment/processIndex`; JSX assignment dispatch; collector support `constructorTarget/targetFunction`; `value-origin.ts`; `connectCalls`; field slicing. **New fixtures:** `javascript-constructors.js`, `receiver-key-storage.js`, `bound-functions.js`; V4, class/function parity, getter/setter entry, two maps/two keys, alias positive, unknown key, bound constructor and arrow-this negatives.

**Validation:** V-STATIC/V-GATE, bounded native controls. **Docs/new example:** ordinary JS object/constructor module in javascript-basics, exact supported call shapes and widening limits. **Main risk:** replacing established invocation pairing with a global heap shortcut. **Exit:** selected same-instance paths work, unrelated instance/key paths fail, and prior call-pairing fixtures remain intact.

### JS-05 — Browser reads, writes, event identities and cancellation limits

**Type/cost:** host model + analysis rule / M. **Dependencies:** SH-02; callback identity after JS-04/SH-05. Wrong page-write classification can ship independently.

**Behavior:** a discarded DOM query is still a read; DOM writes through a local receiver remain effects. Registration, dispatch, removal and invocation have different roles. Recognize host identity rather than textual `addEventListener`; pair target/type/callback/capture where known. Suppress canceled paths only with justified ordering; otherwise expose lifecycle uncertainty.

**Modules:** `program-evidence-support.ts` (`pageEffectCall`, `browserCall`, `isDomEventHandler`); `program-evidence-boundary-support.ts`; collector field assignments and emitter pairing; `engine/models/web.json`; endpoint display. **New fixtures:** `browser-read-write.js`, `event-lifecycle.js`; V5 kept/dropped selector, local parameter DOM write, same-name fake host, listener object, two targets, mismatched callback removal, abort/once and never-fired window.

**Validation:** V-STATIC, V-BROWSER, V-GATE. **Docs/new example:** plain-JS local DOM page with explicit actions and disposal, static may-callback wording. **Main risk:** treating no observation as impossibility or confusing Node EventTarget with DOM. **Exit:** exact read/write ends and supported event payload roles pass; unresolved timing is visible.

## 4. React track

### RE-01 — Correct effect and mutation return channels

**First React milestone. Type/cost:** model correction + bounded rule / S–M. **Dependencies:** minimal SH-02 disposition and SH-01 exact edge assertions; runtime evidence packets are not a dependency.

**Behavior:** useEffect/useLayoutEffect cleanup functions no longer become hook return values; setup/body effects remain reachable. TanStack `mutate` returns void while `mutateAsync` retains its promise payload. Explicit registration roles prevent generic fallback from restoring the wrong return.

**Modules:** `engine/models/react.json`; `framework-flows.ts`; collector call support `connectExternalCallbacks`; collector boundary-processing `connectOptionFlows`. **New fixtures:** `react-effect-returns.tsx`, `react-mutation-results.tsx`, actual `.jsx` twins; R-EXP01/04/05, setup returns cleanup, mutation payload forbidden at mutate result, never-called callback. Keep ordinary cleanup returning void as the primary typed case. A separate cleanup-returning-token case must be labelled actual JS, or deliberately contextually typed `const cleanup: () => void = () => { cleanupCalls++; return token; }` in TSX; an inferred token-returning destructor must not be presented as type-correct without acknowledging diagnostics. **Validation:** V-STATIC/V-CONTRACT/V-GATE and V-BROWSER pinned React assertions. **Docs/new runnable example:** `engine/examples/library-semantics/react/` with exact manifest and createElement adapter, separately typed/JSX mirrors; coverage model-role table. **Main risk:** deleting an edge can expose missing lifecycle handling; retain a named partial boundary, not a fabricated terminal. **Exit:** wrong return edges disappear while legitimate body and mutateAsync paths remain.

### RE-02 — Consistent state/reducer dispatch roles

**Type/cost:** state/callback analysis rule / M. **Dependencies:** SH-02, SH-01; SH-05 for independent instance precision.

**Behavior:** direct, prop-lifted and context-lifted dispatch all invoke the reducer with previous state and action; only reducer result becomes future state. Function-valued reducer actions are not setState updaters. Resolve named initializers/updaters and renamed hook imports; distinguish lazy state seed from reducer init(initialArg).

**Modules:** `program-evidence-state-pairs.ts`; collector call support (`processVariable`, direct setter/reducer path, `connectStateFunctions`); JSX support `connectBoundHandlers/contextMethod`; `value-origin.ts`; model seed metadata. **New fixtures:** `react-reducer-roles.tsx/.jsx`; R-EXP03 constant reducer, action-field exclusion, inline function action count zero, init, direct/context/prop twins, named updater, two pairs. **Validation:** V-STATIC/V-BROWSER/V-GATE. **Docs/example:** lifted reducer and snapshot limit in React semantics example. **Risk:** state cycles and lost caller context. **Exit:** equivalent dispatch forms agree and function actions/ignored fields cannot become state through shortcuts.

### RE-03 — Context syntax, defaults and provider applicability

**Type/cost:** JSX/context rule / M, syntax and ancestry slices. **Dependencies:** SH-01/02; SH-05 for bounded occurrence-sensitive selection.

**Behavior:** React 19 `<Ctx value>` is recognized by resolved createContext identity; local defaults work; closed resolved trees exclude unrelated providers and select nearest applicable ancestors. Unknown render/mount contexts are explicit candidate sets, not exact selection claims.

**Modules:** JSX support `processJsx`, `contextKey`, `connectContexts`, `contextMethod`; component binding/occurrence modules; kinds/proof details. **New fixture:** `react-context-selection.tsx/.jsx`; R-EXP06 `.Provider`/shorthand twins, nested/sibling/root defaults, distinct equal-shaped contexts, handler contexts, reusable component with unknown mount. **Validation:** V-STATIC/V-BROWSER/V-GATE. **Docs/example:** exact versus candidate context trace and modern provider syntax. **Risk:** over-pruning reusable components. **Exit:** syntax/default slice can ship first; exact ancestry is asserted only for resolved closed trees.

### RE-04 — Query and mutation result fields and selectors

**Type/cost:** async-library field/channel rules / M–L. **Dependencies:** SH-02/05 and RE-01.

**Behavior:** query fulfilled data reaches `.data` through `select`; errors, status, methods and infinite pages have separate roles. Mutation variables bind the matching mutationFn; only supported return/callback slots receive its completion. Use stable proven key summaries only; cache/dynamic option uncertainty is explicit.

**Modules:** collector boundary-processing `optionFunction/connectOptionFlows`; `framework-flows.ts`; `engine/models/react.json`; field and callback slot emitters. **New fixture:** `react-query-slots.tsx/.jsx`; R-EXP05, select constant/excluded secret, rejected completion, two query keys, empty-cache enabled:false, manual-refetch positive, mutate/mutateAsync, destructured handle and per-call callbacks as later finite slices.

**Validation:** V-STATIC/V-BROWSER/V-GATE; await committed observer predicate, not only microtasks. **Docs/example:** pinned TanStack 5.105.0 local-promise case and result-channel table. **Risk:** dynamic cache sharing and callback lifecycle. **Exit:** selected finite paths have exact fields and forbidden metadata identities; unresolved options do not gain proof by name.

### RE-05 — Snapshot/ref roles and external-store lifecycle

**Type/cost:** state/ref/lifecycle metadata and finite rules / M–L. **Dependencies:** SH-02/03/05.

**Behavior:** distinguish render snapshot, future state, mutable ref, snapshot getter and subscription cleanup. useRef initial value goes to `.current`; ref writes do not imply rendering. useImperativeHandle writes the ref target and returns void. useSyncExternalStore snapshot/subscription/unsubscribe roles remain distinct. useDeferredValue includes optional initialValue and previous/current uncertainty.

**Modules:** React models, state/call support, field assignment and member identity; kinds/contracts; client outcome/marks/inspector. **New fixtures:** `react-ref-snapshot.tsx/.jsx`, `react-external-snapshot.tsx/.jsx`; R-EXP02/04, stale saved closure, ref-only write, two refs, cleanup, no-click, server snapshot. **Validation:** V-STATIC/V-BROWSER/V-CONTRACT/V-CLIENT/V-GATE. **Docs/example:** snapshot versus ref event tuples with limits. **Risk:** metadata mistaken for complete scheduler analysis. **Exit:** ordinary role-specific paths work; exact epochs remain partial where unsupported.

### RE-06 — Finite current React 19 coverage

**Type/cost:** role-specific model/rule slices / L. **Dependencies:** RE-02/03/04/05 mechanisms, not EX-01.

**Behavior/slices:** (a) use(context) and use(promise) context/fulfilled/rejected/pending roles; (b) useActionState state/dispatch/pending outputs, previous-state/payload inputs, FormData actions; (c) optimistic base/update/revert roles; (d) effect-event latest committed capture distinction; (e) current 19.3 Fragment ref/ViewTransition boundary/shape controls without visual scheduler simulation. Ship each with finite positive and negative cases. Keep unsupported Server Component transport/serialization named; SSR compatibility is independently testable.

**Modules:** React models, framework flows, callback/state/field consumers, scope roles and package condition provenance. **New fixtures:** one annotated TSX/actual JSX pair per listed slice under basics, mirrored in the pinned React example. Include never-committed render, rollback, rejected promise, pending fallback, same-named local API and client/server condition controls. **Validation:** V-STATIC/V-BROWSER/V-CONTRACT where required/V-GATE. **Docs:** exact version/API role inventory and explicit transport limits. **Risk:** API-name expansion without implementing roles. **Exit:** each supported family has exact fields/channels and negative controls; no broad “React 19 supported” completeness claim.

## 5. SolidJS track

### SO-01 — Correct existing result shapes and imported identity

**First Solid milestone. Type/cost:** matcher + model/rule correction / S–M. **Dependencies:** SH-01 and minimal SH-02; alias normalization can ship independently.

**Behavior:** createSelector returns a keyed predicate whose invocation returns a boolean; createMemo returns an accessor; on returns a wrapper; onCleanup returns the identical callback while registering lifecycle work; effect/computed/render-effect/onMount calls return void. Preserve valid batch/untrack callback-result paths. Canonical and renamed imported factories match the same rule.

**Modules:** `engine/models/solid.json`; `framework-flows.ts`; state-pairs factory identity; collector call support; `value-origin.ts`; TypeScript host state classifier; model schema/kind traits. **New fixture:** `solid-result-channels.tsx/.jsx`, `solid-import-identity.tsx/.jsx`; E-S1/2/3, never-invoked wrapper, clone versus same memo, selector same-fields/different-reference, cleanup return versus callback return, held function state. **Validation:** V-STATIC/V-CONTRACT/V-GATE and V-BROWSER after Solid1.9.17 preflight. **Docs/new example:** `engine/examples/library-semantics/solid/` with browser/server entry manifest and no-JSX primitive adapters plus JSX mirrors. **Risk:** fixing call return accidentally drops effect-body paths. **Exit:** exact result roles pass, lifecycle uncertainty stays explicit.

### SO-02 — Resource overloads and actual returned payload

**Type/cost:** async resource rule / M. **Dependencies:** SH-02/01; SH-05 field identity.

**Behavior:** normalize no-source and source overloads; resolve named fetchers/sources; connect the value actually returned rather than any `.json()` inside loader; distinguish tuple accessor, actions, payload/error/loading/state/latest/refetch metadata. Solid resource mutate returns replacement and refetch has conditional result semantics; never reuse TanStack's void rule by spelling.

**Modules:** collector call support resource maps/source binding; `program-evidence-carrier.ts` `collectResourceResultCarriers`; framework/model result slots; field extraction. **New fixture:** `solid-resource-channels.tsx/.jsx`; E-S5 discarded JSON versus returned JSON, false→true source, no-source fetcher true argument, named fetcher, mutate/refetch, Error identity and throwing accessor. Preserve `resource-source.tsx`'s named framework-runtime boundary where ordering is unresolved.

**Validation:** V-STATIC/V-BROWSER/V-GATE. **Docs/example:** exact overload/action/result table and local promise resource demo. **Risk:** misclassifying dynamic overloads/options or losing owner across async setup. **Exit:** no unsupported returned-payload assertion; precise supported channels coexist with honest async boundaries.

### SO-03 — Props subsets, overrides and lazy reads

**Type/cost:** field-selection rule / M. **Dependencies:** SH-01/05; independent of SO-02.

**Behavior:** props view descriptions carry include/exclude keys, complement, ordered source precedence and undefined fallback. Reactivity is not equality to a destructured snapshot. Do not evaluate getters to discover fields.

**Modules:** component-binding `propsViews/componentPropReceivers/connectComponentPropBindings`; field transfers/slicing; relevant Solid model normalization. **New fixture:** `solid-props-selection.tsx/.jsx`; E-S4 included/excluded halves, constant override, undefined fallback, getter read count, changed parent source, snapshot negative, dynamic keys partial.

**Validation:** V-STATIC/V-BROWSER/V-GATE; use supplied unexecuted no-JSX adapter as a starting source, not as passed evidence. **Docs/example:** partition/override trace with exact keys. **Risk:** proxy/getter semantics and field order. **Exit:** excluded/overridden caller fields cannot reach exact rendered value; unknown selections remain partial.

### SO-04 — Store paths and updater roles

**Type/cost:** state-path rule / M–L. **Dependencies:** SH-02/05.

**Behavior:** parse setter path selectors, predicates, final value/updater; bind previous selected field/subtree, not whole root; distinguish predicate boolean from stored value; resolve named updaters and higher-order produce/reconcile roles where supported. Function-valued signal state remains separate from updater invocation.

**Modules:** collector call support `connectStateFunctions/processCall`; state-pairs; value-origin; field packing/selection; Solid store summaries. **New fixture:** `solid-store-paths.tsx/.jsx`; E-S4 sibling title/item negatives, predicate id selection, inline/named updater twins, two stores, selected prev field, unknown key, produce/reconcile updater identity.

**Validation:** V-STATIC/V-BROWSER/V-GATE. **Docs/example:** selected-path update and named unknowns for complex proxy traps. **Risk:** false cross-store/updater pairing. **Exit:** selected field changes and siblings remain excluded in both directions; existing two-signal/store identity controls remain valid.

### SO-05 — Owner-scoped context and render callback channels

**Type/cost:** context/render rules / M–L, independently shippable subparts. **Dependencies:** SH-01/02/05; shares RE-03 provider mechanism but not React scheduling assumptions.

**Behavior:** disclose unknown owner ancestry immediately, then resolve nearest known provider/default for closed source trees. For/Index item/index roles differ; Show/Match keyed value callbacks differ from unkeyed accessors. A library component's input attribute is not automatically a DOM output. Keep unknown branch/owner activation named.

**Modules:** JSX support contexts/occurrences; field-transfers `connectSolidFor/connectSolidShow`; component binding; kinds and proof details. **New fixtures:** `solid-owner-context.tsx/.jsx`, `solid-render-callbacks.tsx/.jsx`; two roots, nested/default/undefined provider, For each accessor and two parameters, named callback, Index numeric index/item accessor, keyed/unkeyed Show, inactive branch, Dynamic known/unknown target.

**Validation:** V-STATIC/V-BROWSER/V-GATE. **Docs/example:** owner-tree scope and render callback role table. **Risk:** unbounded owner graph or treating possible render as actual render. **Exit:** finite callback shapes work with exact roles; unresolved trees remain candidate sets rather than false exact provider links.

### SO-06 — Solid Query/accessor options and router boundaries

**Type/cost:** library adapters + result channels / M–L. **Dependencies:** shared RE-04 field mechanism, SH-02/04, SO-01/02.

**Behavior:** resolve accessor-produced query options; separate selected data/error/status/method slots; distinguish TanStack mutate void from mutateAsync; model finite router returned wrappers and resolved accessors without promising cache/action execution or transport identity.

**Modules:** boundary-processing `optionFunction/connectOptionFlows`; framework flows; `engine/models/solid.json`; value-origin; package-condition metadata. **New fixtures:** `solid-query-slots.tsx/.jsx`, `solid-router-results.tsx/.jsx`; accessor/direct-object negative, select drops field, enabled:false empty-cache versus manual enable, mutate/mutateAsync, same-spelled resource mutate positive, returned wrapper never called, browser/server action boundary. Pin exact Solid Query/router versions in the new example's lock before declaring runtime support; this research does not invent an unverified package pin for those later cases.

**Validation:** V-STATIC/V-BROWSER/V-GATE with package preflight. **Docs/example:** locked adapter-specific role tables and runnable local-data cases. **Risk:** package/version/export-condition drift. **Exit:** supported finite adapters are version-qualified; unresolved transport/cache/option construction stays explicit.

## 6. Research, deferrals and rejected paths

**EX-01 — Optional observation-packet comparison (Explore, M).** Execute the sixteen authored cases under the experiment protocol after versions/entries are available; compare direct assertions with identical assertions plus explicit records. Use no generic proxy instrumenter. Retain a minimal format only for an incremental justified channel/identity/condition finding; stop if it repeats existing assertions or perturbs behavior. Destination: versioned research notes and fixtures, never automatic installed rows or product runtime capture. It is not a dependency of any Build milestone.

**EX-02 — Selected dynamic-key/call-target hints (Explore, L).** One authored package-initialization/computed-property example, informed by approximate interpretation/Jelly. Compare exact static negative/positive paths with bounded hints; no downloaded-program execution in this mission, no engine replacement. Advance only if it resolves a concrete post-JS-04 miss without hiding incorrect paths.

**DF-01 — Full scheduler/proxy/eval/heap completeness (Defer).** Retain named uncertainty; unbounded context and arbitrary dynamic execution would dominate cost. **DF-02 — RSC/router serialization and live runtime capture (Defer as separate proposals).** Requires a chosen framework/build/transport contract and separately authorized product design. SSR entry controls and honest boundary labels are in Build already.

**AV-01 — Automatic model/proof installation from observations (Avoid).** Executed witnesses are conditional; they cannot authorize universal proof or hidden model changes. **AV-02 — Endpoint-only success, forced-strict JS and name-only API expansion (Avoid).** All three conceal the exact defects this audit found. Full evidence/reasons are in recommendations.md.

## 7. Validation, documentation and completion gates

The following command sets are referenced by each milestone. They are future implementation-owner work on a full checkout, not a claim of tests run during research. Use only affected focused tests plus required gates; broaden testing to resolve an identified remaining risk.

### V-STATIC — Required for semantic and model work

```bash
cd engine
pnpm exec vitest run test/srcly/fixture-annotations.test.ts test/srcly/library-models.test.ts
pnpm typecheck
pnpm lint
```

Run additional focused existing/new session, field, cache, or contract tests that exercise the changed mechanism. Add annotated positive and negative examples under basics for every new language rule. Check actual JS inventory separately from strict TS results. Never rewrite expected results solely to make a changed percentage green.

### V-CONTRACT — Only where schema/admission/wire shapes change

```bash
cd engine
pnpm emit-contracts
pnpm exec vitest run test/srcly/contracts-current.test.ts
cd ../server
uv run pytest tests/test_dataflow_availability.py tests/test_dataflow_models.py tests/test_dataflow_outcomes.py
```

`emit-contracts` also emits `engine/models/library-models.schema.json`; this was verified in the exact-ref `contracts/emit.ts`. Update Python mirrors only for changed shared fields. When intentional server snapshot changes are required, follow AGENTS.md's `SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest tests/test_dataflow_outcomes.py`, review the diff, then run ordinary verification again. Do not silently regenerate snapshots to accept a wrong outcome.

### V-CLIENT / V-BROWSER — Affected UI and finite library semantics

```bash
cd client
pnpm typecheck
pnpm test
```

Use the existing Playwright toolchain at 1.62.0 for affected UI cases and proposed finite library semantics tests, with `--workers=1`, exact Chromium revision and five-second per-case bounds. New semantic test paths must be created and documented; no command here claims a nonexistent test already runs. React/TanStack observers wait for committed predicates; Solid verifies browser entry/owner/disposal. SSR is a separate manifest/lane. No public/private real project is captured by these tests.

### V-GATE — Mandatory for analysis and corpus changes

```bash
cd engine
pnpm exec node --max-old-space-size=4096 --import tsx scripts/pattern-catalog.ts --json /tmp/srcly-pattern-catalog.json
pnpm survey-gate
```

SH-01 first changes the gate's explicit child `--max-old-space-size=3072` to **4096**. Preserve spawn/wait serialization. Every real-repository Program measurement is **one repository per process, one process at a time across sessions, under `node --max-old-space-size=4096`**. Do not launch concurrent measurement agents. Report before/after counts with attempted/refused/skipped/error/budget denominators and `Survey moves:` explanations for correct honesty downgrades. The gate includes Python only because its shared contract must remain compatible; no Python coverage expansion is proposed.

### Documentation and final acceptance

Each milestone updates the matching `docs/CODE_MAP.md` row, `docs/dataflow-coverage.md` capability/limit entry, and model-plan contract where affected. New examples include exact dependency lock, configs, source forms, commands, positive/negative expected assertions, and browser/server manifest. Keep historical reports immutable except explicit correction notes; add a dated new result record after execution.

A milestone is done when its promised visible behavior passes exact positive/negative assertions, actual JS and typed lanes are distinguished, expected proof/channel/field/end claims are correct, required gates pass with reviewed moves, generated contracts agree, docs/examples run under their pinned setup, and limitations are named. Failure of optional packet research does not block this definition. The complete scope is the shared engine plus all three tracks; no Solid pilot is the stopping point.

## 8. Access and remaining implementation decisions

The baseline ZIP and exact GitHub refs were readable. Relevant existing modules, all catalog/basics source files, model schema/consumer code, acceptance/proof/survey/UI paths and exact contract emitter were inspected. Proposed fixture/example files do not yet exist in srcly. No repository source was edited. Solid1.9.17 runtime bytes and React declaration tarball integrity require preflight before their respective future tests. Later Solid Query/router versions must be pinned when those adapters are implemented. These bounded setup decisions do not prevent immediate source-backed corrections or the JavaScript discovery slice.
