# Reviewed implementation plan

Status: ready for plan review; implementation is not authorized by this research handoff. Baseline: `e07cc510087b5c028273cad785b97ee36c6c3b35`.

Use the [review dispositions](review.md) with the [original detailed plan](assets/pro-results/2026-11-01/implementation-plan.md) and [16 experiment designs](assets/pro-results/2026-11-01/experiment-plan.md). The [asset index](assets/pro-results/2026-11-01/README.md) preserves every original. These reviewed stages take precedence over the original architecture and compatibility suggestions.

## Stage 1: Make the first failures precise

IDs: SH-01. No dependency on observation packets.

Extend `engine/test/srcly/fixture-annotations.test.ts` only where existing `@never-reaches`, exhaustive ends, and edge claims cannot identify a bad path. Add exact source/destination labels with ambiguous-label failures. Preserve existing two-call and state-isolation fixtures.

Add isolated strict-allowJs fixture roots or lane configs. Keep actual `.js/.jsx` distinct from typed counterparts. Assert Program membership before grading. Extend catalog inventory to report attempted, refused, skipped, and checked cases. Do not replace the historical score.

Start with one case per environment:

| Environment | First controls | Expected evidence |
| --- | --- | --- |
| Vanilla JS | V1 membership; V2 retained push versus discarded concat | Actual JS belongs to the Program. Mutation follows operation semantics, independent of result use. |
| React | R-EXP01 effect result; R-EXP05 mutate result | Cleanup cannot be hook result data. Mutation output reaches mutateAsync, not mutate. |
| Solid | E-S1 selector; E-S2 cleanup/effect; E-S3 unused on wrapper | Boolean, accessor, same callback, new wrapper, and void results stay distinct. |

Check collector facts as well as graph projection. Record baseline failures before changing expected outcomes. Extend language rules through annotated fixtures in `engine/examples/value-flow-basics/src/`. A focused relation assertion can supplement an annotation.

Files: annotation test, basics fixture configs, `engine/scripts/pattern-catalog.ts`, survey reporting. Correct the survey child flag to 4096 MiB before required real-repo checks. Keep all Program measurements serial.

Done: a wrong path fails even when an allowed endpoint exists; missing cohorts remain counted. Risk: overly broad harness work. Add only assertions required by the first cases.

## Stage 2: Ship one correction for each environment

IDs: minimal SH-02, JS-01/02, RE-01, SO-01. Depends on the relevant Stage 1 controls.

**Shared:** separate callback invocation from call result. Add finite return dispositions only for these cases. A recognized void result must suppress generic callback-return fallback. Migrate affected JSON rows and consumers together, with no old-format compatibility layer.

**Vanilla:** align server/engine config discovery; admit `.mjs` roots and jsconfig. Keep configless/loose handling a separate slice with explicit null-proof capability. Do not write config files into scanned projects. Correct native receiver writes for the V2 pair.

**React:** preserve setup/body paths, remove cleanup-to-effect-result paths, and split mutate from mutateAsync. Do not infer lifecycle execution from registration.

**Solid:** correct selector, memo, on, cleanup, and effect results. Preserve valid batch/untrack returns. Resolve imported factory identity consistently, including renamed imports.

Files: project discovery/config modules, session refusal, server availability; `library-models.ts`, `framework-flows.ts`, state-pairs, call-support, option-flow connector, React/Solid/ecmascript rows. Update `docs/CODE_MAP.md`, coverage docs, and the existing library-model plan.

Done: each environment has one reviewable correction with exact positive/negative controls. The first changes do not wait for a general model language or heap solver. Risk: removing a wrong edge exposes a real unresolved path. Keep that path named.

## Stage 3: Complete ordinary language and framework paths

Ship small independent slices under the original IDs:

| Track | IDs and work | Cases and acceptance |
| --- | --- | --- |
| Vanilla | JS-02 callback positions; JS-03 Promise channels; JS-04 setters/computed writes/call adapters; JS-05 DOM read/write and event roles | V2–V5. Reject ignored callback-return data, wrong Promise completion, unrelated literal keys, and query-as-write ends. Preserve unknown dynamic targets. |
| React | RE-02 reducer roles; RE-03 shorthand/default context; RE-04 query result fields | R-EXP03/05/06. Direct/lifted dispatch agree through the reducer. Constant reducers exclude action data. Query select feeds data; metadata keeps its own role. |
| Solid | SO-02 resources; SO-03 props; SO-04 stores; finite SO-05 render callbacks | E-S4/5 plus render fixtures. Exclude consumed-but-unreturned JSON, split complements, overwritten props, sibling store fields, and wrong item/index roles. |

Use the detailed plan for source modules and fixture proposals. First locate the live consumer of each candidate relation. Do not repair a legacy path and claim the current graph changed.

Provide local authored runnable examples with dependency locks. Keep browser, server, JSX, and no-JSX adapters as distinct lanes. Do not run downloaded Pro companions as part of this research review.

Done: finite fields/channels pass both directions, and existing invocation pairing survives. Risk: widening turns false exactness into new assumptions. Explain each expected survey move.

## Stage 4: Preserve evidence and invalidate changed models

IDs: SH-03/04. Can proceed beside Stage 3 after precise controls exist.

Preserve distinct relation witnesses between the same boxes. Keep the compact drawing while retaining field, proof, and invocation evidence. Check graph/ledger outcome consistency on one shared expression. Explain completion, terminal kind, and proof basis separately.

Include the effective model set in cache identity. Add model-only refresh/invalidation controls first. Expand package/config fingerprints only for demonstrated dependency inputs. Preserve stale-generation rejection.

Files: `anchor-slice.ts`, `ops/anchor-graph.ts`, `ops/value-flow.ts`, kinds/contracts, fingerprint/result-cache, and client outcome/marks/inspector consumers. Generate shared contracts only when wire fields change.

Done: model-only changes cannot reuse stale evidence; compact edges retain material witnesses. Risk: unnecessary wire changes. Keep current shapes when evidence can fit them.

## Stage 5: Bound identity and extend framework coverage

IDs: SH-05 and RE-06 Explore; RE-03/05, SO-05/06 Build in finite slices.

Prototype disjoint receiver/key and provider-root cases before choosing wider allocation/owner context. Preserve exact aliases and known literal fields. Label unresolved ancestry and dynamic selection. Do not promise complete render epochs or a scheduler.

Add ref/external-store roles and versioned Solid Query accessor options after result-field support. Review current React APIs one at a time. Promote a finite API slice from RE-06 to Build only after its input/result/lifecycle contract and negative control are concrete.

Done: bounded identity improves selected cases without breaking call pairing or growing traces beyond reviewed limits. Risk: state-space growth and false pruning of reusable components. Exact ancestry applies only to resolved trees.

## Stage 6: Decide whether observation packets earn their cost

IDs: EX-01/02. Independent of the Build tracks.

Use the same inputs, actions, assertions, and versions with packets hidden and visible. Record whether a packet changes a justified verdict. Reject runs whose instrumentation changes behavior. Start with the first discriminating cases; expand only to resolve a specific remaining review question.

Stop packet work when it only repeats direct assertions. Explore dynamic-key hints only for a concrete miss left after direct fixes. Do not auto-install models, upgrade proof, capture user projects, or expand to arbitrary instrumentation.

## Validation and handoff

Run focused tests for each changed mechanism, then required checks. Use pnpm for JavaScript and uv for Python. Typical commands:

```sh
cd engine
pnpm exec vitest run test/srcly/fixture-annotations.test.ts test/srcly/library-models.test.ts
pnpm typecheck
pnpm lint
pnpm survey-gate
```

Fetch the base before survey comparison. Every analysis/corpus change needs the survey gate and an explained `Survey moves:` line. Use one repo per process, one process at a time, under the required 4096 MiB heap. No multi-repo benchmark expansion is needed.

For shared contract changes, emit contracts and run their currentness check, Python mirror checks, and reviewed snapshots. UI changes need client/browser checks and PR screenshots. Runtime cases need verified package bytes, export entries, owner/root setup, and explicit disposal.

Record implemented behavior in coverage docs and remove its completed grid node when it lands. Do not mark this plan's research findings implemented. Broader identity, contemporary APIs, runtime capture, and transport completeness retain the dispositions in the review ledger.
