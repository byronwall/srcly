# Value investigation implementation plan

Status: proposed; not approved for implementation. Scope: Srcly and tsx-data-flow only.

Build two user-visible milestones. M1 proves a useful local journey. M2 adds the harder cross-file semantics. Further infrastructure-only milestones would postpone the user proof.

See the [research decision](../../research/data-flow-integration-2026-10-23/README.md), [dispositions](../../research/data-flow-integration-2026-10-23/recommendations.md), and [verified evidence](../../research/data-flow-integration-2026-10-23/verification.md).

## M1: exact local occurrence and reliable return

### Outcome and scope

From a treemap, dependency node, hotspot, finding, or source selection, open one pinned preview. Choose an expression. Select **Inspect value flow**. Read a local path and its limits. Return to the same overview state.

Start with static identifier/property occurrences, intrinsic JSX slots, and a supported enclosing nullish expression. Reject ambiguous selections or offer explicit AST choices. Dynamic keys and unproved upstream callers remain named boundaries.

### Files and responsibilities

| Repository | Extend | Proposed additions |
| --- | --- | --- |
| Srcly server | `server/app/run.py`, `main.py`, `routers/files.py` | `services/value_analysis.py` owns the child; `routers/value_flow.py` proxies bounded operations. |
| Srcly navigation | `client/src/App.tsx`, `navigation/{location,store,history,nodeActions}.ts` | `navigation/investigation.ts` holds semantic selection and return snapshots. |
| Srcly UI | `components/Treemap.tsx`, `viz/deps/DependencyView.tsx`, hotspot components, `components/CodeModal/`, `services/fileContent.ts` | `investigation/{PinnedPreview,InvestigationWorkspace,EvidenceLedger,EvidenceInspector}.tsx`; pure model and request state. |
| tsx-data-flow analysis | `src/core.ts`, owning Program routing, provider/slice primitives, direct JSX collectors | `src/analysis/expression-selection.ts` resolves the AST occurrence; `value-investigation.ts` verifies supported value transfers. |
| tsx-data-flow transport | `src/server-cli.ts`, `src/cli/server-flags.ts`, `src/server/{cache,routes,analysis-service,analysis-worker}.ts` | One expression contract and projection under `src/api/`. |

New names describe responsibilities, not a mandatory file count. Use existing code when it remains clear. Do not extract a shared frontend or add a new evidence engine.

### First implementation sequence

1. Use Srcly's concrete target: root at the checkout, source at `client/src`, configuration at `client/tsconfig.app.json`.
2. Extend `createAnalyzer` to expose the selected file's owning Program/checker. Reuse its compiler and identity index.
3. Resolve raw-source spans to exact AST occurrences. Verify supported transfer rules before declaring value flow.
4. Separate compiler/session initialization from mandatory full-report generation in the existing analysis cache.
5. Add the query contract and worker operation. Preserve existing route contracts and validators.
6. Add the configured child owner and same-origin proxy. Start only on explicit inspection.
7. Add preview, ordered ledger, evidence inspector, and return restoration as one usable journey.

### Runtime and source identity

Propose `srcly --value-analyzer /absolute/path/to/tsx-data-flow`. Require a prepared checkout and its installed Node dependencies. Do not install or build on demand.

FastAPI owns one child and one active target/configuration. Reuse tsx-data-flow's server and worker. Bind loopback on an ephemeral port. Emit the actual bound port in a readiness record; the current CLI prints the requested port. Keep logs separate from readiness data.

Keep browser requests on Srcly's origin. Cancel obsolete work, discard late replies, and close the owned child on shutdown or target replacement. Show a missing runtime or process failure with an explicit retry. Do not create a daemon or an automatic restart loop.

Bind each result to the actual Program text, compiler, configuration, analysis options, and generation. Include contributing source/configuration identities. Revalidate inputs before presenting cached evidence as current. Rebuild the whole generation initially; incremental invalidation is optional later work.

Serve evidence excerpts from that Program's text. A selected-file hash alone misses changed imported helpers. Revision and mtime alone do not identify dirty inputs. If freshness cannot be established, show an earlier snapshot and require refresh.

### Minimum semantic boundary

The following fields describe a proposed contract, not an existing endpoint. Reuse current evidence types instead of duplicating their structures.

| Request | Result |
| --- | --- |
| Server-owned repository ID, expected generation/content token | Matched repository, generation, compiler/configuration and source identity |
| Relative file, raw-source span, exact selected text | Resolved occurrence, symbol, full field segments where known |
| Forward/backward direction, optional field/terminal | Complete bounded `EvidenceSlice` plus verified ordered paths |
| Depth/element/relation/terminal/visit limits | Exact consumers, proof scope, frontiers, used budgets and omissions |
| Origin entry ID | Source excerpts, value-property assessments, stale/cancelled/unsupported outcomes |

Use one-based lines and UTF-16 columns, with an exclusive end. Keep verbose return state in browser history/session state.

The first concrete selection is:

```json
{
  "file": "client/src/components/HotSpotItem.tsx",
  "span": {"startLine": 135, "startColumn": 14, "endLine": 135, "endColumn": 29},
  "text": "props.node.name",
  "direction": "forward"
}
```

An accepted path must connect ordered adjacent element/relation IDs to the exact terminal. Structural containment or references alone cannot prove transfer. Do not invent route occurrence IDs for a generic expression.

Keep connectivity, coverage, and runtime validity separate. A local proof does not establish its caller's origin. A null check does not prove finiteness. A fallback is not automatically a defect.

### Semantic acceptance

- Prove the selected `props.node.name` occurrence at `HotSpotItem.tsx:135` reaches its JSX text slot.
- Keep the title attribute occurrence at line 134 distinct. Also reject a same-name field on another binding.
- Show `props.rank ?? "–"` at line 130 as a valid default. Preserve zero.
- Show the line-145 metric expression as partial when helper, accessor, dynamic-key, or catalog evidence is absent.
- Preserve an empty `valueText` override. Do not treat `value()!` as a runtime check.
- Keep unknown, unsupported, stale, cancelled, no-proven-terminal, and exhausted-budget states distinct.
- Exercise a changed imported helper while selected source text stays unchanged. Reject old current-proof styling.

Specify a small direct-property fixture, a same-name negative, and a null-versus-finite negative. Run or change tsx-data-flow tests only after its required explicit test-work approval. No builds form part of its agent verification.

### Interaction acceptance

Use 1440×900, 1024×768, and 390×844. Start from nondefault filters, metric, expansion, selection, scroll, and camera.

Exercise each entry, inspect evidence, then Back, Forward, and Return. Restore the same originating control and overview state. A copied URL restores semantic focus with defaults; it does not invent another tab's camera state.

Keep the source, Return, and status visible at narrow width. Support keyboard row navigation, disclosure, source opening, and Escape focus restoration. Separate focus from selection. Do not require graph gestures.

### Docs, example, and gate

Srcly: update `README.md` and `docs/CODE_MAP.md`; add `docs/value-investigation.md`. tsx-data-flow: update `docs/application-structure.md`; add `docs/expression-investigation.md`. Document runtime setup, syntax limits, freshness, and return behavior.

Both docs must include a runnable walkthrough of the actual HotSpotItem selection, title negative, rank default, and partial metric result. Use the prepared checkout and real target configuration. Proposed flags and endpoints must be labeled until implemented.

Main risk: generic evidence may not support exact local field transfer outside route proof. Stop if only toy fixtures work, terminal identity is ambiguous, or the explanation requires hiding uncertainty. M1 must pass through the normal user control.

## M2: cross-file depth with invocation identity

### Outcome and modules

Trace `HotSpotList.tsx:88` selected `item.node`, field `name`, through that `row` invocation and `node={node}` at line 64, to `HotSpotItem.tsx:135`.

Extend tsx-data-flow's `program-value-summary*`, `program-callback-return.ts`, relevant call/JSX/component/field collectors, and `evidence-slice.ts` only as this path requires. Add bounded argument/parameter/return pairing by exact invocation. Preserve valid specialized route rules.

Extend Srcly's investigation model, ledger, and inspector. Keep helper frames and branch expansion in the same workspace. No new runtime boundary is required.

### Precision and explanation gate

The same `row` helper receives N/A inputs at line 109. They must not join the selected ranked invocation. Add a two-call identity-helper negative and a helper that returns another argument. Shared source spans must retain distinct call context.

Current exact `For` handling requires a property-access `each`, one plain callback parameter, and direct field use. The real path has `shown()`, two parameters, and a helper. Plain `node={node}` also falls outside current component value-mode recognition. These are new supported forms, not presumed existing proof.

Keep upstream ranking/accessor work as a frontier until separately proved. Keep the metric/formatter chain partial around dynamic lookup, mutable catalog, repeated accessors, or external formatting. Do not transfer guard facts between separate calls without justified stability.

Compress verified linear alias/helper steps only. Keep fallbacks, branches, joins, uncertainty, exact fields, and terminals explicit. Preserve ordered expansion and counts. Use destination lists for fan-out and back-references for cycles. Explore a small graph only if it improves a real explanation.

Update both documentation pages and runnable examples with the line-88 positive and line-109 negative. Repeat responsive, keyboard, and history acceptance with a long chain and multiple terminals.

Main risk: false attachments across shared helper facts. This justifies the separate milestone. Do not expand grammar until the real path and precision controls pass.

## Measurements and completion evidence

Record analyzer/frontend source identity, target configuration, generation, Node/TypeScript versions, machine, port, and asset mode. Measure readiness, compiler work, input validation, query, projection, first useful row, cancellation, memory, payload, and return separately.

Initial targets are proposals: preview/return p95 within 150 ms, warm first useful result within 750 ms, progress within 250 ms, and cold first result within 10 seconds. Calibrate with three cold sessions and 20 warm queries. Profile missed targets; do not remove evidence to meet them.

For changes to existing named route-field proof, use its maintained acceptance runner after the required approval. That runner does not currently accept generic expressions or operate browser controls. Extend it deliberately only if reused for the new mode. Static checks alone cannot close semantic or interaction acceptance.

This research run executed no product tests, builds, analyzers, or browser acceptance. No implementation gate is reported as passed.
