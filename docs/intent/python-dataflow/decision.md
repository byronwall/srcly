---
title: "Python data flow in the engine — type source decision and measurements"
slug: "python-dataflow"
phase: build
status: current
last_updated: "2026-10-24"
---

# Python data flow: where the checked types come from

Data flow mode works on TypeScript roots through `engine/`. This initiative makes it work on a Python root the same way, FastAPI first, and proves it on srcly's own `server/` and on `engine/examples/python-fastapi/`. The contracts (`engine/src/srcly/contracts/`) are already language neutral, so the work is a Python evidence provider behind the engine's fact index, a routes adapter, a session that builds it, and server availability that lets a Python root in.

The brief asked for checked types, not guessed ones: annotations, pydantic and dataclass fields, `typing`, and a real checker's inference. This page records how the type source was chosen and what each option measured.

## Decision

**Structure from `ast`, types and call targets from mypy's build API, in one Python helper the engine runs once per generation.**

- `engine/python/srcly_pyfacts.py` parses every `.py` file with the standard library's `ast`, runs `mypy.build.build` over the same modules with `export_types`, and prints ProgramElement / ProgramRelation facts in the collector's raw shape, plus the expressions a selection may name with their checked types, function scopes, call sites and FastAPI / Flask routes.
- Every box's `typeText` is mypy's type at that exact span (`typeSource: "mypy"`). Where mypy has none (a parameter, which is a declaration rather than an expression, or a file mypy could not check) the annotation's text stands in and says so (`typeSource: "annotation"`). A pydantic or dataclass field read cites the field's declaration as its proof (`ItemIn.name: str (pydantic field, app/models.py:7)`).
- mypy also resolves call targets: `CallableType.definition` names the function or method a call reaches, including `self.helper()` and methods on typed instances, which is what makes argument-to-parameter and return-to-call relations possible without guessing.
- mypy reads the project's own installed packages through `python_executable` (its `.venv`, else `VIRTUAL_ENV`, else the interpreter running the helper), so `BaseModel`, `APIRouter` and `HTTPException` resolve to their real classes.
- mypy becomes a dependency of srcly (`server/pyproject.toml`). The server runs the helper with its own interpreter, so mypy is always importable there. When it is not (the engine run by hand under another interpreter) the engine refuses with `python-checker-not-found` rather than guessing.

### Why not the others

| Option | Verdict |
| --- | --- |
| Annotations over `ast` alone | Fast and dependency free, and srcly's server is annotated almost everywhere, but 2,208 unannotated assignments, every call result and every narrowed `Optional` would need a hand-written inference engine. That is the guessing the brief rules out. Kept as the fallback text for declarations only. |
| `pyright --outputjson` | Reports diagnostics, not types. No use as a type source. |
| pyright's language server (hover) | Every position answers, and answers well, but one request at a time: 3 ms each, about 65 s for every name and attribute in `server/app`. Answers are display strings (`(parameter) root: Path`) to parse, with no call-target structure. Good for a lazy per-box lookup, too slow and too stringly to build relations on. It also needs Node's pyright package (60 MB with typeshed) or a network download through the PyPI wrapper. |
| **mypy build API** | One pass types every expression (91% precise on `server/app`), names call targets structurally, and is a pure-Python dependency of a Python package. The API is internal but has been stable for years; the helper uses `build.build`, `Options`, `format_type_bare` and `server.subexpr.get_subexpressions`, and a failed check degrades to annotation text rather than failing the analysis. |

## Measurements

### 2026-10-24 — type source options on srcly `server/`

Machine: development Mac. Python 3.13.2, Node v22.21.1. `server/app`: 56 files, 14,911 lines (tests excluded). Third-party packages from `server/.venv`. One cold run each unless noted; scripts were throwaway probes kept in the session scratchpad.

| Option | Wall | Coverage | Shape of the answer |
| --- | ---: | --- | --- |
| `ast` parse and walk, annotations only | 140 ms | parameters annotated 1,060 / 1,099 (96%); returns 627 / 679 (92%); 699 declared fields in 101 classes; 2,208 unannotated assignments, 4,420 calls, 4,803 attribute reads left to infer | annotation source text |
| `pyright --outputjson app` (1.1.414) | 2.7 s | 56 files analyzed, 76 errors | diagnostics only, no types |
| pyright language server, hover on every name and attribute load in 4 files (`routers/dataflow.py`, `routers/files.py`, `services/dataflow/engine.py`, `services/analysis.py`) | init 540 ms, first hover 650 ms, then 3.07 ms per hover: 3,214 positions in 9.9 s | 3,206 / 3,214 answered (100%) | display strings to parse |
| mypy 2.4.0 `build.build`, `export_types`, non-incremental (two runs) | 2.2 s, 2.5 s | 7,398 expressions in `app/`: 6,741 precise (91%), 473 imprecise (6%), 184 `Any` (2%) | `Type` objects; callee definitions; RSS 375 MB |

### 2026-10-24 — the chosen helper end to end

`server/.venv/bin/python -I engine/python/srcly_pyfacts.py --root <root>`, wall clock from `/usr/bin/time` (two runs on `server/`). `check` is mypy with `check_untyped_defs`; `facts` is the `ast` walk that emits elements and relations.

| Target | Files | Wall | parse | check | facts | Elements | Relations | Expressions | Routes | JSON | Peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| srcly `server/` (tests left out) | 59 | 4.9 s | 58 ms | 2,277 ms | 529 ms | 28,918 | 31,815 | 24,462 | 34 | 13.4 MB | 563 MB |
| `engine/examples/python-fastapi` | 7 | 2.8 s | 1 ms | 1,510 ms | 3 ms | 147 | 126 | | 5 | | 296 MB |

The first version emitted full JSON objects and used `ast.get_source_segment`: 61 MB and 11.8 s of facts on `server/` with its tests. Slicing source text from cached encoded lines, the C JSON encoder and a compact wire format (file indexes, ids rebuilt from kind and span, relations by element index) brought it to the numbers above. Tests (`tests/`, `test_*.py`, `conftest.py`) are left out by default (`--include-tests` reads them): they drive the app through a client, they are not its data flow.

All 34 FastAPI handlers in `server/app` come back with their router prefixes (`POST /api/dataflow/anchor-graph`, `GET /api/scans/{job_id}/result`, …), and a forward slice from `anchor_graph`'s request body reaches `body.path` and `body.file` through the real fact index (`engine/test/srcly/python-facts.test.ts`).

## How Python maps onto the engine's evidence

The engine derives origin roles, terminal roles and boundaries from an element's `kind` (`engine/src/analysis/evidence-slice-normalization.ts`), and `src/analysis` is never edited for srcly. So the helper speaks that vocabulary:

| Python | Element kind (roles the engine derives) |
| --- | --- |
| a FastAPI handler parameter's binding (path, query, body, header, cookie, form, file) | `parameter` with `originRole: request` at the route decorator, joined to the real parameter by `request-binding`; the proof names FastAPI's rule (`parses the JSON body of POST /v1/items into body: ItemIn`) |
| `os.environ[...]`, `os.getenv`, `os.environ.get` | `environment-input` (environment) |
| `open()` to read, `Path.read_text`, `json.load` | `file-input` (filesystem) |
| `requests` / `httpx` calls, `urlopen` | `fetch-input` (fetch, network) |
| `sqlite3` / SQLAlchemy queries, `subprocess` output | `external-read` (external read) |
| `sys.argv`, `input()`, `sys.stdin` | `process-input` (argument / stdin) |
| a handler's `return` | `return` with `terminalRole: http-response` |
| an entry function's `return` (nothing in the program calls it) | `return` with `terminalRole: return` |
| a helper's `return` | `return-expression`, carried to each call by `return-value` |
| `HTTPException(...)`, Starlette / FastAPI response classes | `http-response` |
| `logging` calls | `external-effect` (side effect) |
| `print`, `sys.stdout.write`, `sys.exit`, file writes | `stdout`, `exit-status`, `file-write` |
| attribute read / literal subscript | `field-read` (`operationKind: field-read`, `property`) / `index-read` |
| first-party call | `call-result`; `argument-binding` into the callee's parameters and `return-value` back; when the callee returns a value, each bound argument is also an `argument` of the call, so the slice pairs the return with the call it entered by (T13), as in TypeScript. A walk that starts inside a helper with several call sites still stops at its return (R7) |
| library call | `call-result` with `call-input` relations marked partial: the result is assumed to carry its inputs |
| pydantic / dataclass construction, dict and list literals | `object-pack` with `pack-field` per field |
| a `class` | `function-entry` over the whole class, with a scope of its own, as a `def` is: anchored by name, it is a declaration whose uses are its constructor calls (`definition` from each `Foo(…)`, as from each first-party call to its `def`) |

A file with syntax newer than the helper's interpreter is rewritten before it is parsed, when an older spelling exists that keeps every expression's columns: Python 3.14's `except A, B:` (PEP 758) becomes `except(A, B):`. mypy checks the same text. A file that still does not parse is a file gap, and anchoring a name in it says so.

Name reads join their bindings flow-insensitively within a function: the last binding before the read when every binding is straight-line, otherwise every binding that can reach it, marked `partial`.

## Slices

| PR | What it proves |
| --- | --- |
| 1 · evidence provider | the helper, the wire format, `PythonRelationProvider`; slices from a FastAPI body reach the response on the example and on srcly's server |
| 2 · session and availability | a Python root opens in Data flow mode: `Tier1` per language behind a language host, `--language python --python <interpreter>`, the server probes a Python root and names `python-checker-not-found`; routes, `selectExpression`, `valueFlow` and `anchorGraph` answer through the real engine over HTTP |
| 3 · anchor flow end to end | a route summary names its `handler`, so picking a FastAPI route (or following a `flow=` link to one) opens the handler in anchor mode; a plain read of a name is `transparent` and the anchor graph walks through it without a box; traced from the code viewer, the import graph and the route picker on the example, and from a handler on srcly's server |

On srcly's own server the `anchor_graph` handler's body comes back `partial`: its origin is found and typed (`AnchorRequest`), but `_query` is shared by every handler (an `unproven-handoff` boundary, R7), and the forward slice reaches its 128-element bound before the response, so the frontiers say so by name.

## Not yet

- `Depends()` parameters are plain inputs, not traced into the dependency function.
- A class anchored by name has no up side: the declaration path takes only the parameters a declaration owns, and a class's inputs are its `__init__`'s parameters or, for a model, the `pack-field`s into each constructor call. Its down side is where each constructor call's instance goes.
- Attribute writes (`self.x = …`) end the path; values are not followed across methods through instance state.
- The route graph (`routeGraph`) is TypeScript's render backbone and has no Python meaning; a Python route opens its handler in anchor mode instead.
