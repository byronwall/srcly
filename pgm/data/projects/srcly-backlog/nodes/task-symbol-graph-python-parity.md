---
id: task-symbol-graph-python-parity
label: "Symbol graph: Python extractor"
type: task
status: planned
parent: area-symbol-graph
---
`server/app/services/symbols/python.py` fills the same contract as the TypeScript extractor: methods through `self`/`cls`, class-qualified members, module attributes through `PyModuleIndex`, `__init__` re-exports passed through, decorators as calls, annotations as `type` edges, bases as `extends`, assignments to module and class state as `write`.

- Done: `tests/test_symbol_index_py.py` covers each; `build_symbol_index` indexes `.py` files.
