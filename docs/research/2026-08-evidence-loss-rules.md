# Evidence-loss analysis: rules and product integration options

> Written in tsx-data-flow (`docs/evaluations/`) on 2026-08-15 and copied here when that repository was archived. In this doc, "tsx-data-flow" now means Srcly's `engine/`.

Date: 2026-08-15

## Recommendation

Build evidence loss as a shared analyzer capability. Do not begin with a new page.

The analyzer should record evidence transitions on existing value trajectories. It should then expose the same facts through three current product surfaces:

1. **Findings** groups consequential evidence-loss sequences into ranked work items.
2. **Trajectories** shows the full before-and-after evidence ledger for a selected flow.
3. **File detail** anchors each transition to the responsible source expression.

Also add a dedicated Markdown and JSON report. Treat that report as an export and automation boundary, not a separate browser destination.

This hybrid scores **8.8/10** across the evaluation dimensions below. It preserves current navigation, supports deep inspection, and leaves room for a dedicated page later.

## Problem and desired outcome

TypeScript code often begins with more evidence than it retains.

A value can have known fields, literal keys, a checked schema, or a precise union. Later code can widen it to `unknown`, `object`, `any`, or an open dictionary. Downstream code then restores the claimed shape through assertions, lookups, repeated guards, or fallback logic.

The suspicious sequence is:

```text
known value
  -> broad or opaque contract
  -> evidence disappears
  -> downstream code compensates
  -> assertion or lookup claims to restore evidence
```

The product should answer five questions:

1. What evidence existed before the transition?
2. Where did that evidence disappear?
3. Was the loss required by a real boundary?
4. How did downstream code recover or replace it?
5. Which consumers and files inherit the cost?

The product must not treat every `unknown`, assertion, dictionary, or serialization step as a defect.

## Terminology

### Evidence

Evidence is information the TypeScript checker or a validated boundary can establish about a value.

Examples include:

- a known object symbol;
- a closed field set;
- literal object keys;
- a discriminated union member;
- nullability status;
- collection element type;
- a branded or parsed value;
- field provenance from an upstream object.

### Evidence loss

Evidence loss occurs when a transition makes established information unavailable to later analysis or consumers.

Examples include:

- `User` becoming `unknown`;
- `{ start: Handler }` becoming `Record<string, Handler>`;
- a closed DTO becoming `Record<string, unknown>`;
- a validated union becoming `object`;
- a typed object becoming an untracked string;
- a value crossing an unresolved external call.

### Evidence recovery

Evidence recovery occurs when later code claims or proves a more precise shape.

Recovery can be:

- **validated**, through a schema, type guard, or checked parser;
- **derived**, through property access or a typed lookup;
- **asserted**, through `as`, a generic claim, or an unchecked cast;
- **reconstructed**, through a merge, lookup, or repacking step;
- **unknown**, when the analyzer cannot prove the mechanism.

### Consequential loss

Not all loss deserves a finding. Evidence loss becomes consequential when it causes one or more downstream effects:

- an unchecked assertion;
- repeated guards or normalization;
- inconsistent fallbacks;
- lost selected-field identity;
- a later lookup to recover discarded data;
- new unknown edges;
- broad fan-out from an opaque boundary;
- incomplete route or consumer proof.

## Proposed rule family

These rules are analyzer capabilities, not direct ports of upstream Oxlint rules.

Each rule should emit facts first. It should create a finding only when path evidence establishes a downstream consequence.

| Rule ID | Core question | Default evidence level | Initial disposition |
| --- | --- | --- | --- |
| `evidence/known-value-widening` | Did a precise value enter a broader contract? | Strong or proven | Finding only with downstream cost |
| `evidence/widen-then-assert` | Did code erase evidence and later assert it back? | Proven for local closed paths | High-priority finding |
| `evidence/chained-assertion` | Does an assertion chain bridge incompatible shapes? | Advisory or strong | Attach to the containing trajectory |
| `evidence/unsafe-dictionary-boundary` | Did a closed object become an open dictionary? | Strong | Finding when field identity matters downstream |
| `evidence/unknown-contract-leak` | Did `unknown` escape a true boundary into internal code? | Strong | Finding when callers compensate |
| `evidence/unverified-assertion` | Does an assertion lack a provable validating invariant? | Advisory or strong | Explain the missing proof |
| `evidence/opaque-round-trip` | Did structure become opaque and later structured again? | Strong | Finding when the round trip adds uncertainty |
| `evidence/drop-then-recover` | Were fields dropped and later restored or looked up? | Proven or strong | High-priority grouped finding |

## Rule 1: known-value widening

### Intent

Find transitions where the source has more useful evidence than the declared target contract.

The rule should compare checker types. It should not rely only on syntax names.

### Candidate

```ts
const handlers: Record<string, Handler> = {
  start: startHandler,
  stop: stopHandler,
};

run(handlers.start);
```

The object literal has a closed `start | stop` key set. The annotation replaces that set with arbitrary strings.

### Better preservation

```ts
const handlers = {
  start: startHandler,
  stop: stopHandler,
} satisfies Record<string, Handler>;

run(handlers.start);
```

`satisfies` checks the value contract without discarding the known keys.

### Legitimate control

```ts
function registerHandlers(
  handlers: Readonly<Record<string, Handler>>,
): void {
  for (const [name, handler] of Object.entries(handlers)) {
    registry.set(name, handler);
  }
}
```

This function owns an extensible registry boundary. The broad contract is part of its purpose.

### Finding threshold

Create a finding only when widening causes a downstream effect. Examples include an unchecked key read, lost exhaustiveness, repeated existence checks, or a later narrowing assertion.

## Rule 2: widen then assert

### Intent

Find a value that becomes broader and later returns to a compatible earlier shape through an assertion.

### Candidate

```ts
const parsed: User = parseUser(payload);
const stored: unknown = parsed;

saveUser(stored as User);
```

The code already had a `User`. It discarded that evidence and later claimed it again.

### Better preservation

```ts
const parsed = parseUser(payload);
saveUser(parsed);
```

### Legitimate control

```ts
const cached: unknown = await cache.get(key);
const user = userSchema.parse(cached);

saveUser(user);
```

The cache is a real untyped boundary. Schema parsing establishes new evidence.

### Finding threshold

This rule can produce a high-confidence finding when all these conditions hold:

- source and recovered types are checker-compatible;
- the path between them has no validating boundary;
- the widening step is first-party code;
- the assertion is reachable from the widened value;
- the path does not cross intentional serialization or external storage.

## Rule 3: chained assertions

### Intent

Find assertion chains that use a broad intermediate type to bypass compatibility checks.

### Candidate

```ts
const user = input as unknown as User;
```

The `unknown` bridge does not add evidence. It only permits the second assertion.

### Better boundary

```ts
const user = userSchema.parse(input);
```

### Legitimate control

```ts
// A third-party declaration omits the runtime field added by its documented plugin API.
const pluginResult = rawResult as unknown as PluginResultWithMetadata;
```

This case can remain advisory. The analyzer cannot verify the external invariant.

### Finding threshold

Treat a chain as strong evidence only when the source has an incompatible known type and no boundary validator exists.

Do not report `as const` as evidence loss.

## Rule 4: unsafe dictionary boundary

### Intent

Find closed objects that cross open dictionaries and lose field-level identity.

### Candidate

```ts
type RoutePayload = {
  projectId: string;
  ownerId: string;
};

function enqueue(payload: Record<string, unknown>): void {
  queue.push(payload);
}

enqueue(routePayload);
```

The queue no longer expresses which fields exist or what each field means.

### Better contract

```ts
type QueueItem =
  | { kind: "route"; payload: RoutePayload }
  | { kind: "refresh"; payload: RefreshPayload };

function enqueue(item: QueueItem): void {
  queue.push(item);
}
```

### Legitimate control

```ts
function parseJsonObject(value: unknown): Record<string, unknown> {
  return jsonObjectSchema.parse(value);
}
```

This helper owns a generic JSON-object boundary. The open dictionary is its declared output.

### Finding threshold

Escalate only when a known field crosses the dictionary and later consumer proof becomes partial or requires assertions.

## Rule 5: unknown contract leak

### Intent

Distinguish correct boundary use of `unknown` from internal contracts that spread uncertainty.

### Candidate

```ts
function loadCurrentUser(): unknown {
  return currentUser;
}

const user = loadCurrentUser() as User;
```

The function hides a known internal type. Its caller must restore it.

### Better contract

```ts
function loadCurrentUser(): User {
  return currentUser;
}
```

### Legitimate control

```ts
function parseRequestBody(body: unknown): RequestBody {
  return requestBodySchema.parse(body);
}
```

Unknown input belongs at this external boundary. The function does not return uncertainty.

### Finding threshold

Report `unknown` only when it crosses from a boundary owner into internal consumers. Parameter or return syntax alone is insufficient.

## Rule 6: unverified assertion

### Intent

Explain which invariant an assertion requires and whether preceding code proves it.

### Candidate

```ts
const location = value as SourceLocation;
```

The assertion claims that `value` contains valid path, line, and column fields.

### Verified alternative

```ts
const location = sourceLocationSchema.parse(value);
```

### Checked local invariant

```ts
if (!isSourceLocation(value)) return null;
const location: SourceLocation = value;
```

### Product behavior

Do not require a magic `SAFETY:` comment. Instead show:

- required target invariant;
- preceding validations found on the path;
- remaining unproven fields or union members;
- downstream consumers that depend on the claim.

## Rule 7: opaque round trip

### Intent

Find structured values that become opaque and later regain structure.

### Candidate

```ts
const serialized = JSON.stringify(user);
const restored = JSON.parse(serialized) as User;
renderUser(restored);
```

Serialization removes checker-visible structure. The assertion claims that JSON preserved the full contract.

### Better boundary

```ts
const serialized = JSON.stringify(user);
const restored = userSchema.parse(JSON.parse(serialized));
renderUser(restored);
```

### Legitimate control

Serialization can be necessary for storage or transport. The product should show it as an ordinary transition when validation exists.

### Finding threshold

Escalate when structured access resumes without validation, or when serialization causes repeated downstream defenses.

## Rule 8: drop then recover

### Intent

Find fields removed from a value and later restored through lookup, merge, or repacking.

### Candidate

```ts
const selected = projects.map((project) => ({
  id: project.id,
  selected: project.id === selectedId,
}));

const cards = selected.map((item) => ({
  ...item,
  project: projects.find((project) => project.id === item.id),
}));
```

The first map drops the project. The second map searches the original collection to recover it.

### Better preservation

```ts
const cards = projects.map((project) => ({
  project,
  selected: project.id === selectedId,
}));
```

### Legitimate control

An ID-only boundary can be correct for URLs, persistence, worker messages, or cache keys. Recovery at the owning boundary is expected.

### Finding threshold

Create a finding when field provenance proves the round trip and no real boundary requires the reduced form.

Group all affected sinks under the common upstream transition.

## Evidence model

The existing graph records operations, source locations, types, unknown edges, defenses, and representation steps. Evidence-loss analysis should add a semantic projection.

```ts
type EvidenceCertainty = "proven" | "strong" | "advisory" | "unknown";

interface ValueEvidenceSnapshot {
  typeText: string;
  symbolKey: string | null;
  kind: "primitive" | "object" | "collection" | "union" | "opaque" | "unknown";
  fields: ReadonlyArray<{
    name: string;
    typeText: string;
    optional: boolean;
    provenance: string | null;
  }>;
  literalKeys: readonly string[];
  nullable: boolean;
  openDictionary: boolean;
}

interface EvidenceTransition {
  kind:
    | "preserve"
    | "narrow"
    | "widen"
    | "erase"
    | "validate"
    | "assert"
    | "serialize"
    | "restore"
    | "unknown";
  before: ValueEvidenceSnapshot;
  after: ValueEvidenceSnapshot;
  location: { file: string; line: number; column: number };
  certainty: EvidenceCertainty;
  reason: string;
  disproof: string | null;
}
```

This model should remain internal to the analyzer. API DTOs should use bounded field lists and truthful total counts.

## Finding model

A transition is a fact. A finding is a consequential sequence of facts.

```ts
interface EvidenceLossFinding {
  ruleId: string;
  causeTransitionId: string;
  recoveryTransitionIds: readonly string[];
  affectedSinkIds: readonly string[];
  affectedFiles: readonly string[];
  certainty: EvidenceCertainty;
  consequence:
    | "unchecked-assertion"
    | "repeated-normalization"
    | "field-identity-loss"
    | "lookup-recovery"
    | "unknown-edge"
    | "incomplete-proof";
  summary: string;
  disproof: string | null;
}
```

Finding identity only needs to be stable within an analysis generation. Change comparison can use source anchors and match confidence.

## Product integration options

The following options differ in ownership and user workflow. They are not only visual variants.

### Option 1: linter-only rules

**Core move:** Port selected rules into ESLint or add the Oxlint plugin. Show diagnostics during normal lint runs.

- **Makes easier:** Fast adoption and editor feedback.
- **Main catch:** Local syntax cannot explain cross-file loss, recovery, or downstream reach.
- **Best fit:** Simple code-style enforcement outside the product.

This option can test candidate volume. It should not become the product authority.

### Option 2: existing Findings report only

**Core move:** Add evidence-loss detectors to existing ranked findings. Each item links to source and shows affected sinks.

- **Makes easier:** Reuses the current cleanup workflow and Markdown handoff.
- **Main catch:** A single finding row cannot explain every ordinary transition.
- **Best fit:** A small first product proof.

This option is materially better than linter-only integration because it can use graph evidence.

### Option 3: dedicated Evidence Loss report

**Core move:** Add `evidence-loss` to the report registry. Provide tables, grouped causes, and Markdown output.

- **Makes easier:** Focused review, automation, and export.
- **Main catch:** It adds another report destination while report navigation is already being simplified.
- **Best fit:** Teams that consume reports more than interactive trajectories.

The report is valuable as an output contract. A browser tab is not required initially.

### Option 4: Trajectories evidence lens

**Core move:** Add evidence transitions and findings to the current route trajectory inspector.

- **Makes easier:** Users can see loss and recovery in full source-to-consumer context.
- **Main catch:** Route trajectories do not cover every generic TypeScript path today.
- **Best fit:** The product's strongest selected-source and field-flow workflows.

This option best demonstrates why evidence loss matters instead of listing suspicious syntax.

### Option 5: new Evidence Explorer page

**Core move:** Create a standalone workspace for browsing types, fields, transitions, causes, and consumers.

- **Makes easier:** Deep exploration across the entire project.
- **Main catch:** It requires new navigation, selection state, APIs, layout, and user mental models.
- **Best fit:** A later mature capability with high finding volume and distinct workflows.

This is the most ambitious option. It should follow evidence that current surfaces cannot support the job.

### Option 6: change-review-only lens

**Core move:** Report evidence loss only when a change introduces or worsens it.

- **Makes easier:** High signal during agent and pull-request review.
- **Main catch:** It hides valuable pre-existing architecture and depends on change attribution.
- **Best fit:** Regression prevention after the base capability exists.

This should become a second lens, not the only product surface.

### Option 7: layered hybrid

**Core move:** Compute one shared evidence model. Project it into Findings, Trajectories, file detail, and report exports. Add change attribution later.

- **Makes easier:** Each current surface handles the part it already does well.
- **Main catch:** The shared domain model requires more care than one isolated report.
- **Best fit:** The existing product and its source-to-consumer differentiation.

This option avoids a new page while preserving a clean path to one.

## Evaluation dimensions

Each dimension uses a 0–10 score. A higher score is better.

| Dimension | Weight | What a 10 means |
| --- | ---: | --- |
| Semantic precision | 20% | Uses checker, path, boundary, and consumer evidence |
| Product differentiation | 15% | Shows value that generic lint and IDEs do not show |
| Workflow fit | 15% | Fits how users already inspect and act on findings |
| Discoverability | 10% | Users can find the capability without prior knowledge |
| Explainability | 10% | Shows cause, transition, recovery, consequence, and uncertainty |
| Architecture reuse | 10% | Reuses current analyzer, DTO, report, and UI boundaries |
| Implementation ease | 10% | Has a small, reviewable, and reversible first slice |
| Performance safety | 5% | Supports bounded queries and avoids duplicate whole-project work |
| Extensibility | 5% | Supports new frameworks, change review, and future evidence types |

## Scored comparison

| Option | Precision | Differentiation | Workflow | Discovery | Explanation | Reuse | Ease | Performance | Extension | Weighted result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1. Linter only | 4 | 3 | 8 | 7 | 5 | 3 | 8 | 9 | 6 | **5.5** |
| 2. Findings only | 8 | 7 | 8 | 8 | 7 | 9 | 7 | 7 | 7 | **7.7** |
| 3. Dedicated report | 8 | 8 | 6 | 7 | 9 | 7 | 5 | 7 | 8 | **7.3** |
| 4. Trajectories lens | 9 | 10 | 9 | 7 | 10 | 9 | 5 | 6 | 9 | **8.5** |
| 5. New explorer page | 9 | 9 | 5 | 9 | 10 | 5 | 2 | 5 | 10 | **7.3** |
| 6. Change-review only | 9 | 9 | 8 | 6 | 9 | 7 | 4 | 6 | 8 | **7.7** |
| 7. Layered hybrid | 9 | 10 | 10 | 9 | 10 | 9 | 4 | 6 | 10 | **8.8** |

Scores reflect the current repository. They are not general ratings for other products.

## Interpretation of the scores

### Why linter-only scores low

Lint is easy to run, but it cannot establish the product's most useful claim. It sees suspicious syntax without full consumer context.

Use lint only as a temporary candidate-volume probe or a narrow code-quality rule.

### Why a dedicated report does not win

A report offers excellent explanation and automation. It fragments the interactive workflow and adds another destination.

The report format should exist. The browser page should wait.

### Why the trajectory lens scores highly

Evidence loss is a sequence. The trajectory inspector already presents sequences, boundaries, gaps, findings, and source selection.

Its main limitation is coverage. It currently focuses on route and selected-source flows.

### Why the hybrid wins

The hybrid separates three jobs:

- Findings answers, “What should I inspect first?”
- Trajectories answers, “What happened along this value path?”
- File detail answers, “Which expression caused it?”

The Markdown and JSON report then supports agents and automation without requiring another browser destination.

## Recommended hybrid shape

### Analyzer ownership

Add evidence snapshots and transitions under `src/analysis`. Reuse the current TypeScript programs, graph, source locations, and boundary classification.

Do not create a second Compiler API engine.

### Findings projection

Add grouped evidence-loss opportunities to the existing finding model.

Each work item should show:

- rule family;
- cause location;
- lost evidence summary;
- recovery mechanism;
- downstream consequence;
- sink and file reach;
- evidence level;
- disproof condition;
- first inspection link.

One cause affecting many sinks must remain one work item.

### Trajectories projection

Add an optional **Evidence** lens to the current trajectory inspector.

The lens should show a compact ledger:

```text
Project
  --pick id--> { id: ProjectId }
  --open dictionary--> Record<string, unknown>
  --assert--> ProjectReference
  --lookup by id--> Project
```

Use explicit labels:

- Preserved
- Narrowed
- Widened
- Erased
- Validated
- Asserted
- Restored
- Unknown

Ordinary transitions remain visible without receiving warning styling.

### File-detail projection

Selecting a transition should open the existing file workspace at the exact expression.

The detail panel should show:

- before and after evidence;
- field additions and removals;
- validation or assertion evidence;
- downstream consumers;
- related transitions in the same sequence;
- why the item is or is not a finding.

### Report and automation projection

Add dedicated Markdown and JSON outputs for evidence loss.

The report should group by cause, not by sink. It should remain useful without the browser.

Suggested sections:

1. consequential evidence loss;
2. validated boundary transitions;
3. advisory assertion chains;
4. incomplete traces;
5. reproduction settings and scope.

### Change-review projection

After the base model is reliable, add evidence transitions to change-oriented analysis.

Distinguish:

- introduced loss;
- worsened loss;
- removed loss;
- downstream propagation into unchanged code;
- possibly related opaque paths;
- pre-existing loss.

## Should this become a new report or page?

### Dedicated report: yes

Create a dedicated report contract because the data has a coherent automation use case.

The report can serve:

- agent handoff;
- baseline comparison;
- CI review;
- saved evaluation artifacts;
- future change-oriented analysis.

### Dedicated browser report tab: not initially

The existing report system already has many views under migration. Adding another tab would work against current simplification.

Expose the report through Markdown, JSON, and links from findings first.

### Dedicated page: only after measured demand

Create a standalone page only when at least two of these conditions are true:

- users frequently begin with evidence loss instead of a route or file;
- non-route evidence paths become a primary workflow;
- grouped findings exceed the current report's usable density;
- users need project-wide type and field search;
- the trajectory inspector cannot represent branching recovery paths;
- saved filters and cross-run comparisons become central.

Until then, a new page would add navigation before proving a distinct job.

## First proof

### Question

Does checker-backed evidence loss produce useful findings beyond current representation-churn and unknown-edge reports?

### Smallest proof

Implement one vertical detector:

```text
closed object
  -> open dictionary or unknown
  -> selected field or object assertion
  -> real JSX consumer
```

Use existing source-to-sink paths. Do not add a new browser route.

### Required cases

1. **Positive:** a real value loses closed fields and later uses an unchecked assertion.
2. **Negative precision:** a generic JSON boundary parses or validates before use.
3. **Normal control:** a direct typed value reaches the same consumer without evidence loss.

### Pass criteria

The slice passes when:

- the positive case attaches to a real consumer;
- the negative case stays non-finding but remains browsable;
- the normal control has no evidence-loss transition;
- the finding shows exact source locations and a disproof condition;
- existing representation and unknown-edge facts remain intact;
- runtime stays bounded on a representative project.

### Failure decision

If most candidates are legitimate boundaries, keep evidence transitions as browsable facts. Do not create a new finding family.

## How to make this go better

- **Reuse the existing compiler lifecycle.** A second scanner would create conflicting project and freshness rules.
- **Prove one sequence before designing a catalog.** Start with closed object to broad boundary to unchecked recovery.
- **Keep facts separate from findings.** This prevents ordinary serialization and boundary parsing from becoming warnings.
- **Group by the first consequential cause.** Do not create one warning for every downstream sink.
- **Make uncertainty visible.** Every opaque edge needs a reason and a disproof condition.
- **Delay the new page.** Current surfaces can test product value without new navigation or state ownership.

## Main risks

### Type comparison cost

Expanding full recursive types can be expensive and unstable. Use shallow normalized snapshots with capped fields.

### False positives at real boundaries

JSON, storage, workers, HTTP, plugins, and runtime feature checks can require evidence loss. Boundary ownership must affect severity.

### Mistaking equivalence for uselessness

Equivalent before and after shapes do not prove that a transformation is unnecessary. Show the sequence as a fact unless downstream cost exists.

### Duplicate findings

Evidence loss can overlap representation churn, unknown edges, defensive ledgers, and field-flow gaps. Prefer attachments to existing causes where possible.

### Unstable public payloads

Raw checker types and symbols are generation-local. Project bounded semantic summaries through DTOs.

### UI overload

Long type ledgers can overwhelm trajectory inspection. Default to consequential transitions and allow ordinary steps on demand.

## Below the cut line

Do not include these in the first proof:

- automatic code fixes;
- a general rule-plugin framework;
- a standalone Evidence Explorer page;
- Git or pull-request integration;
- durable cross-commit finding IDs;
- exhaustive recursive type visualization;
- all eight rule families;
- non-TypeScript language support;
- CI failure thresholds;
- blanket bans on `unknown`, assertions, dictionaries, or `typeof`.

## Final decision

The best approach is a layered hybrid with one source of semantic truth.

Build evidence snapshots and transitions inside the existing analyzer. First expose consequential sequences as grouped Findings. Add the full ledger to Trajectories and exact expressions to file detail. Generate a dedicated Markdown and JSON report for agents and automation.

Do not add a dedicated browser page in the first release. Add one only when usage proves that evidence loss is a distinct starting workflow.

This shape preserves the product's advantage: it explains not only that a broad type or assertion exists, but where evidence disappeared, how it returned, and which real consumers inherited the cost.

## Related documents

- [`2026-08-agent-quality-tools-review.md`](2026-08-agent-quality-tools-review.md)
- [`type-shape-transformation-tracing.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/plans/type-shape-transformation-tracing.md)
- [`change-oriented-analysis-review.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/plans/change-oriented-analysis-review.md)
- [`application-structure.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/application-structure.md)
