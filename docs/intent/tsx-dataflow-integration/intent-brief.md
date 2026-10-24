---
title: "Bring tsx-data-flow into srcly"
slug: "tsx-dataflow-integration"
phase: intent
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly

## My read

What you want most from tsx-data-flow is its route → terminal data-flow graph, shown in srcly's dependency viewer. Its compiler-backed analysis is the asset to keep: TypeScript type checking, symbol identity, field lineage, and proof frontiers. srcly has the better visuals and selection. So the engine supplies the evidence, and srcly draws it.

The same engine answers two more questions from the code viewer:
- What happened to this value? An ordered path ledger answers this.
- What does this function touch? An effects panel answers this.

Findings, metrics, marks, and reports bring the evidence into srcly's existing surfaces. Throughout, srcly stays the fast base layer.

## What matters most

- The route → terminal graph in the dependency viewer is the headline.
- The analysis moves whole. Evidence is never approximated or invented.
- srcly owns visuals, selection, navigation, and return.
- Evidence states are honest: proven, partial, not analyzed, and stale are distinct, and not analyzed is never 0.
- The engine never delays the treemap or the import graph.

## The experience you appear to want

You open srcly on a SolidStart app, and the treemap and import graph appear as they do today. In Data flow mode you pick a route and see its components down to the terminal render points. You select a field, and its proven destinations light up. You pick one destination, and a ledger explains the path step by step. Any step opens the code. From any line in the code viewer, you can ask the same of a value or a function. Return puts you back exactly where you were.

## Boundaries

### Must be true

- Content comes from compiler-backed evidence with exact source spans. Evidence is tied to the Program, the tsconfig, and the generation that produced it.
- Call identity is kept. Two calls to one helper never merge.
- Without Node, a tsconfig, or TS files, data flow is N/A with a reason, and nothing else changes.

### Must be avoided

- No Python port and no second TypeScript analyzer.
- No relabeling import edges as data flow or execution.
- No purity, testability, or tangle score.
- Don't carry over tsx-data-flow's canvas, layout, or SPA.

## What seems settled

- One repository: the engine moves to `engine/`, and tsx-dataflow-serve goes away.
- The engine ships bundled in the wheel and runs on the system `node`.
- The route-graph and ledger proofs run in parallel, after a shared engine milestone.
- Priority order:
  1. the route graph;
  2. the ledger, which also explains graph paths;
  3. effects;
  4. findings, metrics, and reports.
- Implementation starts only with your explicit approval.

## Current reality that matters

- tsx-data-flow's route canvas has no operation-order evidence, which is why the ledger carries path detail.
- Two engine capabilities are new work: generic expression selection, and per-invocation tracking.
- tsx-data-flow has four open cleanup PRs and uncommitted route-proof edits. These land before the move.

## Next step after confirmation

Wait for your approval, then start M1.

Evidence for all of this is in [research.md](research.md). The shape is in [shape-brief.md](shape-brief.md), and the steps are in [implementation-plan.md](implementation-plan.md).
