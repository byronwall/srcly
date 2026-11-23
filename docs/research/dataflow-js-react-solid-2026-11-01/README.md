# Srcly gaps across JavaScript, React, and SolidJS

Fix incorrect value paths and project access before expanding library name lists. Strengthen existing fixture assertions first. Keep offline observation packets optional until they add a justified finding beyond direct assertions.

This research expands [PR #308](https://github.com/byronwall/srcly/pull/308) beyond its Solid pilot. Pro reviewed 19 vanilla runtime families, 22 React families, and 20 Solid families. JavaScript project admission has an additional matrix. See the [complete report](pro-results/research-report.md).

## Findings that decide the next work

| Environment | Important gaps | First delivery |
| --- | --- | --- |
| Actual JavaScript | Automatic discovery omits jsconfig; root filtering omits `.mjs`; no-config and all-loose projects are refused. The catalog uses `.ts`, not `.js`. Native receiver writes depend on discarding the call result. Callback roles and Promise completion channels are too broad. | Align project discovery and add actual-JS fixture membership checks. Then correct native mutation and callback rules. |
| React | Effect cleanup returns feed hook results. The mutation connector sends callback output to both `mutate` and `mutateAsync` results. Lifted reducer dispatch takes a plain-setter shortcut. Context providers are pooled; query outputs lack field-specific roles. | Remove impossible effect/mutation return paths while retaining callback-body paths. Add a constant-reducer negative control. |
| SolidJS | Selectors are described like memo accessors; `on`, cleanup registration, and void effects share callback-result summaries. Resources assume fetcher argument 1. A carrier treats a sole loader `.json()` call as returned payload. Props views ignore split keys and merge priority. | Separate selector, accessor, wrapper, callback identity, and void results. Then test resource and props false paths. |
| Shared | A matching terminal can hide wrong paths. Standard-library identity can upgrade generic behavior guesses. Projection keeps one edge per pair of boxes. Model JSON is absent from the engine cache fingerprint. | Add precise positive/negative assertions, preserve evidence, and include effective models in cache identity. |

The [review ledger](review.md) links these findings to inspected source. It distinguishes code mechanisms from predicted graph results.

## What was checked

The source baseline is `e07cc510087b5c028273cad785b97ee36c6c3b35`. Codex checked the decisive discovery, callback, mutation, reducer, resource, props-view, proof, cache, and catalog paths. No application code changed during integration.

Primary-source checks confirmed that React effects return no data value, Solid cleanup returns the callback itself, and selectors return keyed booleans. Sources: [React useEffect](https://react.dev/reference/react/useEffect), [Solid onCleanup](https://docs.solidjs.com/reference/lifecycle/on-cleanup), [Solid createSelector](https://docs.solidjs.com/reference/secondary-primitives/create-selector).

Pro reports six native controls and 21 passing assertions. Those results are preserved, attributed sandbox observations. Codex inspected the supplied programs and data but did not execute them. All 16 srcly/framework/browser cases remain unexecuted. No new coverage percentage or reproduced framework graph failure is claimed.

The historical 105 expected catalog landings do not establish complete support. The grader accepts any matching allowed end. It does not prove the intended field, callback channel, invocation, or absence of wrong paths.

## What shipped

The reviewed six-stage plan was retired on 2026-11-23. `docs/dataflow-coverage.md` records each rule that landed.

| Stage | Result |
| --- | --- |
| 1. Precise failures (SH-01) | Shipped in #316: `@path` and `@no-path` claims, actual `.js` fixtures with a Program-membership check, and catalog counts of skipped cases. |
| 2. One correction per environment (SH-02, JS-01, RE-01, SO-01) | Shipped in #317–#319 and #321: jsconfig and `.mjs` roots, React effect and mutation results, Solid result kinds, native writes from the method. |
| 3. Ordinary language and framework paths | Shipped in #322, #324 and #326–#336: reducers through props and context, DOM reads, resources, props views, promises, loose projects, callback roles, store paths, nearest context provider, setters and call adapters, `For` and `Index`, query fields. |
| 4. Evidence and model invalidation (SH-03, SH-04) | Shipped in #320, #325 and #337: per-side gaps, model rows in the cache fingerprint, every relation between two boxes kept. One gap is open: the ledger and the graph disagree on some shared expressions (pgm `task-ledger-and-graph-agree-on-every-shared-expression`). |
| 5. Bounded identity and wider framework APIs | Partly shipped through the library-model work (#429–#437): per-call contexts, nearest-provider ancestry, `useRef`, `useTransition`, Solid Query rows. Open: per-instance class state (pgm `task-per-instance-state-for-class-members`) and React 19 action hooks (pgm `task-react-19-action-hooks-as-library-rows`). React handles, external stores and class `setState` are the redo of #425. |
| 6. Observation packets (EX-01, EX-02) | Not started, and not carried to the backlog. Direct fixture assertions answered every review question so far. Reopen only for a concrete miss that a fixture cannot settle. |

## Research materials

- [Original assets and collection index](pro-results/README.md)
- [Reviewed recommendation dispositions](review.md)
- [Submitted prompt](pro-prompt.md) and [run record](run-record.md)
- [Pro conversation](https://chatgpt.com/c/6ae6bd64-1340-83e8-8609-abad82c3a205)
