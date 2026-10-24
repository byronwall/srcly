# Research verification

This review checked the design against source. It did not implement or measure the proposed analyzer.

## Collection and coverage

Pro completed after 40 minutes, 12 seconds. The October 23, 10:45 p.m. Indianapolis check found the finished response.

The ZIP downloaded successfully to Downloads despite the browser event wait timing out. The local file was checked before any retry. Its three entries used safe relative paths and were regular files. Extraction went to ignored `tmp/pro/effects-async-test-seams/collected/`.

All three reports were read: research report, 1,002 lines; implementation plan, 573 lines; recommendations, 62 lines. No downloaded program was executed. All five priority questions were answered. All 30 recommendation IDs have dispositions. No follow-up message was needed.

## Decisive source checks

| Claim | Evidence inspected | Result |
| --- | --- | --- |
| Srcly edges are usage/import edges | `deps/typescript_deps.py::collect_ts_usages`, `deps/common.py::emit_symbol_edges` | Confirmed identifier/type uses, unused imports, and same-file exclusion |
| TSX has real occurrence evidence | `program-evidence-collector-call-support.ts::processCall` | Confirmed CallExpression records and supported invokes targets |
| Existing host labels are insufficient | `program-evidence-boundary-support.ts::processProgramCallBoundary` | Confirmed name-based fetch branch; cannot certify purity |
| Ranking reads ambient state | `hotSpotRanking.ts::rankHotSpots`, `metricsStore.tsx::metricDef/setMetricCatalog` | Confirmed call to lookup and replaceable module Map |
| startScan awaits once and adopts helper result | `services/scanJobs.ts::startScan/expectJson` | Confirmed one direct fetch await and two helper JSON await sites |
| Cancel differs from stopping observation | `state/scanStore.ts::cancel/dispose/start`, `scanJobs.ts::watchScan` | Confirmed server request, stale guards, and close/timer behavior |
| Paint completion is a separate seam | `scanStore.ts::finish` | Paint promise is obtained before setData and awaited before onComplete |
| Stateful controller can be testable | `viz/deps/interaction.ts::createClickIntent` and its tests | Scheduler injection and behavioral tests are present |
| Worker request is promise-returning without async declaration | TSX `src/server/analysis-service.ts::request` | Confirmed eager executor, pending map, message send, cancellation, close |
| Program loading needs scope policy | TSX `program-evidence-loading.ts`, `project/typescript.ts` | Existing loading paths have different fallback/diagnostic behavior |
| A concurrent-start test is not a race proof | `server/tests/test_scan_jobs.py::test_concurrent_starts_for_same_path_share_a_job` | Calls start sequentially while work remains active |
| Missing packet files block implementation | Local TSX structure doc and CLI entry | Corrected: both exist locally; read them during implementation |

Srcly source checks used `aea1015`. TSX remained at `b4f1ba4` with existing local changes. This task made no TSX edits.

## Primary-source spot checks

- [CodeQL call graph](https://codeql.github.com/docs/codeql-language-guides/codeql-library-for-javascript/#call-graph): possible targets and incomplete/imprecise resolution are explicit.
- [TypeScript compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#a-note-on-soundness): accepted types are not a general soundness guarantee.
- [ECMAScript Promise constructor](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-constructor): executor invocation occurs during construction.
- [typescript-eslint void guidance](https://typescript-eslint.io/rules/no-floating-promises/#ignorevoid): discarding a promise does not handle rejection.

The complete report contains 32 primary-source entries. This review spot-checked claims that decide the design. It did not reproduce papers or benchmark external analyzers. Compiler and framework models must use the installed versions during implementation.

## Integration decisions and limits

The integrated summary retains the conceptual distinctions, source examples, architecture direction, and testing workflow. The plan keeps two delivery boundaries. It defers broader models and infrastructure. The register accounts for every Pro recommendation.

Original reports remain local and in the source conversation. They are not committed as unreviewed duplicate deliverables. The integrated documents are the review product.

No application build or test suite ran. This change contains Markdown only. Validation covers whitespace, local document links, code fences, recommendation coverage, and the staged file list. Proposed fixture outputs remain specifications, not observed analyzer results.
