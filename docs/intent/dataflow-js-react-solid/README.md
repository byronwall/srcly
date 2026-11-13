# JavaScript, React, and SolidJS data-flow correctness

Status on 2026-11-12: Stages 1–4 shipped in #316–#337, and `docs/dataflow-coverage.md` records their rules. One Stage 4 gap is open: graph and ledger still differ on 9 of 137 anchors (pgm `task-ledger-and-graph-agree-on-every-shared-expression`). Stages 5 and 6 have not started. Reviewed on 2026-11-01 at `e07cc510087b5c028273cad785b97ee36c6c3b35`.

Start with the [research summary](../../research/dataflow-js-react-solid-2026-11-01/README.md), then the [implementation plan](implementation-plan.md). The [review ledger](review.md) records accepted findings, limits, and recommendation dispositions. Preserve the [seven original Pro assets](assets/pro-results/2026-11-01/README.md) as research evidence.

This extends [PR #308](https://github.com/byronwall/srcly/pull/308) across all three environments. The question is which incorrect paths and missing capabilities to fix first. Observation packets are one research option.

The existing [library-model plan](../dataflow-library-models/plan.md) owns the model loader and registry. Extend those modules. The [robustness plan](../dataflow-robustness/implementation-plan.md) owns natural ends and named frontiers. Preserve its outcomes. These plans do not authorize implementation or create another backlog. Open implementation tasks belong in `pgm/data` when work is scheduled.
