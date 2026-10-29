---
id: task-first-query-after-a-rebuild-times-out
label: First query after a rebuild times out
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
---
The first anchor query after a Python app's rebuild builds the fact index and counts against the 30 s query timeout. On paperless-ngx it timed out ("The engine did not answer anchorGraph within 30 s"); the next query answered in under 1 s.

- Files: `server/app/services/dataflow/engine.py` (timeouts), `engine/src/srcly/python/session.ts` (`provider`).
- Done: the first query after a rebuild either waits on the index with the build's own budget, or the index is built with the program, so no N/A follows a ready status.

