---
title: "Dependency and treemap quick fixes — shape brief"
slug: "dependency-and-treemap-quick-fixes"
phase: shape
status: current
last_updated: "2026-10-15"
---

# Dependency and treemap quick fixes — what we are adding

**Outcome:** Opening code from the graph behaves exactly like opening it from the treemap. The treemap draws your eye to what matters. Popovers and the metrics panel stop getting in the way.

**Primary flow:** Drill the graph → double-click (or middle-click) a symbol → the code viewer opens on that symbol with its sidebar and metrics → close → the graph is not stuck gray.

## Feature scope

```text
Quick fixes (five independent PRs, in this order)
├── PLANNED ADDITIONS
│   ├── A · Graph open path (bugs 1–4)
│   │   ├── hover state resets whenever the layout changes; no stale dimming
│   │   ├── open goes through the app's single CodeModal: fileNode + scopeNode found by path
│   │   ├── symbol → its treemap scope, matched by line in that file (names differ: "(class) Foo",
│   │   │   "Foo (class)") → opens on that range
│   │   └── single click focuses after the dblclick window; middle-click and ⌘-click open
│   ├── B · Graph polish
│   │   ├── side headers removed; the focus file title stays
│   │   └── legend bottom-right: solid = import, dashed = context edge,
│   │       thickness = weight, dashed box = external package
│   ├── C · Treemap visuals
│   │   ├── labels dark on light fills (plc tokens), no alpha on chunk text
│   │   ├── IBM Plex Mono for file and symbol labels; folder headers stay Inter (evaluate)
│   │   ├── stronger ramp with perceptual interpolation; much lighter depth brightening
│   │   ├── padding one step tighter
│   │   └── tooltip: mono tabular numbers, top symbols by LOC, fan-out, edge flip
│   │       (CompareTreemap HoverCard pattern)
│   ├── D · Popovers
│   │   ├── only one open at a time: opening one closes the others
│   │   ├── positioned before first paint, flipped/clamped to the viewport
│   │   └── short origin-aware scale/opacity entry (emil-design-eng)
│   └── E · Code viewer metrics
│       ├── only metrics that apply to the file's language and the node's scope
│       ├── grouped: Size · Complexity · Language-specific
│       └── one table: metric | scope | file
└── LATER POSSIBILITIES
    └── color metric as a single-select, separate from the Hot Spots multi-select
```

## Behavior

| Situation | Expected result |
| --- | --- |
| Click a neighbor, then don't move the mouse | The graph drills in with no node dimmed |
| Double-click a neighbor | It opens in the code viewer without refocusing the graph |
| Open a symbol whose name has no matching scope | The viewer opens the file at the symbol's line, with full file metrics |
| Open the file filter while the Color picker is open | The Color picker closes |
| Python file in the code viewer | No TSX, `useEffect`, or Markdown rows |
| A metric is 0 but applies | It still shows, since 0 is information |

## Decisions and boundaries

**Appetite:** Small. Each PR stays within a handful of files and changes no scan, cache, or graph contract.

**Key decisions:**
- **No server change for the open path.** The graph's `absPath` already matches the treemap tree's absolute `path`. `findNodes` resolves the file and the scope client-side, so the contract stays as it is. The scope end line comes from the treemap, not from a new `endLine` field.
- **Metric applicability lives in the client.** `HOTSPOT_METRICS` already carries a language `group`. Add a scope flag (file-only metrics such as `python_import_count` and `file_size`) instead of building a definitions API.
- **One CodeModal.** Moving the graph's open into the app's modal is also the first step of [unified-navigation](../unified-navigation/shape-brief.md). It stops two modal instances from drifting apart.

**Boundary:**
- Compare mode picks up the ramp and font changes through the shared `TREEMAP_RAMP`. Check it there, don't fork it.
- No modeler-derived fixtures get committed, because srcly is public. Before/after screenshots of modeler stay in the PR description only.

**Worktree collisions:**
- A and B both touch `DependencyCanvas.tsx`, so land A first or run them in sequence.
- C and E don't collide with anything.
- D touches only `Popover.tsx` and its pickers.
- A must merge before unified-navigation starts, and B before the legibility layout work.

**First proof:**
- **Try:** PR A on srcly's own client folder, then by hand on modeler `agent_skills/qa/pipeline.py`.
- **Observe:** Vitest checks pass for:
  - the hover reset after the layout changes;
  - `absPath` + symbol → scope lookup (hit, miss, duplicate name);
  - click/dblclick timing.

  In the browser, a double-clicked symbol opens on its line range with the sidebar and metrics, and a drill leaves nothing gray.
- **Decide:** If all three pass, ship PRs B–E in parallel worktrees. If the scope lookup misses on real Python classes or methods, add `endLine` to the graph symbol contract (one server field) before B.

Intent: [intent-brief.md](intent-brief.md)
