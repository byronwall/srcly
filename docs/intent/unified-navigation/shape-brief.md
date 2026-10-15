---
title: "Unified navigation — shape brief"
slug: "unified-navigation"
phase: shape
status: current
last_updated: "2026-10-15"
---

# Unified navigation — what we are adding

**Outcome:** There is one "where I am". The treemap and the dependency graph are two projections of it. Every move can be undone with Back or a history list, and nothing ever drops the analyzed repo.

**Primary flow:** Zoom the treemap to `model_making` → toggle to graph (same place) → drill to `create_identities.py` → misclick → press Back → you're on `create_identities.py` again → refresh → same repo, same place, same view.

## Feature scope

```text
Unified navigation
├── PLANNED ADDITIONS
│   ├── Location = { repo, path (folder | file | file#symbol), view: treemap | graph }
│   │   ├── kept in the URL: ?repo=…&at=…&view=…
│   │   │   (color metric and filters are evaluated below)
│   │   ├── treemap zoom and graph focus both read and write it
│   │   └── one breadcrumb, shared by both views
│   ├── History
│   │   ├── each location change pushes a browser entry; Back/Forward and Alt+←/→ just work
│   │   └── a History dropdown in the header: last ~30 places, each with a
│   │       view icon and path; click to jump
│   ├── Toggle replaces Close
│   │   └── one Treemap | Graph switch; switching keeps the location and filters
│   ├── Node actions (visible, not modifier-only)
│   │   └── graph card and treemap tooltip offer Focus · Open code · Show folder
│   └── Repo-safe Back
│       └── entering or leaving compare and stepping history never remount the app
│           or rescan
├── EVALUATE BEFORE COMMITTING
│   ├── keep both views mounted (hidden) so toggling is instant
│   └── color metric and filters in the URL
└── LATER POSSIBILITIES
    ├── animated canvas morph between treemap and graph
    └── the open code viewer as part of the location
```

## Behavior

| Situation | Expected result |
| --- | --- |
| Drill into a graph node | The treemap location and the breadcrumb move to it too |
| Graph focus on a symbol, then toggle to treemap | The treemap zooms to the file with that scope highlighted |
| Back after a misclick | The previous location, in the same view, with no reload or rescan |
| Refresh, or open a pasted URL | The repo is re-analyzed from the server cache, and you land at `at` in `view` |
| `at` no longer exists (file deleted) | The nearest existing ancestor, with a toast |
| Back out of compare | The previous normal-mode location, with the scan intact |

## Decisions and boundaries

**Appetite:** Medium. The work is client-only: a small location module, wired into the treemap, the graph, the header and the compare entry and exit.

**Key decisions:**
- **Fetch the graph once for the repo root.** Today it is fetched for the treemap's current folder (`Treemap.tsx:252` → `?path=`), so dependents outside that folder are silently missing. With one location, fetch the whole-repo graph once and let focus select within it. The whole-repo graph is already mtime-cached on the server, and drills stay local with no refetch. That keeps performance as it is and fixes correctness.
- **The URL is the source of truth.** Location lives in the URL and history gets real `pushState` entries. App signals derive from the URL, not the other way round. This replaces today's mix of `replaceState`, in-memory `currentRoot`, and `pushState` used only by compare.
- **No remount on `popstate`.** Compare and normal mode keep the scan in a store that outlives the view switch (`App.tsx:156-165`).

**Boundary:**
- Local paths in the URL are fine, since srcly runs on localhost.
- The Explorer tree follows the location but keeps its own expand/collapse state.
- Compare keeps its `?compare=` parameter. Folding compare into the location model is not in scope.

**Collisions:** Starts after quick-fix PR A, which moves graph open into the app's single CodeModal. It touches `App.tsx`, `Treemap.tsx`, `TreemapHeader.tsx`, `DependencyView.tsx` and `compare/api.ts`. Dependency-graph-legibility touches `DependencyView.tsx` only to add a metrics-index prop, so agree on that prop before running both in parallel.

**First proof:**
- **Try:** a location module (parse, serialize, push, history list) with Vitest, wired to treemap zoom and graph focus only, on srcly's own repo.
- **Observe:** Using the in-app browser:
  - drill 3 levels, misclick, and press Back to return to the prior focus, with no network request for a scan;
  - refresh, and the same repo, `at` and view are restored;
  - the History dropdown lists the visits.
- **Decide:** If all pass, add the toggle swap, node actions, the compare no-remount path, and the root-scoped graph fetch. If restoring the repo on refresh takes more than about 2s on modeler, show the last location's treemap from the client cache while the rescan validates.

Intent: [intent-brief.md](intent-brief.md)
