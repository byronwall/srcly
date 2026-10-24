---
title: "Data flow robustness — decision log"
slug: "dataflow-robustness"
phase: plan
status: current
last_updated: "2026-10-24"
---

# Decision log

Each decision stays open only to the evidence named in its last column. Decisions R1–R12 came from three rounds of questions to the maintainer on 2026-10-24. The rest are planning defaults. The earlier initiative's D1–D8 (`../tsx-dataflow-integration/detailed-plan.md` §8) still stand unless one is superseded here.

| Id | Decision | Accepted | Evidence that would reopen it |
| --- | --- | --- | --- |
| R1 | Primary surface | The graph. The ledger is a detail opened from a box or an edge. | Reviews where people can't read a path from the graph and edge card together |
| R2 | What "robust" means, in order | Never wrong, then never broken, then fast | — |
| R3 | M5 scope | Call identity only (edits 1–2: `callId` on relations, an invocation stack in the slice walk). The `For`-over-call and plain-identifier-prop edits go below the cut line. | A real route whose headline path needs either recognition edit |
| R4 | Cold budget | ≤ 10 s to the first result on visual-notes `app/`, cold, as the original plan set | Profiling (T8) shows the floor without warming is above 10 s. The fallback is the smallest honest number, recorded with its cause. |
| R5 | Levers for speed | Disk cache by `programHash`, performance-only analysis edits, scoped Program. Choose by measurement and improve over time. **Warming at scan time is out.** | — |
| R6 | Carried milestones | M4, M6, M7, M8 | — |
| R7 | Order after the core | M6 effects first, then M4, M8, M7 | — |
| R8 | Investigation workspace | Dropped, along with the pinned preview. The view-state registry for Back and Return stays. | — |
| R9 | `engine/` vs tsx-data-flow | `engine/` is the fork for now. Analysis edits are allowed. Each is recorded in `engine/UPSTREAM.md` with its fixture so it can be backported. Byte-identity is not a goal. | Upstream resumes active development |
| R10 | Reference corpus | `solid-route` and `value-flow-basics` gate CI. srcly `client/` and visual-notes `app/` are measured locally per milestone in `measurements.md`. | — |
| R11 | Anchor extensions in scope | File or folder anchors (through exports), anchor history, multiple anchors. Name anchors beyond identifiers go below the cut line. | — |
| R12 | Visual gaps in scope | Dark-theme colors and label overlap. Legend length, inspector width and keyboard/a11y go below the cut line. | — |
| R13 | Order of the core | E1 honesty → E2 test net → E3 speed. E4 call identity runs beside E3, and the scoped Program (T12) waits for it. | — |
| R14 | Per-box status source | Locate each `surface.omissions[].locations` entry and each located `totality.gaps[]` entry at the deepest drawn box whose call site or definition contains it. Unlocated ones go to the route box. Render edges take their target's status. | T1 finds that most gaps are unlocated. Then fall back to the occurrence's own omissions plus the route box. |
| R15 | Edges the engine did not prove | A new edge status, `structural`, for links the projection found syntactically (a parameter of this declaration, a return inside it). It has its own stroke and never counts as proven. | The contract change ripples into Python. It stays cheap because `models.py` mirrors the enum. |
| R16 | `disconnected` gaps | A natural start only when the element is a literal, a constant initializer or an import of an external module. Anything else becomes a "dead end" frontier. | A fixture where a common, correct pattern renders as a dead end |
| R17 | The 13-PR stack (#104–#117 without #113) | This initiative stacks on `claude/dataflow-anchor-menus` and does not wait for merges. Each PR stays revertible. | The maintainer starts merging the stack, then rebase on `main` |
