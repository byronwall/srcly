---
id: task-file-anchors-for-python
label: File anchors for Python
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
---
G13. A file anchor (`path@*`) lists a file's exports for TypeScript only. On a Python file it says "Not available for Python yet", so T10 ("how do the values in `documents/serialisers.py` connect to the views and models?") scores Answer 0.

- Files: `engine/src/srcly/ops/file-exports.ts` (`requireTypescript`), `engine/python/srcly_pyfacts.py` (module-level classes and functions as exports), `client/src/viz/deps/flow/exportsAdapter.ts`.
- Done: a Python file anchor lists its top-level classes and functions, each one opening into its trace; T10 shows the serializers in `serialisers.py` and the views that use each.

