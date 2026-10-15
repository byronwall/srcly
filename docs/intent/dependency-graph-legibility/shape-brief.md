---
title: "Dependency graph legibility — shape brief"
slug: "dependency-graph-legibility"
phase: shape
status: current
last_updated: "2026-10-15"
---

# Dependency graph legibility — what we are adding

**Outcome:** A mid-level focus such as `server`, `agent_skills` or `components` reads at a glance. You can see what kind each box is, how big it is, which neighbors belong together, and where the edges go. Both views use one metric color.

**Primary flow:** Focus a folder → a compact, centered layout → neighbors sit in package frames, sized folders show their counts → you spot the heavy box and the cluster → drill in.

## Feature scope

```text
Dependency graph legibility
├── PLANNED ADDITIONS
│   ├── Packing
│   │   ├── layout choice targets the viewport's aspect ratio, not "most unfolded"
│   │   └── rows sized to the depth levels actually used, so no empty grid
│   ├── Two-line boxes (all kinds)
│   │   ├── line 1: name, dark
│   │   └── line 2: context, muted
│   │       ├── symbol → module · file
│   │       ├── file → LOC
│   │       └── folder → "12 files · 3 folders · 4.1k LOC"
│   ├── Folder vs file
│   │   ├── folders get their own style (tinted fill, heavier frame)
│   │   └── a size bar inside the box, scaled by log(LOC) against the largest sibling,
│   │       plus a bold count, so a 276-file folder looks massive
│   ├── Grouping
│   │   ├── side neighbors kept together by package/module (first folder below the
│   │   │   common ancestor), then by owning file for symbols
│   │   └── a light labeled frame around each group's run of boxes in a column
│   ├── Single-symbol files
│   │   └── every edge hits one symbol → draw the symbol; the file name becomes context
│   ├── Shared color overlay
│   │   └── fill tinted by the treemap's current color metric, joined by absolute path
│   └── Edge spread
│       └── bundles widen with edge count (no 8px cap); cross-column edges use
│           more gutters once more rows exist
├── EVALUATE BEFORE COMMITTING
│   ├── folders spanning 1–3 rows (only if the router can treat a span as blocking its gutters)
│   ├── frames that span several columns, if per-column frames read as fragmented
│   ├── fewer faint dashed edges when a view is busy
│   └── LOC and color on the compare graph
└── LATER POSSIBILITIES
    ├── peek / fly-in of a neighbor's contents without refocusing
    └── a folder's most-used items shown on the parent view
```

## Behavior

| Situation | Expected result |
| --- | --- |
| Focus `server` (15 children, mixed files and folders) | Roughly viewport-shaped, centered. Folders are clearly bigger and styled differently |
| 30 neighbors from 4 packages | Each package's boxes are contiguous and framed, with the package name on the frame |
| `edit-in-place.tsx` exports one component that three neighbors use | One box: `EditInPlace`, with "edit-in-place.tsx" as its context line |
| Color metric changed in the treemap | The graph re-tints with no refetch and no relayout |
| Graph node with no treemap match (filtered or excluded) | Neutral fill, and the LOC line is omitted |

## Decisions and boundaries

**Appetite:** Medium. All of the work is in the client's view model, layout, and canvas. No server or contract change.

**Key decisions:**
- **Join metrics on the client.** The treemap tree already holds LOC and every metric, keyed by the same absolute path as the graph's `absPath`. Pass a path → node index into `DependencyView` instead of adding metrics to `DepGraphNode`. The graph payload and server build time stay unchanged, which meets the performance bar.
- **Keep the grid.** Every box stays one uniform (now two-line) cell, and folder size is shown by a size bar inside the box. A box spanning several rows would cover the gutters that edges route through, so it would break the router's "gutters are free end to end" guarantee (`layout.ts:9-10`, `:389`, `:556-606`). Row spans are under evaluation, not in the plan.
- **Groups come from the hierarchy.** Group keys use folders and owning files the view model already knows, not clustering. Barycenter ordering runs at the group level first, then inside each group.

**Boundary:**
- Compare mode shares `layoutViewSync`, so its tests must stay green.
- The ~48-box budget is unchanged.
- No modeler graph JSON is committed, because srcly is public. Modeler fixtures stay in a gitignored local folder, and committed tests use srcly's own fixture plus small synthetic graphs.

**Collisions:** Start after quick-fix PRs A and B merge, since they share `DependencyCanvas.tsx`. Coordinate with unified-navigation: it changes how `DependencyView` gets its location, while this work adds the metrics index prop.

**First proof:**
- **Try:** Change only the packing, two-line boxes and grouping, against srcly's fixture plus local modeler `server` and `components` graphs.
- **Observe:** Geometry tests report:
  - aspect ratio within 0.5–2× the viewport;
  - zero edges through boxes;
  - every group contiguous in its column;
  - crossing count no worse than today.

  Before/after screenshots of `server`, `agent_skills`, and `components`.
- **Decide:** If the tests pass and the screenshots read clearly, continue with folder styling and size bars, the color join and edge spread. If grouping raises crossings by more than about 25%, drop to group labels without contiguity and revisit.

Intent: [intent-brief.md](intent-brief.md)
