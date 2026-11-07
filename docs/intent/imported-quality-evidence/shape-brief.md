# Complementary source evidence — shape

**Outcome:** Reviewers can inspect evidence that source counters alone cannot provide.

**Primary flow:** Select an evidence source → verify its match to the scan → inspect a target → open the supporting source or peer.

## Feature scope

```text
Complementary evidence
├── PLANNED FIRST PROOF
│   └── Existing dependency view
│       ├── Original import declaration and relation kind
│       └── Resolution completeness; cycle and unique-neighbor witnesses
├── EVALUATE BEFORE COMMITTING
│   ├── Clone artifact → matched peer regions and intentional duplicates
│   ├── Typed findings → rule, source, suppression and duplicate evidence
│   └── Coverage artifact
│       ├── File gaps, eligible counts and source-match status
│       └── Method mapping, then optional CRAP component view
└── LATER POSSIBILITIES
    └── Written boundary rules and existing targeted mutation artifacts
```

## Behavior

| Situation | Expected result |
| --- | --- |
| Artifact source differs from scan | Show mismatch; abstain from numeric joins. |
| A file is absent from coverage | Show unknown unless the artifact establishes eligible zero. |
| A graph has unresolved edges | Show partial evidence; do not claim no cycles. |
| A clone is intentional | Retain that valid review outcome. |

## Decisions and boundaries

**Shared ownership:** Use the [custom results initiative](../custom-metrics-and-repo-config/implementation-plan.md) for diagnostics imports and source association. Do not build a second importer here. Graph, clone, and coverage proofs remain independent. Current native checks already run during scans; these imported workflows add no automatic execution.

**Appetite:** One independently rejectable workflow at a time, using existing local inputs.

**Key decision:** Import artifacts before building engines. The first graph proof extends the existing dependency-view contract and keeps its ≤50-box focus and routing rules.

**Boundary:** No general plugin system or compatibility layer. Each optional source can be omitted without losing source analysis. Revert an unsuccessful integration as one slice.

**First proof:** A cycle witness connected to original source declarations.

**Try:** Compare runtime, type-only, barrel, lazy and unresolved import cases in TS and Python.

**Observe:** Check original edges, source lines, graph completeness, and configuration-only cache invalidation.

**Decide:** Withhold cycle quality claims if the projection cannot explain its edges. Continue only with faithful evidence and unchanged focus geometry.

See the [implementation plan](implementation-plan.md).
