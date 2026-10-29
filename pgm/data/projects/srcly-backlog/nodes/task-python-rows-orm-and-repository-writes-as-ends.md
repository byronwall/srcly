---
id: task-python-rows-orm-and-repository-writes-as-ends
label: "Python rows: Django model writes as ends"
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
rawContext: |
  G7. ORM and repository writes are not ends. `session.add/commit/delete/refresh`, `sqlmodel_update` (SQLModel), and Django `save` / `objects.create` stop as `external-code` frontiers, so a "create" endpoint never shows its database write.

  - Files: `engine/models/python.json` (rows), `engine/python/srcly_pyfacts.py` (`LibraryModels.load`), fixture in `engine/examples/python-anchors/`.
  - Done: T1's `item` reaches a "database write" terminal; T4's frontiers drop the ORM calls. Related: `task-python-row-sqlalchemy-and-sqlmodel-session-engine`.
---
G7 (rest). SQLAlchemy session writes end a trace as "database write" (#222). Django's are not covered: `instance.save()` and `instance.delete()` take the value as their receiver, not an argument, and `Model.objects.create(**fields)` / `bulk_create` go through a manager mypy types as `Manager[Any]` without the Django plugin.

- Files: `engine/models/python.json`, `engine/python/srcly_pyfacts.py` (`LibraryModels`, `keyword_model`), fixture `engine/examples/python-anchors/app/orm.py`.
- Done: in paperless-ngx, a document saved in a view ends at a database write. `session.refresh` (a read-back) is a `passes-through` row, library-models step 5.

