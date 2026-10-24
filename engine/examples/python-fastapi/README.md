# python-fastapi

A small FastAPI app for the engine's Python evidence provider (`engine/python/srcly_pyfacts.py`). Every handler shape the provider recognises appears once:

| Handler | What it shows |
| --- | --- |
| `POST /v1/items` (`create_item`) | a pydantic request body, field reads, a helper with one call site (`save_item`), a log line, the response |
| `GET /v1/items/{item_id}` (`read_item`) | a path parameter, a query parameter, a helper with two call sites (`find_item`), `HTTPException` |
| `GET /v1/items` (`list_items`) | `Query()` and a comprehension over the store |
| `GET /v1/settings` (`read_settings`) | an environment read and a file read, through a dataclass |

Nothing here runs; it is only read.
