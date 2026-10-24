---
title: "Data flow robustness"
slug: "dataflow-robustness"
phase: intent
status: current
last_updated: "2026-10-24"
---

# Data flow robustness

## My read

The stack #104–#117 gave srcly a working Data flow mode: a route's render backbone, origins that light their destinations, kind marks, reach emphasis, an inspector rail, and anchor mode, which traces from any expression or symbol. Now that it works, you want it to be dependable. When the graph says a value flows, that should be true. When the graph cannot answer, it should say why and never break. And it should arrive fast enough on a real app that people keep using it. After that, the unfinished milestones should land on the same footing.

The graph is the primary surface. The ledger is the detail you open from a box or an edge, not a separate place to work.

## What matters most

1. **Never wrong.** Nothing is drawn as proven unless the engine has proof for it. Status is per box and per edge, not inherited from the route. A path that ends without an explanation is shown as a frontier, not hidden as a normal end.
2. **Never broken.** Every failure has a name: not analyzed, unsupported, stale, budget, crashed, timed out. A browser smoke pass and contract tests catch regressions before a PR merges.
3. **Fast.** The first result arrives within 10 s cold, even on a 65K-line app like visual-notes. Today a cold `/time-blocks` takes 68 s to its first box.

## The experience you want

You open visual-notes in srcly and switch to Data flow. Within 10 s the route backbone appears, and the rest fills in. Every box has its own status stroke: proven boxes look proven, and a box the engine could not reach looks partial. Selecting the records origin lights the rows it really feeds. Clicking a lit edge explains it: the ordered steps from origin to destination, each with its code. From a file, a folder, or two places at once, you can trace where values go. Back and Return bring the canvas back to exactly where it was. It reads correctly in the dark theme, and labels never cover boxes.

## Scope this initiative carries

- **Robustness core:** proof-honesty fixes, a test net (fake-engine shapes and a browser smoke pass), and performance to the 10 s budget.
- **Invocation identity, call identity only:** two calls of one helper never join (M5 edits 1–2). The `For`-over-call and plain-identifier-prop recognition edits wait.
- **Carried milestones, in this order after the core:** M6 effects panel; M4 explaining an edge from the graph; M8 the engine shipping in the wheel; M7 metrics, findings and work packets.
- **Return without a workspace:** the full-page investigation workspace and pinned preview are dropped. The view-state capture for Back and Return stays.
- **Anchor mode:** trace a file or folder (through its exports), anchor history, and several anchors on one canvas.
- **Visuals:** colors that work in the dark theme, and field-path labels that never overlap boxes.

## Boundaries

### Must be true

- Proof honesty outranks coverage. Showing fewer proven paths is acceptable. A wrong proven path is not.
- Not analyzed is never 0, and every result carries its `generation` and `programHash` (from `AGENTS.md`).
- The treemap and the import graph never wait on the engine.
- The engine starts only when someone opens a data-flow surface. Warming it at scan time is out.

### Must be avoided

- No srcly-specific recognition rules in `engine/src/analysis`.
- No speedup that trades away proof. For example, a scoped Program that undercounts call sites would turn real boundaries into false proven paths.
- Nothing from the Python data-flow work. That runs as its own session and stack, briefed separately. This initiative shares only the contracts and outcome vocabulary.

## What seems settled

- `engine/` is now srcly's fork of tsx-data-flow. Analysis edits are allowed, including performance work and M5's call identity. Each one is recorded in `engine/UPSTREAM.md` with a fixture that shows its effect, so it can be backported later if needed. Keeping the two repositories byte-identical is not a goal.
- The performance approach is chosen by measurement, and it is allowed to improve over time. Acceptable levers are a disk cache keyed by `programHash`, performance-only edits in the analysis, and a scoped Program, as long as proof does not regress.
- The reference corpus: `solid-route` and `value-flow-basics` gate CI. srcly's `client/` and visual-notes `app/` are measured locally, and every milestone records its numbers in `measurements.md`.
- Anchors by name stay identifier-only. Multi-line JSX anchoring sits below the cut line.
- Legend length, the inspector's width at 1024, and keyboard and screen-reader work sit below the cut line for now.

## Current reality that matters

- All 13 PRs of the stack (#104–#117, on top of docs PR #101) are still open, and this initiative stacks on top of them. The longer the stack grows, the more each merge costs.
- `routeGraph` gives every box the route's overall status. That marks clean boxes `partial` whenever any part of the route is partial.
- The anchor graph draws invented `parameter`, `prop-read` and `returns` edges as `proven` with no proof attached. It matches prop reads by regex on source text.
- Upstream raises `disconnected` only for a non-terminal element with nothing after it. The anchor graph drops these gaps as if they were the natural end of a path. That hides real dead ends.

## Next step after confirmation

Start ticket T1 (per-box status in `routeGraph`). It, T2 and T3 are implementation-ready in [implementation-plan.md](implementation-plan.md). The evidence is in [research.md](research.md), the shape in [shape-brief.md](shape-brief.md), and the decisions in [decision-log.md](decision-log.md).
