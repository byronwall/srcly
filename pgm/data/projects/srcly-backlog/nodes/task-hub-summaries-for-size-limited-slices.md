---
id: task-hub-summaries-for-size-limited-slices
label: Hub summaries for size-limited slices
type: task
status: planned
priority: high
parent: area-data-flow-trace-coverage
---
596 traces stop at a size budget. Replace #208's lossy per-file fold (`foldAnnotatedUses` in `anchor-slice.ts`).

- Cache per (element id, direction, field path) for one generation: ends, stops, a proven-only flag. Later runs inherit it. A summary built under a limit carries the limit and stays partial.
- Draw a folded "N ends via <hub>" box.
- Pick the hub threshold by measurement (uses and callers), never by name.
- Never summarize across an open call context (T13).
- Plug in at `walk()`/`slice()` in `engine/src/srcly/ops/anchor-graph.ts`, off `walkFollows`. Cache in `AnchorGraphBuilder` for one op's runs first.

First step: measure the fan-out of the elements at the top of size-limited slices on six repos.

Known hubs: srcly client `location` signal (22 reads), diagram-studio `doc` store and `transact` (31 callers), memo `geo` (48 reads), parameters with 12–44 callers.

Negatives: a field path narrows through a hub; two helper calls stay apart; a class end through a second use in a file is still reached.

An agent started this and stopped at a rate limit before it wrote code. Branch `claude/dfx-hub-summaries` has no commits.

