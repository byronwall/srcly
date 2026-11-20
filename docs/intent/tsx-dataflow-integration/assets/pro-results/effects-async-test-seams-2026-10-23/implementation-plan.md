# Implementation plan — function effects, async boundaries, and test seams

**Design handoff only.** This plan does not approve implementation or test execution. No application, build, test suite, source modification, commit or push was performed for this mission. “Build” dispositions identify proposed work for review.

The authoritative inputs are the attached Srcly snapshot at `aea1015258f56dd45b8e175f7288e2fef3abc6cf` and tsx-data-flow at `b4f1ba4f0df402251f4b666cddf5312efa4a62be` plus its supplied local edits. `S/` and `T/` below denote those separate repositories. See [research-report.md](research-report.md) for source evidence and rationale; [recommendations.md](recommendations.md) owns stable EAT IDs.

## 1. Delivery decision and worker brief

### M1 — One useful function inspector

Implement a narrow TSX compiler-based effects pass, a one-shot JSON CLI, a direct Srcly subprocess boundary, and an Effects panel in CodeModal. Demonstrate:

- One closed transformation: `S/client/src/utils/dataProcessing.ts::extractFilePath`.
- One useful partial ambient chain: `hotSpotRanking.ts::rankHotSpots → metricsStore.tsx::metricDef → byId`.
- One useful partial network/async chain: `services/scanJobs.ts::startScan → expectJson`.
- One compact fixture that catches closure, alias, shadowing, unknown-call, recursion and discarded-async mistakes.

**M1 is the default delivery.** It succeeds with accurate positive evidence and visible unknowns. It does not require the ranker or network helper to become completely modeled.

### M2 — A justified later execution view

Only after M1 is useful, add a bounded typed execution slice for `watchScan` and a small promise-coordination fixture. This is a separate review boundary because event triggers, resource ownership and visual relations add a different capability.

There is no third planned platform milestone. Solid, Node worker, Python, stronger alias analysis and optional tracing remain explicitly outside these builds unless a later decision selects a named case.

### Worker rules and prerequisites

1. Work in the full authoritative checkouts, preserving supplied local edits. Do not replace them with the remote default branch.
2. Read both current `AGENTS.md`. TSX requires `docs/application-structure.md` before structural changes; it was missing from this packet and unavailable at the exact supplementary ref. Obtain it from the working checkout before editing structure. Read frontend design guidance if altering TSX UI; this plan adds no TSX UI.
3. Inspect actual compiler installation and complete TSX `bin/` packaging. The packet's manifests show Node ≥18 and TS/Solid ranges, not installed versions or a verified distributable CLI.
4. Reuse compiler/project loading **below** `core.ts::analyzeProject`; do not invoke render report construction as the effect engine.
5. Use pnpm for JS/TS and uv for Python. TSX prohibits builds. Its current `AGENTS.md` also requires explicit user approval before creating/changing/running tests or `pnpm verify`; the fixture and assertions here are specifications for that future phase. Routine implementation feedback is `pnpm lint` and `pnpm typecheck`.
6. No mass refactor, shared package, persistence, default runtime instrumentation, or neighboring route-field redesign.

If a prerequisite is missing, name that exact input. Do not invent a replacement structure policy or a new approval rule.

## 2. M1 support envelope

### 2.1 Resolve only what the proof needs

| Supported initially | Explicitly open initially |
| --- | --- |
| Function declarations, arrows, expressions, callable identity/spans, own-body scanning that skips nested bodies | Full class hierarchy, reflection, arbitrary decorator/JSX execution and `eval` |
| Compiler-resolved local/imported body targets and stable const callable aliases | Mutable/dynamic aliases, arbitrary method dispatch and bodyless external declarations |
| Literal IIFE and identity-modeled literal callbacks | Callback parameters or callbacks hidden in unknown containers/factories |
| Parameter/receiver roots, fresh literals/arrays, direct aliases, module reads, bounded unknown region | General heap shape, escaping closure state histories, deep ownership |
| Finite SCC summaries; direct and transitive evidence | Feasible-path proof, exact exception escape, termination theorem |
| Async flag, Promise result, direct awaits, returned/adopted versus discarded result | Precise pre-/post-await CFG phases, races or complete happens-before |
| Separate invocation/deferred channels; returned callable references stay latent | General generator/iterator activation; retain a typed frontier |
| Module initializer as separate scope, or explicit unmodeled initializer status | Whole dependency loader order and all package side effects |

For property reads/iteration, record ordinary-data and standard-intrinsic assumptions. Structural TS types are not proof of those assumptions. Visible accessors/proxies/custom coercion invalidate the relevant closed model.

All known effects are may-facts, not must-execute claims. Stable callable references/immutable primitive constants are not automatically ambient reads; mutable module cells or reachable mutable contents are. A function declaration whose binding may be reassigned is not a closed target merely because the checker found its original declaration.

### 2.2 Small explicit host/builtin models

Implement direct functions in `function-effects-models.ts`, not a plugin registry. Every rule needs canonical target identity, receiver/input preconditions, operation facts and callback/result behavior.

| Model | Required first behavior | Guard against |
| --- | --- | --- |
| Primitive string length and `String.split` with string separator | Length is primitive access; split returns an ordinary fresh array supporting the leaf's destructuring under standard-iterator assumptions | Generic getter-free object access, regex/custom `Symbol.split`, arbitrary coercion or same-named user method |
| Ordinary primitive-array `slice` | Fresh outer array; copied primitive elements for the closed fixture | Treating object elements as freshly owned |
| Ordinary array `sort` with known numeric comparator | Receiver write; comparator invoked eagerly | Marking all sort calls pure or all receiver writes external |
| Canonical `console.log` | Output seed | Local/shadowed `console` or unknown method treated as canonical |
| Canonical global `fetch` | Network seed; promise result | Parameter/local named fetch or unmodeled wrapper guessed by spelling |
| Canonical `setTimeout` with literal callback | Invocation schedule seed; callback effects lifted to deferred | Body counted as immediate output; delay treated as exact time |
| Canonical `new Promise` with literal executor | Eager executor; no-argument resolve in the fixture is a settlement capability | General thenable assimilation, escaping resolver, arbitrary subclass or every callback deemed deferred |
| Canonical no-argument `Promise.resolve()` | Promise result for the async fixture | Generic thenable assimilation or user objects deemed harmless |

Read of module `byId` is an ambient seed even if `Map.get` remains an external-call frontier. Do not add `Map`, `JSON.stringify`, `Response.json`, every string method or every Array method just to remove frontiers from real examples.

An unknown call yields an unresolved effect/escape frontier, not a fabricated known network/write fact. It also invalidates nonescape assumptions for values passed to it where later writes rely on private ownership.

### 2.3 Finite summary semantics

- Fact keys: family × finite region × `invocation|deferred`.
- Keep writes with regions internally; classify fresh-region writes as local mutation and parameter-reachable writes as input mutation after substitution.
- Region universe: source allocation sites, parameter slots, receiver roots, module/captured declarations, known host roots and unknown top. Bound alternatives/field depth.
- Every summary holds known facts **and** propagated unknown keys `(sourceFrontierId, effectiveActivation)`; a scheduled callback's unknown can be deferred in its caller while invocation-scoped in its own body.
- Eager edges preserve activation and substitute actual argument origins.
- Schedule/register edges lift callback effects into deferred activation.
- Contains/returns-callable edges do not propagate body effects.
- An actual async call propagates possible invocation effects regardless of whether its promise is awaited, returned or discarded.
- Await/adoption records are result dependencies, not another invocation.
- Explicit throws/rejection potential are completion facets. M1 does not claim complete escaping-exception analysis.
- Use SCC/worklist fixed points; no call-depth cutoff for effect closure. Bound witness display separately.

The research report §8 supplies pseudocode. Keep witnesses out of the lattice. Retain direct seeds and exact transfer/call-site provenance, then retrieve a deterministic bounded representative on demand.

## 3. M1 modules and implementation order

These are proposed paths. Confirm the full checkout layout before creating files. Splitting is by present responsibility, not hypothetical reuse; TSX's 300/400-line guidance remains a review signal.

| Repository/files | Work | Completion criterion |
| --- | --- | --- |
| T `src/analysis/function-effects-contract.ts` | Define serializable scope, callable, site, fact, frontier, relation and witness records; one schema revision | No compiler nodes/Maps/cycles; units and coverage documented |
| T `src/analysis/function-effects.ts` | Direct library entry; reuse configured compiler/project loader; collect request scope and diagnostics | No render report or route-field analysis invoked |
| T `src/analysis/function-effects-collect.ts` | Index callable bodies/sites, resolve supported targets, bounded origins and direct facts | Nested body activation and shadowing fixture cases are correct |
| T `src/analysis/function-effects-models.ts` | Small identity/precondition-checked model list from §2.2 | Unsupported variants remain frontiers |
| T `src/analysis/function-effects-propagate.ts` | SCC/worklist, region/activation transfer, bounded witness projection | Recursive facts converge; known and unknown evidence coexist |
| T `bin/tsx-effects.ts` | Proposed one-shot CLI calling the library directly | One JSON object on stdout; diagnostics on stderr; defined exit behavior |
| S `server/app/services/function_effects.py` | Direct subprocess invocation, scope validation, timeout/cleanup and response checks | No shell evaluation or target application execution; failed/unavailable distinguished |
| S `server/app/services/function_effects_models.py` and `routers/analysis.py` | Transport types and proposed `POST /api/analysis/function-effects` | Exact source request in, validated evidence out |
| S `client/src/services/functionEffects.ts` | Typed client request/response and source selection; abort stale requests | No name-based semantic inference in UI |
| S `client/src/components/CodeModal/EffectsPanel.tsx` | Facts, scope, assumptions, direct/transitive witnesses, call sites and frontier | Three real anchors explainable without another graph |
| S `client/src/components/CodeModal/{CodeModal,CodePane}.tsx`, `client/src/App.tsx` open flow | Panel integration, neutral semantic marks, exact source selection | Witness opens correct file/span; existing metrics remain independent |
| T example/docs and S `docs/CODE_MAP.md` | Runnable fixture and user walkthrough; feature row updated | User can reproduce first proof and understand limits |

A Python-to-Node subprocess boundary is necessary because Srcly's backend is Python and the semantic engine uses TypeScript's compiler. It should be one concrete adapter, not an extensible transport framework. Avoid extra forwarding exports or a shared package.

**Implementation order**

1. Establish the scope/identity contract and configured project loading with explicit failure states.
2. Implement collection and the smallest closed leaf model.
3. Add activation/alias/unknown/SCC traps from the fixture; inspect resulting JSON.
4. Check the three real anchors. Preserve unsupported facts rather than widening the model list to obtain clean badges.
5. Connect the subprocess and panel with exact source navigation.
6. Record code-health checks, inspect the reviewable behavior, and then enter the repository's explicitly approved test phase if authorized.

These are work steps inside one delivery, not independent releases.

## 4. Compact M1 synthetic fixture

**Proposed source, not created or executed in the repositories during this mission.** Add it as `T/examples/effects-basics/` when implementation is authorized. If used as a test fixture, follow the repository's explicit test-work gate.

### 4.1 Files

`src/leaf.ts`:

```ts
export function leaf(x: number) {
  return x + 1;
}
```

`src/cases.ts`:

```ts
import { leaf } from "./leaf";

export const referenceOnly = leaf;
export function direct(x: number) { return leaf(x); }
export function throughAlias(x: number) {
  const alias = leaf;
  return alias(x);
}
export function unicode() { const mark = "🌱"; return leaf(mark.length); }

export function fresh(xs: readonly number[]) {
  const ys = xs.slice();
  ys.sort((a, b) => a - b);
  return ys;
}
export function inputAlias(xs: number[]) {
  const ys = xs;
  ys.sort((a, b) => a - b);
  return ys;
}
export function passInput(xs: number[]) { return inputAlias(xs); }
export function passFresh(xs: number[]) { return inputAlias(xs.slice()); }
export function borrowedChild(input: { child: { n: number } }) {
  const copy = { child: input.child };
  copy.child.n++;
  return copy;
}

export function factory() { return () => console.log("latent"); }
export function immediate() { (() => console.log("now"))(); }
export function timer() {
  setTimeout(() => console.log("later"), 0);
}
export function executor() {
  return new Promise<void>((resolve) => {
    console.log("executor");
    resolve();
  });
}

async function after() {
  await Promise.resolve();
  console.log("after");
}
export function discarded() { void after(); }
export async function awaited() { await after(); }
export function adopted() { return after(); }

export function shadowed() {
  const fetch = () => 1;
  return fetch();
}
export function unknownCall(fetch: () => void) { fetch(); }
export function mixed(cb: () => void) {
  console.log("known");
  cb();
}

export function recursiveA(n: number): void {
  if (n > 0) recursiveB(n - 1);
}
function recursiveB(n: number): void {
  console.log(n);
  if (n > 0) recursiveA(n - 1);
}
export function quietA(n: number): number {
  return n > 0 ? quietB(n - 1) : 0;
}
function quietB(n: number): number {
  return n > 0 ? quietA(n - 1) : 0;
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"],
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

This chooses standard DOM declarations for the browser-style host models and avoids accidental ambient test/Node globals. The running analyzer still uses its supported installed TypeScript compiler. Model identity must survive the actual compiler/declaration version, not hard-code an incidental absolute declaration path.

### 4.2 Exact expected classifications and relations

“Closed” below means **complete for the stated supported model**, not total-language purity. All functions retain the general termination/exception-analysis qualifications unless a narrower rule is implemented. The fixture does not execute the effects.

| Case | Required summary | Required edges / forbidden claim |
| --- | --- | --- |
| `leaf` | Empty external-effect and ambient sets; primitive transformation candidate | No call/await/schedule edge |
| `referenceOnly` | Module reference to leaf, not an invocation | No module→leaf call created from the identifier or import |
| `direct` | Same candidate status as leaf | Exact call site direct→leaf across files |
| `throughAlias` | Same candidate status as leaf | alias(x) targets leaf; do not manufacture an alias function body |
| `unicode` | Same candidate status as leaf | `leaf(mark.length)` spans **1-based UTF-16 columns 55–72, end exclusive**; start/end must select the exact call |
| `fresh` | Fresh result + local array mutation; no parameter write under ordinary numeric-array assumptions | slice allocates outer array; sort invokes comparator eagerly and writes the fresh receiver |
| `inputAlias` | Known input write to parameter zero | Same comparator semantics; sort receiver aliases xs |
| `passInput` | Transitive input write to parameter zero | call to inputAlias substitutes caller parameter origin into callee parameter write |
| `passFresh` | Callee write becomes caller-local mutation; no input write from that call | call to inputAlias substitutes fresh slice origin; do not propagate an unconditional external-write label |
| `borrowedChild` | **Partial**, `mutation-target-unknown` at `copy.child.n++` in the baseline model | Never closed/local-only merely because copy is fresh; optional later precision can refine to parameter-reachable write |
| `factory` | No active output; returned callable reference with latent output | contains/returns-callable to arrow; **no call to arrow** |
| `immediate` | Invocation/output | Eager literal-IIFE call; no deferred output |
| `timer` | Invocation/schedule plus deferred/output | schedules→arrow; timer must not receive invocation/output from that callback |
| `executor` | Invocation/output; promise result; no deferred output from executor | new Promise invokes literal executor eagerly; resolve is settlement, not an unknown user callback |
| `after` | Async; promise result; one direct await; invocation/output | Await at Promise.resolve; phase remains unspecified, not “all before return” |
| `discarded` | Transitive invocation/output; zero direct awaits | calls→after plus explicitly-discarded disposition; effects must not disappear |
| `awaited` | Same may-output; one direct await; async | calls→after plus awaits-result; do not duplicate call count |
| `adopted` | Same may-output; zero direct awaits; promise-returning but not async | calls→after plus returns/adopts-promise |
| `shadowed` | Local primitive transformation candidate; no network fact | fetch() resolves to local arrow |
| `unknownCall` | Partial with unresolved callback-target frontier | Parameter name fetch creates **no network fact** and no complete candidate badge |
| `mixed` | Known invocation/output **and** partial frontier | console seed retained alongside cb unknown |
| `recursiveA/B` | Both invocation/output after fixed point; termination not established | A→B and B→A; one deduplicated output fact; representative A→B→console witness |
| `quietA/B` | No modeled external effects in a closed supported SCC; termination not established | Recursion alone creates no unknown-effects frontier or infinite witness |

The baseline deliberately leaves `borrowedChild` partial. If a worker adds a bounded field-origin rule, document the refinement and change that expectation explicitly; accepting either answer silently would conceal an accidental false-negative. The non-negotiable invariant is that this write cannot become proven private through shallow freshness.

**Additional request-level precision checks, using the same fixture**

- Select a noncall reference and verify it is not included in the call-site list.
- Change `leaf` to call an unresolved callback in a temporary approved fixture variant: known facts/frontiers must propagate to both direct and alias callers.
- Omit or corrupt the explicit config: return an explicit error/partial scope, never a closed empty result.
- Query Python: return not analyzed for unsupported language, not zero effects.
- Change source after analysis: exact source selection is refused as stale until refreshed.
- A UTF-16/non-ASCII and CRLF variant must navigate correctly; display caps must not alter semantic completeness.

These belong in the same compact semantic/contract verification, not a new framework of fixture families.

## 5. Real-source acceptance

| Anchor | Required M1 output | Acceptable remaining limits |
| --- | --- | --- |
| `S/client/src/utils/dataProcessing.ts:81–91 :: extractFilePath` | Correct callable/span; canonical primitive split; no ambient/external effects; complete for supported primitive contract | Import/module setup shown separately; arbitrary runtime objects and patched intrinsics outside assumptions |
| `S/client/src/utils/hotSpotRanking.ts:57–82 :: rankHotSpots` | Call to metricDef at 58; transitive ambient witness to `metricsStore.tsx:144`, with byId declaration/update context at 105/109 | Map.get, Number.isFinite, reduce, Math.max, property/iterator and item.score provenance may remain frontier sites |
| `S/client/src/services/scanJobs.ts:88–98 :: startScan` | Network seed at fetch; exactly one direct await; call and returned/adopted promise to expectJson | JSON.stringify, Boolean and other unsupported operations must be shown if not modeled |
| `scanJobs.ts:70–82 :: expectJson` | Two distinct JSON await sites on alternative branches; explicit throw site; async may-reject/site-only exception status | Response.json, String coercion, Error construction, catch/escape details are not silently closed |

Do not assert that Response.json is the only frontier unless the other operations are actually modeled. Do not count expectJson's awaits as direct startScan awaits. Do not describe an async throw as synchronous propagation to the immediate caller.

`cohortNodes`, the TSX CLI transformations, `createClickIntent`, `scanStore`, Node service and Python supervisor are research examples and optional manual follow-ups. They are not all first-slice closure requirements.

## 6. Transport, identity, and source navigation

### 6.1 Proposed CLI/API

Library entry, directly imported from its defining module:

```ts
analyzeFunctionEffects({
  root, tsconfig,
  selection: { file, line, column },
  witnessBudget: { maxNodes: 20, maxEdges: 30, maxDepth: 6, maxWitnesses: 2 }
}): Promise<FunctionEffectsResponse>
```

The example budget values are initial UI/projection defaults, not measured performance limits. The function may be synchronous internally where appropriate; its API can return a promise for project I/O. It must never execute the analyzed target code.

CLI success writes exactly one UTF-8 JSON response to stdout and exits 0. Partial semantic coverage is a successful analysis with `coverage: "partial"`. Invalid config/selection/unavailable compiler or operational failure returns a typed error envelope and a nonzero exit. Diagnostics belong on stderr; do not corrupt stdout with progress logs.

Srcly proposal:

```text
POST /api/analysis/function-effects
{
  root: absolute configured project root,
  tsconfig: validated project-relative config path,
  file: project-relative source path,
  line: 1-based,
  column: 1-based UTF-16
}
```

The request names the effective config explicitly. M1 can use a small per-session project/config selection in the panel; suggest a default only when the reused TSX project-loading code establishes one effective config. Do not assume an existing UI discovery endpoint or build an automatic project picker first. For the Srcly walkthrough, select project `client/` and config `tsconfig.app.json`. Missing/ambiguous configuration remains explicit, with no nearest-file/file-walk fallback or persistent project-management system.

The adapter resolves/canonicalizes paths, checks containment in the selected project, invokes an argv list with `shell=False`, validates the schema revision and required fields, and maps outcomes to analyzed/partial/unavailable/failed UI states. Reject paths outside the selected analysis scope. This is a concrete boundary validation, not an unrelated redesign of Srcly's file API.

Use a new asynchronous route and asynchronous subprocess I/O so the route can monitor request disconnection while analysis runs. One local cleanup path handles disconnect, request cancellation, timeout and output-limit failure; a `finally` block terminates/reaps remaining process-group work. Browser AbortController by itself does not stop the backend child. If a disconnect is not observable promptly, the operational timeout still bounds the process lifetime. The panel also rejects any response for an obsolete selection.

A local developer configuration can supply one trusted JSON argv setting, for example:

```text
SRCLY_TSX_EFFECTS_COMMAND=
["pnpm","--dir","/absolute/path/tsx-data-flow","exec","tsx","bin/tsx-effects.ts"]
```

The newline here is presentation only; the environment value is the JSON array. Append validated request arguments as separate argv entries. Do not accept an arbitrary shell command from the browser, auto-install packages, or assume a production binary already exists. If configuration/runtime is absent, show Effects unavailable with a useful reason.

Use a bounded stdout reader and a timeout that terminates/reaps the entire analysis process group, including descendants behind the pnpm wrapper. On platforms without that mechanism, use the platform's process-tree termination facility and verify cleanup. Prefer a direct installed executable when available; do not kill only the wrapper PID and leave the analyzer running. Initial operational defaults can be 30 seconds and 8 MiB; label them provisional and measure real anchors. Exceeding the bound is explicit failure/partial analysis as appropriate, never truncated JSON masquerading as success.

### 6.2 Required response fields

- `schemaRevision`: one accepted revision; reject incompatible output, no coexistence machinery.
- `snapshotId`: opaque identity for this analysis run/scope.
- `scope`: actual compiler/version/configs, source inclusion/exclusion, declarations/models, assumptions, diagnostics and coverage.
- `sources`: project-relative files and source-text revisions for every displayed definition/site/witness.
- `functions`, `callSites`, `relations`, `directEvidence`, `summaries`, `frontiers`, `witnesses`: compact query projection with full referenced records.
- `projection`: displayed/omitted counts and `witnessTruncated`, distinct from semantic coverage.

No generic confidence percentage. A known body target, a model application and a heuristic guess are different support kinds; M1 never upgrades a heuristic to a closed target.

### 6.3 Source coordinates and stale evidence

Use unique snapshot-scoped callable/site IDs derived from file/kind/span, not `file#name` alone. Anonymous callbacks need IDs too. Names and qualified labels are display/search hints.

Public positions are 1-based line and UTF-16 column with end-exclusive ranges; offsets are 0-based UTF-16. Their coordinate representation is canonical display text: CRLF/CR converted to LF and a leading BOM removed. Map original compiler start/end positions into this representation once at serialization. Raw compiler offsets remain internal and must not be applied to differently normalized viewer text.

For source-text matching, compare revisions of that same canonical text and pass that representation to the code highlighter when displaying semantic marks. Test CRLF, standalone CR, BOM and non-ASCII cases; normalized revision equality alone does not repair an unmapped coordinate. A content revision is an internal response value, not a generated hash/manifest file. The existing `useFileContent`/`fileContent` path supplies the viewer text; the panel normalizes and compares it before applying semantic marks. If the revision differs, show “Source changed; refresh effects” and disable the stale exact jump.

Extend the current CodeModal/App open flow to accept an exact file/span selection. Do not route semantic evidence through `findScopeForSymbol`'s name/line tolerance and then call that exact. Keep existing metrics/navigation behavior for ordinary selections.

If CodeModal is showing `gitRef` content, M1 must say **effects unavailable for historical revision**. Do not analyze the current worktree and display its claims over historical code. Snapshot/compare analysis is future scope.

### 6.4 Cache and cancellation policy

M1 can rebuild the configured program per cold selection. Retain the displayed response only for that selection; **do not add a reusable semantic cache in this slice**. This avoids an invalidation subsystem before latency is measured. A new request supersedes/aborts the old client request; prevent its result from becoming current and stop/reap its process group on disconnect/cancellation or the bounded timeout.

Record wall time, file/callable/site counts and frontier counts in the manual acceptance notes. If repeated startup is unacceptable, choose one measured next step: whole-snapshot result reuse or a resident worker. Any reusable cache must include source bytes/declaration resolution, configs/packages, compiler, models and assumptions; Srcly's current graph metadata signature is insufficient. Do not add both caching and a service speculatively.

## 7. Verification, runnable examples, and documentation

### 7.1 Few meaningful checks

Once explicit test work is authorized under TSX's repository guidance:

1. **One semantic fixture suite**, proposed `T/test/function-effects.test.ts`: table-driven expectations in §4, exact real-anchor checks in §5 where fixture access is appropriate, SCC/activation/unknown preservation and source coordinate cases. Assert meaningful facts and source selections, not every serialization detail or implementation helper.
2. **One transport contract suite**, proposed `S/server/tests/test_function_effects.py`: controlled executable/response fixture for stdout/schema/scope/unavailable/failure, disconnect and timeout cleanup including descendants; one approved local real-CLI smoke check proves the cross-repo wiring.
3. **One panel/source-selection check**, proposed `S/client/src/components/CodeModal/effects.test.tsx`: known effect plus partial frontier are both shown, exact witness selection maps correctly, stale/obsolete responses or historical content cannot receive current evidence.

Do not run the entire application test portfolio merely because it exists. Reuse existing metric/navigation assertions if an implementation changes those behaviors; broaden only for a concrete remaining risk. Final TSX post-approval verification remains its centralized `pnpm verify`.

### 7.2 Proposed runnable commands

These commands describe files/behavior to be added. They were **not run** and do not exist as a complete feature in the packet. Execute from the full TSX checkout after implementation, with dependencies already installed and no build step.

```bash
# Synthetic direct-call anchor: cases.ts line 4.
pnpm exec tsx bin/tsx-effects.ts \
  --root examples/effects-basics \
  --tsconfig tsconfig.json \
  --file src/cases.ts --line 4 --column 1

# Real closed leaf; replace only the absolute checkout root.
pnpm exec tsx bin/tsx-effects.ts \
  --root /absolute/path/srcly/client \
  --tsconfig tsconfig.app.json \
  --file src/utils/dataProcessing.ts --line 81 --column 1

# Ambient witness.
pnpm exec tsx bin/tsx-effects.ts \
  --root /absolute/path/srcly/client \
  --tsconfig tsconfig.app.json \
  --file src/utils/hotSpotRanking.ts --line 57 --column 1

# Network, await and returned-promise witness.
pnpm exec tsx bin/tsx-effects.ts \
  --root /absolute/path/srcly/client \
  --tsconfig tsconfig.app.json \
  --file src/services/scanJobs.ts --line 88 --column 1
```

In the implementation phase, routine TSX code-health commands are:

```bash
pnpm lint
pnpm typecheck
```

Only after explicit test approval, the final TSX gate is:

```bash
pnpm verify
```

For the proposed Srcly tests, in their respective directories and only when implementation/test work is authorized:

```bash
# Replace checkout paths; run only in the authorized test phase.
cd /absolute/path/srcly/server
uv run pytest tests/test_function_effects.py

cd /absolute/path/srcly/client
pnpm test -- src/components/CodeModal/effects.test.tsx
```

No build command belongs in this run sheet. The TSX package's prepack/build lifecycle is not a workaround for its no-build instruction.

### 7.3 Documentation required in the same delivery

- `T/examples/effects-basics/README.md`: commands, expected relations, assumptions, examples of partial results and why a returned closure is latent.
- `T/docs/function-effects.md`: support envelope, schema/coordinate conventions, model identity preconditions, result dispositions, known gaps and cache policy.
- `S/docs/intent/function-effects/README.md`: configure optional local command; open the three real anchors; interpret direct/transitive/deferred evidence; choose a test seam.
- Update `S/docs/CODE_MAP.md` with analyzer adapter, route and panel.
- Correct only directly relevant stale documentation; do not fold the neighboring route-field design into these docs.

The manual review record should state compiler/model versions, selected roots/configs, source snapshot, what was inspected, duration/counts, and outstanding frontiers. It need not become a new reporting system or generated manifest.

EAT-015 ships as this source-grounded test-seam walkthrough. It does not require an automated recommendation engine, hard-coded production rules for the three example function names, or generated refactor patches.

## 8. M2 — Bounded execution and lifecycle slice

### Why this is a separate delivery

M1 can show effects and exact call witnesses in a code inspector. It cannot yet explain event-trigger alternatives, cleanup ownership and aggregate promise completion visually. Adding these before inspecting M1 would enlarge both the semantic surface and UI without knowing whether the simpler panel answers Byron's spot-checks.

Proceed after reviewing M1 usefulness and measured latency. This is a planned Build disposition with a delivery gate, not authorization to implement automatically.

### 8.1 Scope

Extend the same contract/pass, without new persistence or service infrastructure:

- Canonical EventSource creation, listener registration, `onerror` assignment and `close`, with resource-handle origins preserved through simple captured variables.
- `setTimeout/clearTimeout` handle creation/cancellation; named const callbacks as well as literals.
- Promise `all/allSettled/race` result dependency semantics and `.then` reaction registration.
- Ordinary primitive-array `forEach` eager callback invocation and ignored callback promises.
- Bounded execution projection with typed calls, registrations, awaits, joins/selections, cleanup and unknown frontiers.

This is still not a path-feasibility, full owner-lifetime or race detector. Captured state and complex handle aliases may remain partial. A callback registered by `.then` stays in the deferred channel even if the resulting promise is returned/awaited; result dependency is a separate relation. A language-level async function's own continuation stays in its invocation channel. The channels identify activation origin, not synchronous versus asynchronous elapsed time.

### 8.2 Real anchor: watchScan

Use `S/client/src/services/scanJobs.ts:122–200 :: watchScan` and its nested `stop`, `accept`, `poll`, `onMessage`, `onerror`.

| Required evidence | Exact source behavior to preserve | Claim prohibited |
| --- | --- | --- |
| Resource creation | new EventSource on the supported branch | Creating a callback alone creates the connection |
| Immediate fallback activation | EventSource-unavailable branch invokes poll with discarded promise | Every poll begins only after a timer |
| Event registration | Event names register onMessage; onerror is assigned | Listener registration executes onMessage |
| Poll lifecycle | fetch/await/accept, then conditional timer registration | Each loop iteration is a guaranteed future event |
| Terminal acceptance | `snapshot.version < lastVersion` is rejected; terminal phase calls stop then onDone | Equal nonterminal versions are always deduplicated |
| Stop ownership | stopped flag, source.close, clearTimeout; returned stop reference | Returning stop executes it; stop aborts an in-flight fetch |
| Unknown handlers | calls to supplied onUpdate/onDone retain target frontiers | User handlers are effect-free |
| Caller lifecycle note | scanStore cancel requests server cancellation; dispose/supersede invalidate and stop observation | cancel immediately closes the watcher |

The view may display `stop` as the resource-owner cleanup seam even where full closure aliasing remains unknown. Show which relation is model-backed and which ownership conclusion is still a source-review note.

### 8.3 Small coordination extension

Add `src/coordination.ts` to the existing effects example when this milestone is selected:

```ts
async function job(label: string) {
  await Promise.resolve();
  console.log(label);
}
export async function joinAll() {
  await Promise.all([job("a"), job("b")]);
}
export async function settleAll() {
  await Promise.allSettled([job("a"), job("b")]);
}
export async function firstResult() {
  await Promise.race([job("a"), job("b")]);
}
export function unjoined() {
  ["a", "b"].forEach(async label => { await job(label); });
}
export function chained() {
  return job("a").then(() => console.log("done"));
}
```

Exact proposed expectations:

- Each aggregate function has **two job invocation sites** before the aggregate call in source evaluation order, a result-aggregation relation and one direct await. The combinator does not create duplicate job starts.
- `joinAll`: fulfillment depends on both inputs; rejection can settle early; no cancellation/completion-of-all guarantee after rejection.
- `settleAll`: result waits for all settlements.
- `firstResult`: first settlement determines result; remaining work may continue.
- `unjoined`: eager forEach callback edge; callback is async and awaits job; outer function has zero direct awaits and no join; callback promises are ignored. Its transitive output remains visible.
- `chained`: one invocation of job, one deferred then-reaction callback with output, returned promise adoption; zero direct awaits in chained.
- No case earns a “parallel threads” badge merely from promise overlap, and no aggregate implies cancellation.

### 8.4 UI/files/docs

- Extend T `function-effects-models.ts`, collection/contract/projection only for these operations.
- Add S `client/src/viz/effects/executionModel.ts` and `ExecutionSlice.tsx` as focused modules; open the slice from EffectsPanel rather than adding a new global navigation mode first.
- Reuse existing code selection, node-card/interaction ideas and geometry helpers where their types fit. Do not route execution data through dependency `buildViewModel` or redefine importer/imported as earlier/later.
- Collapse recursive components; show a bounded slice and omitted/frontier counts; use labels and stroke styles rather than only color.
- Extend the same semantic suite and one panel scenario after explicit test-work approval. No new test framework.
- Add a `watchScan` walkthrough to Srcly docs and coordination commands/expectations to the existing example README.

**Acceptance:** selecting the terminal path explains stop-before-onDone when control reaches that branch and earlier operations return normally; unknown handler/cleanup failures remain possible frontiers. Selecting fallback explains immediate poll plus later timers; joins/first-settlement and source order are correctly labeled. A UI cap must never change summary coverage or claim hidden work is absent.

## 9. Risks, stop criteria, and scope control

| Risk | Required response | Stop condition |
| --- | --- | --- |
| Compiler identity mistaken for runtime certainty | Display ordinary-data/intrinsic assumptions and target completeness | Shadowed fetch gets network fact or structural type alone closes arbitrary dispatch |
| Callback bodies flattened into owners | Independent callable nodes and typed activation transfer | Factory inherits latent log; Promise executor wrongly deferred |
| Async result disposition mistaken for activation | Propagate actual call effects independently of await/return/discard | Discarded async call loses later output |
| Freshness loses borrowing/escape | Track bounded origins; widen to unknown at unsupported nesting/escape | Shallow copy makes borrowed child mutation local-only |
| Unknowns erase known effects | Componentwise fact/frontier join | Mixed callback case loses console output or becomes closed |
| Recursion/path explosion | Finite SCC summaries; bounded witness retrieval | Repeated cycle changes fact universe or creates unbounded path materialization |
| Cross-language source offsets/stale revisions | Explicit UTF-16/line convention and content match | Witness highlights wrong text or current evidence appears over gitRef source |
| Project/config gaps | Fail or mark affected scope partial, with reasons | File-walk fallback/missing declarations silently produces candidate badge |
| One-shot startup too slow | Measure anchors; report latency and scope; choose one follow-up if needed | Hide freezes with unsupported “instant” claims or add a service before measurement |
| Transport lifecycle | Bounded read, timeout, abort/reap; reject invalid schema/output | Orphaned analysis process or prior selection publishes as current |
| Test workflow conflict | Design/specify now; follow current explicit test gate during implementation | Run/update TSX tests or builds without authorization |
| Neighbor mission absorbs feature | Keep effects contract and user questions separate | Require route/field proof UI or shared kernel to ship M1 |

**Stop expanding M1** once the three real anchors and semantic traps are explainable, the contract/source selection works, and required authorized checks pass. A partial ranker is not an excuse to add generalized heap analysis. A useful unknown is an intended outcome.

## 10. Build-disposition traceability

Every Build recommendation appears in this plan. Other dispositions are not hidden implementation commitments.

| Recommendation IDs | Delivery | Concrete section |
| --- | --- | --- |
| EAT-001, EAT-002 | M1 | Compiler pass, target support and modules: §§2–3 |
| EAT-003, EAT-004 | M1 | Fact/coverage taxonomy, bounded origins: §§2.1–2.3, 4–5 |
| EAT-005, EAT-006 | M1 | Activation/result separation, SCC/witness algorithm: §§2.3, 4; report §8 |
| EAT-007 | M1 | Direct library/CLI and one Srcly subprocess boundary: §§3, 6 |
| EAT-008, EAT-009 | M1 | Inspector, neutral evidence and exact/stale-aware navigation: §§3, 5–6 |
| EAT-010 | M1 | Compact fixture, meaningful verification and runnable docs: §§4–7 |
| EAT-011, EAT-012 | M2 | Typed execution slice and narrowly modeled lifecycle/coordination: §8 |
| EAT-013, EAT-014 | M1 | Category/N/A separation, analysis scope and initialization disclosures: §§2, 5–6 |
| EAT-015 | M1 | Test-seam explanations in panel/walkthrough docs: §§1, 3, 7.3; report §§5–7 |

## 11. Handoff questions

The defaults are enough to begin an authorized implementation. Resolve only these practical inputs:

1. Obtain the full authoritative checkouts and missing TSX structure/packaging files.
2. Confirm the local TSX command installation path and supported compiler version.
3. Review whether the first three source explanations are useful before selecting M2.
4. At the repository's required stage, obtain explicit test-work authorization if not already provided in that future session.

No implementation authorization is being requested or implied by this Design deliverable.
