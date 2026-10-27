---
id: task-framework-hand-offs-external-read-keys-celery-tasks-drf-request
label: "Framework hand-offs: external-read keys, Celery tasks, DRF request"
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
rawContext: |
  G12. Framework hand-offs not followed.

  - An external read's key argument: `current_user` stops at `session.get(User, token_data.sub)` and never reaches the token or `SECRET_KEY` (T2).
  - Celery: `apply_async(kwargs=…)` / `delay(…)` into a first-party `@shared_task` is not paired; `consume_file`'s 14 callers are not linked (T8, T9).
  - Django/DRF: a view method's `request` is not a request origin (T8).
  - The token origin says "enters from Depends(…)" at the `CurrentUser` alias, not the `OAuth2PasswordBearer` header (T2).
---
G12 (rest). Celery `delay` / `apply_async` into a first-party task now binds the task's parameters (T8, T9). Still not followed:

- An external read's key argument: `current_user` stops at `session.get(User, token_data.sub)` and never reaches the token or `SECRET_KEY` (T2).
- Django/DRF: a view method's `request` is not a request origin (T8).
- The token origin says "enters from Depends(…)" at the `CurrentUser` alias, not the `OAuth2PasswordBearer` header (T2).

