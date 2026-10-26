---
id: task-python-row-sqlalchemy-and-sqlmodel-session-engine
label: "Python row: SQLAlchemy and SQLModel `Session(engine)`"
type: task
status: planned
priority: medium
parent: area-data-flow-library-models-as-data
---
41 `get_db` traces land assumed because `Session(engine)` has no model.

- Add rows in `engine/models/python.json`.
- `engine/src/srcly/python/run.ts` passes `--models` to the helper. `LibraryModels.load` in `engine/python/srcly_pyfacts.py` handles only `origin` and `terminal` for Python. Add a `passes-through` or `resource` emitter, and handle `with Session(engine) as session`.
- Fixture: `engine/examples/python-anchors/app/library.py`; resolve test in `python-anchors.test.ts`.

Keep as code: FastAPI parameter tables, `MODEL_BASES`, `SETTINGS_BASES`, `MODEL_KEYWORD_CALLS`, and decorator and route tables.

