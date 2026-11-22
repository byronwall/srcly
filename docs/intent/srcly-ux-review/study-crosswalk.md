---
title: "Srcly UX review — implementation intake"
slug: "srcly-ux-review"
phase: intent
status: current
last_updated: "2026-11-22"
---

# Implementation intake

This is a handoff and evidence crosswalk, not a parallel backlog. Use the linked GitHub issues for acceptance/discussion and Product Grid (`pgm/data`, `srcly-backlog`) for open execution tasks when shaped. Follow the existing field-lineage, proof-strength, trace controls, batch-run and alias-resolution nodes rather than recreating them. Update actual PR/issue evidence as it lands; retire planning documents using repo conventions once the work is absorbed.

| Study finding | Disposition and proof |
| --- | --- |
| UX-001 · P0 | Focused ownership fix; S15/E028: caller-visible alias sort is not Closed, local copy sort is the negative control. Unknown ownership must not assert closure. |
| UX-002 · P1 | [#440](https://github.com/byronwall/srcly/issues/440) repository inventory; S02/S13 / E005/E032: tracked-ignored helper is visible to tree, Imports and Symbols; ignored-untracked and non-code controls. |
| UX-003 · P1 | [#441](https://github.com/byronwall/srcly/issues/441) demand/eager parity; S09: cold callback-to-state/render matches supported eager result; truly unresolved case remains partial. |
| UX-004 · P1 | [#442](https://github.com/byronwall/srcly/issues/442) field precision, scope and evidence; S06/S07/S12: title does not silently acquire tags as exact ancestry. |
| UX-005 · P1 | Focused revision handoff fix; S18/S19 / E043: deleted function opens base source while correct inline diff and open selection survive. Compare is the positive control. |
| UX-006 · P2 | Focused frontier action fix; S12: a synthetic display ID is never sent as a program anchor; failed query is not displayed with stale success data. |
| UX-007 · P2 | [#446](https://github.com/byronwall/srcly/issues/446) repository-state repair; S04/S08: repo/route ownership is explicit; switching roots cannot request an old route or show both empty and error. Keep URL/Back restoration. |
| UX-008/009/010/018 · P2/P3 | [#443](https://github.com/byronwall/srcly/issues/443) search scope, visible actions, keyboard/narrow viewport and counts. Start with existing search and inspector; keep the working 20→92→28 drill-down. |
| UX-011 · P2 | Focused Effects selection/API fix; S08/S09 / E022: no line-zero request when opening the whole file, controlled API validation, valid function positive control. |
| UX-012/013/015 · P2 | [#444](https://github.com/byronwall/srcly/issues/444) complete change footprint first; responsibility and behavioral comparison later. Use the existing batch-run task and Compare backend hooks. |
| UX-014 · P2 | [#442](https://github.com/byronwall/srcly/issues/442) later explicit framework evidence slice; S08: initialization, subscription and timing are different relationships. |
| UX-016 · P2 | [#445](https://github.com/byronwall/srcly/issues/445) receipt-based local provenance; S17/S19: no session/per-edit attribution guessed from a trailer. |
| UX-017 · P3 | Bounded checker feedback improvement; S12: present the actionable failure reason without dumping arbitrary stderr; ignored input is not itself a product failure. |

## Proof ladder

1. Reproduce failures on current main and lock in narrow controls. Treat source inspection as distinct from browser/runtime execution.
2. Run applicable engine/client/server checks and browser checks for affected interactions as documented in `AGENTS.md`. Follow survey gate guidance for analysis changes. No release bump or tag.
3. Use S02/S09/S12/S15/S18 as a minimal trust smoke run. Before workflow-wide rollout, rerun relevant tasks with opt-in/absent evidence, keyboard and constrained viewport. Track completion and detours without converting shell runtimes to people’s task times.

Minimum proof before shape advances: one observable outcome and one falsifying case per issue. Build each slice so it can be reverted without losing existing workflows. Original examples and tiny study fixtures should be reconstructed or derived from public repository sources; do not commit the whole research archive.
