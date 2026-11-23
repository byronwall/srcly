---
title: "Srcly UX review follow-through"
slug: "srcly-ux-review"
phase: intent
status: current
last_updated: "2026-11-23"
---

# Srcly UX review follow-through

## My read

A developer can ask a focused question about a repository or a change, reach source-backed evidence, and tell what the evidence does and does not establish. The UX review found that Srcly is especially useful when the graph assembles evidence that would otherwise take several manual searches. Preserve that advantage; don't add another way to make a hairball.

## What matters most

Turn the November 22 UX evaluation and its artifacts into coherent work. Fix independently verifiable defects in focused PRs. Capture intent for larger changes, link actionable issues, and let those projects go through the usual shaping process. This intake doesn't approve the speculative redesigns or a release.

## Boundaries

The study ran 20 expert walkthroughs at [`a4d2a8e`](https://github.com/byronwall/srcly/commit/a4d2a8e04b4b4f1a346695c3daa56240e6a57716): 3 completed cleanly, 7 with substantial friction, 7 partial, 3 blocked by defects. This is a demanding benchmark, not a user success rate. Keep these distinctions:

- **Incorrect vs. uncovered:** A caller-owned mutation incorrectly shown as Closed is a correctness defect. A partial trace that names an actual unknown is useful, not necessarily a failure. Reproduce demand/eager disagreement separately.
- **Inventory vs. analysis:** A tracked path can exist even if a view can't structurally analyze it. Don't turn an exclusion, missing metric or unknown receipt into zero or absence.
- **Source identity vs. view:** Repo, ref, side, file and range belong together. Historical source, inline diffs and Back should not move the user into a different interpretation.
- **Measured vs. inferred:** A metric delta, changed-file set or declared coauthor isn't a conclusion about quality, behavioral equivalence or per-line agent authorship.

## What seems settled

Preserve the notes input-to-render/save path (S05), generic HOC (S11), async effects and assumptions (S10), hotspot-to-source witnesses (S14), source+Back navigation (S04/S20), and Changes windows, Touched/Net, commit rail, correct diff and In repo selection (S16/S18/S19). Build first proofs around the same small fixture/target and a failing control, not just a more polished picture. No human timing, formal accessibility or performance claim follows from this study.

## Next step after confirmation

The first inventory and field-inspector slices landed in [#457](https://github.com/byronwall/srcly/pull/457) and [#458](https://github.com/byronwall/srcly/pull/458). The focused browser retest confirmed both made several original objectives easier, but exposed a blocked source-to-ledger action and narrower navigation and Git-reporting defects. Repair those independently. Shape the next product work around one question: can someone follow the title back to its first demonstrated producer without confusing object context with value provenance? Review continuity is separate; decide what Compare owns before changing its history. Keep the search and agent-receipt proposals out of this wave.

The public [study crosswalk](study-crosswalk.md) records the initial intake. The [current shape](shape-brief.md) records retest evidence and the cut lines. The full private evidence packages are not checked in.
