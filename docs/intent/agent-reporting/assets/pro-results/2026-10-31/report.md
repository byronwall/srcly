**Decision — Build a small, evidence-first CLI around an immutable analysis snapshot and one scoped inspection service.** Keep Srcly's metric catalog, executable-scope witnesses, bounded scan workers, dependency resolvers, checker adapters, and Git comparison machinery. Replace the report generator's mixed responsibilities and composite severity queue with `audit → inspect → compare`: an inexpensive repository triage, progressively requested folder/file/symbol evidence, and coverage-aware verification. Retire the redundant default artifact bundle, rank-dependent finding IDs, generic “safe first patch” text, and metric-based failure gates. The first release should repair machine-output contamination and false improvement from missing measurements; the structural redesign should then make provenance, category, source location, uncertainty, and omitted work explicit. This is a proposed implementation direction, not a claim that the redesigned CLI exists or that metrics prove a refactor is safe.

# Srcly agent reporting: repository audit and design

- **Repository:** [byronwall/srcly](https://github.com/byronwall/srcly).
- **Fixed source baseline:** [`aa56155c9268ce9da3a54180cb6a77ae6635d190`](https://github.com/byronwall/srcly/commit/aa56155c9268ce9da3a54180cb6a77ae6635d190), release 1.8.0.
- **Review date:** October 30, 2026, America/Indianapolis.
- **Mode:** static code review, primary-source research, and design. No repository implementation or repository-code execution.
- **Companions:** [implementation-plan.md](implementation-plan.md), [recommendations.md](recommendations.md), [contract-cases.json](fixtures/contract-cases.json), and [source-inventory.json](evidence/source-inventory.json).

## Evidence, access, and limits

The access check passed. The connected GitHub source returned the exact commit, its release change, `AGENTS.md`, and the complete Git tree with **1,299 blob entries** and `truncated: false`. Relevant complete text files were retrieved by that commit, saved as local evidence copies, and checked against their Git blob identities. The attached prompt was also read in full. The supplied count of 1,035 scanned files is a different quantity from tracked blob entries; this review did not rerun that scan.

The review covers **103 unique repository files: 101 full-text reviews, one full structured-data review of the pilot TSV, and the requested CODE_MAP sections.** The reading route includes every specifically requested source file, the requested metric-trust and metric-portfolio plans/findings, the complete metric-pilot record and strata, and additional analysis, checker, dependency, compare, dataflow, cache, and test code. `docs/CODE_MAP.md` was used for the requested headless and dataflow sections and the supporting scan/API/compare index. Exact read extents and blob hashes are in the source inventory. An indexed file is not automatically a reviewed file.

Evidence labels used below:

- **CODE:** behavior follows from the pinned implementation or a direct contradiction between its branches. Tests were inspected, not executed.
- **LIMITATION:** an architectural or product constraint, sometimes intentional. It is not automatically a defect.
- **HISTORICAL:** a result reported in repository research; independently inspected as a document, not independently rerun.
- **USER OBSERVATION:** the local run described in the mission; not reproduced here.
- **PROPOSAL:** a future interface, contract, acceptance criterion, fixture, or experiment.

No Srcly CLI invocation, repository test, package installation, build, bootstrap script, checker, Git worktree operation, or dataflow engine was executed. The public archive download route was unavailable; the connected GitHub route supplied decisive source. No commit, push, issue, or pull request was created. External comparisons use current primary documentation or source, with a deliberately small set of transferable ideas rather than an unsupported competitive benchmark.

# 1. Audit and priorities

## 1.1 Current journeys and command surface

The CLI has five headless verbs and an interactive launcher. Its headless dispatch is selected before the launcher parser, so `srcly --help` describes the launcher rather than providing a complete headless command index. An omitted analysis path finds the enclosing Git root; an explicit `.` uses the current directory. These are useful distinctions, but they should appear in a single discovery surface. ([S01]: `run.py::_main`, `_resolve_target_path`, `_run_headless`)

| Journey | Current interface and output | Evidence and practical limit |
| --- | --- | --- |
| Interactive exploration | `srcly [PATH]`, `--host`, `--port`, `--version`; starts the server and opens the browser | Useful existing product entry. This mission does not redesign the UI. ([S01]) |
| Full tree export | `srcly scan [PATH] --out FILE`, or `--out -` for JSON stdout | Full nested `Node` tree, including metric status fields. Eagerly runs history/checkers as part of `scan_tree`. ([S01], [S02]) |
| Repository triage bundle | `srcly report [PATH] --out DIR` | Default nine files: manifest, summary tree, metric hotspots, findings, top findings, catalog, report, action plan, generated skill. ([S02]: `write_report`) |
| One metric / cohort | `srcly hotspots [PATH] --metric complexity --cohort file --limit 25 --format json` | Correctly separates file and executable-function cohorts; no folder cohort. Repeats whole-root scanning/checks. ([S01], [S02]) |
| Focused subtree | `srcly explain [PATH] --file PATH --format json` | Finds an exact node path; folders can match despite the flag's name. Functions are ranked within the selected subtree. No documented symbol selector, configurable top-K, source excerpt, or analysis-provider selection. ([S01]: `_explain_file`) |
| Refactor comparison | `srcly compare [BASE] [HEAD] --repo PATH --json` | Defaults to merge-base → working tree; supports PR refs and other worktrees through the resolver. Includes changed-file metrics and dependency deltas. It is an existing CLI capability, not API-only. ([S01], [S08], [S09], [S10], [S11]) |

### Option inventory

These are current options, not proposed syntax. All analysis commands accept the history windows `30d`, `90d`, `1y`, and `all` except compare, whose service supports a window but whose CLI does not expose it. ([S01], [S24])

| Command | Options and defaults | Important semantics |
| --- | --- | --- |
| `scan` | `--out codebase_mri.json`; `--refresh`; `--format json\|jsonl`; `--include-source none\|false\|snippets`; `--activity-window 90d` | JSONL and snippets are advertised as reserved and rejected. `--refresh` is discarded. ([S01], [S02]) |
| `report` | `--out .srcly`; `--stdout`; `--refresh`; `--limit 50`; `--verbose`; `--agent-compact`; repeatable `--focus`/`--deprioritize`; `--no-default-deprioritize` | Focus is a score multiplier, not a hard scope restriction. Default deprioritization is narrow. Compact mode increases top-findings allowance from 10 to 20, rather than reducing the bundle. ([S01], [S02]) |
| `report`, continued | `--profile general\|frontend\|backend\|typescript\|python\|docs`; `--metric`; `--format markdown\|json\|both`; `--fail-on none\|medium\|high`; `--tree-depth 3`; `--tree-top 6`; `--include-tree`; `--include-dependencies`; `--quadrant`; `--quadrant-cohort` | Default format is both. Main metric tables and composite queue are different rankings. Fail-on evaluates the emitted, already-limited metric queue. Markdown plus fail-on is silently promoted to both. ([S01], [S02]) |
| `hotspots` | `--metric complexity`; `--limit 25`; `--cohort file\|function`; `--format markdown\|json`; history window | One metric, no neutral-detail metrics; stable path/start-line tie breaking. ([S01], [S02]) |
| `explain` | Required `--file`; `--format markdown\|json`; history window | `--file` resolves against the process CWD, not the analysis root. Function top-K is fixed at 10; tree depth 3 and breadth 20. ([S01]) |
| `compare` | Base defaults to `merge-base`; head to `WORKTREE` or the supplied PR; `--repo`; `--json`; `--out`; `--include-sides`; `--refresh`; `--limit 40` | Refresh forwards force to side/analysis caches, but does not bypass every graph/checker cache. Limit applies to Markdown files, not to the complete JSON. Full side trees/graphs are optional output, but both sides and graphs are still computed. ([S01], [S08], [S09]) |

### Output contract and cost

`report --stdout` returns the entire assembled payload, including Markdown strings and repeated representations. It is one JSON document but is not a small machine-only response. Default disk output duplicates essentially the same queue across `report.md`, `findings.json`, `findings.top.json`, and `action-plan.md`. The catalog and generated skill repeat information that could be requested once. `--include-tree` and dependency export are correctly opt-in, but most other artifacts are unconditional for their chosen format. ([S02]: `build_report_payload`, `write_report`, `enrich_manifest_with_artifacts`)

For `scan`, `report`, `hotspots`, and `explain`, `scan_tree` starts checker collection alongside a fresh syntax scan, overlays history, and waits for the checkers. Headless syntax scanning does not use the analysis-cache lookup path used elsewhere; findings have their own cache. Consequently, reading one file through `explain` can pay for the whole repository, Git history, and project tools. This is a **cost-path observation**, not a measured latency result. Default checker deadlines are 120 seconds for tsc/ESLint and 60 seconds for Ruff/built-in TS tools, overridable by `SRCLY_FINDINGS_TIMEOUT`; concurrency does not make that wait free. ([S02]:25–40; [S13], [S14])

Normal scan progress uses stderr, and the CLI's version banner explicitly uses stderr. `report` passes quiet verbosity by default; `scan`, `hotspots`, and `explain` inherit verbose scanning. That corroborates the reported `explain` noise without treating stderr text as JSON corruption. A different cache-failure path does write to stdout; see D03. ([S01]:82–85, 424–449; [S02]:25)

## 1.2 Scope and evidence inventory

| Evidence | Available now | Gap for an agent |
| --- | --- | --- |
| Repository and folder rollups | Nested tree, sums/maxima/weighted means; compact summary; folder selection is incidentally possible with `explain --file` | Folder summary ranking does not summarize descendant importance. Scope filtering and analysis universe are not distinct. ([S02], [S04]) |
| Files and executable functions | Single-metric ranking, profile-weighted file queue, per-file function ranking | No coherent first-class symbol request; pseudo-paths mix physical paths with scope names. ([S01], [S02]) |
| Max-complexity / component witnesses | `complexity_witness`, `witnesses`, names and line spans | Strong starting evidence. Not every aggregate has one witness, and exact ties need a declared rule. ([S03], [S04], [S05]) |
| Metric contribution markers | `/api/files/markers`, language analyzer markers | Not exposed in the report/inspect CLI. These should supply concise supporting lines on demand. ([S12]) |
| Actual checker diagnostics | Internal `FindingsResult` and API findings routes preserve rules, messages, severity, locations, tool status | Report “findings” are generated metric candidates, not those actual diagnostics. Counts lose the best evidence. ([S02], [S13], [S14], [S15], [S16]) |
| Imports and dependency symbols | Hierarchical TS/JS-family and Python graph; aliases, barrels, external packages, type-only edges, test-path hint | Exportable with report and used in compare; targeted importers and related tests are not a concise CLI view. It is not a sound call graph. ([S17], [S18], [S19]) |
| History | Commit count/churn and named unavailability; selected time window | Activity is context, not intrinsic defect severity. Moving windows need a fixed evaluation anchor. ([S24]) |
| Dataflow / effects | Engine and API provide routes, selected value flow, anchor graphs, function effects, witnesses/frontiers, outcomes and generation | No headless reporting command adapts these. Python supports several flow operations but not the TypeScript-only effects op. ([S20], [S21], [S22], [S23]) |
| Before/after | Ref resolution, detached snapshots, working-tree support, rename-aware edge comparison, timing breakdowns | No reusable general audit snapshot contract or coverage-safe verification statement. ([S08], [S09], [S10], [S11]) |
| Local instructions | `AGENTS.md`, code map, package scripts and source can be read externally | No reliable automatic policy enforcement; this should remain cited context unless an explicit structured rule exists. ([S25], [S26]) |

### The best current features should survive

- **The catalog is the correct center of gravity.** Labels, units, direction, aggregation, applicability, profile weights, and UI/CLI parity derive from one source. Keep and strengthen it rather than inventing a second reporting metric system. ([S03], [S05])
- **`None` and measured zero are deliberately distinct in the core model.** The models, attachment layer, and trust tests make that distinction explicit. Preserve it through output and compare instead of discarding it downstream. ([S04], [S05], [S27])
- **Maxima name the function/component responsible.** That provides a concrete next place to read, instead of a file-sized allegation. Keep function and file cohorts separate. ([S02], [S04], [S05])
- **Failure isolation already exists.** Worker timeouts, cancellation, large-file fallback, and named dataflow refusals are useful infrastructure to reuse. ([S04], [S20], [S21], [S22], [S23], [S28])
- **Compare has substantial implemented architecture.** It resolves refs, scans isolated sides, normalizes paths, follows renames in edge deltas, and uses portable checker choices across sides. Do not replace this with an ungrounded score subtraction. ([S08], [S09], [S10], [S11])
- **The project has meaningful invariant tests.** Metric applicability, executable scopes, witness identity, single-metric ranking parity, snapshot portability, checker outcomes, dependency fixtures, and dataflow generated-contract tests are stronger than presentation snapshots alone. Their presence is not evidence that they were run in this review. ([S27], [S28], [S29], [S30], [S31], [S32])

## 1.3 Ranked defects and limitations

Ranking below reflects harm to a repository refactor audit. D01–D18 are stable audit finding identifiers; implementation recommendations have separate `CLI-xxx` IDs in the recommendations file.

### D01 — Missing analysis can appear as an improvement in compare

**CODE; highest correctness priority.** `compare/diff.py::_summary` drops null values, then converts an empty side's aggregate to zero before calling `verdict`, and also computes the delta with zero substitution. For a modified file whose complexity was 12 and whose new analysis is unavailable, the file-level path declines a like-for-like verdict, but the summary can report `before=12`, `after=null`, `delta=-12`, `verdict=better`. The same flaw affects max/mean metrics. This is a direct counterexample, not a claim that a particular real refactor produced it. ([S10]:193–205, 254–275)

The summary must distinguish changed source, changed analyzability, and actual measured movement. A missing side gets `not-comparable` and a null delta. A deleted file is an explicit lifecycle event, not a measured zero. A paired subset can be summarized, but its denominator and omitted pairs must be visible. **Build: CLI-001, CLI-020.**

### D02 — Compact reports erase essential coverage distinctions

**CODE / LIMITATION.** Core fallback nodes retain `analysis_status`, `analysis_error`, and N/A reasons. The ranked evidence and summary projections do not systematically carry those fields. `_metrics_subset` additionally drops measured zero and null alike. A failed or oversized file with fallback LOC can enter a size-oriented queue without showing that its complexity and functions were not analyzed. A reader cannot tell “not measured” from “not interesting” using the compact evidence alone. ([S04]:1037–1049; [S02]:332–348, 411–425, 732–738)

Display mandatory coverage before the queue, and preserve null with a reason in each requested measurement. Showing partial results is useful; implying full coverage is not. **Build: CLI-002, CLI-007.**

### D03 — Cache-write warnings can corrupt machine stdout

**CODE.** `FindingsCache.put` catches failures and calls plain `print`, which writes to stdout. `scan_tree` requests cached findings and waits for the result before serializing its output. On a successful checker run followed by denied cache persistence, JSON stdout can be prefixed with the warning. The history cache has another directly reachable plain-print failure path. `AnalysisCache.save` and compare's side cache also print on persistence failures, although the fresh headless syntax scan does not itself use `AnalysisCache.save`. This is separate from normal progress and the banner, which use stderr. ([S13]:124–137, 160–185; [S02]:25–40; [S24]:254–255; [S06]:192–215; [S09]:115–116)

The mission's denied-cache observation makes this condition especially relevant, but its actual captured stdout was not supplied. Do not state that its particular JSON was corrupted. Add a fault-injected subprocess test that forces a clean checker result and a cache-write failure, then parses the entire stdout. **Build: CLI-003.**

### D04 — The composite queue confuses relative prominence, missing support, and urgency

**LIMITATION with concrete misleading behavior.** `rank_nodes` computes a weighted mean of each metric divided by its repository maximum, using only metrics measured for the node. This preserves the measured-zero denominator rule, but it does not make differently supported nodes comparable. A documentation file measured mainly for LOC can score near 1, while a well-covered code file's measured zero findings dilute its score. Adding a new extreme peer can change an unchanged file's priority. `high`/`medium` are fixed cutoffs on this cohort-relative score. `build_findings` also emits candidates with score zero. ([S02]:280–395, 724–738, 765–770; [S03])

This is not evidence that LOC or complexity are useless. It is evidence that one cross-category “quality severity” is the wrong product contract. Keep named metric lanes and raw values. Require a declared inspection trigger for an actionable candidate; all-zero or uniformly simple repositories may have an empty queue. **Build: CLI-008, CLI-009; Avoid: CLI-030.**

### D05 — Folder summaries systematically favor root files over folders

**CODE.** `summarize_tree` receives a file-ranked score map. Folder identities do not occur in that map, so their score defaults to zero. Direct root files with positive scores sort before all folders, even folders containing stronger descendants. LOC breaks ties only after that comparison. The problem is structural, not proof that documentation should always be hidden. ([S02]:398–441)

A folder view should summarize descendant coverage and selected candidates, with no synthetic folder quality score. Group by actual folder and category, show the strongest distinct witnesses within it, and report omitted children. **Build: CLI-010.**

### D06 — The best checker evidence is not the report's finding evidence

**LIMITATION.** Checker adapters retain rule IDs, locations, messages, tool provenance, and outcome. The reporting queue uses `finding_count` in a metric blend, then emits a generated category/title/action. `_category_for_metrics` has no checker-diagnostic category; a file promoted by many diagnostics can receive a size or complexity suggestion. Actual rule messages cannot be recovered from that row. ([S02]:358–392, 751–808; [S13], [S14], [S15], [S16])

Expose actual diagnostics as a distinct evidence type and separate tool severity from Srcly's inspection order. Do not call 20 style warnings 20 defects or substitute generic advice for an available rule location. **Build: CLI-011.**

### D07 — Every zoom step can repeat expensive work

**CODE / LIMITATION.** Headless `scan_tree` performs a fresh analysis and eagerly schedules checkers for `hotspots` and `explain` as well as `report`. These commands do not accept an existing analysis result. Syntax, checker, history, dependency, and flow caches have different inputs and lifetimes. ([S01], [S02], [S06], [S13], [S17], [S20])

Use one snapshot acquisition step, then pure projections for folder/file/symbol queries. Optional providers should run only when explicitly requested and should produce evidence bound to that snapshot's source and provider inputs. **Build: CLI-004, CLI-012.**

### D08 — Refresh and freshness are inconsistent

**CODE.** `write_scan` and `build_report_payload` explicitly discard `refresh`, with a stale comment saying cache support is a no-op, despite a real analysis cache and a separately active findings cache. The shipped skill recommends `report --refresh` after edits. Compare, in contrast, forwards refresh to its side-loading path. ([S02]:43–45, 74; [S01]:453–468; [S06]; [S26])

**CODE-supported cache limitation.** The analysis fingerprint hashes path, size, mtime and installed distribution version, not file contents or the imported analyzer source. Restoring an mtime after a same-size edit can retain that key. Dependency cache signatures omit resolver configuration such as tsconfig changes. Dataflow's `programHash` is also a metadata-based fingerprint; its name must not be presented as proof of content identity. ([S06]:90–127; [S17]:27–34, 65–78; [S23])

A content manifest, provider configuration identity, honest cache-use metadata, and explicit refresh semantics are needed. **Build: CLI-004, CLI-005, CLI-018.**

### D09 — Target paths and identities do not form a portable contract

**CODE.** `explain ROOT --file relative/file.py` resolves the file against CWD, so invoking from outside ROOT can fail after scanning the whole root. Many weighted findings and witnesses retain absolute paths while single-metric rows use relative display paths. Finding IDs are `srcly-001`, etc., based on current rank; a new first item renumbers unrelated items. Path-prefix matching also infers directory-ness from suffixes, creating ambiguous matching for dotted directories and filename prefixes. ([S01]:442–445, 519–539; [S02]:335, 376–379, 850–877)

Use structured repository-relative locations and snapshot-scoped IDs; resolve relative selectors against the declared repository root. Define symbol matching separately from file paths. A short human label is not a durable identity. **Build: CLI-006, CLI-013.**

### D10 — Limits, formats, and artifact metadata disagree

**CODE.** Negative integers are accepted by argparse and reach Python slices. `--limit 1` bounds some JSON lists but the Markdown metric tables still use `[:10]`; the action plan uses `[:5]`; quadrants have their own limit. `--agent-compact` increases one allowance and does not remove artifacts. The manifest records its own byte size before adding its artifact list. JSON-only disk output still prints a “Read first” path to `report.md`, and Markdown-only output refers to JSON files that need not exist. ([S01]:209, 294, 345, 494–497; [S02]:102, 487, 507, 602, 648–692; [S07]:343)

These are independent of whether nine files happen to be affordable. Replace them with one view budget, explicit total/returned/omitted counts, and explicit exports. **Build: CLI-014, CLI-015.**

### D11 — Metric severity is a poor CI gate, and truncation can disable it

**CODE / DESIGN.** `--fail-on` reads the queue after `--limit`; `--limit 0 --fail-on high` has no findings to enforce. More fundamentally, a peer-relative metric priority is not a reliable policy violation. Even a correctly applied gate would change with unrelated repository maxima. ([S01]:417–421, 507–516; [S02]:358–395)

Remove this gate rather than preserving it by habit. A later explicit diagnostic policy can gate on complete eligible results, with independent status for unavailable checks. A projection's top-K must never control a gate. **Avoid: CLI-030; Build: CLI-021.**

### D12 — Witnessed max, mean, and count semantics need stronger output discipline

**CODE / LIMITATION.** File/folder max complexity has a useful executable-function witness. Other maxima and sums have different semantics. File parameter count is a sum across functions, not “the function takes N parameters.” Compare's `_total` averages file means equally, unlike the function-count-weighted folder aggregation. For files containing one function of mean 20 and nine functions of mean 2, the unweighted file mean is 11 while the function-weighted mean is 3.8. ([S03]:173–180; [S04]: aggregation; [S10]:160–167; [S05])

Declare each measurement's basis, denominator, observed population, and aggregation. For maximum ties choose a stable primary witness and state how many equivalent maxima were omitted. Do not display a folder's sum of file commit touches as unique repository commits. **Build: CLI-007, CLI-016.**

### D13 — Parsing and fallback accounting can overstate completeness

**CODE, with proposed runtime fixtures.** The reviewed TS and Python tree-sitter `analyze_file` paths traverse the parse result without checking main-source parse-error nodes before returning ordinary file metrics. Recovered/malformed syntax therefore has no explicit partial-parse status in this path. The fallback LOC counter returns zero on read failure and stops after a 32 MiB read budget without reporting a lower bound. Main language dispatch uses case-sensitive suffix checks while applicability classification lowercases suffixes. ([S04]:899–923, 990–1049; [S33], [S34]; [S35])

LOC also has inconsistent descriptions: TS/Python file LOC counts nonblank lines including comments, while function LOC uses physical source spans. The catalog's “excluding comments and blanks” description does not fit both. Comment accounting can count multiple comment nodes on one line, so its ratio is not necessarily a percentage of distinct commented lines. The pilot already flags these definition issues. ([S03], [S33], [S34], [S36])

Do not infer a particular malformed fixture's recovered AST without running it. Add located recovery diagnostics, count basis/precision, and consistent suffix dispatch. Unknown LOC is not zero LOC. **Build: CLI-002, CLI-016, CLI-022.**

### D14 — Dependency absence can become false zero, and imports are not calls

**CODE.** Compare fills graph fan-in/fan-out with zero even for files present only in the metric tree and outside the graph's analyzed population. Graph-node membership alone is also insufficient proof of success: graph construction retains discovered files whose dependency extraction failed. A graph artifact that catches an exception returns empty nodes/edges plus an error; it lacks a uniform coverage envelope. Symbol refinement in dependency extractors uses names and does not establish lexical call identity for all shadowing cases. ([S10]:136–156; [S02]:699–711; [S17]:37–75; [S18]:324–328; [S19]:217–224)

Represent graph eligibility, unresolved imports, and partial coverage. An import from a test is useful related-test evidence; it does not prove the test executes a function or asserts its behavior. **Build: CLI-017.**

### D15 — Stable single-metric ranking does not imply stable composite ranking

**CODE.** `rank_by_metric` filters non-finite values and sorts by raw metric value, path, and start line. Composite `rank_nodes` rounds scores to four decimals before sorting and has no explicit path tie-break; its maxima/evidence path lacks the same finite-value filtering. The parity fixture covers the single-metric path, not the complete multi-artifact or composite contract. ([S02]:230–277, 280–355, 724–738; [S29])

Sort full-precision typed values, resolve all ties explicitly, reject non-finite JSON numbers, and separate semantic determinism from timestamps and timings. **Build: CLI-014, CLI-023.**

### D16 — Suggestions overstate how much analysis was done

**CODE / LIMITATION.** Titles such as “Component carrying too much state and rendering logic,” and “Safe first patch” in the generated action plan, follow metric categories rather than evidence of actual separable responsibilities. Quadrant descriptions include claims like safe rework or solid ground from limited metrics. The standalone skill still advises import coupling and low comment density, despite neutralized/demoted metrics and newer wording in the generated skill. ([S02]:593–610, 751–807; [S07]; [S26])

Emit an evidence-backed question and next inspection command. Only a reviewed plan can claim an extraction boundary, and verification must identify actual tests or explicit gaps. **Build: CLI-010, CLI-024.**

### D17 — Provider planning can silently bound coverage

**CODE.** TypeScript checker planning limits selected tsc and ESLint projects; the reviewed planning path slices those lists rather than reporting omitted project configurations. Package/checker availability and tool status are valuable, but “checks complete” needs an explicit analyzed-project denominator. Runtime ESLint configuration is executable project code, so always-on checks also cross a meaningful execution boundary. ([S14], [S15], [S16])

Make the default audit syntax-only, with cheap capability discovery and an obvious `--with checks` follow-up. This trades immediate diagnostic availability for predictable cost and intent. It must say `checks: not-requested`, never “clean.” **Build: CLI-012, CLI-011.**

### D18 — The existing evaluation is useful evidence, not a defect-prediction benchmark

**HISTORICAL / CODE.** The metric pilot records 729 cases: 175 useful, 229 noise, 317 duplicate, and 8 excluded fixtures, adjudicated by one non-blind agent reviewer. Its purpose is queue usefulness, not defect detection. The evaluation helper's path-plus-start-line identifier can overwrite two same-line scopes (`node_id` at lines 173–175 feeds the dictionary at line 208), and its top-K overlap computation does not fully match the README's minimum-paired-sample description. ([S36], [S37])

Reuse the corpus and rubric, repair the identity/protocol problems, and add blinded paired task evaluation and known edge fixtures. No outside-demand gate is warranted; the owner has requested the feature. **Build: CLI-025.**

## 1.4 Reconciliation of the reported local run

| Supplied observation | What the baseline source supports | What remains unverified |
| --- | --- | --- |
| 1,035 scanned files; ten-item queue contains CODE_MAP and a golden snapshot | General category mixing and current path deprioritization permit these targets. The previous pilot already records CODE_MAP noise. | Exact membership, measured values and run discovery conditions. |
| 10,636-byte report; nine artifacts total 97,464 bytes | Nine default artifacts are written; compact mode does not shrink that set. | Those exact byte counts. |
| Useful complexity witnesses; generic suggestions | Both are directly visible in models/ranking/renderers. | Whether each witness in that local output was correct for its source. |
| Absolute findings paths; root-document-heavy summary | Weighted paths are absolute; summary score map favors root files over folders. | Exact presentation in the unsupplied artifacts. |
| Cache writes denied | Failure paths are best-effort, with stdout warning leakage possible. | Which cache failed and whether stdout JSON was captured/contaminated. |
| Installed banner 1.2.0 while source is 1.8.0 baseline | Banner/manifest version lookups use installed distribution metadata; imported source can differ under PYTHONPATH. | That environment's full package/config inventory. |
| `explain` emitted extensive stderr progress | Its call uses verbose `scan_tree` default. | Volume and elapsed time. This is not itself a stdout defect. |

## 1.5 What earlier plans already resolved

The older metric-trust and metric-portfolio files are planning records, not the final authority on shipped state. The newer metric-system-overhaul initiative and pilot record implemented catalog centralization, max complexity with witnesses, null semantics, executable cohorts, and pilot-based demotions. The pilot explicitly acknowledged LOC/documentation contamination, file-summed arity, LOC description inconsistencies, and style-rule-heavy findings as follow-ups. The production-run retrospective's suggestions for quiet reports, focus, top-N files, action plans, and manifest sizes are partly implemented already, with the defects above. ([S36], [S38], [S39], [S40], [S41])

Do not reopen the old “obtain demand” decision or treat every old proposed feature as missing. Also reject the retrospective's suggestion that automatically extracting policy terms can reliably prove compliance. `AGENTS.md` can give context and suggested verification commands; free-form instructions do not constitute an executable rule specification.

# 2. Desired workflow and contract

Everything in this section is a **PROPOSAL**. The commands are a specification for future implementation, not commands available at 1.8.0. Baseline commands and execution recipes are separately identified in the implementation plan.

## 2.1 A progressive workflow with four headless concepts

1. **Discover:** `catalog` describes commands, schema versions, metrics, providers, supported languages/operations, defaults, and expected work. A root-specific invocation detects available configuration without starting checkers or the engine.
2. **Capture:** `audit` acquires source evidence once and returns a concise repository view. `--save` stores the complete canonical snapshot; the output view remains bounded.
3. **Investigate:** `inspect` queries that snapshot at repository, folder, file, symbol, or source-location scope. Most requests are pure projections. `--with` explicitly requests additional providers; `--save` writes a new derived snapshot, never mutates the input.
4. **Verify:** `compare` compares two snapshots or resolved Git refs. It separates source lifecycle, metric movement, diagnostic changes, coverage changes, and unresolved behavior questions.

**Folder and symbol investigation should be first-class scopes, not additional top-level commands.** The same resolver, query model, evidence envelope, and rendering budget should serve all scopes. `folder-report`, `symbol-report`, `effects-report`, and `test-report` would replicate the current fragmentation.

The existing interactive launcher can remain, with an explicit `serve` spelling for paths colliding with commands. Global help must list both interactive and headless entry points. The headless `scan`, `report`, `hotspots`, and `explain` verbs should be consolidated in a documented breaking release once their replacements pass the acceptance suite; no permanent alias framework is needed.

### Proposed command run sheet

All paths below are real baseline locations, including the verified `rankHotSpots` export. These commands describe future syntax and were not executed. ([S59])

```bash
# Discover the installed contract and cheap per-root capabilities.
srcly catalog . --format json

# Capture syntax/inventory/context once; return at most ten concise candidates.
# No checker, Git-history walk, dependency graph, or flow program by default.
srcly audit . --save /tmp/srcly-before.json --limit 10 --max-bytes 16384

# Inspect the repository, a folder, a file, and a named function from that snapshot.
srcly inspect /tmp/srcly-before.json --path .
srcly inspect /tmp/srcly-before.json --path server/app/services
srcly inspect /tmp/srcly-before.json --path server/app/services/reporting.py
srcly inspect /tmp/srcly-before.json --path server/app/services/reporting.py --symbol rank_nodes

# Recover today's useful single-metric journey without a rescan.
srcly inspect /tmp/srcly-before.json --path server --view metrics --metric complexity --cohort function --limit 20 --format json

# Request contextual imports and related tests; retain repository-wide resolution.
srcly inspect /tmp/srcly-before.json --path server/app/services/reporting.py --symbol rank_nodes --with imports,tests --save /tmp/srcly-before-related.json

# Checks are an explicit execution request. Preserve their complete results for compare.
srcly audit . --with checks --save /tmp/srcly-before-checked.json --format json --limit 10

# Request effects only on a supported TypeScript callable.
srcly inspect /tmp/srcly-before.json --path client/src/utils/hotSpotRanking.ts --symbol rankHotSpots --with effects

# Ask for value flow from a located expression. Ambiguous selections return candidates.
# Choose actual line/column values from inspect's returned source locations.
srcly inspect /tmp/srcly-before.json --path server/app/services/reporting.py --line 328 --column 9 --with flow --direction forward

# After a separately reviewed change, acquire fresh evidence and compare like-for-like.
srcly audit . --with checks --save /tmp/srcly-after-checked.json --refresh
srcly compare --before /tmp/srcly-before-checked.json --after /tmp/srcly-after-checked.json --format json

# Existing ref comparison remains useful, with explicit unified formatting.
srcly compare HEAD~1 WORKTREE --repo . --format markdown --limit 20

# Ref-mode enrichment is explicit and uses the same provider plan on both sides.
srcly compare HEAD~1 WORKTREE --repo . --with checks,imports --format json

# Export a Markdown view explicitly; do not generate nine sibling artifacts by default.
srcly inspect /tmp/srcly-after-checked.json --path . --format markdown > /tmp/srcly-review.md
```

The proposed line selector does not promise that a position is a supported expression. At reporting.py:328 the inspector must return the actual enclosing/selected candidates and their capabilities; it must not silently substitute a different symbol. Commands requesting flow on a Python root also need the appropriate Python subproject context, which capability discovery should identify.

## 2.2 Representative concise outputs

The following is **illustrative fixture output**, with deliberately synthetic paths and numbers. It is not a Srcly scan, benchmark, or measurement of the supplied baseline.

```text
Srcly audit · example-project · source demo-before
Syntax: 8/8 eligible files measured. Checks/history/imports/flow: not-requested.
Categories: production 5 · tests 2 · documentation 1.

2 inspection candidates; 2 returned; 0 omitted.
1. src/parse.ts:4–31  parseInput
   complexity 17 CCN; inspection trigger >=10. Evidence E1.
   Next: inspect demo-before.json --path src/parse.ts --symbol parseInput
2. src/Panel.tsx:12–186  Panel
   component 175 lines + 6 hooks; related measurements share one card. Evidence E2,E3.
   Next: inspect demo-before.json --path src/Panel.tsx --symbol Panel

Snapshot saved: demo-before.json
```

A folder projection should then show relevant descendants without rescanning or ranking folders against files:

```text
Scope src/ · 5 files · 5 measured · 0 failed · 0 excluded by this query
2 distinct candidate files. Full repository remains the dependency context.
parse.ts   parseInput:17 CCN   E1   next: inspect --path src/parse.ts --symbol parseInput
Panel.tsx  Panel:175 lines    E2   next: inspect --path src/Panel.tsx --symbol Panel
Tests: not-requested. Related imports: not-requested.
```

After explicitly requesting related evidence:

```text
parseInput · src/parse.ts:4–31 · source demo-before
Observed: 17 CCN. Reason: metric.complexity.inspect-trigger. Evidence E1.
Imported by: src/api.ts:2 (resolved import; not a runtime caller claim).
Related test: tests/parse.test.ts:3 (direct import; assertion coverage unknown).
Next question: which branch cases already have assertions?
Next command: inspect demo-before-related.json --path tests/parse.test.ts --view evidence
```

The action is a concrete question tied to source and tests. It does not invent an extraction plan from a scalar. A work item becomes actionable when an agent has inspected the source, named the intended behavior boundary, identified protections, and recorded unresolved assumptions.

## 2.3 The canonical records

Use typed Python/Pydantic models and generated JSON Schema for the audit contract. Keep this separate from the existing engine-owned Zod schemas; wrapping the engine's result is preferable to redefining its proof vocabulary.

| Record | Essential fields | Why it exists |
| --- | --- | --- |
| `SourceManifest` | repository identity, canonical relative files, per-file content digest/status, discovery inputs, effective scope, VCS commit and dirty state, instruction/config digests | Names the bytes and scope the evidence describes. A Git SHA alone does not identify a dirty checkout. |
| `AnalysisSnapshot` | schema version, source ID, snapshot ID, producer build/catalog/policy versions, subjects, measurements, provider results, coverage | Immutable captured evidence, independent of a view's top-K or formatting. |
| `Subject` | source-bound ID, kind, path, language, category with reason, optional parent/symbol identity and range | Uniform repository/folder/file/symbol addressing; physical path is not overloaded with `::scope`. |
| `Measurement` | metric ID, nullable value, status/reason, basis, numerator/denominator when relevant, coverage, evidence refs | A number cannot be interpreted without its applicability and population. |
| `Evidence` | ID, provider, observation kind, source location/content digest, optional bounded excerpt, links, assumptions | Connects claims to precise source; supports several witnesses without repeating prose. |
| `Diagnostic` | provider/rule/severity/message, primary and related locations, run identity, stable matching material | Preserves tool evidence instead of converting it into a count-derived generic finding. |
| `Candidate` | subject, reason code, lane, evidence refs, next inspection action, caveats | A triage proposal, explicitly distinct from a proven defect or tool diagnostic. |
| `EvidenceResponse` | request, snapshot/source IDs, status, coverage, bounded data, omissions/cursor, diagnostics, separate run metadata | One JSON envelope for audit, inspect and compare; errors use the same envelope after JSON mode is selected. |

Recommended invariants:

- **Two identities:** `source_id` hashes the declared source/configuration manifest; `snapshot_id` additionally identifies semantic analysis results and producer definitions. Adding a provider creates a derived snapshot with the same source ID only while that manifest is unchanged; its additional inputs have a separate provider digest. Expanding or changing the declared source manifest requires a new source ID. Neither identity includes timestamps, timings, absolute local root, or display limits.
- **No false permanence:** subject IDs are stable for the same source and analysis identity. Cross-edit symbol matching is an explicit match with evidence and confidence, not a claim that line-based IDs survive refactoring. Match renamed files through Git first; accept a symbol correspondence only when unique under the declared matcher.
- **Coordinates are explicit:** canonical ranges use one-based lines and columns, an exclusive end, and Unicode scalar columns. Locations lacking exact columns are line-precision locations. Retain original byte spans for exact identity. Adapters convert tree-sitter byte positions and TypeScript UTF-16 positions using the exact source text, including conversion back to native coordinates for selections; they must never relabel units without conversion. ([S53])
- **Nullable values stay nullable:** a measured zero is numeric zero with `status=measured`; missing values are null with a reason. A partial count may carry an observed value with `status=partial` and its known denominator, but never looks fully measured.
- **Provider outcomes remain native:** flow's `ok`, `assumed`, `partial`, `not-analyzed`, `unsupported`, `stale`, `cancelled`, and `budget` are preserved inside the response. Do not reduce them to an error count or complexity zero. ([S20])
- **Portable semantic data:** paths are case-preserving repository-relative POSIX paths. Local source-root locations are runtime locators, not identity material. Escapes, tabs, Markdown pipes, and newlines must not break output or generated commands.
- **Versioned schemas:** unknown major versions fail explicitly. A simple personal tool does not need a migration service; support the published schema(s) deliberately and document breaking releases.

## 2.4 Ranking and work-queue policy

Delete the universal composite quality score. Keep raw metric lists for users who intentionally request them. Build the default inspection queue from **named lanes**, not hidden normalization:

- **Diagnostics lane, when checks were requested:** preserve checker severity and rule. Project configuration errors and unavailable tools belong in coverage/diagnostics, not in a code-defect count.
- **Complexity lane:** executable-function max with a concrete witness; initial inspection trigger 10 CCN, explicitly a heuristic inherited from an existing quadrant cutoff, not a safety boundary.
- **Structure lane:** nesting and component measurements. Initial candidates may use nesting ≥4, or component LOC ≥150 together with hooks ≥5 or effects ≥2. These are versioned seed heuristics to evaluate, not experimentally established universal thresholds.
- **Context lenses, explicitly requested:** activity, fan-in, comment noise, type escapes, raw LOC, docs, and current 2×2 predicates. Keep them available without letting their availability alter unrelated severity labels.

For a limit of K, merge lane queues in a fixed documented round-robin order, sorting each lane by its declared raw value(s), canonical path, range, and subject ID. Dedupe at the file work-item level for repository triage, retain the strongest distinct symbol witnesses, and accumulate all reasons onto the same item. Never average CCN, bytes, lint messages, and missingness into a substitute scalar. Explicit `--view metrics --cohort function` returns individual symbols and allows a measured zero in a raw ranking; zero alone does not create a refactor task.

**Category is context, not a diagnosis.** Use production, tooling, configuration, test, fixture, generated, documentation, vendor, and unknown labels with a rule source and confidence. A structured local config can override classifications. Default refactor candidates include production/tooling/configuration/unknown; tests and docs stay in the snapshot and have separate discoverable views. Requested checker diagnostics remain visible across test and production categories; generated/vendor diagnostics are summarized separately. Do not identify all unsupported-language files as non-production, or assume every Markdown file is dispensable. The pilot's useful inline JavaScript in HTML is a relevant counterexample. ([S36])

## 2.5 Scope, uncertainty, and local instructions

A query has two separate scopes:

- **Analysis universe:** the repository/project context used to resolve imports, configuration, symbols, and providers.
- **Output selection:** the path/symbol/category shown in this response.

Inspecting `server/app/services` should not discard imports from its callers outside that folder. Conversely, scanning a folder as an explicitly isolated root must state that repository-wide callers were not considered.

For each evidence type, name the strength supported by the provider: syntax occurrence, resolved import, checker diagnostic, modelled flow, assumed handoff, or heuristic related-test match. A path/name match is not assertion coverage. Absence of results proves only absence within the enumerated analyzed domain. “No diagnostic reported in 18 checked files” is defensible; “no defects” is not.

Discover local instruction files and applicable package scripts as **cited context**. Record path, digest, line range, directory applicability, and conflicts. Prefer explicit structured exclusions/category overrides over free-form interpretation. Do not automatically promote a phrase in `AGENTS.md` into a pass/fail check, run arbitrary commands extracted from prose, or infer that a no-match keyword search proves a semantic convention. A future explicit rule pack can declare applicability, rule semantics, and its own fixtures.

## 2.6 Provenance, stale data, and on-demand work

A saved snapshot is immutable evidence, not a promise that the working tree is frozen. Syntax analysis should consume the same bytes that were hashed. For providers that read the filesystem themselves, record actual input inventories and compare their hashes before/after the request; describe this as a consistency check, not an atomic filesystem transaction. If sources/configuration change, return `stale` and do not merge the enrichment.

Native dataflow `expectedGeneration` catches a generation mismatch, but generation numbers restart with a new process. Existing status can say stale while the old generation still answers. Native `programHash` uses metadata and is not a content digest. A valid attachment needs the target source ID, provider input digest, engine build/version, session identity, generation, and program hash; a returned witness must also match its file digest. Retain native fields as evidence, and add the missing source-content guard. ([S20], [S21], [S22], [S23])

On-demand policy:

| Work | Default | Reason |
| --- | --- | --- |
| File discovery, source metrics, syntax witnesses, category/context discovery | On | Minimum useful repository map and bounded triage. |
| Git history | Off; `--with history` | It costs a history walk and changes with the selected date/window. Useful after relevance is established. |
| Project lint/type checks | Off; `--with checks` | Can execute project tooling/configuration, wait for long deadlines, and have incomplete project coverage. Explicitly show not requested. |
| Import graph and related-test candidates | Off; `--with imports,tests` | Valuable for a selected refactor; require whole-project resolution and explicit incompleteness. |
| Function effects and value-flow trace | Off; `--with effects` / `--with flow` | Compiler programs and traces are more expensive, language-dependent, and require generation/freshness handling. |
| Source excerpts | Bounded and selected | Avoid full-source duplication; preserve exact source digest and coordinates. |
| Full raw tree, full relation graph, Markdown export | Explicit output request | Disk capacity and agent reading budget are different constraints. |

The default-off choice sacrifices immediate checker findings. Make that loss prominent and provide the exact next command. It is not acceptable to market the syntax-only result as a complete defect audit.

Ref comparison follows the same rule: syntax by default, with explicit `--with checks,imports,history` selections propagated symmetrically into side loading. The current compare service eagerly collects portable checks, graphs and history, so retaining its isolation/ref machinery requires changing that provider orchestration. Snapshot compare remains offline; a gate does not itself request missing analysis. ([S08]:137–139; [S09]:281–285, 327–330)

## 2.7 Machine consumption, budgets, and errors

One stdout response per command in JSON mode; no banners, progress, cache warnings, summaries, or provider output outside it. Diagnostics are structured in that response and may be summarized on stderr. Format defaults to text; `--format json` explicitly selects machine output, with no implicit TTY-based schema switch. Progress defaults to `never`; `--progress auto|always|never` controls throttled stderr progress. While stdout remains writable, it must parse even when a provider fails after partial useful results. A broken pipe makes a complete document impossible: stop quietly, use the documented I/O outcome (exit 4), and do not claim successful complete output.

Use `--limit` for returned top-level items and `--max-bytes` for the UTF-8 byte budget of the rendered response, including envelope, warnings and final newline. Proposed default: 10 items and 16 KiB. Reject values below the documented envelope minimum before analysis; `--limit 0` means metadata/coverage only, and negatives are invalid. Whole cards/evidence groups may be omitted, never half a JSON object or a detached claim without its citation. Always return total, returned, omitted and nullable `next_cursor`; issue a cursor only for saved evidence under §4.3. Formats use the same ordered semantic selection, but encoding size may change how many complete rows fit; report that difference. If a single requested item cannot fit, return a named item-too-large result with a narrower query when possible, a sufficient larger budget, or an artifact-reference recovery.

A byte budget is exact; a token count depends on a tokenizer. Runtime can report an estimate only when its tokenizer is named. Evaluate tokens with one pinned tokenizer, and count stdout, stderr captured by the agent, artifacts opened, follow-up source reads, and repeated boilerplate. Do not claim a universal four-bytes-per-token guarantee.

| Exit | Proposed meaning | Required behavior |
| --- | --- | --- |
| 0 | Requested evidence response completed | May contain metric candidates, diagnostics, or a valid `assumed` flow outcome; optional unrequested providers do not make it fail. |
| 1 | Explicit diagnostic gate failed | Only a declared policy over complete comparable diagnostics; never a metric-score threshold. |
| 2 | Invalid CLI input, unknown schema, unresolved/ambiguous selector | Structured error in JSON mode; candidates or correction guidance where useful; no expensive scan before basic validation. |
| 3 | A requested analysis is incomplete/unavailable | Return useful partial evidence and precise missing coverage; uncertain diagnostic matching that prevents a gate decision also blocks a clean pass. |
| 4 | Execution, internal, or required artifact I/O failure | Name the failing operation; preserve prior files with atomic writes. Best-effort cache failure alone is only a warning. |
| 5 | Stale source, incompatible source attachment, or stale provider generation | Do not merge results; explain exactly what must be refreshed. |
| 130 | Interrupted | Cancel child work; mark any saved partial evidence incomplete; no successful-completion marker. |

When several conditions occur, interruption wins; fatal execution/I/O then stale then invalid/incompatible request then incomplete required coverage then policy failure then success is the reported process outcome. Validation errors should normally be discovered before execution, so mixed invalid-input/runtime cases should be rare. A per-provider status array preserves the full detail regardless of the single exit code.

# 3. Leverage: alternatives, removals, and selected direction

## 3.1 Three coherent approaches

The following comparison is a design judgment against this mission, not a benchmark of competing products.

| Approach | Fit for the agent workflow | Cost and rejection/selection |
| --- | --- | --- |
| **A. Repair the existing reporter**: keep commands/artifacts, add flags, improve templates and filters | Quickly fixes paths, limits, stdout and wording. Familiar to current callers. Still repeats scans, preserves two ranking stories and keeps evidence behind unrelated surfaces. | **Use only for the immediate repair milestone.** As the long-term answer it accumulates options around the wrong boundary. |
| **B. Shared evidence snapshots and scoped queries**: thin CLI over existing providers, canonical records, bounded views, optional enrichment | Best fit for repository → folder → file → symbol investigation and before/after verification. Gives determinism, reusable evidence, named missingness, and small outputs without changing analyzer semantics wholesale. | **Selected.** Requires a real contract and intentional command break; can ship in slices and use ordinary JSON files and current caches. |
| **C. Persistent universal code graph / agent server**: always-on index, query language, broad semantic model, possibly an MCP service | Powerful long-running cross-repository questions, but merges uncertain dependency and dataflow semantics too early and turns a personal CLI into infrastructure. | **Defer.** Memory, invalidation, migration, service lifetime and schema complexity are disproportionate before the local evidence workflow works. A later adapter can consume the same snapshots. |

Task-specific criteria favor B: source-grounded correctness, visible coverage, progressive scope, latency control, stable machine use, simple ownership, reuse of existing providers, and straightforward refactor verification. A wins immediate delivery speed; C may eventually win interactive cross-query throughput. Neither advantage compensates for their respective structural limitations today.

## 3.2 Twelve distinct improvement ideas

| Idea | Structural change or removal | Decision |
| --- | --- | --- |
| Capture once, query many scopes | Move scanning out of rendering; snapshots become an input to views | **Build**, central architectural change. |
| Uniform subject/selector model | One resolver for repository/folder/file/symbol/source span | **Build**, replace extra report verbs. |
| Evidence and diagnostics as typed records | Separate measurements, findings from checkers, and proposed work | **Build**, removes count-derived allegations. |
| Category-aware investigation | Keep test/docs/generated context but choose relevant refactor queues | **Build**, replace blind path-score multipliers. |
| Named lanes with explicit triggers | Raw values and reason codes replace mixed max-normalized severity | **Build**, delete universal quality score. |
| Source-bound provider enrichment | Expensive providers run explicitly and attach only to verified inputs | **Build**, removes eager whole-root work from each zoom step. |
| One bounded output view | Return the selected evidence once; export formats explicitly | **Build**, remove default nine-artifact fan-out. |
| Portable locations and stable matching material | Separate absolute locators, source positions, IDs, and cross-run matching | **Build**, remove rank IDs and pseudo-path parsing. |
| Evidence-backed next question | Cite the actual witness/import/test and unresolved assumption | **Build**, remove generic per-row agent prompts and “safe first patch.” |
| Coverage-aware compare | Match identities and like-for-like populations; expose losses of analysis | **Build**, remove misleading global better/worse totals. |
| Local instruction context | Cite applicability and declared scripts; structured rules only if explicit | **Build context; explore rule packs; avoid automatic prose-policy verdicts.** |
| Task-based evaluation | Blinded utility/precision plus exact adversarial fixtures and cost ledger | **Build**, replaces output-volume or metric-reduction success proxies. |

These are not twelve new default sections. Several eliminate output, and others are requested only when they answer the next investigation question.

## 3.3 What primary sources contribute

The external research supports contract decisions, not claims that importing another product's architecture automatically makes Srcly better.

- **SARIF 2.1.0:** its physical/logical locations, result fingerprints, invocation status, and baseline states are useful vocabulary for location, identity, and comparison. Its baseline-state semantics also require complete matching when that state is asserted. Adopt those lessons in a smaller native contract; do not make SARIF the internal representation of folders, metrics, incomplete flow, and work queues. An export adapter can come later. ([E01])
- **CodeQL CLI:** the official workflow separates database creation from query analysis, demonstrating the practical value of reusable analysis inputs. Its output documentation also distinguishes fixed SARIF versions from a changing “latest” format and preserves related locations/path evidence. Borrow the acquisition/query separation and explicit output versioning, not the cost of a full CodeQL database system. ([E02], [E03], [E09])
- **Semgrep CLI:** explicit baseline commits, trace output, context/resource limits, and distinct execution/findings exit behavior are relevant. Its baseline option has documented repository/worktree constraints; it is not a drop-in model for Srcly's dirty-working-tree comparison. Use explicit inputs and honest bounded output without assuming all baseline workflows have equivalent semantics. ([E04])
- **Ruff:** published exit codes distinguish a clean result, findings, and abnormal termination. Srcly should likewise separate result content from tool failure, while retaining richer codes for its partial and stale evidence states. Tool-level error severity remains the tool's claim. ([E05])
- **SCIP source contract:** repository-relative canonical paths, separate symbol/display identity, and explicit position encodings are strong precedents. Srcly should borrow those invariants without promising full SCIP-grade symbol resolution or introducing a second universal index. ([E06])
- **Git status porcelain:** documented machine-oriented status formats distinguish staged/unstaged and submodule states; NUL-separated filenames avoid whitespace ambiguity. Capture that state alongside content digests and sort records explicitly; status alone does not prove source identity. ([E07])
- **uv tool documentation:** version-pinned tool invocation and project execution are distinct. Baseline evaluation should use the checked-out server and its locked environment, not infer imported source provenance from whichever installed distribution prints a version. ([E08])

No external product was installed or benchmarked. The documentation was checked directly; external comparison claims are limited to the cited behavior.

# 4. Correctness and craft

## 4.1 High-value counterexamples

The companion JSON provides 25 exact, data-only cases. They are **proposed fixtures**, not test results. The source-derived behavior and proposed oracle are distinct fields. The following examples explain why these cases matter.

### A. A score changes because a peer appears

For a single max-normalized metric, file A with complexity 10 and peer maximum 20 scores 0.5. Adding an unrelated file of complexity 100 changes A to 0.1 without changing A's source. In a weighted mean the effect depends on the other measured inputs, but the same coupling remains. A displayed percentile or rank can legitimately be cohort-relative; a severity/gate must not quietly pretend otherwise. ([S02]:297–328)

### B. Missing measurements improve apparent rank

With equal weights and metric maxima 10/10, node A measures `(10, 0)` and scores 0.5; node B measures `(10, null)` and scores 1.0. The arithmetic correctly treats measured zero as evidence and excludes N/A, but comparing A and B as a common quality severity rewards missing information. The fix is not to change null to zero. It is to report coverage and avoid that cross-support composite. ([S02]:306–328; [S30])

### C. Zero becomes indistinguishable from absent evidence

Even though zero contributed to A's score, `_metrics_subset` omits it. Its emitted evidence may therefore look identical to B's on the missing field while their scores differ. A contract must preserve zero and null, including the denominator used by any explanatory calculation. ([S02]:732–738)

### D. A vanished measurement looks like successful refactoring

Before: one modified file with max complexity 12. After: the file still exists but parsing failed, so complexity is null. Correct result: `not-comparable`, delta null, coverage loss 1. Current max/mean summary logic can call this `better` with delta −12. The fixture must distinguish this from a file deletion. ([S10]:254–275)

### E. A folder looks harmless because it has no direct score

Construct a root with six documentation files that each have positive file scores and one source folder containing the highest-ranked code file. With `tree_top=6`, all six direct files can be retained and the source folder omitted. A folder query should show descendant evidence, with explicit omissions, rather than a fake zero folder score. ([S02]:398–441)

### F. Mean-of-means changes the question

One file has one function with mean complexity 20; another has nine functions with mean 2. A file mean gives 11; a function-population mean gives 3.8. Both are computable statistics, but they answer different questions. The catalog says folders weight by function count; compare must either implement that definition or name a different statistic explicitly. ([S03], [S04], [S10])

### G. A metadata fingerprint misses changed bytes

Replace a file's contents with different bytes of the same length and restore its mtime. Analysis and graph metadata keys can remain unchanged; changing an alias configuration alone can also leave the graph signature unchanged. A fingerprint is an optimization unless its input closure and guarantees are stated. This review did not execute the mutation on the repository. ([S06], [S17], [S23])

### H. A stable generation refers to stale source

An engine session can have generation 1 and stale source; a new session can also begin at generation 1. Therefore `(generation=1)` is neither a content identity nor a globally unique session key. Content revalidation and session/build identity must accompany it. ([S20], [S21], [S22], [S23])

### I. One source line contains two scopes

Two callbacks on the same line are different symbols. A path-plus-start-line key collides. Retain byte spans/qualified identities, support duplicate names, and return ambiguity instead of the first plausible node. This applies to evaluation as well as the CLI. ([S37]: `node_id`, `build_strata`)

### J. A healthy response is destroyed by an optional cache failure

Make checker/history collection succeed, then deny cache writes. JSON stdout must still be exactly one parseable response and exit 0 if the requested analysis succeeded. The warning is diagnostic metadata and optionally stderr. Required snapshot-write failure is different: it returns exit 4 and does not claim a saved artifact. ([S06], [S13], [S24])

## 4.2 Important distinctions to preserve

| Easily conflated concepts | Required distinction |
| --- | --- |
| Metric / defect | A metric suggests where to inspect; a diagnostic is a tool-reported rule result; a proven defect needs supporting reasoning or execution. |
| Zero / null / missing object | Measured zero; unavailable measurement with reason; and unrequested/unsupported section are distinct states. |
| Empty query / complete clean analysis | A scoped query can have no matching rows while the repository has unmeasured files. |
| Display truncation / analysis incompleteness | A top-K view can be complete as a query even when it omits rows; a timed-out provider is incomplete evidence. |
| File addition/removal / numeric zero | Lifecycle has no corresponding measured value on the absent side. |
| Import / runtime call / test assertion | Distinct relations with different confidence and evidence. |
| Maximum witness / whole-file explanation | A witness identifies one function carrying the max, not all reasons a file is hard to change. |
| Package version / analyzer source | A distribution banner can disagree with imported checkout code. |
| Git HEAD / worktree contents | Dirty and untracked inputs require their own manifest. |
| Engine generation / source freshness | Native generation is session-scoped, and metadata hashes have limits. |
| Same serialized meaning / identical runtime metadata | Semantic payload can be deterministic while elapsed time and invocation timestamp vary. |
| No match / policy compliance | A lexical search proves no match in its analyzed scope, not a semantic convention. |

## 4.3 Budget and pagination refinements

A cursor is only issued for a **complete saved fact set**: an existing saved snapshot, or a derived snapshot written with `--save`. The saved facts may include partial analysis; preservation does not imply full measurement coverage. A cursor binds schema, snapshot/derived-evidence digest, normalized selection, sort order, and last stable key. Changing source, provider result, filter, or ordering invalidates it. Changing format/page size or relocating an unchanged root does not invalidate a pure-query cursor. Pure `inspect` pagination does not rerun providers.

If an unsaved `audit` or transient `inspect --with` view omits rows, return omitted counts and a replay command with `--save`; do not issue a cursor that could later recreate different evidence. Redirecting a bounded response to a file is not equivalent to saving its complete snapshot. Output truncation alone remains a successful bounded view; explicitly requested provider failure remains exit 3.

Avoid recording a response's own byte length inside the bytes being counted. The renderer enforces the serialized UTF-8 cap externally. An export manifest may record completed sibling files' exact byte lengths and hashes, but should exclude itself from self-size claims. This directly avoids repeating the current manifest defect.

## 4.4 Baseline-based evaluation

The complete protocol is in the implementation plan. Its essential design is:

1. **Freeze the tool and corpus independently.** Baseline analyzer/source is the exact 1.8.0 commit, with locked Python/JS dependencies and full imported-source identity. Candidate runs use their own fixed commit. Corpus roots are immutable content manifests, with history cutoffs and configuration locked.
2. **Compare three workflows:** current report/explain/compare; repaired reporter only; snapshot/inspect design. Comparing only broken output with polished output would overstate architectural benefit.
3. **Evaluate tasks:** locate useful refactor targets, identify folder boundaries, explain one symbol's risks, find related tests, detect omitted analysis, and verify a behavior-preserving change. Include tasks where the correct answer is “insufficient evidence” or “no refactor warranted.”
4. **Measure separate outcomes:** precision of returned inspection candidates; diagnostic/source-citation precision; unsupported-claim rate; omitted-coverage recognition; useful distinct targets per 1,000 tokens; time to first useful answer; cold/warm/end-to-end latency; peak memory; and output/artifact bytes.
5. **Use source-grounded judgments.** Blind presentation labels for paired reviews; use an independent reviewer or adjudicate disagreements explicitly. Do not require outside customers or a statistically grand study before shipping owner-requested improvements.
6. **Keep exact gates and exploratory goals separate.** JSON parseability, source-location validity, null handling, determinism, and no stale mixing are hard gates. Utility/latency targets are provisional engineering targets until measured.

Representative corpus: this exact Srcly baseline; the existing pilot's React/TSX, Python-heavy, mixed Swift/JS, and large explorEDA roots once their recorded short refs are resolved to full commits; a small conventional Python service; and a synthetic adversarial fixture repository. The pilot's four historical runs are evidence about a previous evaluation, not new measured results. A repository that cannot be retrieved at the intended immutable ref is marked unavailable rather than silently replaced with current main. ([S36])

# 5. Implementation direction

## 5.1 Shippable sequence

| Milestone | Useful deliverable | Main dependency |
| --- | --- | --- |
| **M0: Repair the current contract** | Clean stdout under failure; null-safe compare; root-relative explain; truthful refresh/limits/artifact references | Current modules and targeted regression tests. |
| **M1: Snapshot and query foundation** | Typed schema, source/subject IDs, save/read validation, basic `audit` and `inspect` without duplicate artifacts | M0; existing analyzer/model adapters. |
| **M2: Honest acquisition and coverage** | Byte-bound syntax inputs, category/context records, explicit parse/fallback status, provider planning and invalidation | M1; discovery/analyzer entrypoint changes. |
| **M3: Concise scoped workflow** | Deterministic lanes, folder/symbol queries, budgets/cursors, prepared migration | M1–M2; fixture-based output review. |
| **M4: Targeted supporting evidence** | Actual diagnostics, history, imports, related tests, provider coverage and provenance; old report verbs can then be retired | M2–M3; current checker/dependency services and replacement acceptance. |
| **M5: On-demand flow/effects** | Native outcomes/witnesses with source/build/session validity checks | M2–M4; generated-contract pipeline only where fields change. |
| **M6: Verification compare** | Snapshot/ref comparison, matching diagnostics, paired metric populations and coverage transitions | M1–M4; reuse current ref/rename machinery. M5 is optional for flow comparison. |
| **M7: Evidence-based release** | Frozen-corpus task evaluation, package smoke, docs/skill updates and removal of obsolete output paths | Tests accompany every earlier milestone; this consolidates release evidence. |

Each milestone has actual modules, proposed contracts, test commands, acceptance conditions, risks, and non-goals in [implementation-plan.md](implementation-plan.md). The recommendations file maps stable IDs to these milestones and supplies a craft ledger of concrete edge cases.

## 5.2 Breaking changes worth making

- Consolidate `scan`, `report`, `hotspots`, and `explain` into `audit`/`inspect` and explicit export views after the replacement is usable.
- Replace the artifact-v1 findings schema with a versioned snapshot/response schema; do not silently reinterpret the old queue as diagnostics.
- Remove universal high/medium/low metric priority and metric-based `--fail-on`.
- Default to syntax-only acquisition; checks/history/graphs/flow are explicit provider requests.
- Standardize portable paths and structured symbol identities; external consumers must stop parsing `::` pseudo-paths and ordinal finding IDs.
- Remove automatic action-plan/skill/catalog duplication per scan; provide catalog/help and a single maintained skill.
- Replace global “better/worse” compare summaries with descriptive movement and a separate explicit diagnostic gate, if requested.

Make these changes at documented replacement gates: retire old report verbs after M4 provides their requested-evidence paths, and replace ref compare after M6 passes its own contract checks. Do not keep indefinitely supported modes. Existing UI consumers of `Node`, the metric catalog, and dataflow should keep their current native data until deliberately migrated; the CLI snapshot layer is an adapter over them, not a reason to rewrite the UI.

## 5.3 Risks and explicit non-goals

The largest implementation risks are source/provenance correctness across provider inputs, category misclassification, symbol identity under ambiguous syntax, and accidental scope reduction that loses outside callers. Byte hashing and immutable evidence cost I/O/storage; measure that against repeated scans rather than assuming it is free. Dynamic checker configuration can depend on inputs Srcly cannot enumerate; record `input_closure=unknown` instead of claiming complete reproducibility. Live before/after hash equality is revalidation, not a transaction that excludes intermediate edits/reverts.

Non-goals: automatic refactoring, whole-program proof of safety or purity, executing repository tests by default, generating custom project test commands from prose, exhaustive cross-language call graphs, a universal graph database, an always-running server, remote uploads, team dashboards, CI policy administration, compatibility layers for every old artifact, or a visual redesign. None is necessary to deliver this workflow.

## 5.4 Open questions and decisions that can proceed

No missing source blocks the audit or the first implementation milestones. The following are decisions to tune during implementation, not requests to postpone work:

- Which seed thresholds produce the most useful first ten candidates on the frozen owner corpus? Start with the declared conservative triggers and record their version.
- Should the owner prefer checks in a saved named preset? Default remains explicit; a local preset can opt in without changing the base contract.
- How much of each provider's dynamic input closure can be captured economically? Unsupported guarantees must remain visible.
- Is one JSON snapshot sufficient for the largest practical repository? Start there, measure parse/load cost, and add a streamed/indexed representation only if the measured workload needs it.
- Is diagnostic SARIF export useful enough to prioritize after the native contract? It is deliberately deferred, not an internal architecture prerequisite.

## Final access and verification statement

**Access:** exact baseline source was readable and the access check passed. **Files read:** all required reading-route files and directories, plus the supporting modules/tests listed with immutable blob hashes in [source-inventory.json](evidence/source-inventory.json). **Checked:** source control flow, contracts, test assertions, historical research, and current primary external documentation; produced artifacts were checked for structural consistency. **Proposed, not run:** CLI redesign, regression fixtures, benchmarks, test commands, and all repository changes. **Deliverables:** this report, the buildable implementation plan, stable recommendation dispositions/craft ledger, data-only contract fixtures, and source inventory, together in the downloadable ZIP. **Unresolved:** measured runtime/utility results and the tuning questions immediately above; no claim of an executed product benchmark or safe refactor proof.

# Evidence and sources

Source references S00–S59 below always refer to the fixed commit. The source inventory records all 103 reviewed files and their exact read extents; the index below names the principal cited sources. External references were checked on the review date. Repository conclusions are anchored in source and symbols, while thresholds/workflows are identified as proposals.

### Pinned repository sources

| Ref | Repository path | Reviewed subject |
| --- | --- | --- |
| [S00] | `README.md` | Documented entry points and package workflow |
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
| [S12] | `server/app/routers/files.py` | Metric and source marker API |
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
| [S27] | `server/tests/test_metric_trust.py` | Metric applicability, witnesses and null invariants |
| [S28] | `server/app/services/scan_workers.py` | Worker isolation, timeout and cancellation bounds |
| [S29] | `server/tests/test_ranking_parity.py` | Single-metric file/function ranking parity |
| [S30] | `server/tests/test_reporting.py` | Reporting contract and measured-zero scoring tests |
| [S31] | `server/tests/test_compare_diff.py` | Existing compare behavior assertions |
| [S32] | `server/tests/test_dataflow_outcomes.py` | Fake-engine named-outcome fixtures |
| [S33] | `server/app/services/python/python_analysis.py` | Python syntax metrics, spans and comment accounting |
| [S34] | `server/app/services/typescript/typescript_analysis.py` | TS/JS syntax metrics, spans and comment accounting |
| [S35] | `server/app/services/analysis_types.py` | Language classification and analysis records |
| [S36] | `docs/research/metric-pilot-2026-10/README.md` | Pilot methods, results, limitations and corpus refs |
| [S37] | `server/scripts/evaluate_metric_portfolio.py` | Evaluation strata, identity and overlap computations |
| [S38] | `docs/intent/metric-trust/implementation-plan.md` | Earlier metric-trust implementation record |
| [S39] | `docs/intent/metric-portfolio/implementation-plan.md` | Earlier metric-portfolio implementation record |
| [S40] | `docs/intent/metric-system-overhaul/implementation-plan.md` | Later implemented metric-system milestones |
| [S41] | `docs/analysis/2026-05-03-product-grid-prod-run-retrospective.md` | Historical production-run observations and suggestions |
| [S42] | `docs/CODE_MAP.md` | Required headless/dataflow sections and supporting index |
| [S43] | `server/tests/test_findings.py` | Checker outcomes, planning, coverage and overlays |
| [S44] | `server/app/services/deps/common.py` | Dependency file discovery and test-path hints |
| [S45] | `engine/src/srcly/session.ts` | Native session/program generation and stale state |
| [S46] | `server/app/services/findings/builtin_ts.py` | Built-in TS checks and unreadable-source behavior |
| [S47] | `docs/research/metric-pilot-2026-10/cases.tsv` | Full structured pilot case table |
| [S48] | `server/tests/test_analysis_cache.py` | Analysis-cache invariants |
| [S49] | `server/tests/test_file_discovery.py` | Discovery and ignore behavior fixtures |
| [S50] | `server/tests/test_scan_error_handling.py` | Scan failure handling fixtures |
| [S51] | `server/pyproject.toml` | Python package metadata, dependencies and tooling |
| [S52] | `server/app/config.py` | Existing structured local configuration |
| [S53] | `engine/src/srcly/selection.ts` | Native one-based UTF-16 selection spans |
| [S54] | `engine/package.json` | Verified engine pnpm script names |
| [S55] | `client/package.json` | Verified client pnpm script names |
| [S56] | `build-srcly.sh` | Package build and dependency setup pathway |
| [S57] | `server/app/services/findings/overlay.py` | Per-file diagnostic counts and failure coverage |
| [S58] | `server/tests/test_large_and_unparsed_files.py` | Fallback size/read-cap tests |
| [S59] | `client/src/utils/hotSpotRanking.ts` | Verified rankHotSpots example target and UI ordering |

### Primary external sources

Current documentation/source was checked directly during the review. These are design precedents, not measured product comparisons.

| Ref | Primary source | Relevant scope |
| --- | --- | --- |
| [E01] | SARIF 2.1.0 specification, OASIS | Locations, fingerprints, invocation status and baseline-state completeness |
| [E02] | CodeQL CLI workflow, GitHub | Separate database creation and reusable query analysis |
| [E03] | CodeQL database analyze manual, GitHub | Fixed output versions, limits and analysis invocation |
| [E04] | Semgrep CLI reference | Baseline restrictions, traces, resource limits and exit behavior |
| [E05] | Ruff linter documentation | Separate findings and abnormal execution exit codes |
| [E06] | SCIP protobuf source contract | Canonical paths, symbol identity and position encodings |
| [E07] | Git status manual | Porcelain status, dirty/submodule states and NUL filenames |
| [E08] | uv tools guide | Pinned tool environments versus project execution |
| [E09] | CodeQL SARIF output, GitHub | Related locations, fingerprints and path evidence |

[S00]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/README.md
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
[S12]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/routers/files.py
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
[S27]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_metric_trust.py
[S28]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/scan_workers.py
[S29]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_ranking_parity.py
[S30]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_reporting.py
[S31]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_compare_diff.py
[S32]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_dataflow_outcomes.py
[S33]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/python/python_analysis.py
[S34]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/typescript/typescript_analysis.py
[S35]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/analysis_types.py
[S36]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/research/metric-pilot-2026-10/README.md
[S37]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/scripts/evaluate_metric_portfolio.py
[S38]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/intent/metric-trust/implementation-plan.md
[S39]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/intent/metric-portfolio/implementation-plan.md
[S40]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/intent/metric-system-overhaul/implementation-plan.md
[S41]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/analysis/2026-05-03-product-grid-prod-run-retrospective.md
[S42]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/CODE_MAP.md
[S43]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_findings.py
[S44]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/deps/common.py
[S45]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/engine/src/srcly/session.ts
[S46]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/findings/builtin_ts.py
[S47]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/docs/research/metric-pilot-2026-10/cases.tsv
[S48]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_analysis_cache.py
[S49]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_file_discovery.py
[S50]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_scan_error_handling.py
[S51]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/pyproject.toml
[S52]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/config.py
[S53]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/engine/src/srcly/selection.ts
[S54]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/engine/package.json
[S55]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/client/package.json
[S56]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/build-srcly.sh
[S57]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/app/services/findings/overlay.py
[S58]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/server/tests/test_large_and_unparsed_files.py
[S59]: https://github.com/byronwall/srcly/blob/aa56155c9268ce9da3a54180cb6a77ae6635d190/client/src/utils/hotSpotRanking.ts
[E01]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html
[E02]: https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-cli
[E03]: https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-cli-manual/database-analyze
[E04]: https://docs.semgrep.dev/cli-reference
[E05]: https://docs.astral.sh/ruff/linter/
[E06]: https://github.com/scip-code/scip/blob/main/scip.proto
[E07]: https://git-scm.com/docs/git-status
[E08]: https://docs.astral.sh/uv/guides/tools/
[E09]: https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-cli/sarif-output
