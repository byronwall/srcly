---
title: "Data flow robustness — shape brief"
slug: "dataflow-robustness"
phase: shape
status: current
last_updated: "2026-10-24"
---

# Data flow robustness: what we are changing

**Outcome:** Data flow mode is dependable. Every box and edge has its own honest status, every failure has a name, and the first result appears within 10 s cold. The unfinished milestones then land on that footing.

**Primary flow:** Graph → Data flow → route or anchor → the backbone appears progressively → select an origin or a box → its reach lights up → click an edge to see why it holds → open the code → Back or Return.

## Feature scope

```text
Data flow robustness: planned additions
├── ROBUSTNESS CORE (in order)
│   ├── E1 Never wrong: proof honesty
│   │   ├── Per-box status in routeGraph, from the surface's own gaps (T1)
│   │   ├── Declaration anchors: no invented proven edges; `ok` only when every run landed (T2)
│   │   ├── `disconnected` split into a natural start (a literal) and a dead end, shown as a frontier (T3)
│   │   └── Field lineage from non-filesystem origins: the records origin lights its rows (T4)
│   ├── E2 Never broken: test net
│   │   ├── The fake engine answers each op in every outcome shape (T5)
│   │   ├── Playwright smoke: route, origin, reach, anchor, menus, light and dark (T6)
│   │   └── Stale generation after an edit: named, with Refresh, end to end (T7)
│   └── E3 Fast: ≤ 10 s cold on visual-notes
│       ├── A phase profiler and anchor timings on the corpus (T8)
│       ├── A progressive route graph: the backbone first, then lineage (T9)
│       ├── Profile-led performance edits in the analysis (T10)
│       ├── A disk cache keyed by programHash, for reopening (T11)
│       └── A scoped Program, only after E4 (T12)
├── E4 Call identity (M5 edits 1–2): two calls of one helper never join (T13)
├── E5 Effects panel (M6) — first after the core (T14, T15)
├── E6 Graph surface
│   ├── Explain this edge: routePath in the edge card and inspector (M4, T16)
│   ├── Back and Return through the view-state registry (T17), then anchor history (T18)
│   ├── Anchors for a file or folder, through its exports (T19), and several anchors at once (T20)
│   └── Dark-theme mark tokens (T21); field labels that never cover boxes (T22)
├── E7 Ship and supporting evidence: M8 wheel (T23), M7 metrics, findings, packets (T24)
└── E8 Engine hygiene: UPSTREAM.md as the fork ledger, registry under many roots (T25, T26)
```

**Dropped:** the investigation workspace and pinned preview (M3's skipped parts), and warming the engine at scan time.

**Below the cut line:** M5's `For`-over-call and plain-identifier-prop edits, name anchors beyond identifiers, multi-line JSX anchors, legend length, the inspector's width at 1024, keyboard and screen-reader work, and the branch graph beside the ledger (D3).

## Behavior

| Situation | Expected result |
| --- | --- |
| One occurrence's subtree is partial | Only the boxes the surface's gaps name are `partial`. The rest stay `proven`. |
| A declaration anchor | Parameter, prop and return links say how they were found. They are never `proven` unless they carry proof. |
| A path stops at a non-terminal, non-literal element | A frontier box reads "dead end · nothing continues". The outcome is `partial`. |
| A cold visual-notes route | The backbone shows within 10 s, and lineage and counts follow. Each phase is named. |
| A reopen with an unchanged `programHash` | Answered from the disk cache. A changed hash rebuilds and bumps the generation. |
| A source edit after a result | `stale`, with Refresh. Results from two generations are never mixed. |
| Two calls of one helper | Separate paths. Line 109 never appears in line 88's walk. |

## Decisions and boundaries

**Appetite:** A program of small, revertible stacked PRs. The core (E1–E3) comes first, and each ticket proves itself on the corpus before any UI grows.

**Key decision:** Honesty before coverage, and coverage before speed. The highest-risk speedup, a scoped Program, would undercount call sites. Today's one-call-site rule would then turn real boundaries into false proven paths. So scoping waits for call identity (E4), which makes the call-site count irrelevant. The progressive graph and profile-led performance edits are the main path to 10 s. The disk cache only helps on reopen.

**Pushback:** "Perf edits in the analysis" is a lever only after profiling names the hot phase. T8 comes before T10, and T10 stops if its fixture output changes.

**Boundary:** No srcly-specific recognition in `engine/src/analysis`. Every analysis edit is recorded in `engine/UPSTREAM.md`. Python data flow belongs to its own session.

**First proof:** T1.
- **Try:** `routeGraph` on solid-route `/records` and visual-notes `/time-blocks`.
- **Observe:** the partial boxes are exactly the ones the surface's gaps locate.
- **Decide:** if the gaps carry no usable location or occurrence id, T1 becomes "status from the occurrence's own omitted items". Either way, a box never inherits the route's status.

See the [intent](intent-brief.md), [plan](implementation-plan.md), [backlog](backlog.md), [research](research.md) and [decision log](decision-log.md).
