# Evaluation plan: dependency explanations that remain correct

**Status:** proposed evaluation, with four executed isolated projection checks reported separately in §2. No application test suite, external-tool workflow, runtime benchmark or participant study was executed. **Baseline:** Srcly `ee8a771ce94fb59573492445d0f5fa2411ad83c8`; topic `srcly.dependency-analysis-tool-ui-deep-dive.v1`; October 28, 2026 (America/Indianapolis). The supplied 729-file packet is selected source, not a runnable checkout. Codex must obtain a complete authorized checkout and reconcile later main before running the integration instructions.

## 1. Decisions this evaluation can support

The central question is whether a developer can explain the right source relationships, with the right limitations, and return to the original question. Fewer boxes and shorter paths are secondary observations.

Compare these three representations on the same labelled tasks:

- **A0 — current baseline:** current function/component folding, graph and inspector, with the pinned behavior reproduced before any change.
- **B — producer-first:** nearest meaningful producer/consumer explanation, explicit condition and identity expansions, source preview and optional overview graph.
- **C — source-first:** dependency tree or ordered evidence ledger, source preview and an optional graph for reconvergence.

Separately test **A1 — preferred first slice**, which adds Explain connection to A0 and preserves contributor evidence. A1 is an incremental candidate, not a fourth representation required for every task. It should pass the semantic and source-return checks before testing a different default.

Run two distinct comparison tracks. **Track E (engine-realistic)** gives every view only facts currently emitted by the engine; absent guard/identity facts must read “not analyzed.” **Track H (interface isolation)** uses a clearly labelled, hand-authored oracle payload for all views to test future interactions with equal information. Never compare A0's incomplete engine facts to B's richer hand-authored facts and attribute the difference to layout. Track H is not a demonstration of implemented analysis. Label its graph comparator **A0-H**, an A0-style prototype with equal oracle information, and distinguish it from the actual frozen application **A0-E**. Record the common scaffolding needed to expose those facts; do not call a modified renderer the unchanged baseline.

A successful first slice answers: “Why is this connection here, which source occurrences contribute, and what remains unknown?” A successful later witness view must additionally prevent incompatible chains. [Current projection][R-ADAPTER] [Current contract][R-ANCHORCONTRACT]

## 2. Experiments actually executed

The ZIP includes `assets/experiments/projection-check.mjs` and `projection-check-results.json`. The harness loaded the actual pinned TypeScript function bodies with Node v24.22.1 type stripping, replacing only imported visual labels/colors. Inputs were synthetic graph-shaped objects; counts were placeholders and schema validation was not run. It did not run an engine, application, layout system or browser. Source hashes are recorded in the JSON.

| ID | Input and observed result | What the result establishes |
| --- | --- | --- |
| P1 | 45 nodes including two scopes. Raw edges `A→u` and `v→B`; u and v are disconnected members of one folded scope. Raw reach from A: A,u. Displayed reach: A,remote,B. | Folding can introduce displayed reach not present in raw topology. No claim about real-project frequency. |
| P2 | Parallel A→B relations with proven and partial status. Reverse array order. Surviving edge/status reverses. | Endpoint deduplication is first-wins and loses evidence alternatives. It is not a stable aggregate status policy. |
| P3 | Same-name reference node R between A and B. A→R is partial; R→B is proven. R is hidden and the surviving displayed A→B is proven. | A hidden serial relation's weaker proof can be dropped. Raw topology did contain a path, so this is not the same failure as P1. |
| P4 | Query one has A→X; query two has X→B. Union highlights A→B. Neither query alone does. | Shared element ID enables uncertified cross-query composition. The check does not establish that the unseen invocation contexts are incompatible. |

To reproduce only these isolated checks after unpacking, supply the original extracted source root:

```sh
mkdir -p work
node assets/experiments/projection-check.mjs /absolute/path/to/source
```

Run in a disposable working directory after unpacking. The harness defaults to a `source` directory if no argument is supplied and writes its result to `work/projection-check-results.json`. This command does not install dependencies or mutate application source. The original output is evidence of this assignment; a later rerun should save a separate result with its own environment and hashes. [Projection][R-ADAPTER] [Union][R-MULTI] [Reach][R-REACH]

## 3. Oracle protocol

The snippets below are **proposed fixtures**, not added repository tests. Comment labels identify conceptual locations, not the existing runner's annotation syntax. During integration, map them to the existing annotated fixture system rather than inventing a second runner.

For each fixture record:

1. Exact source revision, file/span, selected expression, direction, language/provider, generation and query/run ID.
2. Required producer/consumer witnesses as an ordered chain **only where composability is known**; otherwise a set of separately supported relations.
3. Forbidden paths, required conditions/activation qualifiers, model/assumption labels and named frontiers.
4. Condition coverage: analyzed for this fixture, partially analyzed, not analyzed or unsupported. “No condition rows” is never the unconditional oracle by default.
5. Both a source-level semantic answer and the **minimum honest answer** from current engine facts. A correct admission of missing analysis is not a complete semantic answer, but is distinct from a false answer.

Two reviewers should independently label the small fixtures, then reconcile disagreements before testing any UI. Report disagreements, not only consensus. Manually confirm framework semantics against the exact installed version. Oracles are a human audit set, not proof of complete static analysis.

### Existing annotation runner and a proposed negative fragment

The current runner recognizes `@trace`, `@outcome`, `@reaches`, `@stop`, `@visits`, `@never-reaches`, `@edge` and `@no-edge`; terminal/origin and stop claims are exhaustive. Its location checks are line based, and edge predicates match a kind/status/proof anywhere in the result. It cannot by itself prove guard-target polarity or invocation-compatible adjacency. [Annotation parser and checks](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/fixture-annotations.test.ts#L10-L141)

For F4, this is a **proposed annotation fragment**, not a complete passing fixture:

```ts
const a = id(left);   // @trace design_call_left forward left
const b = id(right);  // @never-reaches design_call_left
```

The complete reviewed fixture must also label every expected terminal/origin and named stop; do not copy actual output into the oracle merely to make the test pass. Add typed assertions for selected raw endpoints, state compatibility and guard polarity alongside the existing runner where line-level annotations cannot express the requirement. The same-line two-call case specifically requires span/ID assertions. F3's forbidden unconditional claim, F6's receiver distinction and F1's activation condition are explicit semantic negatives; a generic `@no-edge` over the entire graph is too coarse to establish them.

## 4. Small fixtures and hand-labelled answers

### F1 — resource callback carries a value and has activation semantics

```tsx
import { createResource } from "solid-js";
async function load(id: string) { return { title: id }; }
export function ResourceCase(props: { id: string; enabled: boolean }) {
  const [doc] = createResource(
    () => props.enabled ? props.id : false,        // F1.source
    async (id) => load(id),                        // F1.fetcher / F1.input
  );
  return <span>{doc()?.title}</span>;              // F1.consumer
}
```

**From/to oracle:** the possible title producer is `props.id` through the selected source expression, the first fetcher argument, `load`'s parameter and returned object's title, resource result and accessor field. Keep the factory occurrence and callback argument binding. `props.enabled` controls source selection; it is not the title string's producer.

**Condition oracle:** for a new source-triggered fetch in this fixture, the source must yield the string branch. A `false`, `null` or `undefined` source suppresses that fetcher call under Solid's documented resource API. Do not incorrectly reduce this to arbitrary JavaScript truthiness; an empty string is not `false`. Rendering a retained earlier resource value and issuing a new fetch are different events. This fixture has no explicit `refetch`. Timing, hydration and promise success are not established by the value chain. [Solid resource contract][EXT01]

**Minimum honest current answer:** framework-modelled source→inline-fetcher transfer with source spans; execution conditions not analyzed. The baseline `bindResourceSource` is a value model, not an activation predicate producer. **Negative:** change `enabled` to false; reject a UI claiming the fetcher always executes or that it supplied false as a title. Also place two resource instances in one file and forbid switching between their fetcher bindings. [Model source](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-call-support.ts#L149-L169)

### F2 — closure stores, returns and later reads a captured value

```ts
function makeReader(input: string) {              // F2.input
  const state = { value: input };                 // F2.store
  return () => state.value;                      // F2.closure-return
}
export function closureCase(value: string) {
  const read = makeReader(value);                 // F2.factory-call
  const answer = read();                         // F2.read-call
  return answer;                                 // F2.output
}
```

**From/to oracle:** `value→makeReader.input→state.value→closure body return→answer→closureCase return`. Returning the closure and returning its captured value are separate transfers. The factory call creates a closure that captures its own state; the later `read()` invocation is needed to obtain the string.

**Condition oracle:** relative to entry into `closureCase`, the two calls are sequential and unguarded in this fixture, assuming normal completion. Creation of a closure alone does not execute its body. For a variant returning `read` without calling it, answer “the function escapes; its later execution is not shown.”

**Negative:** create `readA = makeReader(a)` and `readB = makeReader(b)`; a query from a may reach readA's output, not readB's output. Include a callback-through-parameter variant `invoke(readA)` under the existing higher-order-call task; an unresolved continuation must remain a named boundary. Do not require first-slice evidence inspection to solve an absent callback model.

### F3 — branch-controlled save with early exit

```ts
function persist(value: string) { return value; } // Pure test sink marker
export function save(draft: string, canSave: boolean, dirty: boolean) {
  if (!canSave) return "blocked";                 // F3.permission
  if (dirty) return persist(draft);               // F3.dirty / F3.write
  return "unchanged";
}
```

`persist` is deliberately a local marker, not a claim that this body performs a database write. In an effects variant substitute a test-only sink model or a captured audit write; label it explicitly.

**From/to oracle:** `draft→persist` argument→persist parameter and return on that branch. Neither boolean is a data producer for the saved string. **Condition oracle:** the marker invocation requires `canSave && dirty` after entering `save`, with no preceding exceptional exit in this snippet. `!canSave` leads to blocked; `canSave && !dirty` leads to unchanged. A value-flow edge alone does not establish these facts.

**Negative:** seed `draft` and ask “does every call save?” Correct answer is no. Seed `dirty` and ask “does this supply the saved text?” Correct answer is no; it permits the invocation. Add a throw/try/finally extension later, with a separate oracle. The first general-control implementation must not extrapolate a simple `if` model to exceptions it does not support. [Inspected collection](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L26-L95)

### F4 — two call sites, plus convergence/redivergence

```ts
function id(v: string) { return v; }
export function twoCalls(left: string, right: string) {
  const a = id(left);                             // F4.callA
  const b = id(right);                            // F4.callB
  return { a, b };
}
export function fanout(input: string) {
  const a = id(input);                            // F4.sameInputA
  const b = id(input);                            // F4.sameInputB
  return { a, b };
}
```

**From/to oracle:** left reaches a and field a, never b; right reaches b, never a. For `fanout`, input reaches both a and b via two distinct valid call contexts. A query rooted inside `id` may legitimately expose all relevant call sites from the two outer functions, separately identified as alternatives.

**Condition oracle:** no local predicate in these simple bodies; execution still requires the corresponding outer and inner invocation. No single selected run is observed. **Negative:** a chain may not enter through callA and return to callB. Put both calls on one physical line to ensure identities use full spans/IDs, not only file and line. The fanout test targets a source-derived requeue hypothesis; it has not demonstrated an engine failure. Existing two-call tests remain valuable and should be extended. [Existing assertions](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/test/srcly/value-flow.test.ts#L65-L90) [Requeue logic][R-SLICE]

### F5 — unavailable library boundary

```ts
import { opaqueTransform } from "unmodelled-package";
export function externalCase(input: string) {
  const output = opaqueTransform(input);          // F5.boundary
  return output;                                 // F5.output
}
```

Supply only a declaration for the external package in the integration fixture, with no source or model, and confirm it is not accidentally matched by a model row.

**From/to oracle:** input is passed to the external call; output is returned from it. Whether input semantically determines output is unknown from the available body/model. **Condition oracle:** the call site is unguarded relative to function entry and normal completion; external internal behavior and execution outcomes are unknown. This separates locally visible control from unknown library semantics.

**Negative:** no proven input→output transfer, no “no dependency” conclusion, no zero-stop successful answer that hides the boundary. If an assumed continuation is shown, label it assumed and preserve the boundary. Reuse existing external-call fixtures. [Existing cases](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/examples/value-flow-basics/src/external-calls.tsx#L1-L36)

### F6 — same property declaration, different receiver

```ts
class Box {
  value = "initial";
  set(v: string) { this.value = v; }              // F6.write
  get() { return this.value; }                    // F6.read
}
export function objects(input: string) {
  const first = new Box();
  const second = new Box();
  first.set(input);
  return second.get();
}
```

**From/to oracle:** input reaches first.value through first.set; second.value read through second.get originates from its own initializer in this closed snippet. A shared property declaration is insufficient to join them. **Condition oracle:** no local guard; object identity distinguishes the values. **Negative:** do not certify first.value→second.value. If the current abstraction admits a may-alias relation, show its abstraction/uncertainty and do not describe it as an actual producer. [Current member matching](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/program-evidence-collector-jsx-support.ts#L437-L451)

### F7 — Python closure and guarded callback

```python
def make_reader(value):
    state = {"value": value}
    def read():
        return state["value"]
    return read

def save_case(payload, allowed, persist):
    read = make_reader(payload)
    if allowed:
        return persist(read())
    return None
```

**From/to oracle:** payload→captured dictionary field→read() return→persist argument. The value returned by persist cannot be asserted to equal that argument without its implementation/model. **Condition oracle:** the persist invocation requires allowed to be truthy and normal evaluation of read. The closure body runs because read is called, not because it was defined. **Negative:** no unguarded persistence and no invented callback result. Provider inability to resolve persist must be explicit. Add a companion first-party persist body to distinguish a missing callback resolution from an actually unavailable library.

Python's current branch visitor marks tests but does not provide a general guard-to-write contract. Unknown Python proof kinds must retain unknown strength rather than defaulting to proven. [Python statement visitor](https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/python/srcly_pyfacts.py#L1442-L1552) [Proof registry][R-KINDS]

## 5. Reuse the audit's real questions

The source packet contains audit descriptions, not the audited application checkouts. These tasks therefore need their original applications and an independently captured source revision before running. Do not fabricate a current answer from screenshots. The audit answers below are **historical oracle seeds** that reviewers must revalidate.

| Task and starting action | Expected explanation to verify | Required challenge |
| --- | --- | --- |
| TSX T1: choose `/docs/[id]` in the route picker; explain what data drives it. | params.id→resource→fetchDoc/database read→doc/Match child→title, metadata and DocumentViewer. | Separate value flow from render tree and resource activation; inspect one connection and return. |
| TSX T2: select DocumentViewer title; trace backward. | props.doc.title, its rendering routes/resources and database-read origins. | Keep alternate route/call-site witnesses distinct; do not merge them into one invocation. |
| TSX T3: select loaded doc; trace forward. | Match-related uses, d, title/meta, DocumentViewer and content-ID text. | Distinguish error/ready branches and material conditions; preserve named partial stops. |
| TSX T4: select updateDoc payload; trace forward. | parse and three historically named writes: doc update, action event, daily activity upsert. | Explain action-wrapper dead ends without treating unrelated wrapper uses as payload consumers; identify write conditions in source. |
| Python P1: SECRET_KEY or User.email forward. | Source to consumer categories with folded scopes and terminal sources. | A folded summary is not an internally connected value; inspect two raw members. |
| Python P2: Mealie req through nested create callback. | Captured request to scraper/network; remaining callback-return boundary named. | Do not mark the later database create proven without its callback binding. |
| Python P3: create_one effects, or PostDocumentView.post forward. | Distinguish direct/latent external effects, inputs and partial boundaries. | Python functionEffects is unavailable at baseline; do not score a fabricated effects panel as implemented. |

[TSX audit tasks/results][R-TSX] [Python audit and remaining gaps][R-PY] [Effects operation][R-EFFECTS]

## 6. Task script and mock screen states

For every representation, use the same four prompts: **(1)** state the selected question and give a from/to answer; **(2)** inspect one hidden relationship or condition; **(3)** open the exact supporting source and explain its status; **(4)** return and confirm root, direction, selected evidence and viewport. Do not coach the correct path. Ask “What could make this answer wrong?” only after the initial answer, to avoid supplying the condition clue prematurely.

| Representation | Initial and expansion state | Source inspection and return state |
| --- | --- | --- |
| A0 current graph | Seed and folded frames; user selects a connection/box in the existing inspector. Expansion opens one frame. Capture what the baseline actually says about proof; do not add proposed labels. | Open an available source link. Return using current history; record whether selected edge/frame/camera are retained. If the baseline cannot open a particular contributing occurrence, record failure rather than simulating it. |
| B producer-first prototype | Initial: draft→persist, selected root/direction and a visible “conditions not analyzed” notice in Track E. Expand Conditions: show unavailable evidence plus source; in Track H show canSave=true and dirty=true as explicit prerequisites. | Inspect the predicate and write spans, preserving producer selection. Return restores expansion and selected witness; changing direction reruns the root question rather than silently rerooting. |
| C source-first prototype | Initial: rows for draft, argument transfer and persist site, ordered as explanation only. Separate condition/identity groups. Expand a call row into its selected occurrence, without mixing two calls. | Source pane focuses the selected span; optional graph shows only that witness. Return restores row, ancestor expansions and scroll position. |
| A1 first-slice check | Select a folded connection; card lists N contributing relations and their kinds, hidden steps, proof strengths and query identity. No certified-path claim. | Open the second occurrence, then return to the same card/member/camera. A new generation shows stale state and refreshes explicitly. |

These are testable mock states, not screenshots of completed implementation. `ui-patterns.md` contains the full annotated state designs and a companion vector storyboard in the ZIP.

## 7. Measures and capture sheet

| Measure | Operational definition | Capture rule |
| --- | --- | --- |
| Answer correctness | Required producer/consumer endpoints, witness links, conditions and boundaries identified. | Score content separately: complete correct, correct but incomplete, explicit unknown, incorrect. Preserve transcript and oracle comparison. |
| False unconditional claim | User or UI says a guarded/activated write occurs without its required qualifier. | Binary per task plus exact offending statement. An unexpanded condition that is visibly unknown is not itself a false claim. |
| Incompatible-context path | Claimed chain crosses a forbidden call/receiver/query boundary. | Count per claimed chain; hard semantic failure for certified UI paths. |
| Relationships inspected | Distinct evidence relations actually read/opened, including revisits. | Log unique and total separately; node count is not a substitute. |
| Expansions | Explicit frame/row/condition/identity expansions and collapses. | Separate query-triggering expansions from local disclosure. |
| Time to correct explanation | Task start until first oracle-correct answer including material qualifiers. | Stop at 8 minutes; mark censored, never treat an incorrect fast answer as success. Also record user work excluding engine wait. |
| Orientation errors | Wrong root, direction, call instance, generation, source location or failed return requiring recovery. | Record each type, recovery action and time. |
| Cold/warm cost | Startup/index, query, serialize/transfer, projection/layout and first useful paint. | Record independently; warm repeats cannot stand in for cold startup. |
| Accessibility/readability | Keyboard path, visible focus, long names, 1440×900 and 1024×768/narrow pane; non-color status comprehension. | Report observed failures; do not infer accessibility from screenshot appearance. |

Reuse the audits' seven 0–4 dimensions: Start, Answer, Focus, Reading, Honesty, Parts and Next. Supply anchored scoring examples before scoring and retain the individual dimensions; a summed score must not offset an Honesty failure with attractive layout. Historical 77/112 and Python scores are contextual baselines, not a controlled comparison. [Audit rubric context][R-TSX] [Python audit][R-PY]

Suggested record schema: `participant, task, fixtureRevision, variant, evidenceTrack, order, generation, engineOutcome, answerClass, falseUnconditional, incompatiblePaths, relationsUnique, relationsTotal, expansionsLocal, expansionsQuery, elapsedMs, waitMs, orientationErrors, coldPhaseMs, warmPhaseMs, rubric, notes`. Keep absence as null/unknown; do not enter zero for an unmeasured phase.

## 8. Bounded execution and decision gates

1. **Semantic gate:** Codex adds/extends the fixture oracles and projection regressions on a complete checkout. Assert forbidden paths, preservation of every raw relation, named missing evidence, serial/alternative distinction and generation mismatch behavior. Candidate guarantees must pass both positive and negative cases before user interpretation testing. Record A0-E's existing failures without silently repairing the frozen baseline; the comparison must not imply that A0 passed a gate it demonstrably failed.
2. **Walkthrough gate:** one maintainer and one independent reviewer perform all seven small fixtures and the source/return sequence. Correct misleading labels before spending participant time. This is review, not a performance study.
3. **Qualitative comparison:** recruit 6–8 developers if practical. Counterbalance A0/B/C order with a Latin-square assignment and use equivalent variants of small fixtures to limit learning. Pair real audit tasks across participants; avoid every participant memorizing the same answer in all views. Record prior Srcly/language familiarity. If only the owner participates, report a single-person walkthrough and do not generalize.
4. **Latency sample:** on one recorded machine/compiler/source revision, collect five cold starts and twenty warm repetitions of representative queries. Separate engine-cache reuse from client-cache returns. Report medians and observed ranges; a small sample does not justify a stable tail percentile. Budget-cut and cancelled requests are a separate cohort.
5. **Decision meeting:** inspect correctness and failed cases first, then interaction/time costs and rubric evidence. Record rejected alternatives and uncertainty, not a single composite winner.

**Hard rejection gates:** any certified incompatible path; hidden material unsupported boundary; a systematic false unconditional claim; lost source anchoring; stale evidence joined to a newer graph. If a defect occurs, fix it and rerun the affected semantic cases before interpreting timing.

**Prospective improvement thresholds, not observed results:** consider changing the default only if B or C improves complete correct answers on at least two of the four TSX task families, does not reduce correctness on the remaining families or representative Python cases, and introduces no hard-gate failures. A roughly 20% median task-time or inspection reduction is a useful practical signal only for matched task/participant pairs where both answers are correct (or matched equivalent fixtures), not a statistical claim with this sample. Report incorrect and censored counts separately so different solved-task subsets do not bias timing. If correctness is tied and the alternative adds expansions/source jumps, retain A0. A1 can ship independently only if its connection explanations help without violating the same honesty gates.

For A1 payload/cost, provisionally investigate if preserving contributors adds more than 25% to warm-query median or makes response size exceed the existing 8 MiB anchor limit on representative audit queries. These are design tripwires to trigger explicit pagination/detail-query design, not reasons to truncate evidence silently. Any changed limit must produce a visible coverage outcome.

## 9. Final run ledger for this assignment

| Work | Status | Evidence |
| --- | --- | --- |
| Pinned packet and selected source inspection | Completed | Pinned line references and source index. |
| Primary-source comparative research | Completed | Official documentation, source and figures; no hands-on product runs. |
| Four synthetic pure projection checks | Executed | Harness, source hashes and output JSON in ZIP. |
| Proposed fixture engine tests | Not run | F1–F7 and expected/forbidden witnesses above. |
| Browser/source-return/keyboard tests | Not run | Task scripts and gates above; existing test sources inspected. |
| Runtime/cold-warm benchmarks | Not run | Sampling protocol above. |
| Human evaluation and default-view decision | Not run | No speedup, superiority or rollout approval claimed. |

## References used in this document

[EXT01]: https://docs.solidjs.com/reference/basic-reactivity/create-resource
[R-ADAPTER]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L21-L207
[R-ANCHORCONTRACT]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/contracts/anchor-graph.ts#L39-L125
[R-EFFECTS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/function-effects.ts#L1-L55
[R-KINDS]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/kinds.ts#L8-L211
[R-MULTI]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/multiAnchorAdapter.ts#L1-L64
[R-PY]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/python-dataflow-audit-2026-10/README.md#L255-L327
[R-REACH]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/reach.ts#L1-L85
[R-SLICE]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L92-L562
[R-TSX]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/docs/research/tsx-dataflow-audit-2026-10/README.md#L17-L136
