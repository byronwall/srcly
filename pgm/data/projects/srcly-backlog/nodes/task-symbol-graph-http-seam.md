---
id: task-symbol-graph-http-seam
label: "Symbol graph: HTTP seam between client calls and server routes"
type: task
status: planned
parent: area-symbol-graph
---
A client `fetch('/api/x')` / `axios.get` / `new URL('/api/x', …)` call site joined to the FastAPI / Flask handler whose route matches, as an `http` edge from the calling symbol to the handler, so a TS + Python repo reads as one graph.
