# AI agent code-quality tools review

> Written in tsx-data-flow (`docs/evaluations/`) on 2026-08-15 and copied here when that repository was archived. In this doc, "tsx-data-flow" now means Srcly's `engine/`.

Date: 2026-08-15

## Scope

This report reviews two repositories:

- [`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop)
- [`typeonce-dev/ai-automation`](https://github.com/typeonce-dev/ai-automation)

The review compares each repository with `tsx-data-flow` in two ways:

1. Can the tool improve this project's code quality?
2. Can its ideas improve this project's static-analysis product?

The review used these upstream snapshots:

| Repository | Commit | Snapshot notes |
| --- | --- | --- |
| `anti-slop` | [`446268e`](https://github.com/dmmulroy/anti-slop/commit/446268e5d15baa968eaec669ff65358d36ae6259) | 15 custom Oxlint rules; private vendored package |
| `ai-automation` | [`0bca096`](https://github.com/typeonce-dev/ai-automation/commit/0bca096fe6fe9878cd15303a623dd2cd85915ddd) | 49 plugin rules, typed checks, diff checks, examples, and guidance |

Star counts and repository activity can change. This report treats them only as maturity signals.

## Executive conclusion

Neither repository should be installed wholesale.

`anti-slop` has one strong idea: preserve type evidence instead of discarding and recreating it. Several rules support this idea. However, most use local syntax instead of TypeScript's full semantic model. Some blanket bans conflict with valid parser, transport, and browser boundaries in this project.

`ai-automation` is more useful as an operating model and pattern library. Its best ideas are generated capability catalogs, changed-file risk alerts, and positive/negative proof cases. Most shipped lint rules target Effect, React, XState, Next.js, or Tailwind. Those assumptions do not match this Solid project.

The highest-value direction is to strengthen `tsx-data-flow` around its existing advantage:

- keep checker-backed, cross-file evidence as the authority;
- add stable finding metadata and a generated capability catalog;
- add change-oriented analysis over the existing graph;
- detect proven type-evidence loss on source-to-render paths;
- keep broad or uncertain patterns advisory;
- use focused positive and negative fixtures for each semantic claim.

## Recommendation summary

| Priority | Recommendation | Code-quality value | Static-analysis value |
| --- | --- | --- | --- |
| 1 | Add a generated analyzer capability catalog | Medium | Very high |
| 2 | Add changed-file and changed-symbol risk alerts | High | Very high |
| 3 | Model type-evidence loss and recovery in existing paths | High | Very high |
| 4 | Add stable finding IDs and evidence metadata | Medium | Very high |
| 5 | Pilot selected evidence-preservation checks as advisory | High | High |
| 6 | Borrow positive/negative smoke-check discipline | Medium | High |
| Skip | Install every `anti-slop` rule as an error | Low | Low |
| Skip | Import the `ai-automation` typed engine | Low | Low |
| Skip | Import Effect, React, XState, Next.js, or Tailwind profiles | Negative | None |

## Current project baseline

`tsx-data-flow` already has a strong verification and analysis base.

The application pipeline is:

```text
project loading -> analysis domain -> server projections -> Zod DTOs -> Solid DOM/SVG
                                \-> Markdown/CLI
```

The boundary is documented in [`docs/application-structure.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/application-structure.md). The analyzer uses the TypeScript Compiler API directly. It resolves target-project TypeScript, supports multiple tsconfigs, and traces selected helpers across files.

Current static checks include:

- ESLint 9 and `typescript-eslint`;
- Solid-specific lint rules;
- unused-import enforcement;
- frontend import-boundary enforcement;
- a complexity ceiling;
- a file-length ceiling;
- direct-import enforcement with no barrel exports;
- separate server and frontend TypeScript checks.

See [`package.json`](https://github.com/byronwall/tsx-data-flow/blob/main/package.json) and [`eslint.config.js`](https://github.com/byronwall/tsx-data-flow/blob/main/eslint.config.js).

The analyzer already finds several patterns associated with generated code:

- type-impossible defensive checks;
- repeated fallbacks and normalization;
- representation churn;
- overpacked render models;
- broad fan-out and prop relays;
- repeated conditional forks;
- opaque boundaries and unknown edges;
- route and field-lineage gaps.

This matters because a generic linter would duplicate part of the product. New work should extend semantic path evidence instead.

## Repository 1: `anti-slop`

### What it adds

`anti-slop` is a custom Oxlint plugin. It rejects low-evidence TypeScript and JavaScript patterns. The project expects users to vendor and maintain its source. It is not a normal package dependency.

The installer skill copies the plugin, installs Oxlint dependencies, edits configuration, enables every rule, and validates the result. See the [README](https://github.com/dmmulroy/anti-slop/blob/main/README.md) and [installation skill](https://github.com/dmmulroy/anti-slop/blob/main/skills/install-anti-slop/SKILL.md).

The plugin registers 15 rules in its [entry point](https://github.com/dmmulroy/anti-slop/blob/main/src/index.ts).

### Detailed rule breakdown

| Rule | What it detects | Local code-quality fit | Product fit | Decision |
| --- | --- | --- | --- | --- |
| [`no-chained-type-assertions`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-chained-type-assertions.ts) | Nested `as` or angle-bracket assertions. `as const` chains are allowed. | Can expose fabricated evidence. Some boundary casts are deliberate. | Good evidence-loss signal when attached to a path. | Pilot |
| [`no-conditional-empty-object-spread`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-conditional-empty-object-spread.ts) | Conditional object spreads with `{}` on either branch. | Clear readability rule. Baseline existing uses first. | Low. It is syntax style, not flow evidence. | Pilot locally |
| [`no-known-value-widening`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-known-value-widening.ts) | Known values assigned or returned through broad target types. | High potential. It can expose discarded key and value evidence. | High concept fit. The local analyzer can make it checker-backed and cross-file. | Pilot and adapt |
| [`no-module-mocking`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-module-mocking.ts) | Vitest and Jest module mock calls. | No current matching calls. It encodes a testing opinion. | None. | Skip |
| [`no-object-parameters`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-object-parameters.ts) | Function parameters typed as `object`, including some local aliases. | Narrow API hygiene benefit. | Weak. It lacks route or path context. | Skip |
| [`no-reflect-apply`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-reflect-apply.ts) | Global `Reflect.apply` calls. | Clear rule, but no current use. | None. | Skip |
| [`no-reflect-get`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-reflect-get.ts) | Global `Reflect.get` calls. | Clear rule, but no current use. | None. | Skip |
| [`no-runtime-typeof`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-runtime-typeof.ts) | Most runtime `typeof` checks. An option permits checks in type guards. | Poor fit. This project has valid parser, server, browser, and SSR checks. | Harmful as a blanket rule. Boundary classification is better. | Skip |
| [`no-shape-in-symbol-names`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-shape-in-symbol-names.ts) | The substring `shape` in identifiers and JSX names. | Direct conflict. Shape is a valid analysis term here. | None. | Skip |
| [`no-unknown-parameters`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-unknown-parameters.ts) | Explicit `unknown` parameters, except a parameter named `cause`. | Poor fit. Unknown input is correct at many external boundaries. | Boundary placement matters more than the type alone. | Skip |
| [`no-unknown-returns`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-unknown-returns.ts) | `unknown`, `Promise<unknown>`, and simple aliases in return contracts. | Useful for internal helpers. External adapters can need it. | Useful as contract-leak evidence on a participating path. | Pilot |
| [`no-unknown-type-aliases`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-unknown-type-aliases.ts) | Non-generic aliases that conceal `unknown`. | Narrow and understandable. Cross-file aliases are a limitation. | Small supporting signal. | Pilot |
| [`no-unsafe-dictionary-type`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-unsafe-dictionary-type.ts) | Dictionaries containing `unknown`, `any`, `object`, `{}`, or equivalents. | Useful in DTOs. Likely noisy in dynamic reports and validators. | High if the dictionary erases selected-field identity. | Pilot by directory |
| [`no-widen-then-assert`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/no-widen-then-assert.ts) | Local values widened to broad types and asserted back later. | The best rule in this set. It detects evidence loss and reconstruction. | Very high concept fit. Extend it across graph edges. | Prioritize concept |
| [`require-safety-comment-for-type-assertion`](https://github.com/dmmulroy/anti-slop/blob/main/src/rules/require-safety-comment-for-type-assertion.ts) | Missing nearby `SAFETY:` comments before non-const assertions. | Blanket use would create comment noise. A comment does not prove safety. | The invariant-explanation model is useful in finding output. | Borrow idea |

### Best ideas from `anti-slop`

#### 1. Evidence loss is more important than suspicious syntax

`no-known-value-widening` and `no-widen-then-assert` target a useful failure sequence:

```text
known value -> broad contract -> lost evidence -> assertion restores claimed evidence
```

This sequence maps well to the graph model in `tsx-data-flow`. The current analyzer can improve it by using:

- cross-file symbols;
- actual TypeScript assignability;
- source-to-sink participation;
- boundary ownership;
- explicit evidence gaps;
- downstream field effects.

The product should report evidence erasure only when it matters to a selected path. This avoids generic lint noise.

#### 2. Assertions need an explicit invariant

The `SAFETY:` rule has the wrong enforcement level for this project. Its diagnostic wording still offers a useful pattern.

A future assertion finding should state:

- which evidence existed before the assertion;
- which evidence was lost;
- what runtime validation occurred;
- which invariant the assertion assumes;
- whether the analyzer can verify that invariant.

#### 3. Vendoring makes policy visible

Vendoring keeps rule behavior reviewable and adaptable. It also creates maintenance cost and source duplication. For this project, selected ideas should enter existing modules instead.

### Risks and limitations

- Most rules inspect one file and local declarations.
- The rules do not provide cross-file route or render-path proof.
- Several rules encode subjective style as universal safety.
- Blanket bans confuse valid boundaries with weak internal contracts.
- A `SAFETY:` comment can claim an invariant without proving it.
- The repository is early and has no stable release contract.
- The project uses Oxlint, while `tsx-data-flow` currently uses ESLint.
- Vendoring requires local ownership of future fixes and compatibility changes.

### Maturity assessment

The repository has strong interest but a short history. Its private package is version `0.1.0`. It has no normal release channel. The current package test script also does not list every rule file.

Treat it as an idea source and pilot implementation. Do not treat it as a stable policy dependency.

## Repository 2: `ai-automation`

### What it adds

`ai-automation` is a reference repository for agent-executable checks. It organizes artifacts by how agents should copy or adapt them.

The main inventory is:

| Area | Addition |
| --- | --- |
| `rules/oxlint` | Syntax rules, profiles, built-in policy, and tests |
| `rules/typed` | Compiler API rules, file rules, discovery, and CLI behavior |
| `scripts/diff-check` | Added-line checks and changed-file alerts |
| `scripts/rule-catalog` | Metadata model and generated rule documentation |
| `examples/configuration` | TypeScript, Oxfmt, and typed-lint patterns |
| `examples/testing` | Vitest and Playwright patterns |
| `examples/tailwind-smoke` | Positive and negative CSS compilation probes |
| `docs` and `.codex/skills` | Operating guidance and extraction recipes |

See the upstream [README](https://github.com/typeonce-dev/ai-automation/blob/main/README.md).

### OXLint profiles

The generated catalog records 49 plugin rules. It also records 11 built-ins, two categories, and six Tailwind checks. See the [generated catalog](https://github.com/typeonce-dev/ai-automation/blob/main/docs/generated/rule-catalog.md).

Profiles are opt-in. Each profile assumes a specific local architecture.

#### Core profile

| Rule | Intent | Fit here |
| --- | --- | --- |
| `no-banned-type-assertions` | Ban assertions to `any`, `never`, and `unknown`. | Pilot only; boundary use can be valid. |
| `no-multiple-function-params` | Require one object parameter for multi-input functions. | Poor fit as a blanket rule. |
| `no-optional-function-parameters` | Require explicit `undefined` or `null` unions. | Style preference with low product value. |
| `no-single-use-private-functions` | Inline private top-level symbols used once. | Conflicts with focused-module guidance in some cases. |
| `no-type-assertion` | Ban all TypeScript assertions. | Too broad for compiler and transport code. |
| `private-function-prefix` | Require underscores on private top-level functions. | Conflicts with local naming style. |

The profile also enables Oxlint correctness and suspicious categories. It adds common rules for console, empty blocks, unused values, and filenames.

#### Architecture profile

| Rule | Intent | Fit here |
| --- | --- | --- |
| `no-api-backend-imports` | Keep public contracts independent from backend code. | Strong concept. Local ESLint already enforces a frontend boundary. |
| `no-api-repository-imports` | Force handlers through owning services. | Stack-specific. There is no repository/service architecture here. |
| `no-comments` | Remove source comments except directives. | Poor fit. Analyzer invariants often need precise comments. |
| `no-reexport-only-modules` | Ban barrel and forwarding modules. | Already enforced by local ESLint. |
| `no-sql-type-parameter` | Prefer typed queries or validated schemas. | Not applicable. |
| `require-tsx-in-ui-folders` | Keep UI folders TSX-only. | Possible convention, but current ownership differs. |

This profile demonstrates configurable ownership rules. That design is more useful than its exact rules.

#### Effect profile

The Effect profile contains rules for:

- ambient time and randomness;
- nested and cascading `Layer.provide` calls;
- direct browser storage;
- direct `fetch`;
- disabled schema validation;
- `Effect.asVoid`;
- global JSON APIs;
- the `in` operator;
- nested Effect array calls;
- `serviceOption`;
- shadowed `Array` globals;
- silent error swallowing;
- static service forwarders;
- `switch` and `try/catch`;
- `typeof object` checks;
- long `pipe` calls;
- Effect `Match`, `Option`, and `Context.Service` conventions.

These checks encode a coherent Effect architecture. This project does not use Effect. Skip the profile.

The general ideas still matter:

- make ambient nondeterminism explicit;
- distinguish integration boundaries from internal code;
- do not swallow errors;
- validate external data;
- detect forwarders that hide ownership.

Those concepts should use local frameworks and evidence.

#### React profile

The React profile bans component-local named functions, non-component exports from TSX, and React state hooks.

This project uses Solid. The rules do not transfer directly. Local guidance already keeps pure shaping outside JSX and lifecycle cleanup with its owner.

#### XState profile

The XState profile enforces typed machine creation, selector facades, actor composition, inline single-use actions, inline guards, and typed event objects.

This project does not use XState. Skip the profile.

#### Next.js and Tailwind profile

This profile bans CSS Modules, fixed content heights, JSX styles, non-route layouts, and unapproved primitives. It also enforces `cn`, default component exports, and closed Tailwind class policy.

This project uses Solid and a regular stylesheet. Skip the implementation.

The closed-system principle is still valuable. Agents work better when ownership, tokens, and approved primitives are explicit.

### Typed Compiler API checks

The typed engine adds three semantic rules and one workspace rule:

| Rule | What it proves | Fit here |
| --- | --- | --- |
| `no-xstate-derived-boolean-context` | Assignment, guard, and snapshot evidence shows a boolean can be derived. | Not applicable. The proof shape is instructive. |
| `prefer-effect-array-match` | A typed array emptiness check can use Effect helpers. | Not applicable. |
| `prefer-typed-schema-apis` | Input is assignable to an Effect Schema encoded or decoded type. | Not applicable. Assignability-based API selection is instructive. |
| `workspace/no-svg-files` | First-party SVG files violate configured ownership globs. | Pilot only if this project defines such a policy. |

The engine discovers tsconfigs, builds programs, sorts diagnostics, removes duplicates, and normalizes paths. See the [typed rules README](https://github.com/typeonce-dev/ai-automation/tree/main/rules/typed).

Do not import this engine. It duplicates `src/project` and the existing compiler-program lifecycle. Duplicate engines can disagree about roots, aliases, exclusions, and freshness.

### Added-lines and changed-file checks

The diff tool runs two rules only on added lines:

- `no-let`;
- `no-explicit-function-return-type`.

It also alerts on configured high-risk files. See the [diff-check README](https://github.com/typeonce-dev/ai-automation/tree/main/scripts/diff-check).

The exact two rules do not have strong local value. The change-scope mechanism does.

Good local alert targets include:

- `package.json` and `pnpm-lock.yaml`;
- `eslint.config.js` and TypeScript configuration;
- `src/api/contracts.ts`;
- public CLI argument and output contracts;
- route-field-proof obligations;
- source-classification catalogs;
- analyzer scope, boundary, and evidence policies.

The upstream implementation parses unified diff hunks. It filters diagnostics by each first label. This is simple, but it can miss multi-span diagnostics or context-line primaries.

For this product, changed lines should become an input to graph analysis. The result should separate:

- direct new findings;
- propagated effects from changed symbols;
- possibly related findings;
- pre-existing findings.

This direction already matches [`docs/plans/change-oriented-analysis-review.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/plans/change-oriented-analysis-review.md).

### Rule catalog and generator

This is the strongest reusable pattern.

The upstream metadata records:

- stable rule name;
- kind;
- default severity;
- profile;
- applicability;
- intent;
- options;
- exceptions;
- source link.

The generator combines plugin, typed, workspace, built-in, Tailwind, and review-only checks. Documentation checks verify registry and catalog parity.

A local analyzer catalog should record:

- stable finding or capability ID;
- source kinds;
- sink kinds;
- supported transformations;
- evidence level;
- disproof conditions;
- known frontiers;
- framework or adapter scope;
- fixability;
- suppression policy;
- fixture coverage;
- report and API consumers;
- documentation links.

The catalog must remain a thin layer over existing evidence. It must not replace graph paths with generic rule rows.

### Configuration examples

The examples cover strict TypeScript profiles, Oxfmt, and typed-lint discovery. They are intended for copying and adaptation.

Direct copying would conflict with pnpm, ESLint, Solid, and the project's two TypeScript boundaries. Borrow the separation and ownership pattern only.

### Testing and CSS smoke checks

The repository separates unit, integration, and Playwright policy. It also contains a Tailwind compilation smoke check.

The CSS smoke check tests both directions:

- a project-owned utility must exist;
- a representative default utility must not exist.

This positive and negative pair is the important idea. A successful command alone does not prove the intended constraint.

The same principle already appears in route-field proof. A positive repair needs a real positive case, a negative precision case, and the normal control.

### Agent guidance and operating model

The [operating model](https://github.com/typeonce-dev/ai-automation/blob/main/docs/operating-model.md) assigns concerns to the strongest useful enforcement layer:

| Concern | Enforcement layer |
| --- | --- |
| Invalid states and shapes | Strict types, schemas, and exhaustive matching |
| Forbidden patterns and ownership | Syntax or typed lint |
| UI consistency | Tokens, components, style lint, and CSS compilation |
| Observable behavior | Unit, integration, and browser checks |
| Contextual judgment | A concise agent skill |
| High-risk changed files | Diff alerts |

This model fits `tsx-data-flow`. One refinement is essential: analyzer findings are evidence-backed advice, not always lint failures.

### Extraction recipes

The repository separates artifacts into three actions:

- copy executable behavior and its tests;
- copy and adapt configuration and discovery;
- reference catalogs, rationale, and guidance.

Its [extraction guide](https://github.com/typeonce-dev/ai-automation/blob/main/docs/extracting-patterns.md) recommends the smallest applicable slice. Its [rule recipe](https://github.com/typeonce-dev/ai-automation/blob/main/docs/recipes/add-oxlint-rule.md) connects implementation, registry, metadata, tests, and generated docs.

That lifecycle is a good model for new analyzer capabilities.

### Risks and limitations

- The repository has only three commits in the reviewed snapshot.
- It is a reference repository, not a stable package.
- Many dependency versions are wildcards.
- Most rules encode one team's technology choices.
- The project uses npm, Oxlint, Oxfmt, Effect, React, XState, Next.js, and Tailwind examples.
- `tsx-data-flow` uses pnpm, ESLint, Solid, and regular CSS.
- A generated catalog proves metadata parity, not semantic correctness.
- Added-line filtering can miss multi-location diagnostics.
- A second Compiler API engine would fragment project ownership and evidence.

## Combined product opportunities

### 1. Stable analyzer capability catalog

Add metadata around existing analyzer behavior before adding many rules.

The first catalog can cover:

- type-impossible defenses;
- representation churn;
- repeated normalization;
- prop and context relays;
- repeated forks;
- unknown edges;
- route sources and consumers;
- exact field-transfer kinds;
- supported framework boundaries;
- known unsupported syntax.

Generate Markdown from executable metadata. Check parity in the existing verification boundary after test approval.

### 2. Change-oriented graph analysis

Accept an explicit change manifest with files, lines, and symbols. Treat Git as one adapter, not the core model.

For each finding, record:

- whether the changed code created it;
- whether changed code only exposed it;
- whether it is pre-existing;
- whether the relation is direct or propagated;
- the confidence of change attribution.

This would provide more value than generic added-line lint filtering.

### 3. Type-evidence transformation ledger

Extend path evidence with transformations such as:

- known literal or object key set;
- widened union;
- open dictionary conversion;
- `unknown` or `any` boundary;
- schema parse;
- checked narrowing;
- unchecked assertion;
- recovered field identity;
- downstream consumer requirement.

Only escalate when the transformation causes downstream uncertainty, repeated validation, or an unsupported assertion.

### 4. Evidence levels and disproof conditions

Each finding should state its proof strength.

Suggested levels:

| Level | Meaning |
| --- | --- |
| Proven | Type and path evidence establish the condition. |
| Strong | Multiple independent facts support it, but one boundary remains. |
| Advisory | Syntax suggests a concern without semantic closure. |
| Unknown | The analyzer reached an explicit evidence gap. |

Also record what would disprove the finding. This makes agent action safer.

### 5. Focused rule profiles

Profiles can describe analyzer scope without importing upstream technologies.

Possible local profiles:

- core TypeScript render path;
- Solid component and resource flow;
- SolidStart server-to-client route flow;
- API transport and Zod validation;
- change-oriented review;
- strict selected-field proof.

Each profile should select evidence capabilities. It should not create a parallel analyzer.

## Code-quality recommendations

### Adopt now

1. Add changed-file alerts for public contracts, dependencies, and analyzer policy.
2. Define a catalog model for current lint and analyzer capabilities.
3. Document positive, negative, and control cases for each new semantic claim.
4. Keep existing direct-import and frontend-boundary rules.

### Pilot

Run selected concepts as advisory checks first:

- chained assertions;
- known-value widening;
- widen-then-assert flows;
- unknown return contracts;
- unsafe dictionaries in API and transport code;
- conditional empty-object spreads.

Measure:

- total findings;
- clear defects;
- legitimate boundaries;
- duplicates of existing analyzer findings;
- suppression needs;
- runtime cost.

Do not enable errors until the project has a reviewed baseline.

### Skip

Do not adopt these blanket rules:

- ban every `typeof` check;
- ban every `unknown` parameter;
- ban the word `shape`;
- ban every type assertion;
- ban all comments;
- require object parameters everywhere;
- import Effect, React, XState, or Next.js conventions;
- import closed Tailwind policy into the current CSS system.

## Proposed delivery sequence

### Slice 1: catalog and change-risk alerts

This is the smallest useful slice.

Deliver:

- a typed metadata record for current analyzer capabilities;
- generated Markdown documentation;
- a parity check;
- a small changed-file risk configuration;
- Markdown and CLI risk output.

This slice makes the existing product easier to inspect. It does not change semantic findings.

### Slice 2: one evidence-loss vertical path

Select one pattern: known object keys widened to an open dictionary, then read at a render consumer.

Deliver:

- transformation records in the existing graph;
- one positive real case;
- one negative precision case;
- one normal control;
- Markdown, JSON, API, and UI projection only where needed;
- bounded performance evidence.

This slice tests whether `anti-slop` concepts improve the product's unique evidence.

### Slice 3: change attribution

Apply an explicit change manifest to existing findings and the new evidence-loss path.

Keep these result groups separate:

- introduced;
- directly changed;
- propagated;
- possibly related;
- pre-existing.

Do not add Git coupling until the manifest model works.

## Decision matrix

| Addition | Direct adoption | Adapt into existing tooling | Product inspiration | Final decision |
| --- | --- | --- | --- | --- |
| `anti-slop` full plugin | Poor | Medium effort | High | Do not install wholesale |
| Evidence-preservation rules | Medium | High fit | Very high | Pilot and port concepts |
| Safety comments | Poor | Medium | Medium | Improve diagnostics instead |
| `ai-automation` OXLint profiles | Poor | Selective | Medium | Copy no full profile |
| `ai-automation` typed engine | Poor | Low need | Medium | Reuse existing compiler lifecycle |
| Added-lines checks | Medium | High | High | Adapt into change-oriented analysis |
| Changed-file alerts | High | High | High | Adopt first |
| Generated rule catalog | High pattern fit | High | Very high | Adopt first |
| Positive/negative CSS probe | Wrong technology | Medium concept fit | High | Borrow proof pattern |
| Operating model | High | High | High | Adopt terminology selectively |

## Final recommendation

Use both repositories as design inputs, not dependencies.

From `anti-slop`, take the evidence-preservation model. Make it semantic, cross-file, and path-aware.

From `ai-automation`, take the catalog, extraction discipline, risk alerts, and proof-oriented operating model.

Keep `tsx-data-flow` focused on what generic lint cannot do: explain how typed values move to real consumers, where evidence disappears, and which conclusions remain unproven.

## Sources

### `anti-slop`

- [Repository and README](https://github.com/dmmulroy/anti-slop)
- [Plugin registry](https://github.com/dmmulroy/anti-slop/blob/main/src/index.ts)
- [All rule sources](https://github.com/dmmulroy/anti-slop/tree/main/src/rules)
- [Shared dictionary analysis](https://github.com/dmmulroy/anti-slop/blob/main/src/shared/dictionary-types.ts)
- [Installation skill](https://github.com/dmmulroy/anti-slop/blob/main/skills/install-anti-slop/SKILL.md)
- [Package metadata](https://github.com/dmmulroy/anti-slop/blob/main/package.json)
- [Commit history](https://github.com/dmmulroy/anti-slop/commits/main)

### `ai-automation`

- [Repository and README](https://github.com/typeonce-dev/ai-automation)
- [Generated rule catalog](https://github.com/typeonce-dev/ai-automation/blob/main/docs/generated/rule-catalog.md)
- [OXLint catalog metadata](https://github.com/typeonce-dev/ai-automation/blob/main/rules/oxlint/src/catalog.ts)
- [OXLint configuration](https://github.com/typeonce-dev/ai-automation/blob/main/rules/oxlint/src/config.ts)
- [Typed rule engine](https://github.com/typeonce-dev/ai-automation/tree/main/rules/typed)
- [Diff-check implementation](https://github.com/typeonce-dev/ai-automation/tree/main/scripts/diff-check)
- [Rule-catalog generator](https://github.com/typeonce-dev/ai-automation/tree/main/scripts/rule-catalog)
- [Operating model](https://github.com/typeonce-dev/ai-automation/blob/main/docs/operating-model.md)
- [Extraction guide](https://github.com/typeonce-dev/ai-automation/blob/main/docs/extracting-patterns.md)
- [OXLint rule recipe](https://github.com/typeonce-dev/ai-automation/blob/main/docs/recipes/add-oxlint-rule.md)
- [Testing patterns](https://github.com/typeonce-dev/ai-automation/tree/main/examples/testing)
- [Tailwind smoke check](https://github.com/typeonce-dev/ai-automation/tree/main/examples/tailwind-smoke)

### Local project

- [`docs/application-structure.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/application-structure.md)
- [`docs/plans/change-oriented-analysis-review.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/plans/change-oriented-analysis-review.md)
- [`docs/code-smell-evaluation-report.md`](https://github.com/byronwall/tsx-data-flow/blob/main/docs/code-smell-evaluation-report.md)
- [`eslint.config.js`](https://github.com/byronwall/tsx-data-flow/blob/main/eslint.config.js)
- [`package.json`](https://github.com/byronwall/tsx-data-flow/blob/main/package.json)
- [`src/analysis/source-defenses.ts`](https://github.com/byronwall/tsx-data-flow/blob/main/src/analysis/source-defenses.ts)
- [`src/analysis/source-trace.ts`](https://github.com/byronwall/tsx-data-flow/blob/main/src/analysis/source-trace.ts)
- [`src/analysis/ranking.ts`](https://github.com/byronwall/tsx-data-flow/blob/main/src/analysis/ranking.ts)
- [`src/analysis/scope-seam.ts`](https://github.com/byronwall/tsx-data-flow/blob/main/src/analysis/scope-seam.ts)
