# Recommendation dispositions

These decisions reconcile all 30 Pro recommendations. Build means include in the plan; it does not authorize implementation.

The [research summary](README.md) explains the reasoning. The [plan](../../intent/effects-async-test-seams/implementation-plan.md) defines M1 and M2. No recommendation needs a Pro follow-up.

| ID | Disposition | Decision and reason |
| --- | --- | --- |
| EAT-001 | Build · M1 | Put the effects pass in TSX; reuse its compiler foundation. |
| EAT-002 | Build · M1 | Collect exact call occurrences and unresolved targets; imports cannot substitute. |
| EAT-003 | Build · M1 | Store facts and coverage independently; known and unknown behavior coexist. |
| EAT-004 | Build · M1 | Track bounded origins and substitute arguments; local and input writes differ. |
| EAT-005 | Build · M1 | Separate activation channels from promise result handling. |
| EAT-006 | Build · M1 | Use finite recursive summaries and bounded source witnesses. |
| EAT-007 | Build · M1 | Use one direct API, JSON command, and Srcly subprocess adapter. |
| EAT-008 | Build · M1 | Add an Effects panel before a new graph. |
| EAT-009 | Build · M1 | Use exact spans and source matching; refuse stale evidence. |
| EAT-010 | Build · M1 | Prove three real anchors and a compact semantic fixture. |
| EAT-011 | Build · M2, gated | Add a bounded execution slice only after M1 review. |
| EAT-012 | Build · M2, gated | Model watchScan and promise coordination as the next concrete use case. |
| EAT-013 | Build · M1 | Keep categories separate from numeric metrics; preserve N/A. |
| EAT-014 | Build · M1 | Disclose analysis scope, assumptions, and module initialization limits. |
| EAT-015 | Build · M1 | Document transformation, contract, and lifecycle seams with real examples. |
| EAT-016 | Explore | Validate Solid activation models against the installed version. |
| EAT-017 | Explore | Use the Node worker service for a later ownership/correlation proof. |
| EAT-018 | Explore | Start Python semantics with a named thread/process lifecycle case. |
| EAT-019 | Explore | Add container-element origin precision only for a useful unresolved case. |
| EAT-020 | Explore | Compare Jelly/CodeQL on selected targets; do not require them at runtime. |
| EAT-021 | Explore | Review explainable tangle signals before using them for prioritization. |
| EAT-022 | Defer | Runtime traces add observations but are unnecessary for static spot checks. |
| EAT-023 | Defer | Measure startup cost before adding a cache or resident service. |
| EAT-024 | Defer | Extract a shared package only after a concrete shared boundary emerges. |
| EAT-025 | Defer | Whole dependency/heap/path proof exceeds the first useful slice. |
| EAT-026 | Defer | Reuse source identity mechanics without coupling to route-field UI. |
| EAT-027 | Avoid | No purity, testability, risk score, or unconditional safe badge. |
| EAT-028 | Avoid | No name-only host rules or reuse of opaque/proven labels as effect proof. |
| EAT-029 | Avoid | Never relabel import or folder edges as execution. |
| EAT-030 | Avoid | No mass refactor or assumption that every effect is a defect. |

M1 contains EAT-001–010 and EAT-013–015. M2 contains EAT-011–012. Explore and Defer items are not hidden M1 requirements.

Integration keeps the recommended design but limits its first delivery. The panel's test-seam guidance starts as documentation. It is not a new automatic recommendation engine. Source checks use the current local checkout. Missing files in the packet are not implementation blockers when they exist locally.
