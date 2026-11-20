---
title: Define the HTTP dispatch evidence contract
origin: repo-reading-brief
topic_id: srcly.http-dispatch-evidence-contract.v1
source_edition: 2026-11-06
source_url: https://chatgpt.com/space/page_880f01ddd7b88191b0c5d8d3cdd04a75
status: research-proposal
---

# Define the HTTP dispatch evidence contract

Clarify what an HTTP reference with `resolution="exact"` establishes: one best match under Srcly's path policy, or the handler selected by a particular framework's router. The new HTTP seam already supplies useful navigation. This note proposes a small differential check before extending its execution claims.

Assistant-generated research from the [November 6, 2026 Repo Reading Brief](https://chatgpt.com/space/page_880f01ddd7b88191b0c5d8d3cdd04a75). Exclude this document, branch, PR and derivative research from future substantive-activity ranking. This change adds one research document. It does not modify application code, tests, graph contracts or existing results.

## Readings

- FastAPI, [Path Parameters: Order matters](https://fastapi.tiangolo.com/tutorial/path-params/#order-matters), living documentation checked November 6, 2026. Path operations are evaluated in declaration order. Its fixed-path example must precede the overlapping parameter path.
- Starlette, [Routing: Route priority](https://starlette.dev/routing/#route-priority), living documentation checked November 6, 2026. Routes are checked in order; place specific routes before general ones. The same page documents method constraints, mounts, host routing and path converters.
- OpenAPI [3.1.0 Paths Object](https://spec.openapis.org/oas/v3.1.0.html#paths-object), February 15, 2021. Its URL matching description gives concrete paths precedence over templated counterparts. That interface-description rule is useful context, but does not prove the dispatch order of a running FastAPI application.

The actionable distinction is between an extracted candidate, a destination selected under a modeled framework configuration, and a destination observed in one execution. A runtime observation validates that execution; it does not establish complete static coverage.

## Verified repository baseline

Inspected November 6, 2026. Documentation baseline: main `668b66aa6070c4f2ffe7557c6c012678ba831ac2`. Independent product change: [#358](https://github.com/byronwall/srcly/pull/358), merged November 5, adds TypeScript requests joined to Python handlers. The relevant implementation and test files are unchanged from its merge commit `6c1152280305bfa89ad707443a0d06692b92e724`.

1. The [index's `_link_http`](https://github.com/byronwall/srcly/blob/668b66aa6070c4f2ffe7557c6c012678ba831ac2/server/app/services/symbols/index.py) constructs mounted paths, compares request method and path segments, assigns a cost to parameter or wildcard matches, and retains only lowest-cost candidates. One retained candidate becomes `resolution="exact"`; ties become `"name"`.
2. The [current HTTP test](https://github.com/byronwall/srcly/blob/668b66aa6070c4f2ffe7557c6c012678ba831ac2/server/tests/test_symbol_index_http.py) declares `GET /{item_id}` before `GET /special` on the same FastAPI router. It asserts an exact edge to `special` and no edge to `get_item`, with a comment that a literal segment beats the parameter. The fixture's `item_id` is annotated `int`.
3. The [client adapter](https://github.com/byronwall/srcly/blob/668b66aa6070c4f2ffe7557c6c012678ba831ac2/client/src/viz/deps/symbols/adapter.ts) describes an unambiguous HTTP edge as matched by method and path, and maps non-guess edges to graph status `proven`. HTTP edges remain dashed. The research question is therefore both about the matching policy and what that confidence means to a reader.
4. Existing extraction covers prefixes, methods and several request forms. Preserve that work. The [code map](https://github.com/byronwall/srcly/blob/668b66aa6070c4f2ffe7557c6c012678ba831ac2/docs/CODE_MAP.md) names the existing HTTP seam and its owners; no second graph or router implementation is proposed.

## Framework-only observation

A locally authored fixture registered two routes on `APIRouter(prefix="/items")`, then mounted it with `app.include_router(router, prefix="/api")`. It requested `GET /api/items/special` through FastAPI's `TestClient` in four cases:

| Registration order | Parameter annotation | Observed response |
| --- | --- | --- |
| `/{item_id}`, then `/special` | `int` | 422, integer parsing error for `item_id="special"` |
| `/special`, then `/{item_id}` | `int` | 200, `special` handler |
| `/{item_id}`, then `/special` | `str` | 200, `get_item` handler with `item_id="special"` |
| `/special`, then `/{item_id}` | `str` | 200, `special` handler |

The four cases first passed with FastAPI 0.141.1 and Starlette 1.6.0 in the available Python 3.12 environment. They were then expressed as four parametrized pytest cases and repeated through `uv run --locked pytest` in this checkout's server environment: FastAPI 0.121.3 and Starlette 0.50.0, **4 passed in 0.77s**. The fixture did not import Srcly. No production server, real project or network request was used; `TestClient` called the synthetic ASGI app in process.

For reproducibility, the fixture setup was equivalent to:

```python
router = APIRouter(prefix="/items")

def integer_item(item_id: int):
    return {"handler": "get_item", "item_id": item_id}

def string_item(item_id: str):
    return {"handler": "get_item", "item_id": item_id}

def special():
    return {"handler": "special"}

routes = [("/{item_id}", integer_item if typed else string_item),
          ("/special", special)]
if not dynamic_first:
    routes.reverse()
for path, endpoint in routes:
    router.get(path)(endpoint)
app = FastAPI()
app.include_router(router, prefix="/api")
with TestClient(app) as client:
    response = client.get("/api/items/special")
assert (response.status_code, response.json().get("handler")) == expected
```

The parameter triples `(dynamic_first, typed, expected)` were `(True, True, (422, None))`, `(False, True, (200, "special"))`, `(True, False, (200, "get_item"))` and `(False, False, (200, "special"))`. Imports were `APIRouter` and `FastAPI` from `fastapi`, and `TestClient` from `fastapi.testclient`.

**Evidence limit:** this verifies framework behavior and contrasts it with a statically inspected Srcly assertion. Srcly's extractor, application suite and browser were not run against the fixture. No Srcly application defect, production misroute, prevalence estimate or implemented repair is claimed. The integer annotation produces validation failure after a route matches; it is not the same as a path converter such as `{item_id:int}`.

## Smallest useful follow-up

A separate implementation or validation task can use the existing HTTP-index tests and the locked framework environment:

1. Run the same four synthetic cases through `build_symbol_index`. Capture every HTTP reference, target, `via` and `resolution`, then compare them with framework status and handler identity. Do not patch expectations first.
2. Add a non-overlapping static-route control. Check that useful current matching remains intact.
3. State the intended contract for `exact` and the client graph's `proven` status. If they mean runtime dispatch, record the framework, effective registration order and supported route conditions that justify the claim. If they mean a match within an approximate policy, make that boundary explicit.
4. Only then add one mounted-order case or one path-converter case already within the intended support boundary. Keep annotation validation distinct from converter matching. Do not transfer FastAPI's ordering rule to Flask without its own source and fixture.
5. Keep any future repair in the existing HTTP seam. A valid outcome is narrower confidence or an unsupported-configuration boundary when order cannot be resolved, rather than a new runtime-capture subsystem.

For each case retain the source, registration order, method/path, framework versions, Srcly SHA, extracted candidates, confidence, observed handler/status and any unresolved configuration. Stop after the bounded comparison if the contract is clear. Broader surveys or a framework-dispatch model require a separate decision.

## Overlap and scope

All 85 open personal-repository PRs were reviewed for topic overlap, followed by Srcly all-state searches for HTTP, route order, route priority, dispatch and literal matching. Research, intent and backlog material across 184 fetched Srcly remote refs was searched for the proposed dispatch topic. No matching HTTP dispatch-contract proposal was found.

Related work keeps its scope:

- [#358](https://github.com/byronwall/srcly/pull/358) owns the merged HTTP bridge implementation. This note is a source-backed validation question about that bridge.
- [#153](https://github.com/byronwall/srcly/pull/153) and [#256](https://github.com/byronwall/srcly/pull/256) concern value-flow projection witnesses and source-relation presentation. This note concerns the framework rule used to select an HTTP destination before such presentation.
- [#308](https://github.com/byronwall/srcly/pull/308) proposes offline review of Solid callback models. It does not own Python HTTP dispatch.
- [#113](https://github.com/byronwall/srcly/pull/113) concerns analysis reuse. [#366](https://github.com/byronwall/srcly/pull/366) concerns refactor-journal failure models. Neither is an activity signal for this proposal.
- Open refactor stack #362–365 and #369 remains separate. This note neither changes nor validates it.

The documentation branch does not change application code, tests, dependencies, lockfiles, generated contracts, backlog items, releases or settings. The framework fixture is described here, not installed as a repository test. Proposed Srcly experiments and any repair require separate authorization.
