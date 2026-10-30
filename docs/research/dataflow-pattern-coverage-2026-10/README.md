# Data-flow pattern coverage (October 2026)

This report tests the target of 99% coverage for common Vanilla, React and SolidJS patterns. It measures coverage two ways: a catalog of everyday patterns, and a survey of real repos.

## How to read the outcomes

- `ok`: the trace reaches an end on every path, and every step is proven.
- `assumed`: the trace reaches an end, but one step passes through library code that has no model.
- `partial`: the trace stops somewhere it cannot name an end.

`ok` is the coverage number. `ok + assumed` is the number of traces that land.

## 1. Pattern catalog

The catalog is in `engine/examples/pattern-catalog/`. It has 71 small patterns, one trace each. The React and Solid patterns are checked against real library types. Run it with `cd engine && node --import tsx scripts/pattern-catalog.ts`.

| Framework | Patterns | `ok` before | `ok` now | `assumed` now | `partial` now |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vanilla | 26 | 17 (65%) | 25 (96%) | 0 | 1 |
| React | 23 | 15 (65%) | 21 (91%) | 1 | 1 |
| Solid | 22 | 17 (77%) | 19 (86%) | 3 | 0 |
| **All** | **71** | **49 (69%)** | **65 (92%)** | 4 | 2 |

Landed (`ok + assumed`): 52 of 71 (73%) before, 69 of 71 (97%) now.

### What changed, by principle

Each fix is one rule, based on facts from the type checker, that covers a family of patterns. None of them is a list of API names.

| Fix | Rule | Patterns it closed |
| --- | --- | --- |
| Restore #207 | #212's squash had reverted the `throw` end. A thrown value ends at the `throw` again. | Real repos: `new Error(...)` dead ends |
| Exported API | An exported value that the program never reads ends at its export. | Unread exports |
| Request ends | A request that is sent is an end. The response body is not a stop. A dropped promise chain ends where the code drops it. | 9: fetch forward, `.then` chains, `Promise.all`, try/catch, FormData post, effect fetch, `useQuery`, `createResource` |
| DOM effects | A call to any member that the TypeScript DOM lib declares, whose value the code drops, is a page write. | 3: `classList.toggle`, `dispatchEvent`, `focus` |
| State functions | A function handed to a state setter stands for what it returns: updaters, store-path updaters, and the lazy `useState(() => …)`. | 4: React and Solid updaters, Solid store path, lazy init |
| Library handles | A dropped call through a function that a library hands back (`navigate`, `setSearch`, `refetch`) is an assumed external effect, not a dead end. | 3 move from `partial` to `assumed` |
| Returned calls | A return that is itself a call is judged by its own function's call sites. | 2: uncalled generator, `useCallback(() => props.save(…))` |
| Empty literal | Going backward, an empty `{}` or `[]` is where a value begins. | Real repos: `{}` dead ends |

### Patterns that are still not `ok`

| Pattern | Outcome | Gap | What would close it |
| --- | --- | --- | --- |
| `v-map-set` | partial | A `cache.set(k, v)` on a module-level `Map`, read by `cache.get(k)` in another function. Library writes are kept out of module state on purpose. | Let a module-level container keep what a method writes into it, with a negative fixture for a shared module. |
| `r-zustand` | partial | The setter comes back through `create((set) => ({ setCount: … }))`. The engine does not follow a value through the library's callback. | A `calls-back` row for zustand's `create`, so that a selector's value is the store object the callback returns. |
| `r-mutation` | assumed | `useMutation().mutate(x)` has no row. | A row: `mutate`'s argument goes to `mutationFn`'s parameter. |
| `s-navigate`, `s-search-write` | assumed | The router functions have no rows. | Rows that name navigation and URL writes as terminals. |
| `s-resource` | assumed | `createResource`'s fetcher is proven, but one step is assumed. | Read the assumed edge, then add a row or mark the step as proven. |

All six are named library gaps. None of them is a missing language rule.

### Caveat: `ok` is not proof that the end is correct

The catalog checks that each trace lands. It checks the end itself only by hand. That review caught two cases where the end was wrong:

- The Solid updater ended at its own `return`.
- `props.save(…)` was labelled "database write".

The first one is fixed. Because these checks were by hand, read 92% as the upper limit for "correct".

## 2. Real repos

These numbers come from `engine/scripts/survey-blockers.ts`: 60 exports per repo, each traced both ways, on five repos: three React and two Solid.

| Repo | `ok` before | `ok` now | `assumed` now | `partial` now |
| --- | ---: | ---: | ---: | ---: |
| React: family-finances | 15 | 17 | 15 | 27 |
| React: kids-reading | 9 | 11 | 15 | 33 |
| React: tasks-trpc | 13 | 17 | 27 | 15 |
| Solid: bible-daily | 5 | 7 | 3 | 50 |
| Solid: hn-client | 13 | 13 | 3 | 42 |
| **All (299 traces)** | **55 (18%)** | **65 (22%)** | **63 (21%)** | **169 (56%)** |

The second survey ran before the empty-literal fix. That fix acts on 34 traces in this sample.

A survey trace starts at a whole export, such as a page component or a server module. It must land on every path, and these traces cross hundreds of steps. That is why survey coverage is much lower than catalog coverage.

### What stops real traces now, ranked

| Stop | Traces | What it is |
| --- | ---: | --- |
| Size limit | 87 (29%) | The walk runs out of budget on large exports. This is the backlog's "hub summaries" task: summarize a hub once instead of walking it for each trace. |
| `disconnected · alias` | 50 | Destructured values that nothing reads (`const { isSuccess } = useQuery()`). These are real dead ends. They could be named "unused" instead of being a stop. |
| `external-code · call` | 46 | Third-party methods with no model (`column.setFilterValue`, Prisma). |
| `unresolved-symbol` | 43 | Calls with no resolved symbol (tRPC proxies, `any`). |
| `disconnected · call` | 31 (was 68) | Callback props that no caller hands a function to. |
| Resource boundaries | 27 + 22 | Solid `createResource` input and result, shown as framework-runtime stops. |

Two repos could not be opened at all:
- `user-flow-workbench`: the engine crashes reading its tsconfig ("Cannot read properties of undefined (reading 'readFile')").
- `product-grid-mgmt/packages/cli`: the folder has no tsconfig.

## Verdict on the 99% target

- **Everyday patterns: about 99% landed is reachable.** The catalog is at 97% landed and 92% `ok`. The remaining gaps are five library rows and one module-state rule.
- **Whole-export traces on real apps: 99% is not reachable in the near term.** They are at 22% `ok` and 43% landed. The biggest single gap is the size budget (29% of traces), which is an architecture change (hub summaries), not a pattern rule. An `ok` here also needs every path through a large component to land, so one unmodelled library on any path makes the trace `partial`.
- **A better target:** measure coverage for each step, not each trace. Count the share of boxes in a trace that are proven or end at a named terminal. The survey already records stops for each trace, so this number can be computed from the same data. Set the 99% target on that measure. For whole traces, a realistic goal is about 60% `ok` and 85% landed, once hub summaries and the library rows are done.
