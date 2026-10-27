# Python data flow: usability audit (October 2026)

This audit drives srcly's Data flow UI on three open-source Python repos. It asks how well the UI answers the questions a working developer brings to it. It runs as a loop: test, synthesize, implement, then test again.

## Who the user is

A developer who wants to understand code. An agent wrote it, or they have not seen it in a while, or they study how repos are put together. They are not new to programming or to Python web apps. They use data flow for four or five jobs:

1. Explain what an endpoint does with its input.
2. Find where a value comes from.
3. Find where a value goes, and what a change to it touches.
4. See how the layers of an app (route, service, repository, model, task) connect.
5. See what a function touches outside itself (database, files, network, environment).

The main concern: the screen shows too much, and it is not clear how the parts (canvas, toolbar, inspector rail, legend, code viewer, menus) work together.

## Repos

| Repo | Files | Shape | Why it is here |
| --- | ---: | --- | --- |
| `full-stack-fastapi-template` (`backend/`) | 43 | FastAPI, SQLModel, `Depends` aliases | Small enough to check every answer by reading the code |
| `mealie` | 695 | FastAPI, class-based controllers, service and repository layers | Depth and scale |
| `paperless-ngx` (`src/`) | 412 | Django REST Framework, Celery | No FastAPI or Flask routes, so no route picker |

All three are in `~/Projects/oss-python`. Each Program build takes real memory, so the audit opens one repo at a time.

## Tasks

The task set comes from a consider-and-contrast pass. Three options were scored: route walks only, value anchors only, or a mix led by the jobs above. The mix won because it is the only set that uses every UI surface and covers every Python flow shape.

Each task names its repo, its job (from the list above), the UI surfaces a developer would reach for, and what a perfect tool shows.

| # | Repo | Job | Task | Surfaces | A perfect tool shows |
| --- | --- | --- | --- | --- | --- |
| T1 | template | 1 | What does `POST /api/v1/items/` do with its body? | Route picker, handler anchor, canvas, inspector | `item_in` from the JSON body → `Item.model_validate(item_in, update={"owner_id": current_user.id})` → `session.add` / `commit` (database write) → the returned `Item` as the response. The owner comes from the token. One screen, in reading order. |
| T2 | template | 2 | In a protected route, where does `current_user` come from? | Anchor on a parameter, Trace from (backward) | `CurrentUser` → `Depends(get_current_user)` → `token` (`OAuth2PasswordBearer`, request header) and `session` (`get_db`) → `jwt.decode(token, settings.SECRET_KEY)` → `TokenPayload.sub` → `session.get(User, …)`. It names the 401/403/404 exits. |
| T3 | template | 3 | If I change `User.email`, what reads and writes it? | Anchor on a model field, Trace to (forward), multi-anchor | Every route, CRUD function and email helper that reads or sets `email`, grouped by file. It separates reads from writes. |
| T4 | template | 2, 3 | Where does `settings.SECRET_KEY` come from and where does it go? | Anchor from the code viewer, Both | Origin: the environment through `pydantic-settings` (`.env`). Uses: JWT encode in `create_access_token`, decode in `get_current_user` and `verify_password_reset_token`. It names the environment as the start. |
| T5 | mealie | 4 | How does "create recipe from URL" travel from the route to the database? | Route picker, frames, inspector, open code | `ScrapeRecipe.url` → `RecipeController.parse_recipe_url` → scraper service → HTTP fetch (network) → parse → `RecipeService.create_one` → repository → database. Frames by layer, with the network and database ends named. |
| T6 | mealie | 2 | Where can a recipe's `slug` come from? | Anchor on an assignment, Trace from | The recipe name (request body or scraped title) through `slugify`, plus the de-duplication suffix. It names each branch that can set it. |
| T7 | mealie | 5 | What does `RecipeService.create_one` touch outside itself? | Effects panel in the code viewer, inspector | Database writes (recipe, ingredients, assets), file writes (image directory), events published, and the user and household it reads. Each with a line to open. |
| T8 | paperless | 1 | Where does an uploaded document go after `PostDocumentView.post`? | No route picker (Django). Anchor from the treemap or code viewer, Trace to | `request.data` → serializer `validated_data` → temp file write → `ConsumableDocument` → `consume_file.apply_async(...)` (Celery boundary, named) → the task id as the response. |
| T9 | paperless | 2, 4 | What feeds the `consume_file` task's arguments? | Anchor on a function, Trace from, multi-anchor | Every `consume_file.apply_async` / `delay` call (upload view, mail fetch, folder watcher, bulk edit), each with where its `input_doc` comes from. The Celery hand-off is named, not silent. |
| T10 | paperless | 4 | How do the values in `documents/serialisers.py` connect to the views and models? | File anchor (`path@*`), import graph, treemap menus | The serializers in the file, which views use each one, and which model fields each one reads or writes. Folded by class so the screen stays readable. |

## Rubric

Each task is scored on seven dimensions, 0 to 4. A perfect tool scores 28. Each score has a reason and a screenshot.

| Dimension | What it measures | 0 | 2 | 4 |
| --- | --- | --- | --- | --- |
| **Start** | Getting from the question to the right view, using only labels and menus on screen | No path from the UI; needs a hand-built URL or internal knowledge | Possible, but the right control is hidden, or its label does not say what it does | The obvious control is where the developer looks first |
| **Answer** | The key origins, hops and ends that a careful code reader would list (the "perfect tool" column) | None of them | About half, or the key one is missing | All of them |
| **Focus** | What is on screen serves the question | The answer is lost in boxes, badges and panels that do not help | The answer is there, but the developer must filter it by eye | Only what helps, and the answer stands out |
| **Reading** | The developer can read the flow as a story: order, labels, and why each step holds | Boxes with no order or with internal names | The order is clear; labels or proofs need decoding | Reads in order in plain words, with the proof one click away |
| **Honesty** | Stops and unknowns are named where they happen. No false `ok`. Not analyzed is never 0 | Silent gaps, or a confident wrong answer | Gaps named, but far from where they happen, or vague | Every stop named in place, with a reason a developer acts on |
| **Parts together** | Canvas, toolbar, inspector, legend and code viewer tell one story. Each panel does one job. Selecting in one updates the others | The panels conflict or repeat each other; the developer cannot tell which to read | Linked, but with repeated or unexplained signals | Each panel has a clear job, and they stay in step |
| **Next step** | From the answer, the developer can open code, pivot the trace, expand or narrow it | Dead end | Some moves; the developer must start over for others | Every natural next move is one action |

Each task also records:

- **Actions:** clicks and keystrokes from the repo's start page to the answer.
- **Cause:** for each lost point, `engine` (the data is not in the API reply) or `ui` (the reply has it and the view hides or confuses it). One API call settles this. The UI is the main subject; the API is only the check.

## The loop

Each round has three phases.

1. **Test.** Drive all ten tasks in the browser, one repo at a time. Save screenshots to `shots/r<round>-t<task>-<step>.png`. Score each task against the rubric. Record actions and causes.
2. **Synthesize.** Group the lost points into gaps. Rank the gaps by the points they cost across tasks, with UI clarity first. Write each gap as a backlog node in `pgm/data` (project `srcly-backlog`) with its evidence, files and done condition.
3. **Implement.** Fix the two or three top gaps, one stacked PR each, with before and after screenshots. Then start the next round and re-score.

The loop stops after three rounds, or earlier when a round raises no task score. A blocker during a test (a repo does not analyze, a view does not open) scores 0 with its reason and the round continues.

## Rounds

Scorecards, gaps and screenshots for each round follow below as the rounds run.

### Round 1 — test (2026-10-26)

Setup: `main` at `78a841e`. Each repo had its locked packages installed (`uv sync --no-dev`) so mypy could resolve FastAPI, SQLModel and Django. Browser at 1440×900. Screenshots are 2x captures of the same URLs.

#### Scorecard

| Task | Start | Answer | Focus | Reading | Honesty | Parts | Next | Total /28 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 endpoint body (template) | 1 | 2 | 2 | 2 | 1 | 1 | 2 | **11** |
| T2 where `current_user` comes from (template) | 2 | 2 | 3 | 3 | 2 | 2 | 2 | **16** |
| T3 who reads `User.email` (template) | 3 | 3 | 1 | 1 | 2 | 1 | 2 | **13** |
| T4 `SECRET_KEY` both ways (template) | 3 | 3 | 0 | 1 | 3 | 1 | 1 | **12** |
| T5 recipe from URL, route to database (mealie) | 0 | 1 | 2 | 2 | 0 | 2 | 1 | **8** |
| T6 where `slug` comes from (mealie) | 2 | 0 | 2 | 2 | 0 | 2 | 1 | **9** |
| T7 what `create_one` touches (mealie) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | **7** |
| T8 where an upload goes (paperless) | 1 | 2 | 1 | 2 | 0 | 2 | 1 | **9** |
| T9 what feeds `consume_file` (paperless) | 2 | 1 | 3 | 3 | 2 | 2 | 1 | **14** |
| T10 how `serialisers.py` connects (paperless) | 2 | 0 | 1 | 1 | 2 | 1 | 0 | **7** |
| **Total /40** | **17** | **15** | **16** | **18** | **13** | **15** | **12** | **106 / 280 (38%)** |

The tool does best on small, local questions in a small FastAPI app (T2, T9). It does worst when the answer crosses a boundary that Python apps use all the time: an ORM write, a closure, a Celery task, a router subclass, or a pydantic validator. In those cases it often still says `ok`. Honesty (13/40) and Next step (12/40) are the weakest dimensions.

#### What happened, task by task

**T1 — `POST /api/v1/items/`.** At the repo root, Data flow picks TypeScript because `frontend/` has a `tsconfig`. The route picker lists ten `.tsx` routes and nothing shows that a Python backend exists ([shot](shots/r1-t1-01-root-picks-typescript.png)). Folder rows have no menu. The only way in is to type `…/backend` into the path box. There, the picker lists 23 routes, but without the app's `/api/v1` prefix ([shot](shots/r1-t1-04-python-route-picker.png)). The route opens a function anchor that shows parameters in and the return out ([shot](shots/r1-t1-02-create-item-anchor.png)). It does not show the body: `Item.model_validate(...)` and `session.add(item)` are not drawn. The engine knows `session.add`, but stops there as `external-code`, so the one thing a "create" endpoint does, the database write, is missing. The anchor still reads `ok`. Selecting `item_in` shows an inspector that says "rendered by", prints "structuralstructural", and ends with "Function effects failed (404): … TypeScript-only" ([shot](shots/r1-t1-03-item-in-selected.png)). A second direction control (Reach Both/Up/Down) appears next to Trace From/Both/To.

**T2 — `current_user`.** A canvas box has no "trace from here". Right-click shows only a hover card. The path is: double-click → code viewer (a third of it is a metrics panel) → right-click the line → "Trace where it comes from". The menu also offers "Inspect value flow", a third tool with no word on how it differs. The trace stops at `session.get(User, token_data.sub)` and calls that the origin ([shot](shots/r1-t2-01-current-user-backward.png)). It does not follow the key into `jwt.decode`, the token and `SECRET_KEY`. The engine can: a trace from `token_data` reaches all of them ([shot](shots/r1-t2-02-token-data-backward.png)). In that trace, orange box borders and "Partial: some paths stop at frontiers" appear, but no frontier box is drawn and the inspector lists no stop. The token's origin says "enters from Depends(…)" at the `CurrentUser` alias, not at the `OAuth2PasswordBearer` header.

**T3 — `User.email`.** Getting there is easy: tree → `models.py` → right-click → Trace where it goes. The answer is mostly right but unreadable: 61 boxes in 11 frames at about 6 px, with frame titles cut off ([shot](shots/r1-t3-01-email-forward.png)). The trace is `ok`, but about 25 boxes have the "Partial: the engine omitted some of what is inside" border. The legend is one static list in React/Solid words: "Terminal: where a value reaches the DOM", "Control: a Show, For, Suspense", "Rendered per item: inside a For" ([shot](shots/r1-t3-02-legend-tsx-vocabulary.png)). Branch tests (`user`, `settings.emails_enabled and user_in.email`) are listed as terminals.

**T4 — `SECRET_KEY`.** The environment origin and all four JWT uses are found. The trace then follows the token into every route that uses `current_user`: 180 boxes downstream in 32 functions ([shot](shots/r1-t4-01-secret-key-both.png)). Data flow has no hop limit or "stop at first use". The inspector says "stops at 10 places" and the footer says 11.

**T5 — mealie, recipe from URL.** At the repo root: "Data flow N/A — the tsconfig is not strict. frontend/tsconfig.json has strictNullChecks off" ([shot](shots/r1-t5-01-mealie-root-na.png)). At `mealie/mealie`: "the engine timed out. The engine did not answer routes within 30 s." The helper alone takes 40.6 s cold (1.6 GB) on 480 files. The progress bar does not move during the mypy phase. With the timeout raised to 240 s, 213 routes load, but the whole recipe controller is missing: the helper knows a router only by the names `APIRouter`, `FastAPI`, `Flask` and `Blueprint`, so 82 routes on `UserAPIRouter(APIRouter)` are lost (`engine/python/srcly_pyfacts.py:580`). From the code viewer, `req` traces to `url` and stops at the nested `async def create()` that passes it on ([shot](shots/r1-t5-02-req-forward-stops-at-closure.png)). The outcome is `ok` with no frontier. A name inside that closure cannot be selected ("No url on line 368"). From the scraper, the trace ends at the abstract `ABCScraperStrategy` and at attribute writes, with no network fetch and no database create ([shot](shots/r1-t5-03-scraper-url-forward.png)).

**T6 — mealie, `slug`.** Backward from the `slug` field: 3 boxes, `ok`, no writers ([shot](shots/r1-t6-01-slug-field-backward-empty.png)). The real writers are the `validate_slug` validator, `slugify(name)` in the scraper's cleaner, and the de-duplication suffix in `repository_recipes.py:134`. The validator's parameter is `untraced`. `document.slug = …` cannot be selected.

**T7 — mealie, what `create_one` touches.** The tile menu has no "what does this touch". The code viewer has no effects section for Python. The graph inspector shows "Function effects failed (404)" ([shot](shots/r1-t7-01-create-one-effects-404.png)). A function anchor mixes in what the callers do (a file write in `create_from_zip`). The method's own writes (`repos.recipes.create`, `user_ratings.create`, `recipe_timeline_events.create`) show as plain transform boxes. Inspector proof words are "renders id" and "handoff".

**T8 — paperless, upload.** The build timed out at 240 s and kept running after the UI said N/A. It finished after about 7.5 minutes and 3.6 GB, with the whole machine deep in swap, so this time is not a clean measure. The helper also ignores the project's mypy plugins (`mypy_django_plugin`, `mypy_drf_plugin`). Data flow then says "No routes here — a file under a routes/ folder that default-exports a component" ([shot](shots/r1-t8-01-django-no-routes-tsx-copy.png)). `doc_data` correctly ends at the temp-file write. `input_doc` is shown flowing into `apply_async(...)`, then `async_task.id`, then the HTTP response, marked `ok` ([shot](shots/r1-t8-02-input-doc-false-ok-into-response.png)). That path is false: the task id does not carry the document, and the first-party `consume_file` task is never entered. `request` forward finds no request origin and draws 461 boxes before the budget runs out ([shot](shots/r1-t8-03-request-forward-461-boxes.png)).

**T9 — paperless, `consume_file`.** Backward from `input_doc`: "enters from @shared_task", `ok`, 4 boxes ([shot](shots/r1-t9-01-consume-file-backward.png)). The entry is named, which is honest, but none of the 14 in-program `apply_async`/`delay` callers are linked.

**T10 — paperless, `serialisers.py`.** A file anchor shows a red "Exports failed (404): A file's exports is TypeScript-only" in the middle of an empty canvas ([shot](shots/r1-t10-01-file-anchor.png)). The node menus still offer it on Python files.

#### Environment notes

- The pane's path box ignored typed input once. The audit opened repos by URL; Start scores count in-app moves only.
- The 30 s query timeout was raised to 240 s (`SRCLY_DATAFLOW_TIMEOUT`, local `launch.json` only) so mealie and paperless could be tested at all. Start scores for T5–T10 still count the timeout.
- `pnpm shot` captured the graph before layout settled (no edges). The audit used a capture that waits.

### Round 1 — synthesize

Lost points are grouped into gaps and ranked by the points they cost across tasks. Gaps that make the screen unclear rank first among equals. `ui` gaps need no engine change; `engine` gaps need the helper or the analysis.

| # | Gap | Tasks | Cause | Cost |
| --- | --- | --- | --- | --- |
| G1 | Python is hidden at a mixed repo's root: a `tsconfig` anywhere within three levels wins, and a non-strict one refuses the whole root. All three repos hit it. No control switches language or points to the Python folder. | all | ui + server | Start on every task |
| G2 | A mid-size Python app never opens: the 30 s query timeout covers the first build (mealie 40 s, paperless minutes). The progress bar freezes, N/A has no retry, and the helper keeps running after N/A. | T5–T10 | server + engine | Start 0–1, blocks the rest |
| G3 | `ok` claims that are not true: function anchors with stops inside, a field with zero writers, a library call whose return is assumed to carry its arguments (`apply_async(...).id`), a closure the walk cannot enter. Status words disagree (`ok` with Partial borders; 10 vs 11 stops). | T1 T3 T5 T6 T8 | engine + ui | Honesty 13/40 |
| G4 | TypeScript/Solid words and TypeScript-only features shown on Python: legend (DOM, Show/For, component), "rendered by", "renders id", "handoff", "structuralstructural", the routes empty state, and red 404 text for effects and file exports. | T1 T3 T7 T8 T10 | ui | Parts, Reading |
| G5 | Too many ways to say the same thing: Trace From/Both/To beside Reach Both/Up/Down; three code-menu entries; reach counts in the inspector and the footer; no "trace from this box" on the canvas. | T1 T2 T4 T7 | ui | Parts, Next |
| G6 | Floods: a forward trace follows a value into every route that touches it (61, 180, 461 boxes). No hop limit, no fold by file, unreadable at Fit. | T3 T4 T8 | ui + engine | Focus |
| G7 | ORM and repository writes are not ends: `session.add/commit/delete`, `sqlmodel_update`, Django `save`/`objects.create` stop as `external-code`. | T1 T4 T7 | engine (rows) | Answer |
| G8 | Routes on `APIRouter` subclasses are lost (mealie: 82). Mount prefixes from non-literal `include_router(prefix=settings.API_V1_STR)` are dropped. | T1 T5 | engine (helper) | Start, Answer |
| G9 | A function or name inside a nested `def` is not walked or selectable. | T5 | engine (helper) | Answer, Honesty |
| G10 | Writers of a model field (constructor kwargs, validators, `obj.field = …`) are not collected. Attribute assignment targets are not selectable. | T6 | engine (helper) | Answer |
| G11 | No effects view for Python ("what does this function touch"). | T7 | engine + ui | Answer |
| G12 | Framework hand-offs not followed: an external read's key argument (`session.get(User, token.sub)`), Celery `apply_async`/`delay` into a first-party `@shared_task`, Django/DRF view `request` as an origin. | T2 T8 T9 | engine | Answer |

Round 1's implement step takes G1, G4 and G2. All three are about whether the screen is clear and honest before any analysis runs, and every task pays for them. The engine gaps (G3, G6–G12) go to the backlog with their evidence.

### Round 1 — implement

Three PRs, each merged on its own after CI passed:

- **G1 — [#218](https://github.com/byronwall/srcly/pull/218).** A TypeScript root names the Python apps below it (`status.pythonApps`: a Django folder, else the deepest project file). The route picker and the N/A and empty states open one in a click: template → `backend/`, mealie → `mealie/`, paperless-ngx → `src/`.
- **G4 — [#220](https://github.com/byronwall/srcly/pull/220).** In anchor mode the inspector names the engine's relation (`request binding`, `carrier`, `field input`) instead of "rendered by". The legend has a value vocabulary. `status` reports the root's language. On Python, effects and file anchors say "Not available for Python yet" instead of a red 404, and the routes empty state names FastAPI and Flask.
- **G2 — [#219](https://github.com/byronwall/srcly/pull/219).** The cause was not the 30 s limit itself. The client's `status` polls counted as queries, so the first build lost its size-scaled timeout. Polls no longer count, the background build waits up to the helper's own 10 minutes, and the progress panel shows the seconds so far. mealie now opens cold in 49 s with default settings.

### Round 2 — test (2026-10-27, `main` at `5a34ea6`)

| Task | Start | Answer | Focus | Reading | Honesty | Parts | Next | Total | Δ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 | 3 | 2 | 2 | 2 | 1 | 2 | 2 | **14** | +3 |
| T2 | 2 | 2 | 3 | 3 | 2 | 2 | 2 | **16** | 0 |
| T3 | 3 | 3 | 1 | 1 | 2 | 2 | 2 | **14** | +1 |
| T4 | 3 | 3 | 0 | 1 | 3 | 2 | 1 | **13** | +1 |
| T5 | 1 | 1 | 2 | 2 | 0 | 2 | 1 | **9** | +1 |
| T6 | 2 | 0 | 2 | 2 | 0 | 2 | 1 | **9** | 0 |
| T7 | 1 | 1 | 1 | 1 | 2 | 2 | 1 | **9** | +2 |
| T8 | 2 | 2 | 1 | 2 | 0 | 2 | 1 | **10** | +1 |
| T9 | 2 | 1 | 3 | 3 | 2 | 2 | 1 | **14** | 0 |
| T10 | 2 | 0 | 1 | 1 | 3 | 2 | 1 | **10** | +3 |
| **Total /40** | **21** | **15** | **16** | **18** | **15** | **20** | **13** | **118 / 280 (42%)** | **+12** |

What moved:

- Every repo now opens its Python app from its root in one visible click ([template](shots/r2-t1-01-root-offers-backend.png), [mealie](shots/r2-t5-01-mealie-root-offers-mealie.png), [paperless](shots/r2-t8-01-paperless-root-offers-src.png)). Start stays below 4 where the task still needs a detour: T5's route is still missing (G8), and re-anchoring from a box still goes through the code viewer (G5).
- The inspector and legend speak about values ([T1](shots/r2-t1-02-item-in-inspector.png), [T3](shots/r2-t3-01-email-legend.png), [T7](shots/r2-t7-01-create-one-inspector.png)). Two direction controls still sit side by side, so Parts stays at 2.
- Unsupported features say so plainly and point to what works ([T8 empty state](shots/r2-t8-02-django-no-routes-python-copy.png), [T10](shots/r2-t10-01-file-anchor-calm.png)).
- Answer, Focus and Reading did not move. The rest of the score is in the engine: database writes (G7), lost routes (G8), false `ok` (G3), floods (G6), closures, field writers and framework hand-offs (G9, G10, G12).

### Round 2 — synthesize

The UI gaps that cost points on every task are fixed. The next points are in what the engine draws, ranked by points across tasks:

1. **G8 — routes on `APIRouter` subclasses.** T5 Start and Answer. Contained in the helper's router table.
2. **G7 — ORM writes as ends.** T1, T4, T7 Answer. Rows in `engine/models/python.json`.
3. **G3 — false `ok`.** T1, T5, T6, T8 Honesty. Start with the library call whose result is assumed to carry its arguments (`apply_async(...).id`).

Round 2's implement step takes them in that order.

### Round 2 — implement

Three more PRs, each merged after CI passed:

- **G8 — [#221](https://github.com/byronwall/srcly/pull/221).** A first-party subclass of `APIRouter` is a router. A mount prefix carries through every router above it, and may be a settings field with a literal default. A root that is itself a package names its modules from above it. mealie: 213 → 289 routes, `POST /api/recipes/create/url` listed, relations 73,729 → 81,734. Template routes show `/api/v1`.
- **G7 — [#222](https://github.com/byronwall/srcly/pull/222).** SQLAlchemy and SQLModel session writes (`add`, `add_all`, `delete`, `merge`, and the async session's) end a trace as "database write".
- **G3 — [#223](https://github.com/byronwall/srcly/pull/223).** A value handed to library code with no model carries the `external-call` proof, which counts as assumed, so a trace that lands only through it is `partial`. A built-in type's method, or a standard container protocol's, is modelled. srcly's own survey: four `server` traces that pass through `pathlib`, `subprocess` or a thread pool move from `ok` to `partial`.

### Round 3 — test (2026-10-27, `main` at `079fc86`)

| Task | Start | Answer | Focus | Reading | Honesty | Parts | Next | Total | Δ R2 | Δ R1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 | 3 | 3 | 2 | 2 | 1 | 2 | 2 | **15** | +1 | +4 |
| T2 | 2 | 2 | 3 | 3 | 2 | 2 | 2 | **16** | 0 | 0 |
| T3 | 3 | 3 | 1 | 1 | 2 | 2 | 2 | **14** | 0 | +1 |
| T4 | 3 | 3 | 0 | 1 | 3 | 2 | 1 | **13** | 0 | +1 |
| T5 | 2 | 2 | 1 | 2 | 0 | 2 | 1 | **10** | +1 | +2 |
| T6 | 2 | 2 | 1 | 1 | 2 | 2 | 1 | **11** | +2 | +2 |
| T7 | 1 | 2 | 0 | 1 | 2 | 2 | 1 | **9** | 0 | +2 |
| T8 | 2 | 2 | 1 | 2 | 2 | 2 | 1 | **12** | +2 | +3 |
| T9 | 2 | 1 | 3 | 3 | 2 | 2 | 1 | **14** | 0 | 0 |
| T10 | 2 | 0 | 1 | 1 | 3 | 2 | 1 | **10** | 0 | +3 |
| **Total /40** | **22** | **20** | **13** | **17** | **19** | **20** | **13** | **124 / 280 (44%)** | **+6** | **+18** |

What moved:

- **T1.** A trace from `item_in` reaches "database write: session.add(item)" and the `POST /api/v1/items/` response ([shot](shots/r3-t1-01-item-in-reaches-write.png)). The route's own view is a function anchor that shows parameters and returns only, and it still reads `ok`, so Honesty stays at 1.
- **T5.** The route is in the picker and mealie opens with default settings (cold build 46–52 s). `req` still stops at the nested `create()` closure with `ok` (G9), so Honesty stays at 0.
- **T6.** Backward from `slug` now finds the `PUT`/`PATCH /api/recipes/{slug}` bodies, `resolve_name_and_slug` → `create_recipe_slug`, and the scraper path, and names the size-limit stop ([shot](shots/r3-t6-01-slug-writers.png)). It still misses the repository's de-duplication suffix and the validator, and draws 155 boxes in 27 functions.
- **T7.** Forward from `create_one`'s data reaches the repository's `database write: self.session.add(new_document)`, but across 423 boxes in 63 functions ([shot](shots/r3-t7-01-create-one-flood.png)). Answer went up, and Focus went to 0.
- **T8.** paperless-ngx opens with default settings (268 s, with the machine in swap). The upload's `input_doc` trace is `partial`, with `consume_file.apply_async` and `Response` named as assumed steps ([shot](shots/r3-t8-01-input-doc-partial.png)). It no longer claims the document reaches the response.

Focus went down (16 → 13). Resolving mealie's imports and following its real routes made traces reach further, and nothing on screen limits them yet. That is now the largest gap.

## Where it stands

Three rounds took the score from 106 to 124 (+17%). Six PRs merged: #218, #220, #219, #221, #222, #223. The loop stops here, after its third round.

The gaps left, ranked by points across tasks, are in the backlog grid (`area-data-flow-python-usability-audit-2026-10`):

1. **G6 — floods** (Focus 13/40). T3, T4, T6, T7, T8 draw 60 to 460 boxes. The view needs a hop limit, "stop at first use", or a fold by file that opens on demand. Now the top item.
2. **G3 — remaining false `ok`.** A function anchor reads `ok` while its body stops inside (T1). A walk stops at a closure with no frontier (T5).
3. **G9 — nested functions.** The closure stop in T5, and names in nested `def`s that cannot be selected.
4. **G5 — one control per idea.** Trace From/Both/To beside Reach Both/Up/Down; no "trace from this box" on the canvas (Next 13/40).
5. **G12 — framework hand-offs.** External-read keys (T2), Celery `apply_async` into a first-party task (T8, T9), DRF `request` as an origin.
6. **G10, G11, G7 (Django).** Field writers, an effects view for Python, and Django's `save()` / `objects.create()`.

## Round 4 — the biggest unlock per line of code

Round 4 picks fixes by user-visible gain per line changed. Two consider-and-contrast passes chose them.

**Pass 1: floods (G6).** Measured on template: `User.email` forward drew 62 boxes in 11 functions; `SECRET_KEY` both ways drew 177 boxes in 32 functions, and 106 of them sat in 16 routes two calls away. Value hops are a poor cut: `User.email` reaches 11 hops inside 4 functions. Function boundaries are a good one.

| Approach | Boxes at Fit (T4) | Ends still named on screen | Direct uses drawn in full | Expand in one action | Code |
| --- | ---: | ---: | ---: | ---: | --- |
| Fold each other function into one box (client) | 9 — 33 boxes | 8 — each box names its ends | 9 — the anchor's function stays open | 9 — the existing `open` list | ~80 lines, one adapter |
| Engine hop limit with a "deeper" frontier | 8 | 3 — a database write three calls deep is cut | 8 | 5 — a new query per expand | contract, op, server, client, survey baseline |
| Client hop filter (hide past N value hops) | 6 | 2 | 6 | 6 | a control and a filter |
| Legibility only (larger text at Fit) | 1 — still 177 | 10 | 4 | — | small |

Choice: fold by function (#224). The canvas already opens and closes frames in place, and the inspector already offers "Open the frame". A trace over 40 boxes opens folded; smaller traces are unchanged.

**Pass 2: the next unlock.** Next step scored 13/40, the weakest dimension. A canvas box had no "trace from here", so re-anchoring went through the code viewer (G5). The engine already anchors on an element id, so the fix is one inspector button (#225). It is offered on value boxes only: a function's own anchor shows parameters and returns and still reads `ok` (G3), so a folded function offers Open the frame instead.

The candidates left, by gain per line:

1. **G3 for function anchors** — a function anchor reads `ok` with stops inside (T1). Engine outcome only.
2. **G5, the rest** — Reach Both/Up/Down beside Trace From/Both/To. One control, UI only.
3. **G9 nested functions**, **G12 framework hand-offs** — engine helper work, larger.
