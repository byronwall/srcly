---
id: task-symbol-graph-symbols-mode
label: "Symbol graph: Symbols mode in the graph view"
type: task
status: planned
parent: area-symbol-graph
---
`?view=graph&symbols=<id>`: Imports / Data flow / Symbols switch; an adapter from `/api/symbols/graph` to the ViewModel (focus centre, referrers left, referenced right, frames per file and class); edge style by kind and resolution; in/out counts on boxes with click-to-expand one hop in place; legend and kind / tests filters; the rail lists reference lines that open the code viewer; entry points from the go-to palette (server search), code viewer menu, treemap tile and import graph box.

- Done: `client/e2e/symbols.spec.ts` opens the mode, expands a hop and opens a line; `docs/CODE_MAP.md` rows.
