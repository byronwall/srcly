---
id: task-python-app-hidden-at-a-mixed-repo-s-root
label: Python app hidden at a mixed repo's root
type: task
status: planned
priority: high
parent: area-data-flow-python-usability-audit-2026-10
---
G1. Python is hidden at a mixed repo's root. All three audit repos have a `tsconfig` within three levels, so `availability.py` (`has_tsconfig`, line 146) picks TypeScript; mealie's non-strict `frontend/tsconfig.json` refuses the whole root. Nothing on screen says a Python app exists or how to reach it.

- Files: `server/app/services/dataflow/availability.py`, `client/src/viz/deps/flow/FlowView.tsx` (N/A and empty states), `client/src/dataflow/availability.ts`.
- Done: opening the root of full-stack-fastapi-template, mealie or paperless-ngx in Data flow names the Python app folder (`backend/`, `mealie/`, `src/`) and opens it in one action. Costs Start on T1–T10.

