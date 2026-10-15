---
title: "Unified navigation — implementation plan"
slug: "unified-navigation"
phase: plan
status: current
last_updated: "2026-10-15"
---

# Unified navigation — implementation plan

## Plan at a glance

Milestone 1 makes the location real. A pure location module backs treemap zoom and graph focus with `pushState`, and the graph is fetched once for the repo root, so one place can feed both views. Those two changes have to land together. If graph focus drives treemap zoom while the graph is still fetched for the treemap's folder, every drill would refetch a smaller graph and lose outside dependents, as happens today. After milestone 1, Back undoes a misclick, the breadcrumbs agree, and nothing else has changed.

Milestone 2 makes refresh and compare lossless. It puts the repo and the view in the URL and lifts the scan into a store that outlives `AppContent`, so `popstate` never wipes it. It also adds the History dropdown. Milestone 3 cleans up the controls: a single Treemap | Graph switch, and visible node actions. Instant toggling and an animated morph stay below the line until milestone 3's timings show whether they're needed.

**Pushback:**
- The shape put the root-scoped graph fetch into later milestones. The plan moves it into milestone 1, because a shared location doesn't work without it.
- The hover cards in both views are `pointer-events-none` (`DependencyCanvas.tsx:349-363`), so their buttons can't be clicked. Node actions therefore go in a right-click menu plus a hover "⋯" button on the node itself.

## Implementation strategy

- **First proof:** on srcly itself in the in-app browser:
  1. drill three levels in the graph;
  2. misclick;
  3. press Back to return to the prior focus, with no scan request in the network log;
  4. check that the treemap breadcrumb shows the same path.
- **Primary seam:** `client/src/navigation/location.ts`.
  - Pure `parseLocation(url)` / `toSearch(loc)` and a `HistoryRing`.
  - A small `navigation` store exposes `location()`, `go(loc)` (pushState) and `replace(loc)`, and listens to `popstate`.
  - All views read the location and call `go`. None write the URL themselves.
- **Fast local loop:** `cd client && pnpm test -- navigation`, then `./dev.sh` with the in-app browser on srcly.
- **Local dependencies:** none.
- **Live confirmation:** manual checks on modeler, recorded in each PR description: refresh restore time and Back after a misclick.
- **Rollout and rollback:** each milestone is its own PR. Milestone 1 keeps `depFocus` readable as an alias for one release, so old links still open.

## Milestone 1: One location for treemap zoom and graph focus, with real Back

- **Change: location module** (`client/src/navigation/location.ts`, new)
  - `Location = { at: string /* repo-relative; "" = root; "file#symbol" */, view: "treemap" | "graph" }`.
  - Supported query parameters are `at`, `view` and the legacy `depFocus`.
  - Tests: round-trip, the legacy alias, the empty root, and symbol fragments.
- **Change: treemap reads the location** (`client/src/App.tsx:192`, `:213-217`, `:379-384`)
  - `currentRoot` becomes a memo: `findTreeNodeByPath(data, abs(at))`. If that path is gone, fall back to the nearest existing ancestor and show a toast.
  - Explorer and Treemap `onZoom` (`App.tsx:576`, `:589-595`) call `go({at: rel(node.path)})`.
- **Change: graph reads the location** (`client/src/viz/deps/DependencyView.tsx:20-37`, `:53-75`, `:97-105`, `:127-150`)
  - Remove `readFocusParam`/`writeFocusParam` and the local `focusId`.
  - Focus is the location's `at`, mapped to a graph id. Graph file ids are repo-relative (`server/app/services/deps/graph.py:107-131`), and symbols are `file#name`.
  - Clicking a node calls `go`.
- **Change: graph fetched for the repo root** (`DependencyView.tsx:39-51`; `Treemap.tsx:252`)
  - Pass the scanned root (`App.tsx:204` `scannedPath`), not `currentRoot().path`. The server caches the whole-repo graph by mtime (`graph.py:65-79`).
- **Change: one breadcrumb.** The graph's "Focus path" (`DependencyView.tsx:127-150`) is removed. `TreemapHeader`'s breadcrumb (`:43-68`) serves both views.

### Desired end state

- Drilling in either view moves both. Back and Forward step through locations, with no rescan and no graph refetch.
- Neighbors outside the treemap folder now appear in the graph.
- First-open graph time on modeler is measured and recorded in the PR.

## Milestone 2: Refresh and compare never lose the repo; History dropdown

- **Change: scan store** (`client/src/state/scanStore.ts`, new)
  - Lift `visualizationData`, `loading`, `scan`, `scannedPath`, `activeRequest` and `stopWatching` out of `AppContent` (`App.tsx:171-209`, `:259-344`) into a module-level store with an explicit `dispose`.
  - `excludedPaths` and the treemap paint gate stay in the component.
- **Change: repo in the URL**
  - Add `repo` to `Location`.
  - On load with `?repo=`, call `handleFileSelect(repo)`. The server analysis cache makes this fast. Then apply `at` and `view`.
  - `FilePicker`'s Recent list (`FilePicker.tsx:30`, `:50-60`) stays as it is.
- **Change: compare without remount**
  - `App`'s `popstate` handler (`App.tsx:156-165`) only switches what is shown. `AppContent` and the scan store survive.
  - Compare's `navigateCompare` (`compare/api.ts:127-132`) keeps its own parameter. Leave the seam alone, because the compare-ref-picker worker also edits this file.
- **Change: History dropdown** (in the `App.tsx` header next to Recent)
  - A `HistoryRing` of the last 30 locations, with a view icon, a path, and the time. Clicking an entry calls `go`.
  - The ring is in memory per tab. It is mirrored to sessionStorage inside a try/catch so it survives a refresh.

### Desired end state

- Refresh or a pasted URL restores the repo, location and view. Time to restore on modeler is recorded.
- Entering compare and pressing Back returns to the same scan with no "Map a codebase" screen.
- The History dropdown jumps back several steps at once.

## Milestone 3: One switch and visible node actions

- **Change: switch** (`client/src/viz/treemap/components/TreemapHeader.tsx:99-113`)
  - A segmented Treemap | Graph control writes `view`.
  - The graph's Close button (`DependencyView.tsx:159-168`) is removed.
  - This also fixes the toolbar toggle leaving a stale `depFocus` behind.
- **Change: graph filters survive toggling.** The `filters` signal (`DependencyView.tsx:51`) moves into the navigation store, so unmounting the view doesn't reset External, Tests and Type-only.
- **Change: node actions**
  - A shared `NodeActionsMenu` opens on right-click in both views and from a hover "⋯" button on graph nodes.
  - Its actions are Focus, Open code (the quick-fix A path) and Show folder (`go({at: parent})`).
  - In the treemap it opens from `TreemapCanvas`'s `contextmenu`. Alt-click keeps excluding paths.

### Desired end state

- One control switches views in place, with the location and filters kept.
- Any node in either view reaches Focus, Open code or Show folder without modifier keys.
- The toggle time on modeler is recorded, to inform the spike below.

## Open decisions and spikes

- **Instant toggle vs remount.**
  - **Decision required:** keep both views mounted (hidden) so toggling is instant, or not.
  - **Evidence to gather:** milestone 3's toggle timings and memory use on modeler.
  - **Fallback:** keep remounting, and cache the graph layout per focus.

## Below the cut line

- An animated morph between the treemap and the graph.
- Putting the open code viewer, color metric and file filters in the URL.
- Folding compare's parameter into the location model.
