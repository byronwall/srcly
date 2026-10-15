---
title: "Dependency graph legibility — implementation plan"
slug: "dependency-graph-legibility"
phase: plan
status: current
last_updated: "2026-10-15"
---

# Dependency graph legibility — implementation plan

## Plan at a glance

Each milestone changes one stage of the existing pipeline: view model → grid layout → canvas. Each one is gated by a geometry test, so a regression shows up as a failing number rather than a screenshot argument.

1. **Packing.** This was the most visible failure in the session, and it is a contained fix to the layout's option scoring.
2. **Two-line boxes and folder styling**, using data the graph already has (member counts, hierarchy).
3. **Grouping.** The highest-value change, and the riskiest for routing.
4. **Joining LOC and the treemap color onto the graph.** No server change.
5. **Edge spreading.**

Every milestone leaves the graph shippable. Compare mode, which shares `layoutViewSync`, stays green throughout.

**Pushback:**
- The shape had folders spanning several rows. The router assumes gutters are free from end to end (`layout.ts:9-10`). A spanning box would block the gutters it covers, so edges would cross it. The plan keeps uniform cells. Every box gets taller to hold two lines, and folder size becomes an in-box size bar.
- Realism without leaking data: srcly is public, so modeler graphs can't be committed. A capture script writes them to a gitignored `__fixtures__/local/` folder. Tests that use them skip when the folder is absent, and committed tests use srcly's own fixture plus small synthetic graphs.

## Implementation strategy

- **First proof:** milestone 1's aspect-band test on a synthetic `server`-shaped graph and on local modeler captures.
- **Primary seam:** the pure functions `buildViewModel(index, opts)` (`viewModel.ts:74`) and `layoutViewSync(vm, opts)` (`layout.ts:203`). They already have Vitest coverage, so no new seam is needed.
- **Fast local loop:** `cd client && pnpm test -- viz/deps compare/graphModel`. Capture fixtures with `scripts/capture-dep-graph.sh <repo> <folder>`. The script calls `GET /api/analysis/dependency-graph?path=` on a running server and writes `client/src/viz/deps/__fixtures__/local/<name>.json`, a folder that is added to `.gitignore`.
- **Local dependencies:** none.
- **Live confirmation:** before/after screenshots of modeler `server`, `agent_skills` and `client/apps/modeler/src/components`, attached to each PR and never committed.
- **Rollout and rollback:** each milestone is its own PR.

## Milestone 1: Mid-level views fill the viewport

- **Change: arrange scoring** (`client/src/viz/deps/layout.ts:312-325`)
  - Among options within 90% of the best scale, pick the one whose width:height is closest to the viewport's on a log scale. Today it picks the most unfolded one.
  - `chooseRows` (`:129-145`) uses the depth-level counts per region instead of raw region counts.
- **Change: test helpers** (`layout.test.ts`)
  - Add `aspectOf(layout)`. Assert that it stays within 0.5–2× the viewport aspect for:
    - the srcly fixture's folder focuses;
    - a synthetic graph of 15 children spread over 5 depth levels;
    - local modeler captures, when present.
  - Replace the weak `> 1.2` assertion (`:46`).
  - Keep `countNodeCrossings === 0` and record the crossing count as a baseline.
- **Change:** add the capture script and the `.gitignore` entry.

### Desired end state

- Modeler `server` and `primitives` render roughly viewport-shaped and centered, not 4–7:1 strips.
- All layout, viewModel and graphModel tests pass.

## Milestone 2: Two-line boxes and visibly different folders

- **Change: box size** (`layout.ts:13-14`): `NODE_HEIGHT` 28 → 40. Rows and gutters follow, because everything already derives from the constant.
- **Change: context line**
  - `viewModel.ts:349-369` sets `subtitle` on every `ViewNode`:
    - a symbol gets module · file;
    - a file gets its parent folder;
    - a folder gets "N files · M folders", from the hierarchy.
  - Symbol `label` becomes the bare symbol name instead of `qualifiedSymbol` (`:420-423`).
  - `compare/graphModel.ts:197-225` sets `subtitle` too. The field is optional.
- **Change: rendering** (`DependencyCanvas.tsx:276-345`)
  - Line 1 is dark and medium weight. Line 2 is muted.
  - Folders get a tinted fill and a 1.5px frame.
  - A 3px bottom size bar shows width ∝ log(memberCount) against the largest sibling in view.
- **Test:** viewModel tests for `subtitle` per kind.

### Desired end state

- `relationship_focus.RelationshipFocus` reads as `RelationshipFocus` over `model_making · relationship_focus.py`.
- In `components`, the 276-file folder has the longest bar, and folders and files are told apart at a glance.

## Milestone 3: Neighbors grouped by package, then file

- **Change: group key** (`viewModel.ts`)
  - `ViewNode.group?: { id, label }`.
  - For side nodes, the key is the first folder below the common ancestor of the focus and that node. For symbols, it is the owning file, nested inside the package.
  - Single-symbol collapse: when every edge into a side file targets one symbol, emit that symbol with the file as `subtitle`.
- **Change: ordering** (`layout.ts:278`, `:336-359`)
  - Within a column, barycenter runs over groups first, then over members inside each group, so groups stay contiguous.
- **Change: frames** (`DependencyCanvas.tsx`, reusing the `focusFrame` pattern at `:145-154`, `:224-237`)
  - One light frame per group run in each column, labeled at the top-left in the frame padding.
- **Tests:**
  - every group's nodes are contiguous in their column;
  - 0 node crossings;
  - crossings no more than about 25% over the milestone 1 baseline;
  - single-symbol collapse on a synthetic graph.

### Desired end state

- Around modeler `identify_properties.py`, `agent-skills`, `agent-core` and `agent-shared` neighbors sit in labeled frames.
- `edit-in-place` shows as its component.

## Milestone 4: Shared color and LOC from the treemap

- **Change: metrics index**
  - `Treemap.tsx:250-255` passes `metricsIndex` (a `Map<absPath, Node>` built once per scan) and `colorMetric` (`Treemap.tsx:66`) into `DependencyView`.
  - Agree on this prop with the unified-navigation worker. It is the only change this initiative makes to `DependencyView`'s props.
- **Change: tint and LOC**
  - In a memo separate from layout, so a color change never triggers a relayout, the canvas fills each box with `treemapFillColor` (`viz/treemap/utils/colors.ts:58`). Text color comes from `treemapLabelColor`.
  - The file subtitle shows LOC. The folder subtitle adds total LOC, and the size bar switches to LOC.
  - A node with no match keeps a neutral fill and no LOC.
- **Test:** a pure `nodeMetrics(index, absPath)` with hit and miss cases.

### Desired end state

- Changing the color metric in the toolbar re-tints the graph instantly with no relayout.
- `pipeline.py` shows its LOC.

## Milestone 5: Edges spread out

- **Change: bundle width** (`layout.ts:663-743`): drop the 8px cap and use `gap = max(1.5, min(BUNDLE_GAP, channelWidth / n))`.
- **Change: gutter choice** (`layout.ts:389`): when both candidate gutters are valid, choose the less loaded one.
- **Tests:** bundle offsets within the channel bounds; crossings no worse than the milestone 3 result; no extra overlapping segments.

### Desired end state

- The `server` focus no longer funnels its edges through one 30px band, and each bundle's width reflects its edge count.

## Open decisions and spikes

- **Frames per column vs across columns.** Decide after the milestone 3 screenshots. If the per-column frames look fragmented when a package spans depth levels, try one frame across adjacent columns, with gutters inside it allowed. Fallback: group labels without frames.
  - **Decided (milestone 3): per column.** Depth layering already separates most packages by column, and a package's lone box in another column gets no frame; its subtitle names the package. A frame across columns would have to contain the channels where other packages' edges run.

## Below the cut line

- Folders spanning several rows, which needs a span-aware router.
- Peek or fly-in of a neighbor's contents.
- A folder's most-used items on the parent view.
- LOC and color on the compare graph.
- Fewer faint edges in busy views.
