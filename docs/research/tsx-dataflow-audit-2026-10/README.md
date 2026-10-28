# TSX data flow on visual-notes: usability audit (October 2026)

This audit drives srcly's Data flow UI on `~/Projects/visual-notes`, a SolidStart app with 647 files. It uses the same loop and rubric as the [Python audit](../python-dataflow-audit-2026-10/README.md): test, synthesize, implement, then test again.

## The question

Byron opened the `/docs/[id]` route and asked: "What am I looking at? My goal is to understand how data flows through this route." He saw a sea of `Show`, `Match` and `For` boxes, a sidebar full of warnings, and no way to follow the objects that drive the page.

A careful code reader answers that question like this (`app/src/routes/docs/[id].tsx`):

1. `useParams()` → `params.id` is the route's input.
2. `createResource(() => params.id, (id) => fetchDocDetail(id))` → `fetchDoc` in `services/docs.queries.ts`, a `"use server"` query that reads `prisma.doc.findUnique` (database read) and returns a `DocDetail` object.
3. `doc` (the resource) → `<Match when={doc.error}>` (the error page) and `<Match when={doc()}>{(d) => …}`.
4. `d` → `<Title>` and `<Meta>` (`d().title`), `<DocumentViewer doc={d()}>`, and `<Show when={d().originalContentId}>` → the "Original content ID" text.
5. Inside `DocumentViewer`, `props.doc` feeds the title signal, the editor, the share panel and the properties editors.

## Tasks

| # | Job | Task | Surfaces | A perfect tool shows |
| --- | --- | --- | --- | --- |
| T1 | Explain a page | What data drives `/docs/[id]`? | Route picker, canvas, inspector | Steps 1–5 above, in reading order, on one screen. Components that only pass the value on are folded. |
| T2 | Where a value comes from | Where does `DocumentViewer`'s `title` come from? | Anchor from the code viewer, Trace from | `props.doc.title` ← each route that renders `DocumentViewer` ← its resource ← `fetchDoc` ← the database read. |
| T3 | Where a value goes | Where does the loaded `doc` go? | Anchor, Trace to | `doc` → both `Match` branches → `d` → title, meta, `DocumentViewer`, the content-ID text. |
| T4 | What a change writes | What does saving a note write? | Anchor on `updateDoc`'s payload, Trace to | `payload` → `updateInput.parse` → `prisma.doc.update` (database write), and the activity event write. |

## Round 1 — test (2026-10-27, `main` at `d3f1b43`)

Browser at 1440×900. Screenshots are 2x captures of the same URLs.

| Task | Start | Answer | Focus | Reading | Honesty | Parts | Next | Total /28 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 what drives `/docs/[id]` | 3 | 0 | 0 | 1 | 1 | 1 | 1 | **7** |
| T2 where `title` comes from | 2 | 2 | 2 | 1 | 2 | 3 | 3 | **15** |
| T3 where `doc` goes | 2 | 0 | 3 | 2 | 0 | 3 | 2 | **12** |
| T4 what saving writes | 2 | 1 | 1 | 1 | 3 | 3 | 2 | **13** |
| **Total /16** | **9** | **3** | **6** | **5** | **6** | **10** | **8** | **47 / 112 (42%)** |

### What happened, task by task

**T1 — what drives `/docs/[id]`.** The route picker finds the route at once. The canvas then draws the route's render tree: 790 component occurrences, 274 control-flow boundaries (`Show`, `Match`, `Switch`, `Suspense`, `For`) and 271 terminals ([shot](shots/r1-t1-01-route-render-tree.png)). Most boxes are not in the route at all: 150 are in `NearbyNodesPopover`, 141 in `PathEditor`, 130 in `ui/tooltip`, 125 in `ui/button`. No box is a value. `params`, `doc` and `d` are not drawn.

The inspector lists one origin, `createResource(…)`, with "resource → 0". Clicking it re-lays out the whole canvas and says "reaches no proven render site · field lineage N/A: The selected source has no unique compiler-backed filesystem origin." The route view's only data action is a dead end, in the engine's internal words.

The inspector then lists 318 gaps. 256 of them are the same two lines, "Element limit reached before Text" and "Terminal limit reached before Text". 23 say "The A definition is outside the route source scope", where `A` is a styled-system component. None of them is about the route's data.

The value tracer can answer most of the question, but the route view never offers it. Anchoring on the route component itself (`DocView`) draws 5 boxes and reads `ok` ([shot](shots/r1-t1-02-docview-anchor-5-boxes.png)): a component with no props walks nothing, because a component anchor walks only its props and its uses.

The first open took a long time. The engine builds the route's render totality (every component the route renders, to the element limit) before the first screen.

**T2 — where `title` comes from.** Backward from `title` in `DocumentViewer.tsx:50`: 237 values in 23 functions, folded ([shot](shots/r1-t2-01-title-backward.png)). The path into `docs.queries.ts` is there. But the one origin listed is `DocumentSidePanel`'s `createResource`, not the database. `prisma.doc.findUnique` is a plain `literal` box. Seven of the 23 function boxes read "(anonymous) in canvas" or "(anonymous) in [id]", which says nothing about which callback they are.

**T3 — where `doc` goes.** Forward from `doc`: 12 boxes, `ok` ([shot](shots/r1-t3-01-doc-forward-stops-at-match.png)). The trace stops at `<Match when={doc()}>` and calls `doc()` a "DOM attribute" terminal. It never reaches `d`, so the title, meta, `DocumentViewer` and the content-ID text are all missing. A trace forward from `d` itself reaches all of them (581 boxes in 59 functions), and backward from `d` finds nothing. The engine binds `<Show when={x()}>{(v) => …}` to its callback, but not `<Match>`, and not a `when` that is not a bare call (`d().originalContentId`).

**T4 — what saving writes.** Forward from `updateDoc`'s `payload`: 545 boxes, and the budget runs out ([shot](shots/r1-t4-01-update-payload-forward.png)). `prisma.doc.update` and `prisma.doc.findUnique` are named, but as `external-code` frontiers. 37 terminals are listed; most are branch tests (`delta < 500`, `input.title !== undefined`). The database write, which is the answer, is not an end.

## Round 1 — synthesize

| # | Gap | Tasks | Cause | Cost |
| --- | --- | --- | --- | --- |
| V1 | The route view is the render tree, not data. It draws every component the route renders, library internals included, and offers no way to the route's values. | T1 | ui | T1 Answer, Focus, Next |
| V2 | A component anchor with no props walks nothing and reads `ok`. Its own values (`useParams`, `createResource`, `createSignal`, `createMemo`) are not seeds. | T1 | engine | T1 Answer, Honesty |
| V3 | `<Match when>` is not bound to its callback child, and neither is a `when` that is not a bare call. The value stops at the condition, called a "DOM attribute", and reads `ok`. | T1, T3 | engine | T3 Answer 0, Honesty 0 |
| V4 | Prisma calls are `external-code`. `findUnique` is not a database read and `update` is not a database write. There are no ECMAScript library rows at all (`engine/models/ecmascript.json` is empty). | T2, T4 | engine (rows) | T2, T4 Answer |
| V5 | The route's gap list repeats one line hundreds of times, and uses engine words ("route source scope", "compiler-backed filesystem origin"). | T1 | ui | T1 Honesty, Focus |
| V6 | "(anonymous) in X" names a callback by its file only. Branch tests are listed as terminals. | T2, T4 | ui + engine | Reading |
| V7 | Selecting the route's origin re-lays out the whole canvas, and then dead-ends. | T1 | ui | Parts |
| V8 | The first open builds the whole render totality before anything is drawn. | T1 | engine | Start |

V1, V2 and V3 are one story. Together they decide whether "how does data flow through this route" has an answer on screen at all. Round 1 takes them.

## The gap sweep

V3 (`<Match when>`) showed that the engine missed constructs that every Solid page uses. A route-by-route test finds such gaps one at a time, so the audit switched to a construct sweep.

**Method.** About 100 small probes, each one construct in isolation: Solid control flow, signals, stores, resources, context, SolidStart `query` / `action` / `createAsync`, React hooks, TanStack Query, and plain TypeScript (classes, closures, `await`, collections, the standard library, the browser). Each probe names a seed and the line a correct trace must reach (`@seed`, `@sink`, `@origin`), runs `anchorGraphOp` on it, and fails on a missed end or a false `ok`. The probes ran against three small projects: Solid (resolved through visual-notes' `node_modules`), React (family-finances' `node_modules`) and plain TypeScript.

**Rule.** Each failure was fixed as a category, not an instance. When one framework call was missing, the whole table of that framework's calls went in. When one browser read was missing, every browser read and write went in. Each category is one PR with an annotated fixture that fails without it. The PRs merged one at a time after CI passed.

Ranked by how often visual-notes uses each construct:

| Category | visual-notes uses | Before | Fix |
| --- | ---: | --- | --- |
| `await f(x)` | 644 | The trace stopped at the call | [#237](https://github.com/byronwall/srcly/pull/237) |
| Database clients (Prisma reads and writes) | 245 | `external-code` stops | Named `database read` / `database write` ([#238](https://github.com/byronwall/srcly/pull/238)) |
| Function wrappers (`query`, `action`, `useAction`, `useCallback`, `debounce`) | 139 | The wrapped function was never entered | [#239](https://github.com/byronwall/srcly/pull/239) |
| DOM event handlers (`on*`, `addEventListener`) | 65 | The event was not an origin | [#241](https://github.com/byronwall/srcly/pull/241), [#248](https://github.com/byronwall/srcly/pull/248) |
| Solid control flow (`Show`, `Match` callback children) | 309 | `Match` and non-call `when` stopped, marked `ok` | [#236](https://github.com/byronwall/srcly/pull/236) |
| Props spread, `memo`, `forwardRef`, `Dynamic` | 33+ | Props lost, marked `ok` | [#240](https://github.com/byronwall/srcly/pull/240), [#250](https://github.com/byronwall/srcly/pull/250) |
| Router URL reads (`useParams`, `useSearchParams`) | 13 | No origin | Named `URL: useParams()` ([#242](https://github.com/byronwall/srcly/pull/242)) |
| Framework calls (`createMemo`, `createAsync`, `on`, `splitProps`, effects, context) | many | Assumed, or drawn as "external effect" | One table, `framework-flows.ts` ([#245](https://github.com/byronwall/srcly/pull/245)) |
| Resource source → fetcher | 12 | Not linked | [#243](https://github.com/byronwall/srcly/pull/243) |
| Object state (`o.f = v`, `this.f = v`, class `Map` fields) | many | Dead ends | [#244](https://github.com/byronwall/srcly/pull/244), [#247](https://github.com/byronwall/srcly/pull/247) |
| Standard library (`trim`, `map`, `JSON`, `console`, constructors) | everywhere | Every trace through one was `partial` | Modelled ([#246](https://github.com/byronwall/srcly/pull/246)); never "outside the program" (#254) |
| Browser state (`location`, cookie, storage, history, page writes) | some | Unnamed | [#248](https://github.com/byronwall/srcly/pull/248) |
| Closures (`factory(v).read()`) | some | Stopped, marked `ok` | [#249](https://github.com/byronwall/srcly/pull/249) |
| TanStack Query `queryFn` / `mutationFn` | — (React) | Not entered | [#250](https://github.com/byronwall/srcly/pull/250) |
| A component's own state (V2) | every route | 5 boxes, marked `ok` | [#251](https://github.com/byronwall/srcly/pull/251) |
| Inline function names | 34 of 74 frames on `/docs/[id]` | "(anonymous) in [id].tsx" | `<Match> child`, `createResource callback`, `onClick on <button>` (#253) |

After the sweep, 100 of the 102 probes pass. The other two are probe artefacts: a second read of the same prop, and `props.children`, which correctly ends at its own `<b>`.

srcly's own client is in the survey corpus, so each PR's baseline shows what moved there. The last standard-library fix alone removed 54 of its 146 `external-code` stops. Component traces that read `ok` while walking nothing (`CompareApp`) now name where they stop.

## Round 1 — implement

V1 is [#252](https://github.com/byronwall/srcly/pull/252). The routes op names each page route's component (its file's default export). The client opens a page route on that component's data trace. A **Route** lens switch (**Data** / **Components**) keeps the render tree one click away (`lens=components`). V2 is #251 above, and V3 is #236.

## Round 2 — test (2026-10-28)

| Task | Start | Answer | Focus | Reading | Honesty | Parts | Next | Total | Δ R1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 what drives `/docs/[id]` | 4 | 3 | 2 | 3 | 3 | 3 | 3 | **21** | +14 |
| T2 where `title` comes from | 2 | 4 | 2 | 3 | 3 | 3 | 3 | **20** | +5 |
| T3 where `doc` goes | 2 | 4 | 2 | 3 | 3 | 3 | 3 | **20** | +8 |
| T4 what saving writes | 2 | 4 | 1 | 2 | 2 | 3 | 2 | **16** | +3 |
| **Total /16** | **10** | **15** | **7** | **11** | **11** | **12** | **11** | **77 / 112 (69%)** | **+30** |

What moved:

- **T1.** The route opens on `DocView`'s data ([shot](shots/r2-t1-01-route-opens-on-data.png)). `params` → `createResource` → `fetchDoc` → `doc` → both `Match` branches → `d` → `<Title>` and `<Meta>`, `DocumentViewer`, and the content-ID text. The inspector lists those ends in the code's words and names the 4 places the trace stops. The render tree is the Components lens ([shot](shots/r2-t1-02-components-lens.png)). Focus stays at 2: 555 values in 74 functions, folded by function.
- **T2.** Backward from `title`, the origins are `URL: useParams()`, `database read: prisma.doc.findUnique(…)` and `findFirst(…)`, both routes' resources, and `process.env` ([shot](shots/r2-t2-01-title-origins.png)).
- **T3.** Forward from `doc`, the trace goes through `<Match when={doc()}>` into `d` and on to `DocumentViewer` (580 boxes, `partial`, 2 stops named) ([shot](shots/r2-t3-01-doc-through-match.png)).
- **T4.** Saving ends at three named writes: `database write: prisma.doc.update(…)`, `tx.actionEvent.create(…)` and `tx.docActivityDaily.upsert(…)` ([shot](shots/r2-t4-01-database-writes.png)). Six `runUpdateDoc` dead ends are noise: the walk reaches the action's `useAction` sites.
- **Opening time.** A rebuild of visual-notes takes about 6 s. The first data query after it takes 15–22 s while the fact index builds. Later queries take under 1 s, or 0.03 s from the result cache.

## Where it stands

From 47 to 77 of 112 (+64%), with 19 PRs: #236–#254.

Focus is now the weakest dimension (7/16). The open gaps are in the backlog grid (`area-data-flow-tsx-usability-audit-2026-10`):

1. **Floods.** A route's data trace draws 500+ values. Open the route's own frame and the first component each value goes to, and fold the rest by component.
2. **Components lens.** The gap list repeats one line hundreds of times in engine words, and selecting an origin re-lays out the canvas.
3. **Action parameters** walk into their `useAction` sites (T4's noise).
4. **`when`** on `Show` and `Match` reads "DOM attribute"; it decides a branch.
5. **First query after a rebuild** (shared with the Python audit's `task-first-query-after-a-rebuild-times-out`).
