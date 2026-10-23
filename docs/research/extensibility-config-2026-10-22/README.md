# Custom results and repository settings

Build native file-result imports and repository settings first. Add explicit local check execution through the same contract later. Keep private analyzer code outside Srcly's process.

[Shape](../../intent/custom-metrics-and-repo-config/shape-brief.md) · [Implementation plan](../../intent/custom-metrics-and-repo-config/implementation-plan.md) · [Intent](../../intent/custom-metrics-and-repo-config/intent-brief.md) · [Pro conversation](https://chatgpt.com/c/6adac10a-5408-83ea-bc48-f4f0baa04b24) · [Prompt](pro-prompt.md)

Research completed October 23, 2026. Inspected baseline: `aea1015258f56dd45b8e175f7288e2fef3abc6cf`. Pro read the 43-file source packet. Codex read all three returned reports and checked the decisive claims against the full checkout. Original downloads remain ignored under `tmp/pro/extensibility-config/`; the conversation is the source record.

## Recommended direction

Use one native JSON envelope with separate typed measurements and diagnostics. Metric definitions supply meaning, units, applicability, direction, and rollup. Repository settings supply interpretation. A custom observation map beside built-in `Metrics` avoids a model edit for each coworker metric.

Start with file-only sum/max/no rollup. Preserve zero, unknown reasons, source association, and partial completeness. A diagnostic run identifies checked files; an empty issue list alone cannot assert clean zero. Keep scalar range evidence separate from diagnostic counts.

Use `srcly.toml`, then equivalent `[tool.srcly]`. Discover one policy at the worktree root. Preserve narrow scan scope. Allow explicit config selection without nested merging. Config paths are config-relative; operation paths are invocation-relative. Expose effective values and their origins.

Keep color stops, raw risk thresholds, quadrant cutoffs, profile scoring, and CI decisions separate. First release includes the first three. Defer new profiles and gates until the core import/settings workflow works. This reduces Pro's proposed first-release scope without discarding its design.

Imports meet the first need without a plugin ABI. A saved-format adapter and explicit argv producer can later feed the same consumer. No normal scan starts a new custom command because config mentions it.

## Verified repository findings

| Finding | Checked source | Plan effect |
| --- | --- | --- |
| Metric storage and CLI IDs are fixed | `models.py:Metrics`, `run.py:_run_headless`, `metric_catalog.py` | Add custom observations and resolve IDs after imports. |
| Catalog state is global; lookup map is nonreactive | `metricsStore.tsx:setMetricCatalog/metricDef` | Install reactive definitions with each scan context. |
| Direct getters and import-time profiles constrain reports | `reporting.py:rank_by_metric/PROFILE_WEIGHTS` | Pass effective context through headless consumers. |
| Color/ranking shortcuts assume current metrics | `colors.ts:domainOf/treemapRampPosition`, `hotSpotRanking.ts:rankHotSpots` | Handle custom scales, signed values, and lower-worse zero explicitly. |
| Normal and cached paths already start checks | `scan_jobs.py:from_cache/run/start_findings`, `reporting.py:scan_tree` | Add a real checks-off mode; portable is not off. |
| Findings job identity omits policy; file endpoint selects finished jobs | `findings/jobs.py:start/for_file`, `routers/files.py:_findings_job_result` | Bind evidence and lifecycle to the selected scan. |
| Cancellation does not reach findings processes | `ScanJob.cancel`, `findings/tools.py:run_process` | Prove process cancellation before offering custom execution. |
| Source cache has stat identity; results directories are pruned | `cache.py:fingerprint`, `analysis.py:analyze_single_file/_is_pruned_dir_name` | Verify source bytes separately; refresh artifacts independently. |
| Compare uses internal side caches and static metric tables | `compare/snapshots.py:SideCache`, `compare/diff.py:COMPARE_METRICS` | Portable custom snapshots need new context, not a renamed cache export. |

These are source observations, not passing runtime tests. Ruff's command omits explicit no-fix overrides. Config-driven mutation is a supported concern, but was not reproduced here. Add a temporary fixture before claiming the bug or its fix.

## Primary-source checks

SARIF defines diagnostic results, locations, and execution status. It does not establish Srcly's chosen units or folder aggregation. Use it as a diagnostics adapter. Its execution-success field is distinct from process exit code. [OASIS SARIF](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html)

PyPA reserves `[tool.NAME]` for tool configuration. This supports the embedded TOML form. Srcly should define its own discovery and precedence rules. [PyPA specification](https://packaging.python.org/en/latest/specifications/pyproject-toml/#arbitrary-tool-configuration-the-tool-table)

Ruff documents config-driven `fix` and `fix-only`, plus explicit CLI overrides. This supports the planned diagnostic-only test. Its per-file config discovery is more complex than Srcly needs initially. [Ruff settings](https://docs.astral.sh/ruff/settings/#fix), [Ruff configuration](https://docs.astral.sh/ruff/configuration/)

Other comparisons in Pro include Sonar external issues, coverage.py, LCOV, ESLint, and CodeCharta. They inform alternatives. They are not dependencies in the first release. Their complete discussion and citations remain in the Pro report.

## Recommendation dispositions

IDs match Pro's recommendations. Build means plan inclusion, not approval to implement. Each row gives the final Codex disposition.

| ID | Disposition | Decision and reason |
| --- | --- | --- |
| SR-001 | Build | Native measurements and diagnostics share a small envelope. |
| SR-002 | Build | Typed custom map preserves built-in metric invariants. |
| SR-003 | Build | Applicability and completeness prevent false zeros. |
| SR-004 | Build | Exact source association protects ranking and line evidence. |
| SR-005 | Build | Per-scan catalog prevents cross-repo definition leaks. |
| SR-006 | Build | File sum/max/none avoids unsupported averages. |
| SR-007 | Build | Shared accessors connect arbitrary IDs across UI and CLI. |
| SR-008 | Build | Dedicated TOML first; embedded form uses the same schema. |
| SR-009 | Build | One worktree-root policy avoids hidden inheritance. |
| SR-010 | Build | Expected IDs distinguish missing imports from typos. |
| SR-011 | Build/Defer | Build color/risk/quadrant separation; defer new profiles and gates. |
| SR-012 | Build | Scoped preferences and value origins explain effective behavior. |
| SR-013 | Build | Raw observations and diagnostics need separate lossless exports. |
| SR-014 | Build | Artifact and interpretation edits need independent refresh. |
| SR-015 | Build | One saved format follows native import; default SARIF. |
| SR-016 | Build | Explicit local commands feed the proven contract later. |
| SR-017 | Build | Fix lifecycle gaps before exposing custom execution. |
| SR-018 | Defer | Explicit CI gates add a separate decision engine beyond the first release. |
| SR-019 | Explore | Prove portable comparison after real import use; milestone 6 is conditional. |
| SR-020 | Build | Reconcile diagnostics ownership with the older initiative. |
| SR-021 | Explore | Coverage needs counts and opportunities, not scalar averages. |
| SR-022 | Explore | A real repo-dependent producer must define its input set. |
| SR-023 | Defer | Add path mapping only when a real artifact needs it. |
| SR-024 | Explore | Graphs can reuse provenance while retaining relationships. |
| SR-025 | Defer | External scope identity needs a separate attribution proof. |
| SR-026 | Defer | Means/ratios/distributions need sufficient statistics. |
| SR-027 | Defer | Method coverage and CRAP depend on reliable attribution. |
| SR-028 | Defer | Nested inheritance and arbitrary quadrants are unnecessary initially. |
| SR-029 | Defer | Keep custom execution explicit and uncached first. |
| SR-030 | Defer | Exact paths and line ranges avoid hidden matching guesses. |
| SR-031 | Avoid | Plugin ABI, marketplace, and services exceed the local need. |
| SR-032 | Avoid | Diagnostic property bags do not define measurement semantics. |
| SR-033 | Avoid | Missing/stale results cannot become clean zeros. |
| SR-034 | Avoid | Interpretation must not rewrite producer meaning. |
| SR-035 | Avoid | Last-wins and automatic count summing hide conflicts. |
| SR-036 | Avoid | Executable config and automatic installs add hidden actions. |
| SR-037 | Avoid | An argv wrapper is not a sandbox. |
| SR-038 | Avoid | Global custom state mixes repositories. |
| SR-039 | Avoid | No compatibility framework or analyzer rewrite is needed. |

## Relationship to existing work

The older [imported-quality-evidence plan](../../intent/imported-quality-evidence/implementation-plan.md) keeps graph witnesses, clone relationships, and coverage attribution. Its typed-diagnostics stage should consume this initiative's shared result path. It must not build a second importer. Graph-first ordering does not block custom scalar results.

The new initiative remains planned. No application behavior changed. No open PR overlapped its modules during the October 23 check. Recheck before implementation.

## Remaining inputs

A real producer sample determines file-local versus repository-dependent freshness. A real saved diagnostic artifact selects SARIF or ESLint first. Process tests determine supported execution platforms. None blocks the deterministic first proof.
