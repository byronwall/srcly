# Metric audit baseline

Baseline: `83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4`.

These notes record source observations. They do not establish measured correlation or confirm proposed improvements.

## Metric surfaces

- API contract: `server/app/models.py`, class `Metrics`.
- Analyzer results: `server/app/services/analysis_types.py`, classes `FunctionMetrics` and `FileMetrics`.
- Node propagation and folder aggregation: `server/app/services/analysis.py`.
- Report definitions: 27 entries in `server/app/services/reporting.py`, `METRIC_DEFINITIONS`.
- Report profiles: `PROFILE_WEIGHTS`; report ranking: `rank_nodes`.
- UI selection: 22 entries in `client/src/utils/metricsStore.tsx`, `HOTSPOT_METRICS`.
- UI ranking: `client/src/components/Explorer.tsx`, hotspot calculation.

The report has five definitions absent from the selector: `function_count`, `file_count`, `comment_lines`, `average_function_length`, and `classes_count`. API metadata also includes modification time, ignored-file counts, and analysis status/error counts. The audit must account for these without treating them all as quality scores.

## Questions from source inspection

1. The current model defines `complexity` as maximum CCN for files and folders. The README still describes file complexity as an average. Verify all displayed labels and documentation against current code.
2. The UI adds selected metric values after max normalization. Reports combine normalized values with profile weights. Determine whether these paths repeat evidence or rank mixed node scopes unfairly.
3. The API initializes numeric fields to zero. Verify whether unsupported language metrics and failed analysis can appear as healthy measurements.
4. The selector treats low comment density as risky. Reports assign positive risk weight to several structural counts. Assess whether these directions have useful evidence.
5. TSX includes React-specific `useEffect` counts. The application itself uses SolidJS. Assess framework support rather than inferring general frontend quality.
6. The latest baseline fix excludes synthetic import scopes from function counts. Validate nested scopes, fragments, denominators, and metric rollups before comparing values.
7. The dependency-view initiative already exists under `docs/intent/dependency-view/`. New coupling or graph recommendations must account for that work.

## Research and planning boundary

The Pro response will supply research proposals. Codex must check decisive claims and reconcile each substantive recommendation. No initiative should present an unmeasured correlation as a finding. No application implementation is authorized by this research run.

After collection, create one or more Software Design Sleuth initiatives. Each plan must include a first proof that can reject the proposal. Keep a compact default portfolio distinct from optional diagnostic metrics. Treat reduced redundancy as a means to better decisions, not an end in itself.
