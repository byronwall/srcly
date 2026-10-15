---
title: "Dependency graph legibility"
slug: "dependency-graph-legibility"
phase: intent
status: current
last_updated: "2026-10-15"
---

# Dependency graph legibility

## My read

The multi-scale dependency view landed, and you called it "wildly better than before". Narrow focus views already work: a file in the middle, dependents on the left, dependencies on the right. What still fails is reading a *mid-level* view: a folder like `server`, `model-server-new`, `agent_skills` or `components`. Those views have four problems:

- They come out as wide strips (4:1 to 7:1).
- Every edge runs through the same ~30px channel.
- Folders look exactly like files.
- Nothing shows which neighbors belong together.

The goal is that a glance at any focus shows how big each thing is, what kind of thing it is, and which neighbors cluster by module, package or file. All of this has to happen without slowing srcly down. Speed is the thing you praised first, and every change has to protect it.

## What matters most

- **Structure is visible.** Neighbors group into containers by module or package, then by file (or class). You raised this more than any other point: "we've really got to just get all these group together".
- **Kind and size are obvious.** A folder reads as a folder and shows what it holds (subfolders, files, LOC). A 276-file folder looks massive.
- **Use the viewport.** Mid-level views fill the screen at a sane aspect ratio, and edges spread out instead of piling into one gutter.
- **Performance holds.** Loading and drilling stay as fast as they are today.

## The experience you appear to want

You focus on `components`. A box per subfolder, sized up and labeled with its counts, makes it obvious that `model-viz` and `inspector` are the heavy ones. Neighbors on each side sit inside light frames by package. Inside each package frame, files sharing a folder sit together, and a box around them shows they belong to the same folder. A file that exports a single component shows as that component, with the file as a thin container. Symbol labels take two or three lines (module, file, symbol), so `relationship_focus.Relatio…` is never cut down to nothing. Boxes carry LOC and are tinted with the treemap's current color metric, so the graph and the treemap feel like two views of one dataset. The layout centers in the screen, and edges spread across real gutters.

## Boundaries

### Must be true

- Folder, file and symbol boxes are visually distinct, and folders can be larger than files. This **supersedes** the "all boxes the same size" rule from `dependency-view` for folder boxes.
- Left-to-right flow (incoming ◀ focus ▶ outgoing) stays, along with the narrow-focus views that already read well.
- Edges stay orthogonal and never pass through a box. Grouping frames count as obstacles.
- No measurable regression in first-open or drill latency on the ~2k-file modeler repo.

### Must be avoided

- Wide one-row or two-row strips, with every edge forced through a single gutter.
- Truncation that hides the part of the name that matters.
- A second color scheme that disagrees with the treemap.

## What seems settled

- Group by module or package first, then by file or class. The groups come from the hierarchy srcly already has, not from clustering.
- The color overlay is shared: the treemap and the dependency graph are "different projections" of the same metric colors.
- Containers stay compact when they hold many items, and collapse to their single symbol when that is all they hold.

## Possibilities, not decisions

- **Peek or fly-in:** click a neighbor and its contents expand in context, without refocusing. You doubted it yourself ("maybe expand in place was not going to look good"), so treat it as a later experiment.
- Showing a folder's most-used items on the parent view, e.g. `camera` inside a `model-viz` box.
- Toning down dashed edges (you weren't sure they help: "maybe the dashed lines is just too much"). The legend in [quick-fixes](../dependency-and-treemap-quick-fixes/intent-brief.md) comes first.

## Current reality that matters

- **Why views come out as strips.** Each layout cell is about 5.8:1 (196×28 boxes). When candidate layouts tie at `MAX_SCALE`, the code always picks the most unfolded one. The relevant code is `chooseRows` and `arrange`, `client/src/viz/deps/layout.ts:129-145` and `:312-325`. The only test asks for an aspect ratio above 1.2 (`layout.test.ts:46`).
- **Why edges pile up.** With 1–3 rows there are very few gutters, and edges that share an anchor share one track. `bundleOffsets` caps every bundle at about 8px (`layout.ts:389`, `:663-743`).
- **Neighbors are not grouped.** Each side is sorted by label, then reordered by barycenter. The only frame drawn is around the focus symbols (`DependencyCanvas.tsx:145-154`). The view model already knows each node's parent chain (`viewModel.ts:222-318`).
- **No size data on the graph.** Its nodes carry no LOC or metrics (`server/app/models.py:73-105`, `contract.ts`). The treemap tree holds both, and its absolute paths match the graph's `absPath` field.
- **Compare reuses this code.** Compare mode uses `layoutViewSync` and its own view model (`compare/CompareGraph.tsx:9`, `compare/graphModel.ts`), so layout changes affect it too.

## Decided in round 1

- A file that exports a single symbol renders as that symbol, with the file name as quiet context.

## Next step after confirmation

Shape the work. The first proof would be grouped side layout plus aspect-ratio packing on `server` and `components` from modeler, checked with geometry tests and screenshots.
