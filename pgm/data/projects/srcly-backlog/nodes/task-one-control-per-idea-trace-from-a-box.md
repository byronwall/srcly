---
id: task-one-control-per-idea-trace-from-a-box
label: One control per idea; trace from a box
type: task
status: planned
parent: area-data-flow-python-usability-audit-2026-10
rawContext: |
  G5. Several controls for one idea. Trace From/Both/To sits beside Reach Both/Up/Down; the code menu has "Inspect value flow" beside two trace entries; reach counts repeat in the inspector and the footer; a canvas box has no "trace from here" (right-click shows a hover card only), so re-anchoring goes through the code viewer.

  - Files: `client/src/viz/deps/flow/FlowTools.tsx`, `FlowView.tsx`, `client/src/components/CodeModal/InspectMenu.tsx`, `client/src/viz/deps/DependencyCanvas.tsx`.
  - Done: one direction control; re-anchor from a box in one action. Costs Parts and Next on T1, T2, T4, T7.
---
G5 (rest). Anchor mode has one direction control: a selected box's reach follows Trace From/Both/To (Reach Both/Up/Down shows in route mode only), and a value box offers "Trace from here" (#225). Still repeated:

- The code menu has "Inspect value flow" beside "Trace where it comes from" and "Trace where it goes", with no word on how they differ.
- Reach counts show in the inspector and again in the footer.
- Files: `client/src/components/CodeModal/InspectMenu.tsx`, `client/src/viz/deps/flow/FlowView.tsx` (footer).
- Done: one entry per idea in the code menu; one place for reach counts.

