---
id: task-python-rows-orm-and-repository-writes-as-ends
label: "Python rows: ORM and repository writes as ends"
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
---
G7. ORM and repository writes are not ends. `session.add/commit/delete/refresh`, `sqlmodel_update` (SQLModel), and Django `save` / `objects.create` stop as `external-code` frontiers, so a "create" endpoint never shows its database write.

- Files: `engine/models/python.json` (rows), `engine/python/srcly_pyfacts.py` (`LibraryModels.load`), fixture in `engine/examples/python-anchors/`.
- Done: T1's `item` reaches a "database write" terminal; T4's frontiers drop the ORM calls. Related: `task-python-row-sqlalchemy-and-sqlmodel-session-engine`.

