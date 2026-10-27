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
