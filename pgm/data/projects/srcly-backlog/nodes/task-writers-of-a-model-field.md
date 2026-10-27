---
id: task-writers-of-a-model-field
label: Writers of a model field
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
---
G10. Writers of a model field. Backward from a pydantic field declaration finds nothing: constructor keyword arguments, `@field_validator` returns and `obj.field = value` assignments are not collected; an attribute assignment target is not selectable (`document.slug = …`, mealie `repository_recipes.py:134`).

- Done: T6 lists `validate_slug`, the cleaner's `slugify(name)` and the repository's suffix as sources of `slug`.

