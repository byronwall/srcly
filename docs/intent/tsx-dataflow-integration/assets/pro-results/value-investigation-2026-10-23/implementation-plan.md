# Srcly overview → exact value investigation: implementation plan

## Decision and execution status

Build a dedicated investigation workspace inside Srcly. A pinned source preview launches an exact, bounded tsx-data-flow query; a readable evidence ledger is the primary result. Keep a small repository locator visible and an optional graph for the selected branch. Preserve the overview's import semantics and the user's route back.

Use one lazy Node child owned by Srcly's Python process, running tsx-data-flow's existing local HTTP server, worker, and cache behind a same-origin Python proxy. The first supported installation is an explicitly configured, prepared tsx-data-flow checkout. This is an ambitious workflow with two delivery boundaries: **M1 proves the integrated interaction and local exactness; M2 earns cross-file depth on Srcly's real hotspot chain.**

**Everything below is proposed.** This Design run changed neither repository and ran no application, analyzer, test, lint, typecheck, install, or build. Repository implementation needs a subsequent instruction. Test edits, tests, the maintained acceptance runner, and `pnpm verify` remain deferred until explicit approval of test work. tsx-data-flow's `AGENTS.md` prohibits builds during agent verification; this plan requires none. “Acceptance” below means future criteria, not a reported pass.

Paths are relative to the named repository. Source facts refer to the supplied snapshot, including tsx-data-flow's local edits. New files are explicitly labeled **proposed**.

## Build recommendation mapping

| Milestone | Included Build recommendations |
|---|---|
| M1 | REC-001 dedicated workspace; REC-002 pinned entry preview; REC-003 exact content/compiler identity; REC-004 return snapshot; REC-005 owned Node runtime; REC-006 bounded selection/proof; REC-007 evidence ledger; REC-008 honest statuses and value-property distinctions; REC-011 docs/examples/responsive review |
| M2 | REC-009 context-qualified real cross-file path; REC-010 branch-aware expansion/compression; REC-011 updated docs/examples/responsive review |

REC-013 remains conditional exploration: no branch graph is required to pass either milestone.

## Constraints the worker must preserve

- **One current protocol:** retain `apiVersion`, `analysisVersion`, and `generation`; add the content-match envelope and one expression-query contract. Do not create protocol negotiation, a plugin API, or a background service independent of Srcly.
- **Real compiler context:** `createAnalyzer` currently exposes `ts`, `program`, `args`, identity lookup, and report projection; project routing remains inside its closure. Extend that existing owner to expose the appropriate Program/checker routing to the resolver and evidence provider. Pass the target's source root and governing configuration through normal arguments. Do not use default-config `programForRoot(root)` for these queries. (`tsx-data-flow/src/core.ts:createAnalyzer`, 32–45; `src/project/typescript.ts:buildProgram`, 85–108; `src/analysis/program-evidence-loading.ts:programForRoot`.)
- **Meaning before reachability:** `queryEvidenceSlice` is a bounded relation query, not proof that any arbitrary span is a value origin. It accepts both proven and partial relations. A connected `contains` or identifier-reference path cannot become a proven value path. (`tsx-data-flow/src/analysis/evidence-slice.ts`, 56–170.)
- **Keep identities exact:** reuse `SourceIdentity`, `SourceSpan`, `ProgramElement`, `ProgramRelation`, statuses, field segments, and terminal identities where adequate. An expression query has no invented route occurrence ID. Preserve valid existing route contracts and checks unchanged. (`tsx-data-flow/src/analysis/scope-seam.ts`, 11–115; `src/api/route-totality-field-lineage-contracts.ts`.)
- **Route proof is a separate capability:** current exact selected-file proof requires a proven `node:fs/promises.readFile` input and verified carriers. It is not an arbitrary-expression API. New selection resolution must not silently widen those preconditions or reuse fixture-specific adapters as generic semantics. (`tsx-data-flow/src/analysis/route-totality-field-proof-index.ts:isSelectedFileInputFact`, 348–350.)

## M1 — Exact local occurrence, usable investigation, exact return

### User-visible result

From a treemap file/scope, dependency node, hotspot/finding, or source expression, Byron pins a preview, chooses a concrete expression, selects **Investigate value**, sees an exact local terminal or an honest limitation, and returns to the same overview state. Previewing does not start TypeScript analysis. Explicit investigation starts or reuses the child process.

The preview contains repository-relative path, enclosing scope, line/column range, a short source excerpt, the selected expression, why the overview brought it here, and a clear action. A hotspot metric is context, not an automatically chosen value origin. A finding's line is an initial locator; the user still chooses an expression. Folder/group nodes first choose a file. Ambiguous or unsupported selection displays alternatives or a reason, without guessing a declaration from its label.

All four surfaces call one preview controller. Existing actions remain useful: Srcly currently opens code from the treemap (`client/src/components/Treemap.tsx:handleHierarchyClick`, 154–173), dependency nodes (`client/src/viz/deps/DependencyView.tsx`, 308–323), and hotspot rows (`client/src/components/HotSpotItem.tsx:open`, 59–65). Findings currently jump by line (`client/src/components/CodeModal/FileFindings.tsx`, 70–93). The hover tooltip is pointer-disabled metadata (`client/src/viz/treemap/components/TreemapTooltip.tsx`, 60), so the action belongs in a focusable pinned preview.

### Repository/file changes

| Repository | Existing files to extend | Proposed files and responsibility |
|---|---|---|
| Srcly server | `server/app/run.py`, `main.py`, `routers/files.py` | **Proposed** `server/app/services/value_analysis.py`: configured child ownership, readiness, lifecycle, bounded proxy calls. **Proposed** `server/app/routers/value_flow.py`: same-origin session/query/cancel/refresh endpoints. |
| Srcly navigation | `client/src/App.tsx`, `navigation/{location,store,history,nodeActions}.ts` | **Proposed** `navigation/investigation.ts`: canonical selection and entry-specific return snapshots. |
| Srcly UI | `components/Treemap.tsx`, `viz/deps/DependencyView.tsx`, `components/{HotSpotItem,HotSpotList}.tsx`, `components/CodeModal/{CodeModal,CodePane,FileFindings}.tsx`, `services/fileContent.ts` | **Proposed** `investigation/{PinnedPreview,InvestigationWorkspace,EvidenceLedger,EvidenceInspector}.tsx`; **proposed** `investigation/{model,session}.ts`. Keep request lifecycle, pure shaping, and JSX separate. |
| tsx-data-flow selection/evidence | `src/core.ts`, `src/analysis/{program-evidence,evidence-relation-provider,evidence-slice,scope-seam}.ts`, relevant direct-consumer/JSX collectors | **Proposed** `src/analysis/expression-selection.ts`: bounded AST resolution in the owning Program. **Proposed** `src/analysis/value-investigation.ts`: operation-specific selected-path verification. **Proposed** `src/api/value-investigation-contracts.ts` and `src/api/projections/value-investigation.ts`: narrow request/result envelope and validated projection using existing evidence primitives. |
| tsx-data-flow transport | `src/server-cli.ts`, `src/cli/server-flags.ts`, `src/server/{routes,analysis-service,analysis-worker,cache,source-excerpts}.ts`, `src/api/contracts.ts` | Extend current server/worker operations directly; no second analyzer service or copied frontend. |

These are responsibility boundaries, not a requirement to create every suggested file before the vertical slice works. Existing modules should remain thin; extract when current responsibilities conflict.

### Worker-start and request sequence

1. Add **proposed** `srcly --value-analyzer /absolute/path/to/tsx-data-flow`. Resolve the checkout before `run.py` changes working directory (123–124). Validate the prepared checkout and available Node/tsx/TypeScript dependencies; never install automatically. Srcly's Python distribution does not supply Node (`server/pyproject.toml`, 1–25). If unavailable, retain the preview and show the exact missing prerequisite.
2. On the first explicit query, the Python owner starts one argv-based child in that checkout. Use the existing server entry point, `--host 127.0.0.1`, `--port 0`, and explicit target `--root`, `--source`, and `--tsconfig`. Do not use `--open`. Serialize startup so simultaneous requests share one child. Support one active target/configuration; changing it retires the old child.
3. Add a **proposed machine-readiness mode** to `server-cli.ts`/`server-flags.ts`: emit one JSON readiness record on stdout after binding, with the actual `server.address()` port. Send logs to stderr. Current `server-cli.ts:32–35` prints the requested port, so port zero needs this correction. HTTP readiness is not Program readiness; the existing `createAnalysisService` starts a worker, while `cache.ensureBuilt()` builds the analyzer lazily.
4. Python confirms process/session identity and proxies only the needed endpoints to that owned loopback address. The browser talks to Srcly's origin. No browser-to-random-port URL, iframe, daemon discovery, or arbitrary destination proxy is needed. `httpx` is already a Srcly dependency.
5. Factor **proposed** `ensureAnalyzer`/Program initialization from `ensureFullReport` inside the existing cache: `ensureBuilt()` currently builds the full legacy/route report before any query (`src/server/cache.ts`, 20–39). A local expression must not require that full report. Retain one generation-local analyzer/provider session, record compiler/configuration provenance and content, resolve the AST occurrence, then seed `queryEvidenceSlice`. Reuse current indexes and bounded demand loading; do not create another service/index. Program construction and identity indexing still cost repository-wide work and must be measured.
6. Return the validated envelope and evidence. Reject stale generation, selected text, source digest, configuration, or program-input content rather than decorating a mismatched result with a green status. Serve proof snippets from the same Program source text. Current `cache.sourceFor()` reads disk after Program construction (73–85), so it cannot alone guarantee this match.
7. Cancellation travels from browser → Python proxy → HTTP abort or explicit request cancellation → worker cancellation token. Extend the existing mechanism to the new operation: today only `route-data` attaches request AbortSignal handling and named cancellation (`analysis-service.ts`, 145–159). Bound queued work, discard late replies, and show cancelled separately from unsupported.
8. Srcly shutdown/root replacement cancels pending work, closes the analyzer server, terminates/reaps its owned process group if needed, and clears handles. Put ownership in FastAPI lifespan and its early signal path (`server/app/main.py`, 17–56). `findings/tools.py:123–154` supplies a process-group/timeout pattern, not an existing persistent supervisor. A later explicit retry may start a replacement after a crash.

### Smallest semantic contract and source-match rule

The **proposed** query identifies a server-owned repository session, relative file, exact span, selected text and file-content digest, requested direction, optional exact field/terminal selection, generation, and budgets. The reply retains existing API metadata and adds repository identity, optional revision, program-input content digest, selected-file digest, compiler version, effective configuration digest, and source root. Revision alone never identifies dirty working bytes.

Hash the content actually used by the owning Program, including imported helpers, declaration inputs, resolved configuration/extends/references, resolution-affecting inputs, and analysis options. Keep a manifest of contributing paths and hashes; revalidate it before accepting a query or presenting cached proof as current. Detect changed file membership and resolution inputs as well as edits to already-loaded files. A selected-file hash alone misses a changed formatter. If reliable current-content validation is too costly, retain explicitly historical results and require refresh; do not claim current proof. A first implementation may invalidate the whole generation conservatively rather than maintain a speculative incremental dependency system.

Inside the reply, keep the `EvidenceSlice` elements/relations, provenance, coverage, typed gaps, and truncation. Add a bounded projection containing ordered paths and exact consumers only where operation-specific relations support them. Preserve `proven`, `partial`, and `unsupported` separately from selection failure, stale, cancelled, and budget exhaustion. Show connected non-proven paths as such. Do not replace source field identity with a collection-membership dependency or a display label.

### Concrete M1 proof and fixture specifications

The resolver initially accepts exact identifier/property-read occurrences, their immediately enclosing supported nullish expression, and the owning JSX attribute/text slot. Resolve against raw source offsets using a documented encoding; do not derive offsets from Shiki-rendered HTML. A caret can produce a small selectable AST candidate list. An ambiguous span, computed dynamic key, unsupported owner, or unowned source fails closed. Supported local transfer relations require explicit AST/checker verification, not lexical containment.

**Real positive:** in `Srcly/client/src/components/HotSpotItem.tsx`, select `props.node.name` at line 135. Prove that exact read reaches that span's JSX text terminal. Selecting the same spelling in `title={props.node.name}` at line 134 produces the distinct attribute terminal. The read's upstream props boundary remains visible; M1 does not claim the whole object's network/runtime origin. Selecting `props.rank` at line 130 exposes the nullish alternative `"–"` and the exact rank terminal. Zero survives `??`; a `number` annotation does not prove finiteness.

Specifications to implement only after the relevant future approvals:

```tsx
// Positive local field and distinct terminal slots.
function Item(p: { node: { name: string }; rank: number | null }) {
  return <span title={p.node.name}>{p.node.name}{p.rank ?? "–"}</span>;
}

// Negative precision: identical property names are different sources.
function Pair(p: { left: { name: string }; right: { name: string } }) {
  return <span title={p.right.name}>{p.left.name}</span>;
}

// Negative validity: null exclusion is insufficient for a finite number.
function Numeric(p: { value: number | null }) {
  return <span>{p.value !== null ? p.value : "N/A"}</span>;
}
```

Assert exact source/target spans, owners, field segments, relation IDs, terminal kinds, and ordered relation paths. `Pair.left.name` must not attach to the right-name attribute. `Numeric` must not gain a finite-value proof. The normal control is the actual preview's Investigate action followed by selecting the exact terminal, opening its evidence/source, and returning; a payload generated without usable UI activation does not close the slice. Also cover unsupported dynamic reads, ambiguity, truncated budgets, and no proven terminal.

**Required honest-partial case:** inspect the metric expression at `HotSpotItem.tsx:145`. It combines a `valueText` override, a finite-number-checking accessor (48–51), N/A fallback, and imported `formatMetricWithUnit`. Display known local branches and exact supported relations while naming unproved accessor/helper/dynamic-field frontiers. A valid empty override and zero are not defects; `!` is not runtime validation. Typed `valueText?: string` permits undefined; an out-of-type runtime null also takes the `??` fallback, without proving callers cannot supply it.

### Navigation, readability, and return acceptance

Push a browser history entry when opening investigation or deliberately changing the selected source/terminal. Use replace for incidental disclosure changes. Capture an entry-specific return snapshot before leaving: location, metric/exclusions, active treemap filters/isolation, graph filters/expansions/selection/camera, explorer expanded IDs/sort/mode/scroll, hotspot cohort/limit/N/A disclosure/scroll, source selection, preview state, and focused control. Restore after the corresponding surface is ready. Back and visible Return use the same restoration path; Forward restores investigation selection and disclosures. The existing MRU ring is not this snapshot (`navigation/history.ts`, 9–29), and graph filters currently survive remount only as a module signal (`navigation/store.ts`, 69–73).

Keep canonical source selection in the URL and bulky snapshots in history/session state keyed by entry ID. A copied link opens canonical focus with default overview state. If refreshed content removes the prior element, restore its nearest surviving container and disclose the adjustment.

| Viewport | Future browser acceptance |
|---|---|
| **1440 px** | Repository locator, path ledger, and evidence inspector fit together. Pinned preview does not obscure its origin. All four entry surfaces reach the same investigation. |
| **1024 px** | Inspector becomes an explicit drawer; locator stays compact. Ledger keeps branch conditions, terminal identity, and status without horizontal whole-page scrolling. |
| **390 px** | One main pane with switchable locator/evidence, persistent source/return controls, wrapping paths and bounded code scrolling. Full keyboard and touch operation; focus returns to the launching control. |

At every width, exercise a filtered overview, expanded graph/explorer, selected metric, scrolled hotspot list, pinned expression, Back → Forward → Return, refresh, and copied link. Ledger rows reveal source evidence by keyboard. A branch, fallback, join, frontier, or terminal is never hidden inside a compressed “N steps” row. Optional graph nodes select the same ledger records; overview imports remain visually and semantically unchanged.

### M1 documentation, examples, and completion boundary

Update Srcly `README.md`/`docs/CODE_MAP.md`; add **proposed** `docs/value-investigation.md` with setup, all four entries, return behavior, partial/stale states, and the HotSpotItem walkthrough. Update tsx-data-flow `docs/application-structure.md`; add **proposed** `docs/expression-investigation.md` with accepted syntax, envelope, ownership, proof limits, and the same source occurrence.

Runnable examples documented in both repositories must use the actual installed target configuration. The packet does not contain Srcly's TypeScript config or dependencies, so these are future checkout run instructions, not a claim that this archive is executable as supplied.

```bash
# Current tsx-data-flow entry point; run from a prepared analyzer checkout.
pnpm exec tsx src/server-cli.ts --root <srcly-root> --source <srcly-client-source> --tsconfig <actual-target-tsconfig> --host 127.0.0.1

# PROPOSED Srcly option; available only after M1 implementation.
uvx srcly <srcly-root> --value-analyzer /absolute/path/to/tsx-data-flow
```

The Srcly example selects HotSpotItem's line-135 occurrence through its preview. The tsx-data-flow example documents the new expression endpoint with the same snapshot and selection; it can use API responses without building that tool's frontend. Include an example partial result for line 145.

**Main risk:** the generic evidence machinery may not provide trustworthy field-to-JSX transfer outside the route-specific proof path. M1 succeeds only with the actual Srcly positive, negative precision checks, a usable normal control, correct source matching, and full return behavior. This is a separate delivery boundary because it tests semantic feasibility and visual usefulness before expanding syntax. A toy-only success or a connected structural graph is a stop/rethink outcome.

## M2 — Cross-file selected values and readable transformations

Start only after M1's gate passes. The required real positive is `HotSpotList → row → HotSpotItem` with exact field `name` and isolated invocation context. The metric/formatter chain remains the secondary partial/stretch example. Extend supported helper calls, aliases, callback/props bindings, exact fields, nullish alternatives, and joins only as these sources require.

### Concrete changes and source obligations

In tsx-data-flow, extend `program-value-summary{,-resolver,-support}.ts`, `program-callback-return.ts`, `program-evidence-collector-{call-support,jsx-support,component-binding,field-transfers}.ts`, `evidence-slice.ts`, and applicable `route-totality-field-transfer-{verifier,component-verifier,carrier-verifier}.ts` only where direct source/checker evidence justifies the relation. Keep generic expression handling independent of route IDs and preserve valid existing route semantics.

In Srcly, extend the proposed `investigation/model.ts`, ledger, and inspector; keep pure shaping separate from rendering. Add field/terminal selection, summarized helper frames, branch expansion, and source jumps. Explore a **proposed** `investigation/BranchGraph.tsx` only if a comparison on a real branch/join demonstrates clearer explanation than the ledger alone (REC-013); it is not a required M2 output. No new transport tier or process topology is needed.

The real chain supplies the scope:

| Actual source | Required interpretation |
|---|---|
| `client/src/utils/hotSpotRanking.ts:valueOf`, 30–33; `rankHotSpots`, 57–82 | Dynamic metric lookup plus finite-number filtering. Do not substitute the current UI metric label for an exact static key. |
| `client/src/components/HotSpotList.tsx`, 26–28, 61–73, 88 | Ranking, `For` callback item, local row helper, and component prop binding are distinct relations requiring evidence. |
| `client/src/components/HotSpotItem.tsx`, 48–51, 145 | Display independently rereads the metric; it does not consume `ranked.value` directly. Preserve override, N/A, and formatter branches. |
| `client/src/utils/metricsStore.tsx:metricDef`, 144; `formatMetricValue`, 163–169; `formatMetricWithUnit`, 172–176 | Resolve imported helper argument/return and unit branches. Mutable `Map` lookup, external formatting, and unmodeled accessor behavior remain frontiers. |

**Required real positive and negative:** select `item.node` in `HotSpotList.tsx:88`, choose field `name`, and prove the path through argument position zero → `row`'s `node` parameter (61) → `node={node}` (64) → `HotSpotItem`'s exact text terminal (135). Keep `shown()` and ranking/dynamic metrics upstream as explicit frontiers. The same `row` helper is called from the N/A collection at line 109: the selected ranked invocation must never acquire that invocation's inputs, guard facts, or consumer context. Source terminal spans can be shared while invocation context differs; retain both identities without manufacturing route occurrences.

This is **new bounded semantic work**. Current `connectSolidFor` requires a property-access `each`, exactly one plain callback parameter, and direct field-to-JSX text (`program-evidence-collector-field-transfers.ts`, 427–491). The real case has `shown()`, two parameters, and a helper. Current component value-mode recognition handles a call or call-property, not `node={node}` (`program-evidence-collector-component-binding.ts`, 143–154). Broaden only these verified binding forms.

**Invocation pairing is mandatory.** Current `connectCalls` binds arguments into shared target parameters and shared return facts to each resolved call (`program-evidence-collector-jsx-support.ts`, 234–277); ordinary `queryEvidenceSlice` traversal has no invocation stack. Add bounded context that pairs call identity, argument position, parameter, and return to the same call. Scope guard/branch evidence to that context and program point. Individually proven AST edges do not justify arbitrary transitive closure across callers.

```tsx
function identity<T>(value: T): T { return value; }
function Calls(p: { left: string; right: string }) {
  const left = identity(p.left);
  const right = identity(p.right);
  return <><span>{left}</span><span>{right}</span></>;
}
// Selecting p.left must never reach the right span through shared helper facts.
```

Admit plain parameters and expression-bodied or clearly unconditional return forms first. `exactCallbackReturnExpression` counts syntactic returns; one return inside a conditional does not prove total return. Surface unsupported destructuring, default/rest parameters, and control fallthrough until their mapping is verified. Formatter argument/return paths remain secondary, with dynamic/Map/external boundaries explicit; a proved downstream segment never proves the whole partial chain.

Add future specifications for imported identity helpers versus helpers that return another argument; alias rebinding; callback parameter versus enclosing variable; same-name fields in distinct objects; `??` versus `||`; optional props; branch joins; recursive/helper cycles; and exact terminal ownership. Distinguish type-impossible guards under the actual configuration from runtime guarantees. Test NaN/Infinity separately from nullability, and valid fallbacks separately from defects. Cross-collection support, if encountered, must compiler-resolve operations and keep membership evidence separate from target-field identity; broad collection inference is outside this milestone.

Compression may fold consecutive verified alias/call steps, with a count and expand action, but must retain branch conditions, fallbacks, joins, uncertainty, exact fields, and terminal identities as visible rows. Fan-out becomes selectable destinations, long paths become expandable frames, and cycles become explicit back-references. If the optional graph earns inclusion, it mirrors only the selected path and immediate alternatives. Repeat the 1440/1024/390 return/focus scenarios with long chains and multiple terminals.

Update both proposed documentation pages and each repository's README example. Both runnable walkthroughs select `HotSpotList.tsx:88` field `name`, reach the context-qualified text terminal, and demonstrate isolation from line 109. Include line 145's metric expression as the partial example and keep M1's local control. **Main risk:** cross-call false attachments from shared helper facts. M2 is separate because binding/return context needs its own evidence gate after the integrated entry and return are useful.

## Verification, measurement, and stop criteria

Record per run: both source revisions/dirty content identities, Node and TypeScript versions, effective target configuration, machine, root/source, generation, asset mode, request budget, source-file count, cold/warm state, process memory, and payload bytes. Measure child readiness, Program construction, index/report preparation, snapshot validation, expression resolution, query, projection, first useful row, cancellation, and return restoration separately. Count proven consumers, partial paths, unresolved frontiers, false attachments, visited relations, and truncation. Do not present the repository's performance notes as measurements of this integration.

**Proposed initial gates, to calibrate on the real Srcly checkout:** preview/return feedback within 150 ms at p95; warm selection-to-first-useful-ledger within 750 ms at p95; visible progress within 250 ms; cold first result within 10 s on the recorded machine; cancellation acknowledgement within 250 ms with late results never applied. Use at least 20 warm requests and three fresh cold sessions. A missed gate triggers profiling of the named phase, not silent loss of evidence or removal of content validation.

Exercise selected-file edits, imported-helper edits with unchanged selected text, config/extends changes, added/removed resolution candidates, root switches, source deletion, process crash, missing runtime, cancellation during cold/warm work, and stale Back/Forward. Each must give an accurate state and usable retry/return. No silent restart loop or successful-looking empty result is acceptable.

After explicit approval of test work, use maintained `scripts/accept-route-field-proof.ts` / `pnpm accept:route-field-proof` for named field-repair closure. `AGENTS.md` requires a real positive, negative precision case, and normal user control; the runner validates named field-ledger obligations, not the browser control or a standalone negative scenario by itself. Record those checks separately; zero positive attachments fails. Its current CLI is route/source-specific (49–82, 91–115). Add an explicit generic-expression input mode and target-config propagation before using it for the new slice. Preserve route validation, validate context-qualified primitive terminals/ordered paths, and keep fixture obligations outside generic discovery. These are proposed future runner changes, not existing flags or completed validation.

Static checks cannot establish useful field proof. Once approved implementation stabilizes, follow the repository's authorized lint/typecheck workflow; after separately approved test work, use centralized `pnpm verify` as the final quality gate. Never substitute a build. Stop or rethink if only toy positives work, real source selection is ambiguous, exact terminals collapse together, source matching is unreliable, return loses orientation, or the only readable result requires hiding uncertainty. A useful partial real chain is acceptable; fabricated completeness is not.
