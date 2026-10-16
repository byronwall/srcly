# A useful metric portfolio — implementation plan

## Plan at a glance

Prove the comparison method on known cases. Then run a three-repository pilot. Only then choose defaults or expand the sample. This prevents broken measurement support from producing persuasive but false statistical results.

## Implementation strategy

Depend on metric trust milestone 2 for reliable scope, units and availability. Reuse `reporting.py` exports. Add one standalone Python evaluation script, proposed as `server/scripts/evaluate_metric_portfolio.py`, and small input artifacts. Do not add a service or database.

The first proof uses deterministic saved observations. Proposed local command after implementation: `cd server && uv run python scripts/evaluate_metric_portfolio.py --manifest ../tmp/portfolio/manifest.json --out ../tmp/portfolio/results`. Record dependencies and run instructions with the script. Use existing Python tools before adding a statistics package.

Use within-stratum Spearman and top-k overlap at k=10 and 25. Report n, ties, support and zero rates. For size adjustment compare log-size bins and simple residual relationships; report uncertainty rather than presenting one pooled coefficient. Treat constant inputs as undefined. Repository resampling can show sensitivity; do not treat nested functions as independent repositories.

No live provider is needed. Local source samples are copied from authorized pinned checkouts; failures come from synthetic missing, constant, overlapping-scope and outlier rows. Rollback removes the evaluation script and report additions without changing analyzer behavior.

## Milestone 1: The evaluation catches misleading metric relationships

Create deterministic cases: same CCN with different nesting, same size with different branching, CRAP with identical components, unsupported zeros, constant fields, and one rare useful exception among strongly related counts.

Produce a compact Markdown/JSON comparison showing associations and differing target queues. Reconcile 32 API fields, 27 report definitions and 22 selectors against the baseline inventory. Extend the inventory explicitly if metric trust changes identifiers.

### Desired end state

- Results reproduce from the same manifest and seed.
- Missing and constant metrics never appear as independent useful signals.
- A rare useful exception survives an otherwise high correlation.

## Milestone 2: Three repositories yield a reviewable portfolio decision

Select Srcly, one different TS/JS repository, and one Python repository with authorization. Pin revisions, analyzer versions, generated/vendor/test classifications and exclusions. Keep files, functions and folders separate. Do not pool language-specific unsupported measurements.

Compare CCN plus size, the proposed compact catalog, and the full organized catalog. Review up to 20 deduplicated targets per arm per repository, starting with a smaller balanced subset. Shuffle metric labels and order where feasible. Record Byron's next action, its source evidence, time, and whether another signal already supplied it. Human review is a required execution observation; automated review may prepare cases but cannot claim Byron's judgment.

Give each metric and candidate a retain, optional, investigate, defer or reject outcome. Require a candidate default to add a justified decision in at least two repositories, with an explicit false-positive and cost account. This is a provisional product gate, not statistical significance. Evaluate cognitive complexity on saved or externally supplied values before implementing a new analyzer.

### Desired end state

- A manifest, comparison tables and adjudicated cases explain every disposition.
- The compact default can be rejected if it loses useful decisions.
- No empirical claim exceeds the pilot's actual support and language coverage.

## Milestone 3: Apply the proven catalog choice

Update `metricsStore.tsx`, `MetricPicker.tsx`, report definitions/profiles, and documentation only for choices supported by the pilot. Retain neutral diagnostics where useful. Apply a coherent API change directly if removal is justified; do not add old/new schema coexistence.

Browser checks prove that retained measurements are discoverable and that the default queue leads to source. Run client tests/build and relevant reporting tests. Keep the pilot artifact as the decision record.

### Desired end state

- UI and headless defaults match the recorded portfolio decision.
- Reverting the catalog commit restores the prior choice without a data migration.

## Below the cut line

- Twelve-repository expansion until the pilot earns it.
- Default Maintainability Index, Halstead effort/bug forecasts, centrality-as-quality and people scoring.
- Automated feature selection, universal defect thresholds and hosting infrastructure.
