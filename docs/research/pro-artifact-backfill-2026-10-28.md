# Pro artifact backfill audit

The exclusion rule was introduced on October 22, 2026, at 18:46 EDT.
This repair preserves original Pro result files under intent entries, including the earlier runs Byron explicitly named.
Open research PRs receive their own artifacts. Merged or closed research PRs are restored in this follow-up.
ZIP containers and repackaged input source packets stay local. Downloaded programs were not executed.

| Original run | State at audit | Original files | Asset index |
| --- | --- | ---: | --- |
| [#100](https://github.com/byronwall/srcly/pull/100) | open | 3 | [Original artifacts](https://github.com/byronwall/srcly/blob/codex/extensibility-config-research/docs/intent/custom-metrics-and-repo-config/assets/pro-results/extensibility-config-2026-10-22/ASSET_INDEX.md) |
| [#103](https://github.com/byronwall/srcly/pull/103) | closed | 3 | [Original artifacts](https://github.com/byronwall/srcly/blob/codex/restore-pro-result-assets/docs/intent/tsx-dataflow-integration/assets/pro-results/effects-async-test-seams-2026-10-23/ASSET_INDEX.md) |
| [#102](https://github.com/byronwall/srcly/pull/102) | closed | 3 | [Original artifacts](https://github.com/byronwall/srcly/blob/codex/restore-pro-result-assets/docs/intent/tsx-dataflow-integration/assets/pro-results/value-investigation-2026-10-23/ASSET_INDEX.md) |

PR #101 consolidated the two runs from #102 and #103. Both are restored under the consolidated intent.
PR #256 already preserves all 31 extracted result files; its ZIP container was removed separately.
