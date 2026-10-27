---
id: task-walk-into-nested-functions
label: Walk into nested functions
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
---
G9. Nested functions. A name read inside a nested `def` is not selectable ("No url on line 368" in mealie `recipe_crud_routes.py`), and a walk does not follow an outer variable into the closure that reads it. The trace ends `ok` at the outer variable.

- Files: `engine/python/srcly_pyfacts.py` (scopes, expressions).
- Done: an annotated fixture where a value passes through a closure; T5's `req` reaches `create_from_html`.

