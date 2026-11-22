---
title: "Srcly UX review follow-through: inventory and evidence"
slug: "srcly-ux-review"
phase: shape
status: current
last_updated: "2026-11-22"
---

# Make the missing pieces visible

**Outcome:** A developer can tell what changed, reach the exact source, and see what a trace does and does not establish without starting the investigation over.

**Primary flow:** Choose a change range → see the whole Git footprint → open a row at the selected revision → return to the same selection. Separately, ask where a field comes from → see the first place the evidence gets less precise → open its witness and return to the question.

## Feature scope

```text
Two independent, proof-sized workstreams
├── PLANNED ADDITIONS: Changes/Compare
│   ├── Include every Git-changed path, not only structurally analyzed files
│   └── Carry the revision, side, path and selection through source and Back
├── PLANNED ADDITIONS: evidence-first trace
│   ├── Keep the field, direction and trace mode visible
│   └── Separate exact field paths, context, and the first named limit
└── EVALUATE LATER
    ├── Responsibility movement and behavior comparisons
    └── Initialization, live subscriptions, and scheduling evidence
```

## Decisions and boundaries

**Recommendation:** Start with the [complete change inventory shape](complete-change-inventory.md). The historical-source handoff fix [#452](https://github.com/byronwall/srcly/pull/452) is on main, so this can be tested without rebuilding Changes. The [shared source inventory defect](https://github.com/byronwall/srcly/issues/440) is related but is not a prerequisite: the changed-file footprint comes from the selected Git revisions, not the working-tree source inventory.

The [trace explanation shape](evidence-first-trace.md) is independent. Start in the existing inspector. Reuse established proof and edge-witness data; if a mode cannot support a precise explanation, show its limit instead of assigning provenance based on adjacency.

**First proof:** Show one small before/after replay for each slice, with a result table and the exact source witnesses.

- **Try:** On the 15-path historical change, open the added `useParams` model row at the head revision and return to the same row. Separately, trace title through the title/tags fixture and repeat with a variant where tags really do supply title.
- **Observe:** Compare with Git's complete path list and the exact historical revision, then record which title steps actually carry the field, which only supply context, and how the trace explains its first material limit.
- **Decide:** Move a slice to planning only if the positive and negative controls pass. No invisible changed paths, invented metrics, tip-of-branch fallback, false exact lineage, or loss of the existing successful traces. Narrow the question if a proof requires a general engine change.

No broad redesign, new search default, agent data collection, or implementation is approved by this document. The draft UI choices for [#443](https://github.com/byronwall/srcly/issues/443) and [#445](https://github.com/byronwall/srcly/issues/445) stay separate. The [intent](intent-brief.md) and [crosswalk](study-crosswalk.md) retain the full intake.
