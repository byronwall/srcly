# Recommendations: Srcly overview to precise value inspection

## Selected direction

Build a **dedicated value-investigation workspace inside Srcly**. A pinned source preview connects repository context to an exact expression. An ordered evidence ledger explains the chosen value; a small branch graph is optional. Browser Back and the visible Return action restore the overview state that launched the investigation.

Keep one semantic owner: tsx-data-flow. Srcly supplies navigation, presentation, and an on-demand process boundary. The proposed selected-expression resolver and `EvidenceSlice` API are **new work**. Existing compiler/provider records and valid contracts are reusable; the current route-field pipeline is not a general expression API. Its selected-source recognition includes `node:fs/promises`, and supporting compiler modules contain project-specific identities and carriers. [E1]–[E4]

Deliver exactly two user-visible milestones: **M1 proves exact local expressions and return fidelity; M2 extends that same workspace through justified cross-file paths and branches.** Neither milestone requires an iframe, shared frontend package, general integration platform, or another repository.

## Ranked recommendations

| ID | Decision | Milestone | Recommendation and one-line reason |
|---|---|---|---|
| **REC-001** | **Build** | **M1** | Add the dedicated Srcly investigation surface with a compact repository locator: the existing overview answers where to investigate, while the ledger answers what happens to one value. [E1], [E3] |
| **REC-002** | **Build** | **M1** | Open a pinned, keyboard-accessible preview from treemap, dependency node, hotspot, finding, or source expression: file/symbol selections need an explicit exact-occurrence step before semantic analysis. [E1] |
| **REC-003** | **Build** | **M1** | Bind every query/result to repository root, content identity, compiler/configuration identity, raw-source span, and analyzer generation: line numbers, display names, Git revision, and mtime alone cannot identify dirty source reliably. [E5] |
| **REC-004** | **Build** | **M1** | Capture a return snapshot before handoff and use it for Return, Back, and Forward: the current URL and recent-location history omit camera, filters, disclosure, scroll, and focus state. [E2], [E6] |
| **REC-005** | **Build** | **M1** | Add one lazy Python-owned Node child, reusing tsx-data-flow's existing server/worker/cache behind a same-origin Srcly proxy and an explicit local analyzer-checkout path: this preserves semantic ownership without porting the analyzer. [E7] |
| **REC-006** | **Build** | **M1** | Implement a bounded compiler-resolved expression selector and `EvidenceSlice`, starting with HotSpotItem name and rank occurrences: these real expressions test exact terminals and fallback evidence without pretending route proof applies. [E4], [E8] |
| **REC-007** | **Build** | **M1** | Make the ordered ledger primary, with operation, effect, source span, proof status, and frontier per row: the present component canvas and transformation-kind list do not provide an ordered value explanation. [E3] |
| **REC-008** | **Build** | **M1** | Keep proven, partial, unknown, unsupported, stale, and budget-limited outcomes distinct, with separate value, validity, and conditional-influence facts: absence of evidence and successful null checks must not become claims of runtime safety. [E8], [E9] |
| **REC-009** | **Build** | **M2** | Prove HotSpotList → row → HotSpotItem with exact invocation context, leaving the metricsStore chain as a partial example: separate calls must not inherit each other's argument/return evidence. [E8] |
| **REC-010** | **Build** | **M2** | Add branch-aware ledger expansion and conservative compression, preserving fallback, join, terminal identity, and uncertainty: readability must not erase semantic decisions. [E3], [E9] |
| **REC-011** | **Build** | **M1, M2** | Ship each milestone with its documented example, source-status rules, and wide/intermediate/narrow keyboard review: a slice is useful only when its explanation and return behavior are demonstrable. [E10] |
| **REC-012** | **Explore** | After M1 proof | Optimize compiler reuse and incremental invalidation only when measurements justify it: M1 must already enforce conservative root/configuration ownership, content matching, and invalidation for correctness. |
| **REC-013** | **Explore** | Within M2 | Add a tiny secondary branch graph only if it explains joins or alternatives better than the ledger: a graph is optional presentation, not a completeness badge. |
| **REC-014** | **Explore** | After M1 proof | Evaluate distributable analyzer packaging after the explicit-path workflow works: Srcly's Python installation currently does not deliver the required Node/TypeScript runtime. [E7] |
| **REC-015** | **Defer** | Outside these milestones | Defer new languages, runtime instrumentation, broad multi-scope APIs, and general arbitrary-expression coverage: none is required to prove this two-repository handoff. |
| **REC-016** | **Avoid** | Throughout | Avoid iframe embedding, extracting a shared frontend package, or making a separate-tool deep link the main journey: those choices add coordination or preserve the current visual mismatch before the focused experience is proven. |
| **REC-017** | **Avoid** | Throughout | Avoid adding the whole semantic graph to the repository map: import aggregation and value-flow identity have different meanings and evidence requirements. [E1], [E3] |
| **REC-018** | **Avoid** | Throughout | Avoid duplicate Python semantic analysis, a plugin/compatibility registry, and a broad route-graph rewrite: one narrow compiler-owned API is sufficient to test the product direction. |

## Non-negotiable behavior

**Preview.** Show the initiating repository location, exact file/symbol, short source excerpt, reason for entry, and supported/ambiguous/unavailable status. Findings and metric witnesses remain prompts for investigation, not proven value origins. A directory or aggregate edge first resolves to a concrete file and occurrence. Do not start cold compiler analysis on ordinary hover. Resolve offsets against raw source, not highlighted or indentation-adjusted DOM text. [E1]

**First proof.** In `HotSpotItem`, the title at line 134 and text at line 135 are separate `props.node.name` terminals. The rank expression at line 130 contains `?? "–"`; preserve that fallback visibly. A component parameter can be a named boundary—“caller value not expanded”—without claiming its runtime origin. The metric expression at line 145 remains partial until its helpers, dynamic metric lookup, callbacks, and external formatting boundaries have justified evidence. Finite-number validation in `value()` is a separate fact from nullability and from an exact source-to-terminal relation. [E8]

**Cross-file proof.** M2 must pair each invocation's arguments, parameters, returns, and continuation. Traversing a shared helper's generic parameter/return graph alone can connect one call's input to another call's output; keep invocation identity in evidence and stop explicitly when it cannot be resolved. This is a proposed proof obligation, not a claim of existing general call-context support. [E11]

**Compression.** Summarize only justified intermediate chains; retain ordered canonical expansion, exact hidden counts, files, and evidence status. Never collapse a fallback, alternative, join, uncertain edge, or terminal identity into a misleading uninterrupted arrow. Predicate/membership dependencies occupy a separate section from exact field-value uses. Same-name fields require source identity and full field path; same-name terminals require occurrence identity. Unassigned frontiers remain visible at their actual scope. [E9]

**Return and responsive use.** Store durable semantic selection in the URL and verbose overview/investigation snapshots in history/session state. Restore filters, rank/cohort, selection, expansions, camera/scroll, preview, and keyboard focus. A copied link can restore semantic selection without inventing the originating tab's state. At 1440×900 use locator/ledger/evidence columns; at 1024×768 reduce the locator; at 390×844 prioritize a single ledger with origin/Return and separately opened evidence. Tab moves between regions; arrow keys navigate ledger rows and disclosure; Enter opens evidence; Escape closes the innermost surface and restores focus.

## Alternatives and delivery gates

| Alternative | Decision |
|---|---|
| Separate tsx-data-flow deep link | Retain as a diagnostic option after identity matching; unsuitable as the primary unified return journey. |
| Embedded current frontend | Reject for this slice: the graph intentionally projects component surfaces, while this task requires ordered value operations. [E3] |
| Artifact-only handoff | Useful later for portable evidence; does not by itself provide the requested on-demand exact-occurrence interaction. |

Start the child only after explicit inspection; use bounded requests, cancellation, owned shutdown, and visible unavailable/stale outcomes. Never install dependencies or run builds automatically. Measure cold compiler work, selected query, serialization/payload, warm reuse, browser rendering, and return restoration separately; the historical performance baseline does not establish present latency. [E7], [E10]

This research ran no applications, tests, builds, or source modifications. Future test execution/modification remains deferred until explicitly approved under tsx-data-flow's instructions. A named field-proof repair requires the repository's acceptance runner for closure; source inspection alone cannot establish it. Stop expanding grammar if the real chain cannot produce an honest, readable local slice with an exact terminal and explicit frontier. [E10]

## Source grounding

References are to the authoritative packet; line numbers identify the inspected snapshot, not upstream HEAD. Current source takes precedence over older design intentions.

- **E1 — Srcly entry/navigation:** `srcly/client/src/components/Treemap.tsx:154–173`; `HotSpotItem.tsx:59–70,101–107`; `CodeModal/FileFindings.tsx:70–93`; `srcly/client/src/viz/deps/DependencyView.tsx:308–323`.
- **E2 — Srcly state:** `srcly/client/src/navigation/location.ts:17–27,40–73`; `store.ts:43–73`; `history.ts:9–29`; `srcly/client/src/App.tsx:175–188`.
- **E3 — Current deep UI:** `tsx-data-flow/src/frontend/src/overview/route-totality-display-layout.ts:80–137`; `RouteTotalityFieldSections.tsx:128–159`; `RouteTotalityInspector.tsx:67–115`.
- **E4 — Scope of current proof:** `tsx-data-flow/src/analysis/route-totality-field-proof-query.ts:31–49`; `route-totality-field-proof-index.ts:308–350`; `program-evidence-carrier.ts:185–269`; `route-totality-field-proof-candidate.ts:446–501`.
- **E5 — Snapshot limitations:** `srcly/server/app/services/cache.py:90–127`; `reporting.py:635–645`; `srcly/client/src/services/fileContent.ts:1–17`.
- **E6 — Deep state:** `tsx-data-flow/src/frontend/src/overview/trajectory-url-state.ts:14–32,237–270`; `trajectory-history.ts:12–16`; `RouteTotalityGraph.tsx:132–163`.
- **E7 — Runtime seams:** `srcly/server/pyproject.toml:1–25`; `srcly/server/app/run.py:71–146`; `main.py:48–56`; `services/findings/tools.py:123–154`. Server/worker/cache reuse requires the narrow new endpoint and lifecycle work described in the implementation plan.
- **E8 — Real demonstration:** `srcly/client/src/components/HotSpotItem.tsx:29–51,121–145,159–165`; `HotSpotList.tsx:26–28,61–73,88,109`; `srcly/client/src/utils/metricsStore.tsx:144–176`; `hotSpotRanking.ts:30–33,57–82`.
- **E9 — Existing proof presentation:** `tsx-data-flow/src/frontend/src/overview/route-totality-field-inspector-model.ts:55–178`; `route-totality-field-dependency-model.ts:19–51`; `route-totality-ui-projection.ts:95–188`.
- **E10 — Verification and historical measurement:** `tsx-data-flow/AGENTS.md`; `tsx-data-flow/docs/performance-baseline.md`; `tsx-data-flow/docs/intent/field-trajectories-and-cleanup/milestone-1-accepted-plan.md`.

- **E11 — Invocation context:** `tsx-data-flow/src/analysis/program-evidence-collector-jsx-support.ts:234–277`; `evidence-slice.ts` traversal state; `program-callback-return.ts`; the required new verifier must pair each call with its arguments, parameters and returns.

[E1]: sandbox:/workspace/scratch/92ee8995274c/source-packet/srcly/client/src/components/Treemap.tsx
[E2]: sandbox:/workspace/scratch/92ee8995274c/source-packet/srcly/client/src/navigation/location.ts
[E3]: sandbox:/workspace/scratch/92ee8995274c/source-packet/tsx-data-flow/src/frontend/src/overview/route-totality-display-layout.ts
[E4]: sandbox:/workspace/scratch/92ee8995274c/source-packet/tsx-data-flow/src/analysis/route-totality-field-proof-query.ts
[E5]: sandbox:/workspace/scratch/92ee8995274c/source-packet/srcly/server/app/services/cache.py
[E6]: sandbox:/workspace/scratch/92ee8995274c/source-packet/tsx-data-flow/src/frontend/src/overview/trajectory-url-state.ts
[E7]: sandbox:/workspace/scratch/92ee8995274c/source-packet/srcly/server/app/run.py
[E8]: sandbox:/workspace/scratch/92ee8995274c/source-packet/srcly/client/src/components/HotSpotItem.tsx
[E9]: sandbox:/workspace/scratch/92ee8995274c/source-packet/tsx-data-flow/src/frontend/src/overview/route-totality-field-inspector-model.ts
[E10]: sandbox:/workspace/scratch/92ee8995274c/source-packet/tsx-data-flow/AGENTS.md
[E11]: sandbox:/workspace/scratch/92ee8995274c/source-packet/tsx-data-flow/src/analysis/program-evidence-collector-jsx-support.ts
