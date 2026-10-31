# On-demand evidence collection

## Working prompt

Reproduce the cold forward trace of `DocView` in `visual-notes` without a saved result.
Find work that the trace does not need. Collect evidence only when the trace needs it.
Defer declaration classification and type formatting. Preserve the complete result, including IDs, type text, proofs, and stops.
Target a cold trace below five seconds. Keep the current timeout and graph limits.
Compare fresh processes, verify the app, and attach measurements and screenshots to the PR.

## Design

The engine keeps the full TypeScript Program. An AST index lists candidate references by name and import alias.
The checker resolves those candidates only when a frontier needs them.
Body collection uses top-level source statements as partitions. Each partition runs once.
Declarations and return summaries load when needed. The collector delays handler classification and type formatting.

Dependency discovery includes callers, callback bindings, component props, contexts, event listeners, and HTTP counterparts.
HTTP candidates include renamed handler calls behind route guards.
The existing proof rules still decide whether each candidate produces a relation.
Return expansion uses the active invocation to avoid loading unrelated callers.

The old end-of-flow classifier resolved every project identifier before checking one unused binding.
It now uses the shared candidate index. Symbol identity still distinguishes shadowed names.

The provider refreshes cached frontiers when the relation index grows.
Failed collection invalidates the provider. The session rebuilds it before another query.
Route totality also drops its captured provider after a failure.

## Compatibility constraint

TypeScript's type creation order affects printed property order and merged property symbols.
Removing all early type queries changed 125 type strings and one ID in the DocView result.
Equal node and edge counts did not reveal this difference.

The collector therefore prepares parameter types in source order before collecting bodies.
It leaves handler classification, fact creation, and type formatting deferred.
This restored the exact DocView result in fresh processes.
The preparation remains a cost across the whole project.

Scores use 10 for exact output, or for a cold trace below five seconds.
The latency scores compare measured experiments; they are not forecasts.

| Approach | Exact DocView output | Cold trace target | Decision |
| --- | ---: | ---: | --- |
| Existing full collection | 10: exact baseline | 1: exceeds the target | Replace body collection |
| Demand collection without type preparation | 0: IDs and type strings change | 7: 7.1 seconds | Reject output changes |
| Demand collection with type preparation | 10: deep equality passes | 6: about eight seconds | Preserve output |

The five-second target is not yet met. A profile attributes about 3.3 seconds to type preparation.
Program construction takes about 2.8 seconds in that run.
Removing type preparation requires a deliberate change to type formatting and merged-symbol identity.
That would change existing output, so it is outside this change's compatibility constraint.

## Verification

The baseline is commit `e07cc51`, the full-collection fix from PR #309.
Benchmarks use its actual source, exported under `tmp/`, with the same installed dependencies.
Each process traces `app/src/routes/docs/[id].tsx:DocView:49` forward three times.
Processes run one at a time, with a 4 GB Node heap limit and no saved result cache.
The first call includes Program construction. Two further calls measure session reuse.

Run from the repository root:

```sh
mkdir -p tmp/docview-proof
node --expose-gc --max-old-space-size=4096 \
  --import ./engine/node_modules/tsx/dist/loader.mjs \
  engine/scripts/memory-probe.ts \
  --root /Users/byronwall/Projects/visual-notes \
  --anchor 'app/src/routes/docs/[id].tsx:DocView:49' \
  --direction forward --calls 3 --every 1 --json tmp/docview-proof
```

The final saved graph has 2,333 nodes and 2,540 edges. Its outcome remains `partial`.
A separate cold-only probe also saves the first graph for deep equality checks.
The demand collector visits 61 statement partitions in 32 files for this trace.
It retains 10,754 compact facts and hydrates 2,441 elements.

Regression checks cover exact eager/demand graph equality, callback and HTTP joins, cancellation recovery,
new relations after earlier queries, unused-symbol classification, and cumulative collection measurements.
The existing annotated fixtures remain the behavior gate.
