# Agent reporting research

**Decision:** repair false comparison results and machine-output reliability first. Prototype reusable analysis and scoped inspection, then select a CLI design using real agent tasks. Retain existing analyzers, catalog and witnesses.

The [Pro report and all companion files](../../intent/agent-reporting/assets/pro-results/2026-10-31/INDEX.md) audit baseline `aa56155c9268ce9da3a54180cb6a77ae6635d190`. The [implementation plan](../../intent/agent-reporting/implementation-plan.md) and [dispositions](dispositions.md) adapt its proposals. [Pro conversation](https://chatgpt.com/c/6ae55e73-73e8-83ea-ba6e-d0938f49a28f).

Local source review confirms three high-impact mechanisms: compare summary substitutes zero for missing values (`compare/diff.py::_summary`); cache failure warnings use stdout (`findings/runner.py`, `activity.py`); and the folder tree sorts against a file-only score map (`reporting.py::summarize_tree`). `reporting.py::_metrics_subset` drops zero and null alike. A local report also placed documentation and a snapshot in its first ten findings. These are triage and transport concerns; metrics alone do not prove a code defect.

Pro proposes `catalog → audit → inspect → compare`, with saved evidence and on-demand providers. This is a promising direction, but the full source identity, pagination and provider model is not yet justified by measurements. Its 25 contract cases are proposed data, not executed tests. Pro did not benchmark a 10× improvement.

Open questions: which categories and ranking lanes help actual audits; whether a saved JSON tree provides enough reuse; and which freshness guarantees are affordable. The comparison and stdout repairs do not depend on those answers. Primary precedents and pinned code references appear in the original report; its external comparisons are design references, not performance evidence.
