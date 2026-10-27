---
id: task-routes-on-apirouter-subclasses-and-computed-mount-prefixes
label: Routes on APIRouter subclasses and computed mount prefixes
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
---
G8. Routes missed. `note_router` (`engine/python/srcly_pyfacts.py:580`) knows a router only by the names `APIRouter`, `FastAPI`, `Flask`, `Blueprint`; mealie's `UserAPIRouter(APIRouter)` / `AdminAPIRouter` lose 82 routes, including the whole recipe controller. A non-literal mount prefix (`app.include_router(api_router, prefix=settings.API_V1_STR)`) is dropped, so template routes show without `/api/v1`.

- Done: mealie lists `POST /recipes/create/url`; template routes carry `/api/v1` (or say the prefix is not a literal). Costs Start and Answer on T1, T5.

