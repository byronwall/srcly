---
id: task-walk-into-nested-functions
label: Walk into nested functions
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
rawContext: |
  G9. Nested functions. A name read inside a nested `def` is not selectable ("No url on line 368" in mealie `recipe_crud_routes.py`), and a walk does not follow an outer variable into the closure that reads it. The trace ends `ok` at the outer variable.

  - Files: `engine/python/srcly_pyfacts.py` (scopes, expressions).
  - Done: an annotated fixture where a value passes through a closure; T5's `req` reaches `create_from_html`.
---
G9 (rest). A walk that reaches a nested `def` handed on as a value (T5 mealie `_create_recipe_from_web` → `create` → `self._stream_recipe_creation(create)`) now stops there as an unproven hand-off and reads `partial`. It does not go on:

- Pair a callback with the call that runs it: `run(create)` binds `create` to `run`'s parameter `job`, so `job(...)`'s result is `create`'s return, and its arguments are `create`'s parameters. The same gap as `task-calls-through-function-typed-params-and-props` for TypeScript.
- Files: `engine/python/srcly_pyfacts.py` (argument bindings of function values), fixture `engine/examples/python-anchors/app/closures.py`.
- Done: in the fixture, `clean` reaches `from_web`'s HTTP response through `run`; T5's `req` reaches `create_from_html`.

