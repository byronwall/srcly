# DocView trace timeout

## Goal

Make the forward trace of `DocView` finish reliably on `visual-notes`.
Measure cold and warm runs. Remove repeated work without changing trace evidence.
Keep the 30-second query timeout and the current graph limits.

Target: `app/src/routes/docs/[id].tsx@DocView:49`, direction `forward`.
The repository root is `/Users/byronwall/Projects/visual-notes`.

## Findings

The installed server returned a saved graph in 0.13 seconds.
A cache hit did not reproduce the reported failure.
Direct calls to `anchorGraphOp` bypassed the result cache and exposed the cold cost.

CPU-profiled runs used one Node process at a time, with a 4 GB heap limit.
All runs used the same repository inputs and TypeScript 5.9.3.

| Phase | Original | Cached module reads | Also collect relations with facts |
| --- | ---: | ---: | ---: |
| Session build | 3.652 s | 3.344 s | 2.941 s |
| Fact provider | 24.509 s | 12.622 s | 18.859 s |
| First graph after provider | 18.761 s | 9.115 s | 1.087 s |
| First trace, excluding session build | 43.270 s | 21.737 s | 19.946 s |
| Warm graph | 0.289–0.419 s | 0.252–0.284 s | 0.267–0.282 s |

The original first trace exceeded the API timeout by 13 seconds.
The final column includes relation indexing in provider construction.
It removes that work from the first frontier expansion.
The full graph remained byte-for-byte identical in both experiments: 2,333 nodes and 2,540 edges.
Its outcome remains `partial`; faster analysis does not change its proof limits.

A separate run without CPU profiling confirmed the improvement, including session construction:

| Measurement | Original | After collection fixes | Final code |
| --- | ---: | ---: | ---: |
| Cold trace | 45.641 s | 20.694 s | 29.923 s |
| Retained heap after three calls | 1,491 MB | 1,463 MB | 1,434 MB |

The initial experiment improved cold time by 2.2×; the final run improved it by 1.5×.
These are individual cold runs on an Apple M3 Pro with 18 GB RAM and Node 22.21.1.
Each process then repeated the trace twice. Machine load was not controlled.
Warm times were 0.286–0.390 seconds originally and 0.532–0.545 seconds in the final run.
Memory readings followed full garbage collection. RSS varied with macOS memory compression.

The original CPU profile identified these costs:

- `readBackInFile`: 18.2 seconds across both collection passes.
  Each dropped library call could scan its whole file again.
  The scan asked TypeScript to resolve unrelated names.
- Fact collection ran all relation-producing passes, then discarded their relations.
  The first frontier repeated those passes to build compact relation descriptors.
- Handler classification spent 5.5 seconds checking parameter types.
  This remains useful work. Changing its rules would change analysis coverage.
- Graph frame classification also scanned files repeatedly, once for each drawn value.
  A follow-up profile of `pickHubs` attributed 4.6 seconds across three calls to this scan.
  The language host now caches each function's span, name, and role.

## Options considered

The main job scored 2/10 for cold completion and 9/10 for repeat-query latency.
The cold trace failed the query deadline. Warm queries already finished below one second.

The candidate changes were:

1. Cache each module variable's read check. **Selected.** Cache false results too.
2. Reject unrelated identifier names before requesting compiler symbols. **Selected.**
3. Collect facts and compact relation descriptors together. **Selected.**
4. Build a file-wide identifier index. Deferred; caching removes the measured repeated scans.
5. Index callback bindings by target. Deferred; its measured cost was much smaller.
6. Cache component prop receivers. Deferred; its measured cost was below one second.
7. Restrict collection to the anchor's imports. Rejected; incoming callers and shared state could disappear.
8. Build all evidence during startup. Rejected; route discovery and surface-only queries would wait for unnecessary work.
9. Increase the timeout. Rejected; it would leave the repeated work intact.
10. Reduce graph limits or omit type evidence. Rejected; this task requires the same trace evidence.

Scores below describe expected domain outcomes, from 0 (poor) to 10 (best).
Latency scores were estimates from the initial CPU profile, before implementation.

| Approach | Cold trace latency | Same trace evidence | Works after source edits |
| --- | ---: | ---: | ---: |
| Raise timeout | 1: same computation | 10: unchanged | 5: still slow |
| Remove repeated lookups | 7: targets the 18-second scan | 10: same rules | 8: cached per build |
| Also collect facts and relations together | 9: removes the second pass | 9: needs equivalence checks | 9: less rebuild work |

The selected combination preserves cross-file collection and lazy relation materialization.
It does not introduce a persistent cache or change generation handling.

## Implementation

`readBackInFile` caches its result by declaration within the collector.
The name filter avoids compiler lookup for unrelated identifiers.
Compiler symbol identity still separates shadowed names.

Provider construction sends relation descriptors directly into `CompactRelationIndex` during fact collection.
Frontier requests read the existing endpoint and producer-file indexes.
They still materialize only requested relations, with the same ordering and proof data.
The collector releases its relation sink after collection.

The TypeScript host caches function descriptions within its current Program.
Every value in the same function reuses its frame description.
A refreshed session builds a new cache. Python behavior is unchanged.

## Reproduce

Run from `engine/`. Do not run another large-repository probe at the same time.

```sh
pnpm memory-probe \
  --root /Users/byronwall/Projects/visual-notes \
  --anchor 'app/src/routes/docs/[id].tsx:DocView:49' \
  --direction forward --calls 3 --every 1
```

The first call includes session construction. Later calls reuse that session.
The probe reports retained heap after full garbage collection.
Use `--json <existing-directory>` to save graphs for exact comparison.

Add Node's `--cpu-prof` flag when calling the script directly to record a CPU profile.
Use `--max-old-space-size=4096` and `--expose-gc` with that command.
CPU profiles and raw graphs stay under `tmp/trace-performance/`; they are not committed.

## Regression checks

The scaling test increases dropped writes from 16 to 64.
Compiler symbol lookup count must grow by less than six times.
The original code grows from 1,803 to 16,395 lookups and fails this check.
The test also checks that a shadowed name does not become a module read.
It uses operation counts instead of a machine-dependent time limit.

The 208 annotated trace fixtures and 27 anchor-graph tests passed after the change.
The full checks passed: 534 engine tests, 453 client tests, and 499 server tests.
Engine and client type checks, engine lint, and server Ruff also passed.

The first coverage comparison found no changed outcomes or stops across 401 traces.
It flagged `pickHubs` at 6.104 seconds, above its five-second limit.
That result led to the function-description cache and a second regression test.
The test confirms that later values do not repeat the file scan used to classify their function.
Both regression tests fail against their respective original code.

The exact HTTP request returned 200 in 28.037 seconds with disk result caching disabled.
The engine used its default 30-second query timeout.
The API response was deeply identical to the original saved response, including all proof data.

The separate browser check opened the forward graph, inspected `doc()`, and reloaded successfully.
It reported no engine timeout and no console errors or warnings.
The screenshots show the loaded graph and selected-node inspector at 1440 × 900.
The browser check also found existing toolbar clipping and limited node accessibility in the graph snapshot.
Those interface issues are outside this engine change.

The final coverage gate passed with no moves across all 401 traces.
The client survey fell from 69.167 to 46.953 seconds.
Its slowest trace after initialization took 1.861 seconds, below the five-second limit.
The complete corpus took 87 seconds before and 62 seconds after, excluding checkout and install.
The browser regression suite passed 16 tests; one optional latency test was skipped.
