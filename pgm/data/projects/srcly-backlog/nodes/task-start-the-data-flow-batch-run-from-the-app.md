---
id: task-start-the-data-flow-batch-run-from-the-app
label: Start the data-flow batch run from the app
type: task
status: planned
parent: area-data-flow-engine-structure
---
# Start the data-flow batch run from the app

**Evidence.** Today only `srcly report --dataflow` and `srcly compare --dataflow` run tier 2 (`fileSignals`). The app colors the treemap and marks the code viewer from the last saved CLI result (`server/app/services/dataflow/signals.py:latest_for_file`, `scan_jobs.py:_overlay`). Without a CLI run, the six `dataflow_*` metrics are N/A in the app. The retired tsx-dataflow-integration plan (decision D5, at https://github.com/byronwall/srcly/blob/4727bd56/docs/intent/tsx-dataflow-integration/detailed-plan.md) planned a `DataflowJob` beside `start_findings()`. It would start once a data-flow surface was opened in the session, with `GET /api/scans/{id}/dataflow` for status.

**Files.** `server/app/services/scan_jobs.py`, `server/app/services/dataflow/signals.py`, a new job and route, and a client trigger (the metric picker's Data flow group or the N/A reason).

**Cost.** Tier 2 takes minutes on a big app (130 s on srcly's client), so the run must be explicit and must not block the scan.

**Done when.** From the app, a user can start the run on a TS root and see it progress. When it finishes, the treemap colors by Impossible Defenses with no CLI step.

