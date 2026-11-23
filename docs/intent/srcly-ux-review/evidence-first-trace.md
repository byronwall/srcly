---
title: "Evidence-first trace explanations — workstream shape"
slug: "srcly-ux-review"
phase: shape
status: draft
last_updated: "2026-11-22"
---

# Keep the developer’s question visible

**Outcome:** A developer tracing one field can tell what actually carries its value, where the trace loses that precision, and which source supports each answer.

**Primary flow:** Select `title` in source → ask where it comes from → read a short answer and its first limit → open a witness → return to the same question.

## Feature scope

```text
Evidence-first trace (#442)
├── PLANNED ADDITIONS
│   ├── One question header: selected expression, direction, scope and trace mode
│   ├── Compact answer: proven field steps, the first widening, and named stops
│   └── Expand context/source in place without changing the selected question
├── EVALUATE BEFORE COMMITTING
│   └── Whether one named handoff needs a narrow proof hook beyond existing data
└── LATER POSSIBILITIES
    └── Separately prove initialization, ongoing subscriptions and scheduled work
```

## Behavior

| Situation | Expected result |
| --- | --- |
| A path carries the selected field | Put it in the answer only when that field’s identity is supported. Open the particular expression, not just its enclosing function. |
| The path widens to an object or an activation condition | Name the handoff where field precision changes; keep sibling values or activation evidence under expandable **Context**, not **Sources of title**. A useful context step can be proven without being field carriage. |
| An edge depends on a model, an assumption or a missing link | Preserve `proven`, `modelled`, and `assumed` independently of the relationship label. If evidence cannot connect to the next step, stop with a reason, not “no source.” Do not turn budget limits into absence or an old result into a new answer. |
| The question uses a route instead of a source anchor | Label **Selected route origin** or **Source expression**. Route field lineage and its edge witnesses apply within the selected route/origin; anchor traces walk a bounded expression slice. Share words, not guarantees. Switching modes is a new query; do not silently substitute one answer for the other. Source return keeps repository, analyzed generation, span and mode; a changed generation asks for refresh. |

## Examples

**Proposed review artifact, not an observed screen:** One pinned source/answer card using a tiny synthetic title/tags fixture, with the exact selected span and the expandable widening witness.

> **Where does `title` come from?** · Source expression · Backward  
> **Proven for `title`:** the argument reads `record.title`. [Open witness]  
> **Stops being field-specific:** `record` crossed a resource/component/store handoff. The object path is known; the earlier producer of this field is not proved. [Open handoff]  
> **Context (1):** `tags` shares the container; it is not shown to supply this title.

## Decisions and boundaries

**Appetite:** One compact, source-backed explanation on the existing inspector. Keep the full view and its navigation available.

**Key decision:** Start with an inspector projection, not a new graph or a label-only fix. Reuse routeGraph/routePath field witnesses and anchorGraph proofs/stops as available. Build on existing field lineage, [proof strength](../../../pgm/data/projects/srcly-backlog/nodes/task-send-proof-strength-to-the-client-through-the-contract.md) and [graph/ledger agreement](../../dataflow-coverage.md#outcomes-and-honesty); don't add parallel tasks. If anchor evidence cannot locate a widening, state where exact proof ends and test one narrow boundary proof before expanding scope.

**Boundary:** No workspace, general field/path sensitivity, graph/ledger redesign or full framework scheduler. A later Solid `untrack` control must show initial value carriage without a live subscription; contrast a genuinely tracked read and a separately scheduled callback. Async Effects remains an independent activation witness, not a subscription claim.

**First proof:** **Try:** replay S06/S07/S12 using a synthetic title/tags fixture; add a positive variant that explicitly derives title from tags and a named-stop control. **Observe:** capture one browser walkthrough and a structured expected/actual table: title provenance, marked widening, clickable source, exact-query return, route/anchor search limits. Preserve S05 input → render and save, S11 generic HOC → heading, and S10 request → await → after-await/timer distinctions. **Decide:** proceed only if incidental tags never appears as exact ancestry, explicit tags-derived title stays discoverable, unknowns remain named, and the positive controls hold. Any false exact claim, lost control or invented witness blocks the slice; prefer a narrower partial explanation over an engine rewrite.

Study anchor: UX-004 and UX-014; source checked at [`5c1b671`](https://github.com/byronwall/srcly/commit/5c1b671355d0f4eb1d75ac25fe3660919219463c), not rerun here.

[Intent](intent-brief.md) · [Study crosswalk](study-crosswalk.md) · [Workstream #442](https://github.com/byronwall/srcly/issues/442)
