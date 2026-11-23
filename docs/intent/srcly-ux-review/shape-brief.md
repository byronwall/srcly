---
title: "Srcly UX review follow-through: evidence and review continuity"
slug: "srcly-ux-review"
phase: shape
status: current
last_updated: "2026-11-23"
---

# Keep the question and the evidence together

**Outcome:** A developer can ask where one field came from or what changed at a revision and open the exact evidence without losing the original investigation.

**Primary flow:** Start from a source expression or committed comparison → read the relevant proof or the first named limit → open its witness → return to the same question.

### Where the retest leaves us

At [`2e0bce2`](https://github.com/byronwall/srcly/commit/2e0bce2ca67a6b94a23c7621de64f8b904ce17c4), a build from source passed three of five repeated objectives cleanly (S02, S15, S18); S09 completed with a detour, and S12 remained partial. All five had been partial or blocked in the saved baseline. This was an expert fixture-based browser retest, not user timing, and the old build was not rerun.

- **Changes:** The formerly omitted JSON could be found and opened at the exact revision. Touched and Net behaved differently on a reverted edit, with an intermediate source witness. Compare Back restored the prior Changes selection; Forward restored refs and path, but not the filter.
- **Flow:** The inspector proved the direct title read at `NoteView.tsx:7` and showed `note={n()}` separately as whole-object context. It did not prove the earlier title producer. A distinct positive fixture proved a tags-derived **initial** draft title in the forward direction, not reinitialization or a different value for the route heading.
- **Independent repairs, not new product scope:** Restore the source ledger's public proof response (F03), clear stale Symbols state when entering source traces (S09), make the committed-range recovery reachable when only nonstructural files are dirty (C04), and verify Git-backed commit counts versus the misleading zero on JSON-only commits (C03). No claim that these were introduced regressions.

## Feature scope

### Primary slice: find the next witness for this field ([#442](https://github.com/byronwall/srcly/issues/442))

```text
One source-anchored field question
├── NOW: make the existing ledger entry usable and keep the selected span
├── PLANNED ADDITION TO PROVE: show one earlier field producer or the exact handoff that stops proof
│   ├── Keep whole-object carriage and unrelated siblings in expandable Context
│   └── Open each witness without losing the question
└── LATER: subscription and timing relationships; broader producer coverage
```

## Decisions and boundaries

**Recommend starting with an evidence replay, not a new analysis engine.** After the ledger fix, test what the existing graph and ledger can already support for `title`; surface only typed evidence. If a route/resource/component handoff prevents a meaningful answer, identify the first one and test a single bounded provenance seam. Keep this under the existing graph/ledger agreement and proof-strength work; don't open another independent backlog. A wording-only change is a useful fallback for unknowns but doesn't solve the producer detour. A general field-sensitive graph or persistent question workspace is beyond this slice.

**First proof:** A source-anchored browser replay with the original Notes fixture and the tags-derived control.

**Try:** From the rendered title in both Notes controls, follow the direct read and whole-object handoff toward the earlier producer. Repeat S12 and the input → render/save control.

**Observe:** Record clickable source for a proven producer or named stop, the tags-derived initializer in the variant, and the first evidence screen for S12. Source-only inference counts as a detour. Initialization is not a live subscription or a different route heading.

**Decide:** Reuse the existing evidence if both controls hold without incidental tags becoming title evidence. Otherwise test one located handoff seam; prefer an accurate named stop over broadening the graph. See the [initial field shape](evidence-first-trace.md).

### Separate slice: preserve one Compare review ([#444](https://github.com/byronwall/srcly/issues/444))

Use a tiny interaction proof before adding history entries. First test restoring the same filter/selection per repository and exact comparison while keeping **Close source** distinct from **Back to Changes**. Compare a route-backed filter with a scoped session snapshot; choose route state only if refresh and copied URLs should reproduce the filter as part of the question. Don't silently change what browser Back means. Replay C02 with `models/`, a selected path, and an open source witness; then change repository and refs to prove state does not leak. The Git inventory and source witnesses already work, so leave responsibility movement, unchanged-neighbor evidence, and broader history redesign below the cut. See the [initial inventory shape](complete-change-inventory.md).
