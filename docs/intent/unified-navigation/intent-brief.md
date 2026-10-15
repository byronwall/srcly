---
title: "Unified navigation"
slug: "unified-navigation"
phase: intent
status: current
last_updated: "2026-10-15"
---

# Unified navigation

## My read

srcly has grown several ways to move around, and they don't agree:

- the treemap's zoom location;
- the dependency graph's focus path;
- the Explorer tree;
- a Dependencies toggle and a Close button;
- the browser's back button.

In the session you misclicked a node in the dependency graph and pressed Back. You lost the repo entirely ("now everything's all messed up") and had to re-analyze to get back. You can be looking at `root` in the treemap while the graph is focused on `identify_properties.py`. Closing the graph leaves you unsure where you are. Your summary: "too many forms of navigation going on here".

What you want is **one notion of "where I am"**. The treemap and the dependency graph become two projections of that location, and you flip between them with a toggle on the same canvas. Every move is recoverable: Back steps through *your* path, a history list lets you jump to any earlier spot, and a misclick costs one keystroke. From any node you can jump straight to its folder. Speed must not drop. Getting back into the repo was fast, and that has to stay true.

## What matters most

- **Recoverability.** You can undo any navigation without losing the scan or the repo. This was the most painful moment in the session.
- **One location.** Treemap zoom and graph focus are the same place, viewed two ways.
- **A visible history** of where you've been, so you can return without fighting the back arrow.

## The experience you appear to want

You zoom the treemap into `model_making` and press Dependencies. The same canvas flips to the graph, focused on `model_making`. Ideally the change is an animated transition ("Oh man, that'd be amazing"). You click `create_identities.py` and the location moves. The treemap breadcrumb would show the same path if you flipped back. You misclick `mcp_runtime` and press Back (or Alt+←) to return to `app.py`. You open a history list and jump three steps back. On a node like `billboard`, a "show its folder" action takes you to the containing folder in one step.

## Boundaries

### Must be true

- Back or undo never drops the analyzed repo or forces a rescan.
- Treemap ↔ graph switching keeps the location and the active filters.
- Location state is shareable and refresh-safe through the URL, including the repo path.
- No measurable slowdown in toggling or in drilling.

### Must be avoided

- Two breadcrumbs showing two different "current" places.
- Navigation hidden in modifier clicks with no visible alternative.

## What seems settled

- Navigation state is worth keeping. You liked that reopening the graph restored your focus ("at least stateful").
- The treemap and the graph are projections of the same data and colors. This is shared with [dependency-graph-legibility](../dependency-graph-legibility/intent-brief.md).

## Possibilities, not decisions

- One canvas that morphs between treemap and graph. The animation is an aspiration, and it was deferred in `dependency-view`'s cut line.
- A history panel or dropdown, as opposed to only reliable Back and Forward entries.
- Graph and treemap as a toggle rather than a separate overlay ("possibly", 5:39).

## Current reality that matters

- **Back does nothing useful.** Normal mode never creates a history entry: `depFocus` is written with `replaceState` (`client/src/viz/deps/DependencyView.tsx:28-37`). Back leaves the page.
- **Compare is the exception.** It uses `pushState` (`client/src/compare/api.ts:127-132`). The `popstate` handler then remounts `AppContent` (`App.tsx:156-165`), which loses the scan and lands on "Map a codebase".
- **What the URL doesn't hold.** The repo path (`scannedPath`), the treemap root (`currentRoot`, `App.tsx:192`), the color metric, and the filters are all missing. A refresh always lands on the empty state.
- **Two disconnected locations.** The treemap breadcrumb renders from `currentRoot` (`TreemapHeader.tsx:43-68`). The graph's "Focus path" comes from `focusId` (`DependencyView.tsx:127-150`). The only link is one-way: the graph is fetched for `currentRoot().path` (`Treemap.tsx:252`), and the focus never updates the treemap.
- **A hard swap.** The toggle switches two `<Show>` blocks in one container (`Treemap.tsx:248-279`): a canvas treemap and an SVG graph, each fully unmounted on switch. `containerRef` is the natural host for a transition.
- **A small bug.** The toolbar Dependencies toggle doesn't clear `depFocus`. Only the in-graph Close does (`TreemapHeader.tsx:108` vs `DependencyView.tsx:162-165`), so a refresh reopens the graph unexpectedly.
- **No middle-click.** There is no middle-click handler anywhere. "Open" in the graph is Ctrl/⌘-click or double-click (`DependencyCanvas.tsx:294-303`).

## Decided in round 1

- **The treemap zoom and the graph focus are the same location.** Drilling in either view moves both, there is one breadcrumb, and the toggle only changes the projection.

## Next step after confirmation

Shape the work. The likely first proof is a URL-backed location (repo, root and focus) with `pushState` history and a repo-safe Back. It can be checked by a misclick-recovery script in the browser.
