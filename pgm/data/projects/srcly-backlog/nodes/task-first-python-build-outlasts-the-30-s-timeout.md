---
id: task-first-python-build-outlasts-the-30-s-timeout
label: First Python build outlasts the 30 s timeout
type: task
status: planned
priority: high
parent: area-data-flow-python-usability-audit-2026-10
---
G2. A mid-size Python app never opens. The 30 s query timeout (`engine.py` `QUERY_TIMEOUT`) covers the first build: mealie's helper takes 40.6 s cold (1.6 GB), paperless-ngx minutes. The progress bar does not move during the mypy phase, N/A has no retry, and the helper keeps running after the server gives up.

- Files: `server/app/services/dataflow/engine.py`, `engine/src/srcly/python/run.ts`, `client/src/viz/deps/flow/FlowProgress.tsx`.
- Done: mealie/mealie opens with default settings; a timed-out build kills its helper; the progress text says the step and elapsed time. Costs Start on T5–T10.

