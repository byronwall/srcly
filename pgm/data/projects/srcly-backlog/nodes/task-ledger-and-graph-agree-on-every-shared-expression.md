---
id: task-ledger-and-graph-agree-on-every-shared-expression
label: Ledger and graph agree on every shared expression
type: task
status: planned
parent: area-data-flow-engine-structure
---
The value-flow ledger and the anchor graph build different slices for one expression (the ledger's `value-flow` adapter versus `walkFollows`), so their gaps differ. On 137 forward text anchors in `engine/examples/value-flow-basics`, 9 still name different outcomes after SH-03 shared the `assumed` rule (`assumedCallee`):

- graph `ok`, ledger `partial` (a `disconnected` dead end at a standard-library call the graph walks through): `classified-calls.tsx:8` stringified, `classified-calls.tsx:10` validated, `library-callbacks.tsx:8` reduce, `library-names.tsx:18` lib-filter, `tested-bindings.tsx:16` visible.
- graph `ok`, ledger `partial` (`external-code` at `Promise.resolve`): `promise-channels.ts:72` promise-resolved.
- graph `assumed`, ledger `ok`: `callback-not-service.tsx:6` draft-save.
- graph `partial`, ledger `ok` or `assumed`: `state-functions.tsx:35` held, `object-calls.tsx:60` union.

Files: `engine/src/srcly/ops/value-flow.ts` (`forward`, `deadEnds`, `composeCall`), `engine/src/srcly/ops/anchor-graph.ts` (`gaps`, `walkEnds`).

Done when the ledger and the graph give the same outcome for every forward text anchor in value-flow-basics, checked by a test that walks them all.

