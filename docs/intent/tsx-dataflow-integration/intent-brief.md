---
title: "Bring tsx-data-flow into srcly"
slug: "tsx-dataflow-integration"
phase: intent
status: current
last_updated: "2026-10-23"
---

# Bring tsx-data-flow into srcly

## My read

You want one tool, not two. srcly becomes the home: it is the fast, whole-repo, big-picture view (treemap, explorer, Hot Spots, 2x2, dependency graph, compare, headless reports), and it comes back in seconds. tsx-data-flow brings what srcly can't see with tree-sitter alone: compiler-backed render-path analysis of TS/TSX. That covers type-impossible fallbacks, prop relay, fan-out and fan-in, repeated forks, representation changes, and route-wide field trajectories.

The merge is layered, not a rewrite. srcly's speed and orientation stay the base layer. Data-flow evidence arrives on top of it, in roughly this order of value:

1. reports and agent handoff;
2. problems you can spot on the map, each linked to the exact code;
3. a richer code viewer that draws paths, defenses, and where-used on the source;
4. eventually, a dependency view that shows how data moves, not just which file imports which.

"Nearly all features" means the analysis and the useful surfaces. It does not mean tsx-data-flow's separate web app. Its overview, file list, and report pages largely duplicate what srcly already does better.

Several Pro threads are working out the details. This document is the shared map they update, not the final design of any one piece.

## What matters most

- **srcly stays crazy fast.** The data-flow layer must never delay the first treemap, explorer, or Hot Spots render.
- **Evidence links to code.** Every data-flow problem opens the exact lines in srcly's code viewer.
- **One vocabulary.** Data-flow signals become srcly metrics, findings, markers, and report sections. They do not get a parallel UI.
- **Analysis quality survives the move.** Compiler-backed identity and type checks are the reason tsx-data-flow exists. They must not be approximated away.
- **Agents get dense, grounded Markdown.** Work packets and findings reach `srcly report` in the same handoff style.

## The experience you appear to want

You run `srcly` on a repo. The treemap shows up as it does today. A moment later a TS/TSX data-flow layer finishes in the background, the same way lint and type-check findings do now. You color the treemap by render-path burden, or rank Hot Spots by impossible defenses. You click a hot file and the code viewer marks the defenses and relay hops, with notes. You select a value and see where it goes. `srcly report` includes a data-flow section an agent can act on. Compare shows whether a PR made data flow worse. Later, the dependency graph gains a data-flow mode that follows one field across components.

## Boundaries

### Must be true

- The base scan, cache, and UI work with no Node, no tsconfig, and no data-flow layer at all. The layer is additive and N/A when unavailable, with a reason.
- Data-flow metrics follow srcly's metric rules: one catalog entry each, N/A instead of 0, TS/TSX-only measurement tables, and witnesses for max-type metrics.
- Data-flow findings mark the same lines in the code viewer that the count describes.
- tsx-data-flow's strict-tsconfig rule holds. It does not fall back to non-strict defaults that would make nullish findings untrustworthy.

### Must be avoided

- Don't port 35K lines of TypeScript compiler-API analysis to Python.
- Don't embed tsx-data-flow's web app as a second app inside srcly.
- Don't block or slow the base scan on a slow whole-project TypeScript program build.
- Don't promote every tsx-data-flow report view into a permanent srcly surface. Each one earns its place.

## What seems settled

- srcly is the shell, the navigation model, and the release vehicle. tsx-data-flow is the analysis engine.
- Merge order: reports and findings, then the code view, then the data-flow dependency view.
- The engine stays in TypeScript and runs as a Node process. That is the only sensible way to keep the type checker.
- One repository. tsx-data-flow's engine, examples, and tests move into the srcly repo, using a workspace layout only if the build needs one.
- The tsx-dataflow-serve web UI goes away. The goal is the best version of each feature in srcly, not keeping the old UI alive.

## Possibilities, not decisions

- Run the engine as another findings-style background job, beside `tsc` and `eslint`.
- Have the engine emit one versioned `srcly` JSON export: per-file metrics, findings with line ranges, markers, symbol references, and edges.
- Map each tsx-data-flow view onto an existing srcly home (see the shape brief).
- Show route totality and data trajectories as a dependency-view mode, not a separate page.

## Current reality that matters

- srcly is Python (FastAPI, tree-sitter) plus a SolidJS client, published to PyPI. tsx-data-flow is a Node/TypeScript package (npm `tsx-data-flow`) with its own Solid SPA.
- srcly already has a findings runner (`server/app/services/findings/`) that runs project `tsc`/`eslint` as timed, cached background jobs and lays results over the served tree. It is the closest existing seam.
- srcly already has a metric catalog, line markers, a compare diff, report artifacts, and a dependency graph. These are all natural landing spots.
- tsx-data-flow analyzes 50K LOC in about 4.5 s and 200K LOC in about 120 s. That is fine as a background layer, but far too slow for the base layer.
- tsx-data-flow's route totality and trajectory UI is its newest and most volatile work.

## Next step after confirmation

Shape: the feature mapping and first proof are in [shape-brief.md](shape-brief.md). The Pro threads refine each branch and update [initiative-map.json](initiative-map.json).
