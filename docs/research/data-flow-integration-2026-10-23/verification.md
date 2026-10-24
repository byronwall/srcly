# Research verification

The Pro response finished after about 33 minutes. Collection occurred on October 23, 2026, at about 10:36 p.m. Eastern.

The [same conversation](https://chatgpt.com/c/6adc0a99-0844-83e9-b309-74996708456a) contains the original report, plan, recommendations, and ZIP. All three reports were read. No follow-up was needed.

## Source boundary

Srcly baseline: `aea1015258f56dd45b8e175f7288e2fef3abc6cf`. tsx-data-flow baseline: `b4f1ba4f0df402251f4b666cddf5312efa4a62be`, plus the supplied local edits. The source packet included 239 Srcly and 380 tsx-data-flow files.

The archive is curated source, not a runnable checkout. It omitted some compiler configurations, dependencies, fixtures, and the design-preferences document. Local complete checkouts supply these before implementation. Srcly's concrete client configuration is `client/tsconfig.app.json`.

The collected archive contained only three Markdown files. Archive entries had no absolute or parent-traversal paths. Originals and the archive stay in ignored `tmp/pro/data-flow-integration-2026-10-23/`.

The browser download waiter timed out, but Chrome saved `srcly-design-research (1).zip` in Downloads. That file was inspected and extracted successfully. No duplicate request or research submission was made.

## Decisive claim checks

Eighteen decision-bearing files matched the submitted source packet byte for byte at collection. Code inspection confirmed the following facts. Paths under tsx-data-flow refer to that sibling repository's local snapshot, including its edits.

| Claim | Checked source | Result |
| --- | --- | --- |
| Name title and text are separate occurrences; rank and metric defaults are real examples | Srcly [HotSpotItem.tsx](../../../client/src/components/HotSpotItem.tsx), lines 130–145 | Confirmed. The two name reads are at lines 134 and 135. Metric display is at line 145. |
| Two different collections call the same row helper | Srcly [HotSpotList.tsx](../../../client/src/components/HotSpotList.tsx), lines 61–109 | Confirmed ranked and N/A calls at lines 88 and 109. |
| Formatting rereads catalog information and is separate from finite-value filtering | Srcly [metricsStore.tsx](../../../client/src/utils/metricsStore.tsx), `metricDef`, `formatMetricValue`, `formatMetricWithUnit`; `HotSpotItem.value` | Confirmed. A caller cannot inherit a guard merely by calling the formatter. |
| Current history omits complete return state | Srcly [location.ts](../../../client/src/navigation/location.ts), `Location`; [history.ts](../../../client/src/navigation/history.ts), `HistoryRing` | Confirmed. Recent places do not store camera, filters, scroll, or keyboard focus. |
| Srcly does not distribute the analyzer runtime | Srcly [pyproject.toml](../../../server/pyproject.toml) | Confirmed Python dependencies; no bundled Node/TypeScript companion. |
| Earlier file-local documentation is stale | tsx-data-flow `src/analysis/report-builder.ts`, `source-trace.ts` | Confirmed shared cross-file state and imported-call descent. Coverage still depends on supported forms and budgets. |
| Fallback classification does not prove general validity | tsx-data-flow `src/analysis/source-trace.ts`, `source-defenses.ts` | Confirmed both fallback operators are recorded; the reviewed nullish defense record applies to `??`. |
| Exact selected-file proof has a narrow source rule | tsx-data-flow `src/analysis/route-totality-field-proof-index.ts`, `selectedFilesystemInput`, `isSelectedFileInputFact` | Confirmed proven `readFile` from `node:fs/promises` and exact location matching. |
| Application-specific carrier rules exist | tsx-data-flow `src/analysis/program-evidence-carrier.ts`, `collectMigrationCarriers` | Confirmed named function and source-path checks. Do not present these as generic Srcly support. |
| Generic call edges share parameter/return facts | tsx-data-flow `src/analysis/program-evidence-collector-jsx-support.ts`, `connectCalls`; `evidence-slice.ts`, `QueueItem` | Confirmed structure. Cross-invocation contamination remains an inference requiring a negative fixture, not a reproduced bug. |
| The real cross-file example exceeds exact transfer recognition | tsx-data-flow `program-evidence-collector-field-transfers.ts`, `connectSolidFor`; `program-evidence-collector-component-binding.ts`, `componentPropValueMode` | Confirmed property-access/one-parameter restrictions and call-based prop value modes. |
| Existing cache requires the full report and reads source separately | tsx-data-flow `src/server/cache.ts`, `ensureBuilt`, `sourceFor` | Confirmed. Focused query setup and Program-text excerpts require changes. |
| Port-zero readiness needs a change | tsx-data-flow `src/server-cli.ts`, listen callback | Confirmed it prints the requested port rather than the bound address. |
| The current graph projects surfaces rather than an ordered operation path | tsx-data-flow `src/frontend/src/overview/route-totality-display-layout.ts`, `layoutRouteTotalityDisplay` | Confirmed empty returned evidence-node/edge arrays. Usability implications remain inferences. |

The eighteen byte comparisons covered the hotspot pair, location/history, metricsStore, Python manifest, core, report builder, trace/defenses, proof index, JSX collector, slice traversal, exact For/component collectors, server cache/CLI, and display layout. The other checked modules were read directly.

## External spot checks

- [CodeQL path queries](https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/) require sources, sinks, and linking steps. This supports explicit path explanations.
- [JetBrains data-flow inspection](https://www.jetbrains.com/help/idea/analyzing-data-flow.html) supports identifier-centered direction, source navigation, and refresh. Its documented language capability is not evidence of equivalent TypeScript support here.
- [uv tools](https://docs.astral.sh/uv/guides/tools/) use isolated environments. Srcly installation alone cannot establish Node runtime availability.

These pages were opened during integration. The full Pro report also cites TypeScript, ECMAScript, W3C keyboard guidance, and original slicing/overview research. The integrated design does not depend on product feature parity.

## Integration judgments and limits

Adopt the ledger-first workflow and lazy child as a design direction. Keep the graph optional. Limit initial semantics to a real local occurrence before extending invocation-sensitive transfer.

Conservative generation refresh is sufficient initially. The plan does not require incremental invalidation, a plugin registry, a public companion release, or separate services.

No application, analyzer, tests, builds, benchmark, or browser acceptance journey ran. No tsx-data-flow file changed. Source claims are verified; usability, latency, and general semantic soundness remain unmeasured. Future checks must follow each repository's rules.
