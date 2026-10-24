---
title: "Bring tsx-data-flow into srcly — shape brief"
slug: "tsx-dataflow-integration"
phase: shape
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly — what we are adding

**Outcome:** srcly's fast map gains a compiler-backed TS/TSX data-flow layer. That layer feeds its metrics, findings, code viewer, reports, compare, and eventually its dependency graph.

**Primary flow:** Scan (instant base layer) → the data-flow job finishes in the background → color or rank by a data-flow metric → open a file → see the defenses and paths on the source → hand `srcly report` to an agent.

## Feature scope

Each tsx-data-flow capability lands in an existing srcly home.

```text
Data-flow layer in srcly
├── PLANNED ADDITIONS
│   ├── Engine seam: tsx-data-flow runs as a background job (findings-style)
│   │   ├── One versioned JSON export for srcly (repo-relative paths, line ranges)
│   │   ├── Cached by fingerprint + engine version; timeout; N/A with a reason
│   │   └── TS/TSX only; strict tsconfig required (no non-strict fallback)
│   ├── Metrics → catalog entries (treemap color, Hot Spots, explorer, 2x2)
│   │   ├── Render-path burden, path depth, representation changes
│   │   ├── Defensive ops and type-impossible defenses
│   │   └── Prop-relay hops, fan-out, fan-in (witness = worst sink or source)
│   ├── Findings → srcly findings (tool = "dataflow")
│   │   ├── Render-path findings and the defensive ledger, with severity
│   │   └── Repeated forks and context relay, as finding rules
│   ├── Code viewer → markers + a "Data flow" rail section
│   │   ├── Marked defenses and relay hops, with notes (marker count = metric)
│   │   ├── Representative path drawn on the source: numbered steps, sink tagged
│   │   └── Cross-file hops open the other file at the line
│   ├── Reports → srcly report artifacts
│   │   ├── Work packets (dataflow.md) with candidate edits and stop recommendation
│   │   └── Agent skill merged into skills/srcly-code-quality
│   └── Compare → data-flow metrics flow through COMPARE_METRICS on both sides
├── EVALUATE BEFORE COMMITTING
│   ├── Symbol where-used / jump to definition in the code viewer (component refs first)
│   ├── Boundary report, junctions, path families, inline preview → finding rules or report-only
│   └── 2x2 preset: burden × fan-in ("load-bearing render knots")
└── LATER POSSIBILITIES
    ├── Dependency view "data flow" mode: component render/prop edges beside imports
    ├── Field trajectories and route totality as a focus mode in that graph
    └── Retire the tsx-dataflow-serve UI
```

**Dropped, not migrated:** tsx-data-flow's overview page, file list, and report tab strip. srcly's explorer, Hot Spots, and scope bar already do that job.

## Behavior

| Situation | Expected result |
| --- | --- |
| No Node, no TS files, or no strict tsconfig | Base scan unchanged; data-flow metrics show N/A with the reason. |
| Data-flow job still running | Map is usable; picker shows "data flow: running", as for findings today. |
| Engine times out on a large repo | Prior cached result if fingerprints match; otherwise N/A (timed out). |
| A file changes and you rescan | Only the data-flow layer is recomputed; the AST cache is untouched. |
| Finding spans files | Marked in its sink file; its path steps link to the other files. |

## Decisions and boundaries

**Appetite:** Big program, but it ships in independently useful slices. Each slice adds one srcly home for data-flow evidence, and each can be reverted alone.

**Key decision:** Integrate at the data level, not the code or UI level. tsx-data-flow stays a TypeScript engine with a narrow JSON export. srcly owns everything users see. This is the only route that keeps both the type checker and srcly's speed. It also reuses the findings runner, metric catalog, markers, compare, and report pipelines instead of copying tsx-data-flow's surfaces. Porting the analysis to Python or embedding the other SPA would both cost more and lose more.

**Boundary:** The layer is optional and off the critical path. Removing the job removes the feature and nothing else. The dependency-view data-flow mode waits until the graph's legibility work settles and the trajectory UI in tsx-data-flow stops churning.

**First proof:** **Try:** Run the engine on `examples/bad-ish-solid` and on srcly's own `client/`. Map its export onto one catalog metric (impossible defenses) plus its finding lines. **Observe:** The treemap stays as fast as today. The layer shows up within the 10-second whole-project target. Every count matches its marked lines in the code viewer. **Decide:** If paths and lines join cleanly and the timing holds, proceed to the full metric set and reports. If they don't join, fix the export contract before adding any UI.

**Open choices:** Where the engine's code lives (separate npm package or the srcly repo), and how users get Node and the engine (project `node_modules`, `npx`, or bundled in the wheel).

See the [intent brief](intent-brief.md). Pro threads add per-branch detail to [initiative-map.json](initiative-map.json).
