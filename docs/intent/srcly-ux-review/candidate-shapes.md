---
title: "Srcly UX review — candidate shapes"
slug: "srcly-ux-review"
phase: intent
status: candidate
last_updated: "2026-11-22"
---

# Candidate shapes for review

These are starting shapes, not implementation authorization. Fix existing trust breaks before adding interpretation.

```text
Srcly UX review
├── Trust floor
│   ├── Caller-owned effects and truthful uncertainty
│   ├── Shared repository inventory (#440) and supported React demand parity (#441)
│   └── Correct source/target identity through navigation and invalid/empty inputs
├── Question → source
│   ├── Preserve field scope, proof kind and unknowns (#442)
│   └── Search scope, visible actions, narrow viewport and keyboard (#443)
├── Change → evidence
│   ├── Complete changed-file footprint and revision-preserving handoff (#444)
│   └── Responsibility movement and before/after behavior, after the first slice
└── Optional local provenance (#445)
    └── Explicit receipts only; unknown is a valid result
```

| Workstream | First visible proof | Cut line |
| --- | --- | --- |
| Evidence-first trace | Ask where the title comes from. Show exact carriage and point to the first handoff where only whole-object context is known. Continue honoring a named partial result. | No persistent workspace or general field/path sensitivity first. Distinguish Solid `untrack` initialization and actual subscriptions in a separate proof. |
| Question to source | Find `SearchPage` despite its absence from the loaded graph; land on its source at laptop zoom without losing Back. Expose one high-value source action and label count scope. | Reuse current index and symbols search. No new search backend, layout rewrite or formal conformance claim. |
| Change to evidence | In `f2544ff^..f2544ff`, list all 15 Git paths (11 structurally visible in the study) and carry one omitted model path into same-range Compare and historical source. | No invented metrics, generic quality score, or arbitrary historical tracing first. Keep batch job and responsibility explanation as later slices. |
| Provenance | Given a known local receipt, a mixed human/agent history and a no-receipt control, show only what each source supports. | No publishing logs, no inferred authorship, no second adapter until one can preserve unknowns. |

**Open decisions for shaping:** vocabulary and scope transitions in traces; whether search fallback is one surface with scopes or explicit separate actions; owner of cross-view revision state; what a receipt can carry without exposing source/session details. The concepts from the study are candidates and not evidence that those interactions already exist.
