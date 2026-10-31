# Recommendations: Srcly agent reporting

**Build an immutable evidence snapshot with one scoped inspection service, repair correctness first, and remove output that cannot justify its claims.** These recommendations apply to [`byronwall/srcly@aa56155c9268ce9da3a54180cb6a77ae6635d190`](https://github.com/byronwall/srcly/commit/aa56155c9268ce9da3a54180cb6a77ae6635d190), version 1.8.0. They are design decisions for future implementation. No repository changes, repository tests, or product benchmarks were executed in this audit.

The complete rationale and source findings are in [report.md](report.md); milestones M0–M7 and future execution commands are in [implementation-plan.md](implementation-plan.md). D01–D18 identify audit findings. CLI-001–CLI-036 below are stable recommendation IDs; retain these IDs if wording or disposition changes. C001–C100 form a concrete craft ledger, not a claim of 100 executed tests. [contract-cases.json](fixtures/contract-cases.json) contains 25 smaller data-only counterexamples and proposed oracles, all marked unexecuted.

## 1. Dispositions

- **Build:** selected work with an implementation milestone and a useful acceptance boundary.
- **Explore:** a bounded measurement or design question; it must not delay the correctness work.
- **Defer:** a plausible capability without enough present workflow benefit to justify its cost.
- **Avoid:** an approach that would weaken the evidence contract or exceed this product's purpose.

All rows are recommendations, not assertions that the proposed feature already exists. Evidence links point to the pinned implementation, inspected research, or primary external contracts; those sources explain the problem or precedent, not an experimental proof of the recommendation.

## 2. Stable recommendation register

| ID | Class | Recommendation and one-line reason | Evidence / milestone |
| --- | --- | --- | --- |
| **CLI-001** | **Build** | Repair null-safe comparison first: a vanished measurement cannot count as improvement, and source deletion needs a separate lifecycle record. | D01; `_summary` ([S10]). M0, M6. |
| **CLI-002** | **Build** | Carry analysis and provider coverage into every compact view so partial, skipped, failed, unsupported, and unrequested evidence stay distinguishable. | D02, D13; fallback nodes ([S04]), projections ([S02]). M0, M2. |
| **CLI-003** | **Build** | Own stdout centrally and route every provider/cache warning to structured diagnostics or stderr so JSON remains one parseable response when the stream is writable. | D03; cache prints ([S06], [S09], [S13], [S24]). M0, M3. |
| **CLI-004** | **Build** | Separate acquisition from projection with `audit`, saved snapshots, and `inspect` to stop whole-root work repeating at every scope. | D07–D08; `scan_tree` ([S02]); reusable-analysis precedent ([E02]). M1, M3. |
| **CLI-005** | **Build** | Bind evidence to content/configuration manifests and provider inputs because metadata fingerprints and installed version labels do not identify analyzed bytes. | D08; analysis/graph/flow fingerprints ([S06], [S17], [S23]). M1, M2, M4, M5. |
| **CLI-006** | **Build** | Use one root-relative repository/folder/file/symbol resolver, reject ambiguity early, and distinguish output selection from the analysis universe. | D09; `explain` CWD resolution ([S01]). M0, M3. |
| **CLI-007** | **Build** | Preserve measured zero, null reasons, units, basis and denominators instead of reducing differently supported measurements to similar-looking rows. | D02, D04, D12; models/catalog/ranking ([S02], [S03], [S04], [S05]). M0, M2. |
| **CLI-008** | **Build** | Replace mixed composite priority with named, versioned inspection lanes that expose raw values and an explicit trigger. | D04; `rank_nodes` ([S02]); pilot usefulness limits ([S36]). M3. |
| **CLI-009** | **Build** | Classify code categories with reasons and overrides so documentation, fixtures and generated code remain evidence without crowding the default refactor queue. | D04–D05; pilot's CODE_MAP/golden noise ([S36], [S47]). M2, M3. |
| **CLI-010** | **Build** | Summarize descendant evidence in folders and deduplicate work cards by file while retaining distinct symbol witnesses and reasons. | D05; `summarize_tree`, `build_findings` ([S02]). M3. |
| **CLI-011** | **Build** | Expose actual checker records and per-project coverage; preserve successful diagnostics when another provider fails. | D06, D17; findings model/runner/planning ([S13], [S14], [S15], [S16], [S46]). M0, M4. |
| **CLI-012** | **Build** | Make checks, history, imports and flow explicit provider requests, with cheap discovery and visible `not-requested` states. | D07, D17; eager scan/check path and tool budgets ([S02], [S14], [S24]). M1, M4, M5. |
| **CLI-013** | **Build** | Separate physical paths, symbol identities, display labels and cross-edit matches so rank changes and same-line scopes cannot silently change identity. | D09, D18; rank IDs ([S02]), evaluator ([S37]), position precedent ([E06]). M1, M3, M6. |
| **CLI-014** | **Build** | Enforce one item/UTF-8 budget with explicit omissions and saved-evidence cursors, independent of analysis and gating. | D10–D11; slices and manifest accounting ([S01], [S02]). M0, M3. |
| **CLI-015** | **Build** | Replace nine default artifacts with one bounded view and an optional full snapshot; make Markdown or other exports explicit. | D10; `write_report`, `render_action_plan` ([S02]). M0, M3. |
| **CLI-016** | **Build** | Unify declared metric definitions, aggregation, count basis and witness semantics, including function-weighted means and bounded fallback LOC. | D12–D13; catalog/tree/compare mismatch ([S03], [S04], [S10], [S33], [S34]). M2, M6. |
| **CLI-017** | **Build** | Provide located imports and labelled related-test evidence with resolution coverage, never interpreting an absent graph node as a measured zero. | D14; graph/extractors ([S17], [S18], [S19], [S44]). M0, M4. |
| **CLI-018** | **Build** | Bind flow to engine build/session/generation plus source/provider digests and reject stale attachments even when native generation is unchanged. | D08; native metadata and generation contracts ([S20], [S21], [S22], [S23], [S45]). M5. |
| **CLI-019** | **Build** | Adapt native effects/flow capabilities to `inspect` on demand while preserving all outcomes, assumptions, witnesses and frontiers. | API/engine capabilities ([S20], [S21], [S22]); outcome fixtures ([S32]). M5. |
| **CLI-020** | **Build** | Make compare describe matched source, diagnostics, measurements and coverage separately, rather than summarize refactor safety as one verdict. | D01, D12, D14; existing compare machinery ([S08], [S09], [S10], [S11]). M6. |
| **CLI-021** | **Build** | Offer only an explicit diagnostic gate over complete compatible results, evaluated independently of top-K, categories, pages and display bytes. | D11; current truncated metric gate ([S01], [S02]); exit-code precedent ([E05]). M6. |
| **CLI-022** | **Build** | Report recovered parsing and source-read/budget failures honestly, with located diagnostics and consistent language dispatch. | D13; analyzer entry points and fallback ([S04], [S33], [S34], [S35]). M2. |
| **CLI-023** | **Build** | Make semantic output deterministic using full-precision ordering, explicit tie keys and normalized collections; keep runtime metadata outside identity. | D15; single-metric parity is useful but narrower ([S02], [S29]). M1, M3. |
| **CLI-024** | **Build** | Replace generic refactor advice with a cited observation, uncertainty, next question and valid inspection command. | D16; generated action wording and quadrant assertions ([S02], [S07], [S26]). M3, M7. |
| **CLI-025** | **Build** | Evaluate completed agent tasks against frozen current/repaired/redesigned baselines, counting all consumed evidence and acknowledging undecidable cases. | D18; pilot and evaluator limitations ([S36], [S37], [S47]). M7. |
| **CLI-026** | **Build** | Surface local instructions, applicable package scripts and conflicts as source-bound context without executing or certifying prose rules. | Repository guidance and retrospective ([S25], [S26], [S41]). M2, M4. |
| **CLI-027** | **Build** | Publish one coherent catalog/help/skill and an explicit command migration, with installed-package smoke checks matching the documented contract. | Split command discovery ([S01]), drifted skill ([S26]), tooling rules ([S25], [S51]). M3, M7. |
| **CLI-028** | **Defer** | A persistent universal graph, daemon, or cross-repository query server adds invalidation and lifecycle cost before this local evidence workflow needs it. | Existing separate graph/flow semantics ([S17], [S20], [S21], [S22], [S23]); report approach C. Revisit only after M7 task evidence. |
| **CLI-029** | **Defer** | SARIF diagnostic export and SCIP interoperability can be adapters later; neither should determine the native folder/metric/coverage contract now. | Useful but different external scopes ([E01], [E06]). Revisit after native consumers need export. |
| **CLI-030** | **Avoid** | Remove universal quality scores, peer-relative severity and metric CI gates because changing peers or missing support can alter an unchanged file's alleged urgency. | D04, D11; exact normalization/gate paths ([S01], [S02]). Prepare in M3; remove after M4 acceptance. |
| **CLI-031** | **Avoid** | Do not turn instruction keywords or free-form policies into automatic compliance verdicts; semantic obligations need explicit rules and fixtures. | Context-only instruction evidence ([S25], [S41]). Applies throughout. |
| **CLI-032** | **Avoid** | Do not generate automatic edits, claim safe extraction boundaries, or run inferred test commands from metric candidates. | D16; current advice exceeds measured evidence ([S02], [S07]). Applies throughout. |
| **CLI-033** | **Explore** | Tune the declared lane triggers and merge order on paired owner tasks; treat the proposed thresholds as seed heuristics rather than validated defect predictors. | Pilot class/metric tradeoffs ([S36], [S47]). Small registered experiment in M7. |
| **CLI-034** | **Explore** | Measure snapshot read/write/hash costs before considering streaming or indexed storage, using the same medium/large immutable corpus. | Repeated-work opportunity ([S02]), existing bounded scanners ([S28]). Measure in M1/M7; no up-front database. |
| **CLI-035** | **Explore** | Assess advanced test relations and explicit rule packs only after direct import/context evidence proves useful, with labelled confidence and negative cases. | Current path hints/name refinement limits ([S18], [S19], [S44]); instruction context ([S25]). Follow M4. |
| **CLI-036** | **Build** | Preserve native model/catalog parity and generated-contract ownership while adding adapters, so CLI improvements do not silently break the existing UI or engine. | Existing parity tests and generated schema rules ([S03], [S25], [S29], [S32]). M0–M7 where shared surfaces change. |

**Disposition totals:** 28 Build, 3 Explore, 2 Defer, 3 Avoid. Build does not mean “all in the first patch.” M0 is independently useful; M1–M3 establish the new workflow; M4–M6 add richer evidence; M7 measures and releases it. The four decisive structural changes are acquisition/query separation, a shared scope/identity contract, typed evidence with coverage, and explicit provider enrichment. Removal of composite severity, duplicate artifacts and generic advice is part of the design, not optional cleanup.

## 3. The 100x craft and edge-case ledger

Each row describes a distinct review or verification case with an observable acceptance condition. “Must” below defines the proposed contract. Some rows belong in unit tests, some in provider integration tests, and some in a release/evaluation checklist. Do not create 100 superficial tests that mirror implementation; use the smallest meaningful fixture set that proves these behaviors. The implementation plan names existing suites and the required new contract tests.

### 3.1 Discovery, grammar, and selection — C001–C010

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C001** | Global help is requested outside a repository. | List all headless and interactive commands without scanning, starting providers, or requiring Git; include an explicit `serve` spelling. CLI-027, M1/M3. |
| **C002** | `catalog` runs in a project with missing checker or engine binaries. | Report discoverable capabilities and missing prerequisites without launching the checker/engine or treating absence as a clean result. CLI-012, M1/M4. |
| **C003** | An invalid metric, provider, cohort, or format is supplied. | Exit 2 before expensive work; name the invalid field and valid choices; emit structured error when JSON mode is already recognizable. CLI-006/027, M3. |
| **C004** | The user passes a negative limit or a byte cap below the minimum envelope. | Reject before acquisition; do not invoke Python's negative slicing or produce oversized error text without a bounded fallback. CLI-014, M0/M3. |
| **C005** | `--limit 0` is requested. | Return identity, counts, coverage and omissions only; do not execute fewer required checks or bypass a diagnostic gate. CLI-014/021, M3/M6. |
| **C006** | A file is inspected from a CWD outside the repository. | Resolve its relative path under the declared source root/snapshot and return the same subject as an invocation from the root. CLI-006, M0/M3. |
| **C007** | A folder contains a dot, or a file shares a directory-name prefix. | Match actual canonical path segments/kinds; never infer directory-ness from an extension or match `src/api2` as `src/api`. CLI-006, M3. |
| **C008** | `--symbol`, position, and `--id` selectors conflict, or column has no line. | Exit 2 with a single useful correction; perform no provider enrichment for an invalid selector. CLI-006, M3. |
| **C009** | A name matches overloads, nested scopes, or duplicate declarations. | Return bounded candidate IDs with ranges/kinds and an exact follow-up; do not silently select the first name match. CLI-006/013, M3/M5. |
| **C010** | Positional refs are mixed with snapshot compare flags, or only one snapshot is given. | Reject the form before ref resolution; support either two snapshot paths or the documented ref grammar. CLI-020/027, M6. |

### 3.2 Paths, source ranges, and identity — C011–C020

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C011** | The same source is copied to a different absolute directory. | Keep semantic source/snapshot/subject IDs and pure-query ordering unchanged; only the runtime locator changes. CLI-005/013, M1. |
| **C012** | Case-distinct paths are present, or a target filesystem cannot represent them separately. | Preserve exact case; detect locator collisions instead of merging files under a lowercased key. CLI-013, M1/M2. |
| **C013** | A filename contains spaces, tabs, newline, backticks, pipes, or shell metacharacters. | JSON escapes correctly; Markdown cannot inject a row; copied commands use a documented safe quoting form; structured selector values remain authoritative. CLI-013/014, M3. |
| **C014** | A source path literally contains `::`. | Keep it as a physical path; symbol identity is a separate field and cannot be parsed from the filename. CLI-013, M1/M3. |
| **C015** | A symlink points outside the root or into a loop. | Apply and report the declared traversal policy; record exclusion/alias status and prevent silent escape or duplicate-count cycles. CLI-005/002, M2. |
| **C016** | A nested repository, submodule, or missing submodule checkout is encountered. | Name its boundary and availability; include it only under explicit discovery semantics, never as an unexplained empty folder. CLI-005/002, M2. |
| **C017** | Two callbacks begin on the same line. | Distinguish exact spans/disambiguators in subject and evaluator identities; neither may overwrite the other in a dict. CLI-013/025, M3/M7. |
| **C018** | Emoji precedes an expression and providers use UTF-8 bytes versus UTF-16 columns. | Convert using the exact source to one-based Unicode-scalar columns and exclusive ends; retain original byte-span identity; never relabel units. CLI-013/018, M3/M5. |
| **C019** | A diagnostic provider supplies only a line, or a witness ends at the next line's start. | Mark line precision when columns are unknown; apply exclusive-end display rules without claiming the next line was included. CLI-007/013, M3/M4. |
| **C020** | A rename or edit changes source positions. | Preserve lifecycle separately; offer a cross-edit match only under a unique declared matcher, with evidence/confidence; do not promise stable line-based identity. CLI-013/020, M6. |

### 3.3 Coverage, missingness, and acquisition — C021–C030

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C021** | A valid measurement equals zero. | Emit numeric 0 with measured status; do not drop it as falsy or treat it like null. CLI-007, M0/M2. |
| **C022** | A metric is inapplicable, unsupported, or not requested. | Keep distinct reasons and null values; no missing case becomes an observed zero. CLI-002/007, M2. |
| **C023** | A file cannot be read or disappears during capture. | Account for it as failed/unstable coverage; do not record zero LOC or invent a content digest. CLI-002/022, M2. |
| **C024** | A file is too large, or fallback line counting hits its byte cap. | State skipped analyses and the fallback count's basis/lower-bound status; never imply a complete count. CLI-016/022, M2. |
| **C025** | Tree-sitter returns a recovered tree containing error or missing nodes. | Keep useful observed evidence with partial status and located recovery diagnostics; exclude it from complete-measurement claims. CLI-022, M2. |
| **C026** | `.PY`, `.TSX`, binary, invalid UTF-8 and unknown-language inputs appear. | Use consistent dispatch/applicability; expose decode/unsupported states instead of mislabelling unsupported analysis as measured. CLI-022/002, M2. |
| **C027** | A folder has measured, failed, excluded and unsupported descendants. | Show named populations and aggregate coverage; a subset maximum is only an observed maximum, not a complete bound. CLI-002/016, M2/M3. |
| **C028** | Ignore rules prevent discovery of some files. | Report known exclusions and the discovery policy; leave unknowable denominators null rather than claiming a complete count. CLI-002/005, M2. |
| **C029** | One of several covering checker tools fails after another reports diagnostics. | Preserve the known diagnostics and mark completeness partial; do not erase true records or call the file clean. CLI-011, M0/M4. |
| **C030** | More tsc/ESLint configurations exist than a provider budget selects. | Report discovered/selected/omitted configurations and affected coverage; requested incompleteness yields exit 3. CLI-011/012, M4. |

### 3.4 Metric definitions, aggregation, and witnesses — C031–C040

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C031** | A file sums parameter counts across several functions. | Label the value as a file sum and show the relevant function measurement separately; never say one function takes that many parameters. CLI-007/016, M2/M3. |
| **C032** | Files have unequal numbers of executable functions. | Compute means from sufficient statistics and declared denominators; compare cannot silently substitute an unweighted mean of file means. CLI-016, M2/M6. |
| **C033** | Two symbols share the same maximum complexity. | Use a deterministic primary witness and tied count; a detail query can reveal both without implying exclusive responsibility. CLI-016/023, M3. |
| **C034** | No executable function exists in an otherwise readable file. | Apply the catalog's declared empty-population semantics and show applicability; do not invent a witness or confuse top-level executable scope with absence. CLI-007/016, M2. |
| **C035** | Measured children and missing children contribute to a folder sum. | Report an observed partial sum with population/coverage; do not compare it to a full sum as if the populations matched. CLI-002/016, M2/M6. |
| **C036** | Two inline comment nodes occur on one physical line. | Report the implemented node/line count basis accurately; a ratio above 1 must not be described as a percentage of distinct commented lines. CLI-016, M2. |
| **C037** | File LOC excludes blank lines while a function span includes them and comments. | Name the two bases explicitly or deliberately unify the definitions; do not use one shared “excluding comments and blanks” claim. CLI-007/016, M2/M7. |
| **C038** | Several changed files were touched by the same Git commit. | Label a sum of per-file commit counts as touches; distinct repository commit count requires its own computation. CLI-007/016, M4. |
| **C039** | A graph node is absent because its language/size/resolution was unsupported. | Return unavailable graph counts with coverage; measured fan-in 0 requires successful eligible graph analysis. CLI-017, M0/M4. |
| **C040** | Provider output contains NaN, Infinity, or a malformed numeric type. | Reject/mark the affected provider record as invalid; never serialize nonstandard JSON numbers or let them alter sorting. CLI-007/023, M1/M3. |

### 3.5 Queue relevance, grouping, and wording — C041–C050

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C041** | Every eligible symbol is simple or every requested raw metric is zero. | Permit an empty inspection queue with coverage; a raw-metric query may still return measured zeros. CLI-008/030, M3. |
| **C042** | A documentation file is much larger than all production files. | Preserve its category/LOC evidence; it does not crowd the default production/tooling/configuration/unknown refactor queue. CLI-008/009, M3. |
| **C043** | A golden snapshot or generated file has extreme size/complexity. | State the classification rule and offer its explicit category view; preserve related failing diagnostics without manufacturing a refactor plan. CLI-009/011, M2/M3. |
| **C044** | HTML or Markdown contains useful executable examples. | Do not equate extension with irrelevance; represent supported embedded evidence separately and allow classification overrides. CLI-009, M2/M3. |
| **C045** | Six root documents compete with a folder containing the strongest code candidate. | Summarize that folder's descendants; no default-zero folder score may hide it behind root-file rankings. CLI-010, M3. |
| **C046** | One file triggers complexity, structure and checker lanes. | Emit one repository work card with multiple reasons and distinct symbol/diagnostic evidence; count deduplicated cards accurately. CLI-008/010/011, M3/M4. |
| **C047** | An unrelated file introduces an extreme metric maximum. | Keep unchanged candidates' raw values, triggers and reason codes unchanged; ordering can change only through the documented queue policy. CLI-008/030, M3. |
| **C048** | Two raw values round to the same displayed number. | Sort full values first and then explicit path/range/ID ties; render rounding cannot decide priority. CLI-023, M3. |
| **C049** | One lane has many more items than the others. | Apply the documented fixed merge order, show per-lane omitted counts, and provide a direct lane/raw-metric query. CLI-008/014, M3. |
| **C050** | A metric candidate lacks import/test/flow investigation. | Say what was observed and ask a next question; do not claim an extraction boundary, purity, correctness defect or “safe first patch.” CLI-024/032, M3. |

### 3.6 Context, imports, checks, and flow — C051–C060

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C051** | A user requests the base audit with no providers. | Acquire syntax/inventory/context only; explicitly list checks/history/imports/flow as not requested, with useful opt-in commands. CLI-012, M1/M4. |
| **C052** | Local and parent instructions conflict or apply to different folders. | Cite exact files/ranges/digests and applicability; report the conflict without inventing an enforced policy. CLI-026/031, M2. |
| **C053** | Package scripts or instruction prose contains test/build commands. | Display verified commands as context; do not execute them or infer that they cover the selected behavior. CLI-026/032, M2/M4. |
| **C054** | Inspecting a folder needs an importer outside that folder. | Resolve using the full declared project universe and label boundary edges; do not discard callers merely to make the response local. CLI-006/017, M4. |
| **C055** | Aliases, barrels, type-only imports, cycles or unresolved imports occur. | Preserve relation type/location/resolution status; unresolved or excluded input remains a coverage limitation rather than no dependency. CLI-017, M4. |
| **C056** | A local parameter shadows an imported symbol with the same name. | Do not attribute the use to the import without resolving the shadowing; label any remaining name-based edge as heuristic. CLI-017, M4. |
| **C057** | A test imports a file but never executes/asserts the target function. | Call it a related-test candidate with direct-import evidence, not behavioral or assertion coverage. CLI-017/035, M4. |
| **C058** | Effects are requested for Python, or another unsupported operation/language pair. | Return native/capability `unsupported` with useful alternatives and exit 3 for the requested unavailable analysis; do not turn a router refusal into empty effects. CLI-019, M5. |
| **C059** | Flow returns `assumed`, `partial`, `budget`, `not-analyzed`, `cancelled`, or `stale`. | Preserve native status, assumptions and frontier; map process outcome explicitly without relabelling the result as `ok` or measured zero. CLI-018/019, M5. |
| **C060** | A dynamic checker configuration has unknown input closure. | Record the unknown guarantee and actual known inputs/tool configuration; no reproducibility or completeness claim may exceed that evidence. CLI-005/011, M4. |

### 3.7 Before/after comparison and gates — C061–C070

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C061** | A modified file changes from complexity 12 to unavailable. | Emit `not-comparable`, delta null and a coverage-loss event; never `better` or −12. CLI-001/020, M0/M6. |
| **C062** | A file changes from unavailable complexity to a measured value. | Call it gained coverage, not regression from zero; a value can still trigger a present-state inspection candidate. CLI-001/020, M0/M6. |
| **C063** | One measured pair worsens while a high-valued peer loses analysis. | Show the paired measured change and omitted pair separately; the disappearing peer cannot make the summary look improved. CLI-001/020, M0/M6. |
| **C064** | A source file is added, deleted or renamed. | Record the lifecycle event independently of measurement delta; use rename alignment for dependency changes where justified. CLI-020, M6. |
| **C065** | Metric catalog, analyzer version, provider options or eligible population differs. | Require explicit compatibility or report not comparable; do not subtract numbers with different definitions. CLI-016/020, M6. |
| **C066** | A diagnostic moves after an unrelated line insertion. | Match using provider/rule/normalized message and source anchors with rename context; line movement alone must not become “resolved + new.” CLI-013/020, M6. |
| **C067** | A `new-check-errors` gate is requested with missing/partial before checks. | Return incomplete/incompatible status with the exact acquisition requirement; do not silently run tools or pass with missing evidence. CLI-021, M6. |
| **C068** | A new error lies after top-K, outside the displayed category, or on another page. | Gate over the complete declared eligible comparison population; output truncation and triage filters cannot hide failure. CLI-014/021, M6. |
| **C069** | Ref comparison starts in a dirty working tree or another worktree. | Identify the exact ref and dirty content for each side, preserve isolation/cleanup, and never mutate the user's branch to gather evidence. CLI-005/020, M6. |
| **C070** | Metrics improve and no new checker error is found. | Report those bounded observations plus coverage and unresolved behavior questions; do not conclude that a refactor preserves behavior or is safe. CLI-020/032, M6. |

### 3.8 Rendering, byte budgets, and pagination — C071–C080

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C071** | A command runs in JSON mode through a pipe. | Produce exactly one JSON document plus the declared newline while stdout is writable; all banners/progress stay out of it. CLI-003, M0/M3. |
| **C072** | Unicode escaping, warnings and required evidence grow the response. | Enforce the total rendered UTF-8 byte cap after escaping, including envelope/newline; keep warnings bounded without hiding their counts. CLI-014, M3. |
| **C073** | A work card fits but its supporting evidence would exceed the cap. | Omit or reduce the whole atomic evidence group under a declared rule; never emit an unsupported claim with a dangling evidence ID. CLI-014/024, M3. |
| **C074** | One selected item is too large even on an otherwise empty page. | Return item-too-large and a narrower query when possible, a sufficient larger budget, or an artifact-reference recovery; never emit endless zero-row continuation pages. CLI-014, M3. |
| **C075** | A user asks for another page of a saved snapshot. | Bind the cursor to snapshot/evidence/query/order identity and last key; no provider rerun and no duplicates/omissions across pages. CLI-014/023, M3. |
| **C076** | A transient unsaved provider result omits rows. | Return total/returned/omitted plus a replay-with-save command and null cursor; do not promise reproducible pages of discarded evidence. CLI-004/014, M3/M4. |
| **C077** | A cursor's filter changes, its snapshot is replaced, or its artifact disappears. | Return a precise invalid-cursor/artifact error; never silently recapture or continue from a different result set. CLI-014, M3. |
| **C078** | Only the view format/page size changes, or an identical source root relocates. | Preserve pure-query continuation when selection/order/evidence are unchanged; presentation and runtime locator are not semantic cursor inputs. CLI-013/014/023, M3. |
| **C079** | The same query renders JSON, text and Markdown. | Use the same ordered semantic source and facts; encoding size may change how many rows fit the byte cap, so returned/omitted counts must state that difference. CLI-014/023, M3. |
| **C080** | An export is requested or a snapshot is saved. | Link only successful actual artifacts, distinguish full snapshot from bounded view, and avoid self-referential manifest byte counts. CLI-015, M0/M3. |

### 3.9 Failures, caching, cancellation, and freshness — C081–C090

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C081** | An optional cache write is denied after successful analysis. | Keep success, emit a bounded warning, and preserve machine stdout; do not confuse a cache with the required saved snapshot. CLI-003/005, M0. |
| **C082** | Required snapshot output is unwritable or replacement fails. | Exit 4, retain the previous valid file atomically, and never print a successful saved-artifact claim. CLI-004/014, M1. |
| **C083** | A consumer closes stdout early. | Stop emitting, handle broken pipe quietly with the documented I/O outcome, and avoid claiming the truncated stream is valid complete JSON. CLI-003, M3. |
| **C084** | A provider is missing, times out, crashes or emits invalid protocol. | Preserve available evidence and typed failure; return 3 for required analysis unavailability, 4 for fatal execution failure as defined, with provider detail. CLI-011/019, M4/M5. |
| **C085** | The user interrupts while providers or a save are active. | Cancel child work, preserve already valid snapshots, mark any explicitly saved partial evidence incomplete, and return 130. CLI-002/012, M1/M4/M5. |
| **C086** | Source bytes change while size/mtime remain identical. | A content-bound acquisition or enrichment detects different identity; metadata cache agreement cannot authorize attachment. CLI-005, M2/M4/M5. |
| **C087** | A new file or alias/config/type declaration appears outside an old cached file list. | Re-enumerate provider inputs, invalidate relevant results, and expose source/provider identity changes; hashing only old paths is insufficient. CLI-005/017/018, M4/M5. |
| **C088** | An engine restarts and reuses generation 1, or answers an old generation marked stale. | Require matching build/session/content and non-stale state; generation equality alone cannot authorize a fresh attachment. CLI-018, M5. |
| **C089** | An enrichment would overwrite its input snapshot, or two saves race for one path. | Reject input replacement and conflicting destination use under the documented atomic-write policy; derived evidence gets a new snapshot ID/path. CLI-004/005, M1/M4. |
| **C090** | `--refresh` is requested with several providers. | Bypass all requested provider caches consistently and report the actual plan; pure saved queries still do not rerun analysis. CLI-005/012, M0/M4/M5. |

### 3.10 Reproducibility, migration, and evaluation — C091–C100

| Case | Situation | Required behavior and owner |
| --- | --- | --- |
| **C091** | Source files or graph edges arrive in a different iteration order/process hash seed. | Semantic records, ordering, IDs and digests remain identical; only separately declared runtime metadata may differ. CLI-023, M1/M3/M4. |
| **C092** | A snapshot has an unknown major schema, bad digest or invalid reference. | Fail explicitly before querying; do not best-effort reinterpret an incompatible record or dereference a nonexistent witness. CLI-004/013, M1. |
| **C093** | Installed distribution metadata reports a different version than imported source. | Record both import/build and distribution provenance; evaluation must verify its exact checkout instead of trusting a banner. CLI-005/025, M7. |
| **C094** | An output snapshot is saved under the analyzed root. | Exclude known output/temp files from that acquisition and record the rule; repeated runs must not recursively analyze their own evidence. CLI-005/015, M1/M2. |
| **C095** | A history query uses a moving 90-day window, shallow history or no Git. | Freeze the as-of/window in comparison/evaluation; expose unavailable or partial history instead of zero activity. CLI-005/012, M4/M7. |
| **C096** | A metric/function result is checked in CLI and existing UI. | Preserve catalog definitions, executable cohorts and native schema ownership; update both callers only for intentional shared changes. CLI-036, M0–M7. |
| **C097** | A documented command is copied into the installed candidate package. | Help, arguments, artifact names and output schema match; baseline and candidate environments/checkout paths are kept separate. CLI-027/036, M7. |
| **C098** | A task review judges candidate usefulness or refactor confidence. | Blind workflow labels where possible, record no-refactor/insufficient-evidence cases, and distinguish useful candidates from proven defects. CLI-025/033, M7. |
| **C099** | A workflow emits less stdout but requires more artifact/source reading. | Count all consumed tokens/bytes, captured stderr, invocations and completed-task latency; report equal-evidence and progressive-default tracks separately. CLI-025/034, M7. |
| **C100** | A proposed 30% token or 50% invocation target is missed, or a corpus ref is unavailable. | Report the result or unavailable corpus honestly; retain hard correctness gates, never change refs/definitions after seeing outcomes or claim a measured 10× win. CLI-025/033/034, M7. |

## 4. Smallest useful shipping sequence

1. **M0: Fix false improvements, machine stdout, path resolution, limits and checker read failures.** This stands alone and should not wait for an architectural rewrite.
2. **M1–M2: Capture immutable evidence and represent missingness correctly.** A saved repository/folder/file view already removes repeated syntax work; honest coverage comes before fancy ranking.
3. **M3: Ship the coherent scopes and bounded queue as an additive workflow, and prepare the migration.** Removal of duplicated artifacts, composite severity and generic advice waits for the replacement evidence paths.
4. **M4–M6: Add actual diagnostics, imports/tests, history, native flow and comparison in independently useful slices.** M4 completes the old report commands' optional evidence paths and activates their documented removal; M6 replaces compare after its own acceptance gate. Each provider inherits the same provenance and budget contract.
5. **M7: Measure task quality and cost, update the maintained guidance, and verify installed-package behavior.** Ship based on evidence rather than output volume or a numerical improvement slogan.

No Explore/Defer item is a prerequisite for M0. No Avoid item should quietly return through a renamed score, “smart” prose checker, or generic generated action plan.

## 5. Final access and verification statement

**Access:** the exact baseline and decisive source were available. **Files read:** the full requested reading route and supporting source/tests are enumerated in [source-inventory.json](evidence/source-inventory.json), with precise read extents and verified blob hashes. **Checked:** pinned code, existing test assertions, historical research, primary documentation, and the consistency/structure of these deliverables. **Proposed:** every recommendation, craft acceptance condition, new command and future test; the data-only fixtures are specifications, not a record of executed Srcly results. **Deliverables:** [report.md](report.md), [implementation-plan.md](implementation-plan.md), this register, [contract-cases.json](fixtures/contract-cases.json), the source inventory and the complete ZIP. **Open questions:** lane calibration, provider-input closure, large-snapshot economics and optional export priority; none blocks the correctness and snapshot milestones.

## Source references

All repository links are pinned to the baseline commit. For complete review coverage and blob verification, see [source-inventory.json](evidence/source-inventory.json).

### Pinned repository sources

| Ref | Repository path | Reviewed subject |
| --- | --- | --- |
| [S01] | `server/app/run.py` | CLI parsers, dispatch, explain, limits, output and gates |
| [S02] | `server/app/services/reporting.py` | scan_tree, rankings, summaries, findings and artifacts |
| [S03] | `server/app/services/metric_catalog.py` | Metric definitions, applicability, aggregation and profiles |
| [S04] | `server/app/services/analysis.py` | Discovery, dispatch, aggregation, fallback and attachment |
| [S05] | `server/app/models.py` | Node, Metrics and witness contracts |
| [S06] | `server/app/services/cache.py` | Analysis fingerprint, persistence and failure handling |
| [S07] | `server/app/services/quadrants.py` | Predicates, thresholds, wording and output caps |
| [S08] | `server/app/services/compare/service.py` | Comparison orchestration, history and timings |
| [S09] | `server/app/services/compare/snapshots.py` | Side caches, portable checks, graphs and worktrees |
| [S10] | `server/app/services/compare/diff.py` | Metric totals, null guards, summaries and graph counts |
| [S11] | `server/app/services/compare/git_refs.py` | Ref resolution and changed-file/rename inputs |
| [S13] | `server/app/services/findings/runner.py` | Findings cache, tool collection and persistence warnings |
| [S14] | `server/app/services/findings/tools.py` | Tool outcomes, execution and default/overridden deadlines |
| [S15] | `server/app/services/findings/model.py` | Diagnostic, source, invocation and findings-result models |
| [S16] | `server/app/services/findings/typescript.py` | TypeScript/ESLint project planning and selection |
| [S17] | `server/app/services/deps/graph.py` | Graph inventory, edge collection and cache signature |
| [S18] | `server/app/services/deps/typescript_deps.py` | TS-family imports, source lines, symbols and failures |
| [S19] | `server/app/services/deps/python_deps.py` | Python imports, source lines, symbols and failures |
| [S20] | `server/app/services/dataflow/models.py` | Native operation/result/outcome mirrors |
| [S21] | `server/app/routers/dataflow.py` | Available API operations, selection and generation handling |
| [S22] | `server/app/services/dataflow/engine.py` | Child lifecycle, request protocol, limits and state |
| [S23] | `engine/src/srcly/fingerprint.ts` | Native metadata-based program fingerprint |
| [S24] | `server/app/services/activity.py` | History windows, unavailable states and cache warnings |
| [S25] | `AGENTS.md` | Build/test/tooling and generated-contract ownership rules |
| [S26] | `skills/srcly-code-quality/SKILL.md` | Current maintained agent workflow and wording |
| [S28] | `server/app/services/scan_workers.py` | Worker isolation, timeout and cancellation bounds |
| [S29] | `server/tests/test_ranking_parity.py` | Single-metric file/function ranking parity |
| [S32] | `server/tests/test_dataflow_outcomes.py` | Fake-engine named-outcome fixtures |
| [S33] | `server/app/services/python/python_analysis.py` | Python syntax metrics, spans and comment accounting |
| [S34] | `server/app/services/typescript/typescript_analysis.py` | TS/JS syntax metrics, spans and comment accounting |
| [S35] | `server/app/services/analysis_types.py` | Language classification and analysis records |
| [S36] | `docs/research/metric-pilot-2026-10/README.md` | Pilot methods, results, limitations and corpus refs |
| [S37] | `server/scripts/evaluate_metric_portfolio.py` | Evaluation strata, identity and overlap computations |
| [S41] | `docs/analysis/2026-05-03-product-grid-prod-run-retrospective.md` | Historical production-run observations and suggestions |
| [S44] | `server/app/services/deps/common.py` | Dependency file discovery and test-path hints |
| [S45] | `engine/src/srcly/session.ts` | Native session/program generation and stale state |
| [S46] | `server/app/services/findings/builtin_ts.py` | Built-in TS checks and unreadable-source behavior |
| [S47] | `docs/research/metric-pilot-2026-10/cases.tsv` | Full structured pilot case table |
| [S51] | `server/pyproject.toml` | Python package metadata, dependencies and tooling |

### Primary external sources

Current documentation/source was checked directly during the review. These are design precedents, not measured product comparisons.

| Ref | Primary source | Relevant scope |
| --- | --- | --- |
| [E01] | SARIF 2.1.0 specification, OASIS | Locations, fingerprints, invocation status and baseline-state completeness |
| [E02] | CodeQL CLI workflow, GitHub | Separate database creation and reusable query analysis |
| [E05] | Ruff linter documentation | Separate findings and abnormal execution exit codes |
| [E06] | SCIP protobuf source contract | Canonical paths, symbol identity and position encodings |

[S01]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/run.py
[S02]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/reporting.py
[S03]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/metric_catalog.py
[S04]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/analysis.py
[S05]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/models.py
[S06]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/cache.py
[S07]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/quadrants.py
[S08]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/compare/service.py
[S09]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/compare/snapshots.py
[S10]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/compare/diff.py
[S11]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/compare/git_refs.py
[S13]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/findings/runner.py
[S14]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/findings/tools.py
[S15]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/findings/model.py
[S16]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/findings/typescript.py
[S17]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/deps/graph.py
[S18]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/deps/typescript_deps.py
[S19]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/deps/python_deps.py
[S20]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/dataflow/models.py
[S21]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/routers/dataflow.py
[S22]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/dataflow/engine.py
[S23]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/engine/src/srcly/fingerprint.ts
[S24]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/activity.py
[S25]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/AGENTS.md
[S26]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/skills/srcly-code-quality/SKILL.md
[S28]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/scan_workers.py
[S29]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_ranking_parity.py
[S32]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_dataflow_outcomes.py
[S33]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/python/python_analysis.py
[S34]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/typescript/typescript_analysis.py
[S35]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/analysis_types.py
[S36]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/research/metric-pilot-2026-10/README.md
[S37]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/scripts/evaluate_metric_portfolio.py
[S41]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/analysis/2026-05-03-product-grid-prod-run-retrospective.md
[S44]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/deps/common.py
[S45]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/engine/src/srcly/session.ts
[S46]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/findings/builtin_ts.py
[S47]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/research/metric-pilot-2026-10/cases.tsv
[S51]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/pyproject.toml
[E01]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html
[E02]: https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-cli
[E05]: https://docs.astral.sh/ruff/linter/
[E06]: https://github.com/scip-code/scip/blob/main/scip.proto
