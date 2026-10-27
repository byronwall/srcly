---
id: task-ok-claims-that-are-not-true
label: "`ok` claims that are not true"
type: task
status: planned
priority: high
parent: area-data-flow-python-usability-audit-2026-10
---
G3. `ok` claims that are not true, and status words that disagree.

- Function anchor `create_item` is `ok` while its body stops at `session.add` (T1).
- Field `slug` backward: 3 boxes, `ok`, zero writers (T6).
- `input_doc` → `consume_file.apply_async(...)` → `async_task.id` → HTTP response, `ok`: a library return assumed to carry its argument (T8).
- `req` → `url` stops at a nested `def`, `ok`, no frontier (T5).
- `ok` trace with ~25 "Partial" box borders (T3); inspector "stops at 10 places" vs footer "11" (T4).
- Files: `engine/src/srcly/ops/anchor-graph.ts`, `engine/python/srcly_pyfacts.py` (call-input / call-result for unmodelled library calls), `client/src/viz/deps/flow/FlowInspector.tsx`.
- Done: each listed case is `partial` with a named stop, or proven; one stop count everywhere.

