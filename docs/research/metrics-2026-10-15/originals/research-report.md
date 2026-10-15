# Srcly: distinctive code-quality signals and explorer research

**Baseline:** `byronwall/srcly` at `83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4`  
**Research date:** 2026-10-15  
**Assignment:** read-only research and planning for Codex; no application integration or initiative artifact creation.

## Executive recommendation

**Build a better evidence explorer before building a larger metric catalog.** Srcly already has enough inexpensive structural data to be useful, but its populations, availability states and ranking paths are inconsistent. The strongest first improvement is not another complexity number: it is making every displayed number mean what its label, scope and denominator claim.

The source inventory reconciles **32 fields in the `Metrics` API model, 27 report definitions and 22 selector entries**. Every field receives a disposition: **12 change, 16 demote, 3 keep, 1 investigate**. Demotion means preserving useful compatible data in a neutral diagnostic catalog, not deleting it immediately. The three keeps are operational/context fields, not a judgment that only three measurements have value. Exact records, profile weights and code evidence are in `current-metrics.json`.

The recommended compact portfolio has two stages:

| Stage | Default evidence | Why it earns the space |
|---|---|---|
| Corrected source-only core | Real-function CCN, worst-function witness, size context and availability; nesting/arity in detail. | Identifies difficult control flow and inspection scope without pretending size or missing analysis is a quality verdict. |
| Conditional additions after proof | Recent change frequency; dependency cycle witnesses; clone families. | Answer different questions: why act now, what boundary is entangled, and what other logic must change together. |
| Optional imported evidence | Relevant typed/static findings and matched coverage; targeted mutation evidence later. | Reveal concrete diagnostics, unexecuted choices or weak assertions that source counters cannot supply. |
| Experimental/derived diagnostics | Cognitive complexity; CRAP component lens; co-change peers. | Must demonstrate useful decisions beyond existing components and their cost. None earns an extra default score merely by having a familiar name. |

Do not combine all these into a “health” number. **Importance, structural difficulty, architectural entanglement, repeated logic and test evidence are different axes.** A small flat function may still be in a dependency cycle; a complex function may be stable and well tested; a frequently changed file may be healthy but important. The interface should reveal those distinctions.

The most consequential baseline findings are:

1. File/folder `complexity` is correctly intended as **maximum recorded scope CCN**, not README's stale file average. However, executable functions are still mixed with classes, objects, type declarations and display scopes.
2. **Ten TS/TSX metrics never roll up to folders**, and most do not exist on scopes. Their zero defaults look like measurements despite report definitions claiming broader support.
3. Browser and report scores disagree by construction. The report omits zero-valued metrics from its weight denominator, so adding a small positive “risk” value can **lower** a score.
4. The source map mixes nonblank file lines with physical scope spans; some body/overlap cases can violate treemap area conservation.
5. The current dependency view already provides TS/Python hierarchy and symbol-focused exploration. Reuse it, but retain original import evidence before claiming runtime cycle semantics.
6. CRAP originated with **Alberto Savoia and Bob Evans**, not Robert C. Martin. It is a deterministic complexity/coverage interaction with an informal threshold history, not a demonstrated independent predictor for Srcly. [S01](https://testing.googleblog.com/2011/02/this-code-is-crap.html), [S02](https://www.artima.com/weblogs/viewpost.jsp?thread=215899)

**First cut line:** semantic correctness and unavailable data (**I01**), one honest UI/report contract (**I02**), then the three-repository portfolio pilot (**I03**). After that, add one new evidence workflow—bounded Git activity is the recommended first prioritization proof—not all candidate features at once. Stable decisions and independently rejectable initiative shapes appear in `recommendations.md`.

## 1. Evidence, access gates and snapshot limits

**GO for an exhaustive static inventory.** The attached manifest identifies the repository and requested baseline, the necessary metric source is readable, and external primary-source research was available. The packet is authoritative for this assignment's baseline; the Git commit object was not independently authenticated through a checkout.

The packet contains **164 selected tracked files**. It explicitly excludes dependencies, build outputs, credentials and unrelated files; it is not a runnable checkout. Source hashes and path/line offsets are recorded in `reading-manifest.json`. GitHub links in this report use the pinned commit and the packet's local source-line numbering. A linked page being unindexed does not override the attached code.

The required reading route was covered: `AGENTS.md`, `README.md`, `DESIGN.md`, `docs/CODE_MAP.md`, package manifests; API/dataclasses; analyzer dispatch, propagation, aggregation and fallback; all five custom analyzer files; reporting, custom CLI metric selection; selector/explorer/treemap/colors/modal/filter/tooltip paths; current dependency services and initiative documents; and the named complexity, reporting, synthetic-scope, TS/TSX, Python, body-LOC and dependency tests. Prior analysis notes were not used as proof that present code behaves a particular way.

`client/src/components/DependencyGraph.tsx` is not in the manifest. The current `Treemap.tsx` imports `client/src/viz/deps/DependencyView.tsx`; the initiative map records legacy retirement. This is a superseded reading-route name with readable replacement code, not an unreported audit gap. Some README/CODE_MAP/AGENTS instructions likewise refer to older routes or semantics; implementation is the authority.

**Evidence labels used throughout:** an *observed fact* is visible in the snapshot or primary documentation; an *inference* follows from that implementation but has not been reproduced in the running app; a *proposal* is a product/engineering choice awaiting proof. No repository tests, builds, scans, benchmark runs, installations, mutation runs or correlation studies were executed. Sandbox source parsing, arithmetic checks, document construction and deliverable validation are not application execution.

Consequential baseline entry points: [`server/app/models.py:4–54`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/models.py#L4-L54); [`server/app/services/reporting.py:31–115`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L31-L115); [`client/src/utils/metricsStore.tsx:49–72`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/metricsStore.tsx#L49-L72); [`client/src/components/Treemap.tsx:17–25`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/Treemap.tsx#L17-L25).


## 2. What the current pipeline actually does

### 2.1 Dispatch and support are narrower than the UI suggests

The metric dispatcher uses exact suffix checks for `.ts`, `.tsx`, `.py`, `.css`, `.scss`, `.md`, `.markdown` and `.ipynb`. JavaScript/JSX and additional TS extensions take the generic Lizard path rather than receiving the TS enrichments. Dependency extraction has broader JS/TS extension support, so graph availability does not imply metric availability. Successful generic/unsupported fallback is not distinguished from a genuinely supported zero for each field. [`server/app/services/analysis.py:895–927`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L895-L927); [`server/app/services/deps/typescript_deps.py:1–38`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/deps/typescript_deps.py#L1-L38)

| Analyzer family | File measure and executable analysis | Scope/support caveat |
|---|---|---|
| TS/TSX | Nonblank lines; custom decisions, comments and lexical TS/JSX counters. | Classes/types/objects and selected JSX structures become scopes alongside functions; scope lengths are physical spans. |
| Python | Nonblank lines; custom decisions, comments and import statements. | Classes/lambdas/functions are scopes; docstrings are not comment nodes; nested executable counts differ from top-level denominator. |
| Generic Lizard | Lizard NLOC, function CCN and available function parameters. | General file enrichments are often left at zero; syntax counting differs from custom analyzers. |
| CSS/SCSS | Nonblank file lines and rule-like structure. | Rules are display scopes; CCN is zero, and comments/nesting are not populated as the general metric names might suggest. |
| Markdown | Nonblank file lines, sections/blocks and raw data-URL matches. | Sections are not functions; repeated matches can occupy the same physical line. |
| Notebook | Nonblank cell source with virtual text coordinates, excluding outputs. | Code-cell source is not recursively analyzed as Python; cell containers with zero CCN are not tested methods. |

The custom parsers do not gate all values on a complete/error-free parse-tree check. File status `ok` therefore is not a guarantee of complete syntax support. Oversized files intentionally keep fallback metrics and do not increment `analysis_failed_count`. The fallback counter stops counting after its 32 MiB accounting limit; since it iterates whole lines, that is **not a hard per-read memory bound** for one pathological long line. These are support/provenance concerns, not evidence that the source itself is poor quality. [`server/app/services/typescript/typescript_analysis.py:16–27`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L16-L27); [`server/app/services/ipynb/ipynb_analysis.py:18–87`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/ipynb/ipynb_analysis.py#L18-L87); [`server/app/services/analysis.py:989–1071`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L989-L1071)

### 2.2 Executable populations and display populations are conflated

`is_synthetic_scope` excludes only imports. `attach_file_metrics` counts top-level non-import entries, and `convert_function` converts every entry to `type="function"`, dropping its original AST/display classification. Nested methods/functions are not counted by that file-level custom denominator. Scope metrics retain own CCN but leave `complexity_avg` and `function_count` at zero. Thus “mean per function” is not reliably a mean over every real executable function. [`server/app/services/analysis_types.py:4–36`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis_types.py#L4-L36); [`server/app/services/analysis.py:119–125`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L119-L125); [`server/app/services/analysis.py:207–251`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L207-L251); [`server/app/services/typescript/typescript_analysis.py:56–74`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L56-L74)

The repaired denominator must be specified before adding cognitive complexity, class cohesion, coverage or CRAP. Count genuine executable units once; keep classes, types, objects, imports, notebook cells, Markdown sections and treemap bodies available for navigation without treating them as equivalent observations.

The maximum-CCN change is a useful correction already present: `attach_file_metrics` takes the maximum across all descendant recorded scopes, and folders take the maximum of children. Preserve that behavior while correcting what a scope's CCN means. The current tree can partition decisions into non-executable object/JSX scopes; a file maximum of such pieces need not equal a canonical executable function's CCN. Scope-local decisions, descendant maxima and function-only distributions need separate names. [`server/app/services/analysis.py:254–270`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L254-L270); [`server/app/services/typescript/typescript_analysis.py:195–220`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L195-L220); [`server/app/services/typescript/typescript_analysis.py:280–318`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L280-L318)

### 2.3 Propagation gaps are confirmed, not hypothetical correlations

These ten fields are copied at file level but are absent from folder aggregation:

`tsx_nesting_depth`, `tsx_render_branching_count`, `tsx_react_use_effect_count`, `tsx_anonymous_handler_count`, `tsx_prop_count`, `ts_any_usage_count`, `ts_ignore_count`, `ts_import_coupling_count`, `tsx_hardcoded_string_volume`, `tsx_duplicated_string_count`.

Most are also absent from the per-scope dataclass and conversion. `ts_type_interface_count` is the exception wired to scopes; types/interfaces and exports are rolled up to folders. Adding zeros to a schema is not language/scope support. A valid near-term choice is explicitly **file-only** diagnostics instead of implementing all omitted rollups. [`server/app/services/analysis_types.py:4–70`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis_types.py#L4-L70); [`server/app/services/analysis.py:128–141`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L128-L141); [`server/app/services/analysis.py:207–225`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L207-L225); [`server/app/services/analysis.py:815–893`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L815-L893)

For counts, a folder sum is appropriate only when the underlying file occurrences are disjoint and the question is volume. Distinct import degree, clone families and dependency neighbors instead require identity unions. Depth requires max; ratios require component counts; quantiles require the distribution. Scope ancestors may contain the same evidence as descendants and must never be treated as disjoint additive observations.

### 2.4 Ranking is not one shared notion of priority

For a browser-selected metric set S, the current score is approximately:

`UI(n) = sum_m in S [badness_m(n) / max_peer badness_m]`

The only explicit inverted metric is comment density, using `1-density`. All nonfolder nodes are eligible—including files, real scopes, imports and body fragments—and maxima are calculated from the current Explorer input. Zoom/filter changes can change the reference set. Raw selected values are shown, but the `score` prop is not displayed as an explanation with contributions. [`client/src/components/Explorer.tsx:393–456`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/Explorer.tsx#L393-L456); [`client/src/components/HotSpotItem.tsx:1–105`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/HotSpotItem.tsx#L1-L105); [`client/src/utils/metricsStore.tsx:49–72`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/metricsStore.tsx#L49-L72)

The report instead computes:

`ReportRaw(n) = sum_positive_m [weight_m * value_m / cohort_max_m] / sum_positive_m weight_m`

The denominator excludes every value `<=0`, including supported measured zeros. **Illustrative arithmetic, not a scan result:** with equal weights and fixed peer maxima of 10 and 100, a node with values `(10, 0)` scores 1; changing the second value to 1 gives `(1 + .01)/2 = .505`. Increasing a nonnegative “badness” measure lowers the score. A support-aware denominator must be determined by applicability, not the sign of the observed value. [`server/app/services/reporting.py:251–313`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L251-L313)

Reports additionally apply path multipliers (focus 1.25, deprioritized 0.55), clamp to one, and label scores at 0.7/0.4 priority bands. These are relative prioritization policies, not empirically calibrated quality thresholds. Outlier maxima are established before path adjustment, so even deprioritized content can suppress another node's normalized contributions. The custom `hotspots --metric` route creates arbitrary equal-weight names without registry/type validation or inversion. Requesting comment density there does not reproduce the browser's “Low Comments” interpretation. [`server/app/services/reporting.py:680–685`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L680-L685); [`server/app/services/reporting.py:762–773`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L762-L773); [`server/app/run.py:319–350`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/run.py#L319-L350)

Finding categories use presence/precedence rules rather than the dominant normalized driver. A small import count can choose a coupling category even when complexity is the substantive concern. Finding IDs use output order; path/category deduplication is not stable semantic evidence identity and does not suppress parent/child restatements. Some reasons call any positive count “High.” Folder summaries have no direct ranked score and can hide an important descendant behind size-based pruning. All are inspectable implementation facts; the magnitude of real-world user impact remains unmeasured. [`server/app/services/reporting.py:316–397`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L316-L397); [`server/app/services/reporting.py:652–685`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L652-L685); [`server/app/services/reporting.py:730–741`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L730-L741)

### 2.5 Display can overstate confidence or change the cohort

Most color fields reuse `[0, 10, 50]` regardless of units, so 50 bytes and CCN 50 share the saturation rule. Comment density, TODO count and nesting use other hardcoded stops; depth brightening also changes color for equal values. These are visual design choices, not validated risk boundaries. The modal iterates only the selector registry, so five report metrics have no automatic modal entry; unsupported numeric zeros do have entries. [`client/src/viz/treemap/utils/colors.ts:19–72`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/viz/treemap/utils/colors.ts#L19-L72); [`client/src/components/CodeModal/MetricsSection.tsx:6–24`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/CodeModal/MetricsSection.tsx#L6-L24)

`filterTree` changes children without reaggregating parent metrics; `filterData` recomputes folder LOC but not other fields. Extension/large-file filters live in the treemap rather than a shared all-view cohort. Code-modal navigation updates selected-scope state while the metrics sidebar receives the original scope prop, creating a plausible stale-panel case that requires browser reproduction. These distinctions must be visible or eliminated, rather than presented as one synchronized truth. [`client/src/utils/dataProcessing.ts:31–159`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/dataProcessing.ts#L31-L159); [`client/src/components/Treemap.tsx:170–180`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/Treemap.tsx#L170-L180); [`client/src/components/CodeModal/CodeModal.tsx:189–202`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/CodeModal/CodeModal.tsx#L189-L202); [`client/src/components/CodeModal/MetricsSidebar.tsx:34–40`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/components/CodeModal/MetricsSidebar.tsx#L34-L40)

The backend calculates remaining physical lines using a union of child spans. However, when no backend body is added, the client may append a dummy containing the **entire parent LOC** rather than the remainder. Multiple Markdown matches on one line and overlapping display scopes create further conservation cases. Fixing a single fixture does not prove a consistent area measure. A source line/range must have one area owner while still being allowed in multiple evidence views. [`server/app/services/analysis.py:166–205`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L166-L205); [`client/src/viz/treemap/utils/tree.ts:6–64`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/viz/treemap/utils/tree.ts#L6-L64); [`server/app/services/markdown/markdown_analysis.py:313–394`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/markdown/markdown_analysis.py#L313-L394)


## 3. Complete current metric audit

The following is the full static portfolio, including fields absent from selectors. **R/S** means present in the report-definition registry / selector registry. All are API fields. A field's presence in `metrics.schema.json` does not mean every compact finding emits it: `_metrics_subset` retains only nonzero selected/profile values. Stock profiles and literal declared definitions are preserved in the JSON inventory.

The five report-only fields are `function_count`, `file_count`, `comment_lines`, `average_function_length` and `classes_count`. The five API fields absent from report definitions are `last_modified`, `gitignored_count`, `analysis_status`, `analysis_error` and `analysis_failed_count`.

Every numeric unsupported value currently defaults to zero. The entries below describe **actual observed propagation**, not what the registry's declared aggregation promises. Unless specifically stated, file counts are not recomputed from scope children, and folder aggregation trusts file values. Additional risks and complete per-layer anchors are in `current-metrics.json`.


### `loc` — CHANGE
**Kind:** size/context. **R/S:** yes / yes.

**File:** Custom TS, Python, CSS and Markdown count nonblank source lines, including comment-only lines. Notebooks count nonblank cell source, not JSON or outputs. Supported Lizard readers use Lizard NLOC. The no-reader fast path approximates Lizard NLOC by skipping blanks, //-leading lines and #word-like lines. Failure/oversize fallback counts nonblank lines until the 32 MiB accounting cutoff; this can be a lower bound and is not a hard per-line read bound. **Scope:** TS/Python/CSS/Markdown scopes usually use inclusive physical spans, including blanks/comments; synthetic imports count all import spans but point at one largest block; notebook cells use virtual nonblank lines. Lizard functions retain Lizard NLOC. **Folder:** Sum immediate file/folder values. This is not necessarily the sum of rendered leaf areas.

**Support and display:** Broad but non-comparable line measures; fallback may be a lower bound, not exact code LOC. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** How much source must be inspected, and what portion of the map does it occupy? **Overlap/limits:** Shares size information with bytes, function count and average length, but line range and physical payload answer different questions.

**Proposed disposition:** Separate nonblank/source-code/physical/display-area measures; preserve local spans; use union/exclusive attribution for area. Keep size as context, not an extra badness vote. (R01, R03, R06.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:16–27`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L16-L27); [`server/app/services/python/python_analysis.py:14–83`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L14-L83); [`server/app/services/analysis.py:166–205`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L166-L205); [`server/app/services/analysis.py:994–1035`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L994-L1035); [`client/src/viz/treemap/utils/tree.ts:6–64`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/viz/treemap/utils/tree.ts#L6-L64).


### `complexity` — CHANGE
**Kind:** structural heuristic. **R/S:** yes / yes.

**File:** Maximum CCN across every descendant scope, not an average. A no-scope file is zero. Generic Lizard yields function CCN; TS/Python custom walks use their own constructs and display-scope boundaries. **Scope:** Own stored CCN, not descendant maximum. TS/Python executable and several non-executable scopes start at one; decisions accrue to the innermost active display scope. CSS/Markdown/notebook scopes are zero. Synthetic bodies/imports are zero. **Folder:** Maximum child complexity. This preserves the worst recorded scope but does not count how many difficult functions exist.

**Support and display:** Lizard-supported languages and custom .ts/.tsx/.py; zero does not establish executable support in documents, CSS, notebooks or failures. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which executable function has the most branching, and where is its source evidence? **Overlap/limits:** Conceptually overlaps nesting, size and cognitive complexity. Equal CCN does not imply equal understandability; max loses distribution information.

**Proposed disposition:** Keep max with a witness, but first classify real functions and preserve executable ownership across objects/JSX containers. Publish analyzer-specific decision rules; test switches, default arguments, optional chains, elif, comprehensions and module logic. (R01, R04, R06.)

Evidence: [`server/app/services/analysis.py:254–270`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L254-L270); [`server/app/services/typescript/typescript_analysis.py:195–220`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L195-L220); [`server/app/services/typescript/typescript_analysis.py:280–348`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L280-L348); [`server/app/services/python/python_analysis.py:131–228`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L131-L228).


### `complexity_avg` — DEMOTE
**Kind:** structural summary. **R/S:** yes / yes.

**File:** Analyzer mean: TS/Python average only top-level non-import display scopes, including classes/objects/types; nested methods/functions are not the denominator. Lizard's mean follows its function list. **Scope:** Not assigned; default zero, even when own complexity is positive. **Folder:** Function-count-weighted child mean; therefore inherits the incorrect/mixed custom denominator.

**Support and display:** Meaningful only with a declared, consistent population. Custom scope population is not real-function population. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Is branching widespread or concentrated in a few functions? **Overlap/limits:** Derived from the same CCN distribution as max. Averages can hide one extreme function and be lowered by adding trivial scopes.

**Proposed disposition:** Retain as diagnostic after denominator correction; prefer eligible count plus distribution/worst-function witness. Do not combine mean and max as independent default votes. (R04, R06, R09.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:56–60`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L56-L60); [`server/app/services/python/python_analysis.py:14–83`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L14-L83); [`server/app/services/analysis.py:862–893`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L862-L893).


### `function_count` — CHANGE
**Kind:** structure/context. **R/S:** yes / no.

**File:** Count of top-level function_list entries excluding origin_type imports only. TS/Python include non-function display scopes; nested methods/functions are not separately counted by this API field. CSS rules, Markdown sections and notebook cells can count. **Scope:** Default zero, not one and not recursive descendant count. **Folder:** Sum child counts.

**Support and display:** All analyzers supply a scope list, but the noun 'function' is not portable across those lists. API and report schema; not a selector/modal row. Custom CLI can request it; positive selected-profile values alone enter compact ranking evidence.

**Distinct question:** How many executable units contribute to this distribution? **Overlap/limits:** Closely linked to code size and average denominators, not automatically design risk.

**Proposed disposition:** Introduce separate executable_function_count and display_scope_count or a typed denominator; keep synthetic import exclusion. Do not merely add all descendants, which would count bodies/containers. (R01, R04.)

Evidence: [`server/app/services/analysis_types.py:30–36`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis_types.py#L30-L36); [`server/app/services/analysis.py:119–125`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L119-L125); [`server/app/services/typescript/typescript_analysis.py:280–298`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L280-L298).


### `last_modified` — KEEP
**Kind:** operational metadata. **R/S:** no / no.

**File:** Filesystem stat modification timestamp populated during tree construction, not Git commit time or change frequency. **Scope:** Default zero; scopes are not independently statted. **Folder:** Maximum timestamp of child nodes.

**Support and display:** Filesystem metadata for scanned files; timestamps can change on checkout, copy or generation. No selector, modal metric row or visible Explorer column in the inspected paths; raw API metadata.

**Distinct question:** When was the local file last modified? **Overlap/limits:** Not a substitute for Git recency/churn; can co-vary with generated artifacts.

**Proposed disposition:** Keep in a neutral provenance/details view with timestamp units; never label it a change-risk signal. (R02, R10.)

Evidence: [`server/app/services/analysis.py:1102–1198`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1102-L1198); [`server/app/services/analysis.py:872–879`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L872-L879).


### `gitignored_count` — CHANGE
**Kind:** operational metadata. **R/S:** no / no.

**File:** Discovery bookkeeping for ignored files, primarily assigned to containing folders rather than a quality property of retained files. **Scope:** Default zero. **Folder:** Ignored-file observations propagate to ancestor folders after metric aggregation; pruned directories need not be enumerated.

**Support and display:** Depends on discovery mode and pruning; not a complete census of all files hidden by Git. Explorer Gitignored column displays observed counts; not a hotspot/color selector or report definition.

**Distinct question:** What did this scan deliberately exclude? **Overlap/limits:** No conceptual quality dimension; useful denominator/exclusion explanation.

**Proposed disposition:** Keep, label as discovery-observed exclusions; report skipped categories separately and do not imply exhaustive ignored-file totals. (R02.)

Evidence: [`server/app/services/analysis.py:1201–1225`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1201-L1225); [`server/app/services/analysis.py:452–476`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L452-L476).


### `file_size` — DEMOTE
**Kind:** size/context. **R/S:** yes / yes.

**File:** Filesystem bytes, including comments, encoding overhead, notebook outputs and embedded data; available for fallback files. **Scope:** Default zero; no meaningful allocation of bytes to source scopes. **Folder:** Sum file bytes.

**Support and display:** Broad filesystem support; not a control-flow or source-maintainability measure. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which files have unusually large physical payloads? **Overlap/limits:** Often overlaps LOC; differs materially for notebooks, data URLs, generated/minified or non-code payloads.

**Proposed disposition:** Retain a bytes/asset-size lens with units and suitable scale; remove from general quality voting and do not compare file bytes with scope zeroes. (R06, R08.)

Evidence: [`server/app/services/analysis.py:1038–1045`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1038-L1045); [`server/app/services/analysis.py:1102–1198`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1102-L1198).


### `file_count` — KEEP
**Kind:** structure/context. **R/S:** yes / no.

**File:** One for analyzed/fallback retained files. **Scope:** Zero for scopes. **Folder:** Sum child file_count.

**Support and display:** Represents discovered retained scan population, not all repository files. Explorer File Count column and headless summaries; not a hotspot/color selector or modal registry row.

**Distinct question:** How many retained files make up this area? **Overlap/limits:** Size denominator; not inherently a responsibility or coupling defect.

**Proposed disposition:** Keep neutral navigation/context. Remove the schema implication that more files universally means more risk. (R02, R08.)

Evidence: [`server/app/services/analysis.py:119–125`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L119-L125); [`server/app/services/analysis.py:1038–1045`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1038-L1045).


### `comment_lines` — DEMOTE
**Kind:** documentation/context. **R/S:** yes / no.

**File:** TS/Python sum AST comment-node physical spans. Python docstrings are not counted. CSS/Markdown/notebooks and ordinary Lizard files do not populate this enrichment. **Scope:** TS/Python count comments in active ancestor scopes as well as the nearest scope; spans are inclusive. Generic Lizard usually has zero here. **Folder:** Sum child file comment_lines, not recursive scope sums.

**Support and display:** Custom .ts/.tsx/.py only; two comment nodes on one line can exceed unique comment-line count. API and report schema; not a selector/modal row or stock profile weight. It can be requested through custom CLI.

**Distinct question:** Where are comments present, and what counting convention was used? **Overlap/limits:** Overlaps LOC and density. More comments can document intent or merely repeat code.

**Proposed disposition:** Keep neutral counts only after deduplicating physical lines or relabeling comment-span count; distinguish docstrings and supported zero. (R02, R05.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:169–185`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L169-L185); [`server/app/services/python/python_analysis.py:85–131`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L85-L131).


### `comment_density` — DEMOTE
**Kind:** documentation/context. **R/S:** yes / yes.

**File:** comment_lines / file nloc, with zero for denominator zero. TS/Python denominator includes nonblank comment lines; generic enrichments default zero. **Scope:** comment_lines / scope nloc; scope nloc is often physical span, making file/scope densities incomparable. **Folder:** Sum file comment lines divided by summed LOC.

**Support and display:** Only as trustworthy as both components; can exceed one with overlapping comment-node spans. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Does this source contain comments worth inspecting, not is this code under-documented? **Overlap/limits:** Deterministic transformation of two counts, not independent evidence of readability or public-API documentation.

**Proposed disposition:** Remove 'Low Comments' inversion and automatic risk coloring. Preserve neutral descriptive density with an explicit denominator, never prescribe a target percentage. (R05, R06, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:62–62`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L62-L62); [`server/app/services/analysis.py:223–225`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L223-L225); [`client/src/utils/metricsStore.tsx:55–55`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/src/utils/metricsStore.tsx#L55-L55).


### `max_nesting_depth` — CHANGE
**Kind:** structural diagnostic. **R/S:** yes / yes.

**File:** Custom TS/Python maximum nesting over selected syntax/control constructs. Python includes with/match; TS includes switch/try/catch. CSS structural nesting is not measured here. **Scope:** Depth relative to the scope's base nesting; nested scopes contribute to active ancestor maxima, so the enclosing function can inherit a nested function's depth. **Folder:** Maximum child nesting.

**Support and display:** Custom .ts/.tsx/.py only; language construct sets differ. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Would guard clauses or separating a nested decision make this function easier to follow? **Overlap/limits:** Related to cognitive complexity and CCN, but distinguishes flat branching from deeply nested flow.

**Proposed disposition:** Keep optional until per-executable-scope reset is defined; test equal-CCN flat/deep cases. Do not count JSX depth as the same thing. (R04, R09.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:157–166`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L157-L166); [`server/app/services/typescript/typescript_analysis.py:188–193`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L188-L193); [`server/app/services/python/python_analysis.py:85–206`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L85-L206).


### `average_function_length` — DEMOTE
**Kind:** structural summary. **R/S:** yes / no.

**File:** Custom analyzers average top-level non-import scope lengths; not necessarily real functions or code-only lines. Lizard file enrichment is not attached through this field. **Scope:** Default zero. **Folder:** Child average multiplied by child function_count, summed and divided by total count.

**Support and display:** TS/Python/CSS/Markdown/notebook scope populations differ; generic Lizard file average is not wired here. API and report schema; not a selector/modal row or stock profile weight. Custom CLI accepts it.

**Distinct question:** Is work spread over long executable units or concentrated in one? **Overlap/limits:** Derived from size and scope count; nested physical spans and trivial additions distort it.

**Proposed disposition:** Fix eligible function denominator and line measure, retain diagnostically; prefer function-size distribution rather than a default mean score. (R03, R04, R09.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:71–74`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L71-L74); [`server/app/services/css/css_analysis.py:33–84`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/css/css_analysis.py#L33-L84); [`server/app/services/ipynb/ipynb_analysis.py:18–87`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/ipynb/ipynb_analysis.py#L18-L87); [`server/app/services/analysis.py:837–893`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L837-L893).


### `parameter_count` — CHANGE
**Kind:** interface diagnostic. **R/S:** yes / yes.

**File:** TS/Python sum parameters of top-level scopes only; methods/nested functions usually do not contribute to file total. Ordinary Lizard file enrichment stays zero. **Scope:** Own parameter_count is copied, including Lizard functions. TS counts parameter-list children; Python uses a node-type whitelist and counts self. Defaults/destructuring and unparenthesized arrows need grammar fixtures. **Folder:** Sum child file totals, not maximum function arity.

**Support and display:** Scope support is broader than file support; counts vary with language and destructuring policy. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which function has an unnecessarily difficult calling contract? **Overlap/limits:** Size/API surface overlap, but arity can reveal an awkward call contract in an otherwise small, flat function.

**Proposed disposition:** Keep function arity optional; replace file total ranking with maximum/quantile plus witness. Distinguish semantic arguments from syntax nodes. (R04, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:428–436`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L428-L436); [`server/app/services/python/python_analysis.py:244–252`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L244-L252); [`server/app/services/analysis.py:214–215`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L214-L215).


### `todo_count` — DEMOTE
**Kind:** maintenance/context. **R/S:** yes / yes.

**File:** TS/Python count comment nodes containing case-sensitive TODO or FIXME, once per comment even with multiple markers. Not computed for Markdown, CSS, notebooks or generic Lizard. **Scope:** Same matching in every active ancestor scope, so parent/child occurrences overlap. **Folder:** Sum file-level counts.

**Support and display:** Custom .ts/.tsx/.py only; the docs profile assigns weight despite Markdown TODO enrichment being absent. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which explicit maintenance notes should be read? **Overlap/limits:** Documentation convention and LOC overlap. A thoughtful task marker can be healthier than no marker.

**Proposed disposition:** Offer a source-linked task search, not a quality penalty. Record matched marker and location; do not equate zero with no unfinished work. (R05, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:169–185`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L169-L185); [`server/app/services/python/python_analysis.py:85–131`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L85-L131); [`server/app/services/reporting.py:111–115`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/reporting.py#L111-L115).


### `classes_count` — DEMOTE
**Kind:** structure/context. **R/S:** yes / no.

**File:** Custom TS/Python traverse class definitions; TS counts class declaration/expression nodes. Not broad language-neutral class analysis through Lizard. **Scope:** Not assigned; default zero even on class display scopes. **Folder:** Sum file class counts.

**Support and display:** Custom .ts/.tsx/.py enrichment only. API/report definition and backend profile weight; absent from selector/modal rows.

**Distinct question:** How is this file organized? **Overlap/limits:** Mostly organization/style/size; object-oriented and functional designs are not comparable by this count.

**Proposed disposition:** Keep neutral structural metadata. Remove the backend profile's generic penalty for class count. (R05, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:121–124`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L121-L124); [`server/app/services/python/python_analysis.py:85–110`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L85-L110).


### `tsx_nesting_depth` — DEMOTE
**Kind:** markup diagnostic. **R/S:** yes / yes.

**File:** Maximum depth of jsx_element, jsx_self_closing_element and jsx_fragment encountered in the file's syntax tree. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Where is markup deeply nested, and does extracting a component clarify it? **Overlap/limits:** Markup depth differs from executable nesting but often follows component/file size; deep layout wrappers are not necessarily difficult logic.

**Proposed disposition:** Retain a JSX-structure lens, not a universal quality metric. Either implement documented scope/max rollup or explicitly restrict support to files. (R02, R07, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:224–230`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L224-L230); [`server/app/services/analysis.py:895–927`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L895-L927).


### `tsx_render_branching_count` — INVESTIGATE
**Kind:** framework-sensitive heuristic. **R/S:** yes / yes.

**File:** Counts ternary and &&/?? decisions only when the active scope is a JSX container or contains_tsx is already true at that traversal point. It is not a complete inventory of rendering decisions. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** What conditional rendering paths need examination or tests? **Overlap/limits:** Overlaps executable CCN and nesting. Misses JSX framework control components, || and imperative render choices; encounter order can affect classification.

**Proposed disposition:** Do not default-rank it. Prove an order-independent, framework-aware definition on React and Solid fixtures; otherwise retire this heuristic from risk scoring and offer explicit JSX evidence only. (R07, R09.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:195–220`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L195-L220); [`server/app/services/typescript/typescript_analysis.py:232–256`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L232-L256).


### `tsx_react_use_effect_count` — DEMOTE
**Kind:** framework-specific descriptive count. **R/S:** yes / yes.

**File:** Lexical call-name match: exactly useEffect or a name ending in .useEffect; not verified as a React import. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Where are calls spelled useEffect, within a confirmed React project? **Overlap/limits:** Counts can track component size but establish neither dependency errors nor excessive effects. Aliases are missed; unrelated functions can match. Solid createEffect is not measured.

**Proposed disposition:** Remove from universal and Solid quality views; retain opt-in React call inventory only with import-resolution evidence. Do not relabel it as framework-neutral effects. (R07, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:264–270`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L264-L270); [`client/package.json:12–22`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/client/package.json#L12-L22).


### `tsx_anonymous_handler_count` — DEMOTE
**Kind:** markup diagnostic. **R/S:** yes / yes.

**File:** Counts JSX attributes whose lowercased name starts with on and whose expression directly contains an arrow/function expression. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which inline handlers deserve inspection for substantial embedded logic? **Overlap/limits:** Overlaps attributes and file size; 'on...' is not proof of an event, and an inline closure is not a performance or correctness defect. Framework tuple/delegation forms differ.

**Proposed disposition:** Keep source-linked optional inventory; rank actual handler function complexity instead. Do not recommend useCallback or extraction from this count alone. (R07, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:258–262`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L258-L262); [`server/app/services/typescript/typescript_analysis.py:350–382`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L350-L382).


### `tsx_prop_count` — DEMOTE
**Kind:** markup/context. **R/S:** yes / yes.

**File:** Total JSX attribute nodes in the file, not the number of inputs accepted by a component. Spread attributes are not this same node kind. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** How attribute-heavy is the rendered markup? **Overlap/limits:** Strong conceptual size/markup-volume overlap; many HTML accessibility attributes can be beneficial.

**Proposed disposition:** Relabel JSX attribute count; do not infer a large component API. A future component-input contract requires separate semantic evidence. (R07, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:258–262`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L258-L262).


### `ts_any_usage_count` — CHANGE
**Kind:** type-safety diagnostic. **R/S:** yes / yes.

**File:** Counts explicit AST any tokens. Does not measure inferred any, unsafe propagation or how far untyped values travel. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Where has type checking explicitly been bypassed? **Overlap/limits:** Some overlap with LOC and ignores, but an explicit escape hatch is distinct from branching. Boundary adapters and intentional dynamic code can be valid.

**Proposed disposition:** Keep an opt-in explicit-any diagnostic with source spans and supported rollups. Prefer imported type-aware findings for unsafe flows; never equate token absence with type safety. (R02, R07, R13.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:134–136`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L134-L136).


### `ts_ignore_count` — CHANGE
**Kind:** type-safety diagnostic. **R/S:** yes / yes.

**File:** Counts comments containing @ts-ignore or @ts-expect-error, once per comment. Does not separately classify the directives or include @ts-nocheck. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which suppressions are unexplained, broad or stale? **Overlap/limits:** Related to explicit any, but suppressions disable diagnostics differently. @ts-expect-error can deliberately assert an expected error in tests.

**Proposed disposition:** Split ignore/expect-error/nocheck, include reason and test context; prioritize unbounded or unexplained suppressions, not all expected-error assertions. (R07, R13.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:169–181`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L169-L181).


### `ts_import_coupling_count` — CHANGE
**Kind:** dependency syntax/context. **R/S:** yes / yes.

**File:** Number of distinct raw static import source literals, including their quote spelling. Not resolved fan-out; re-exports, require and dynamic import are not covered by this metric. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which modules are syntactically named by static imports? **Overlap/limits:** Imports often scale with LOC and library style. They do not identify incoming exposure, a cycle, a forbidden boundary or actual symbol use.

**Proposed disposition:** Relabel the legacy field; prefer distinct resolved file/package dependencies with kind/provenance. Reuse deps services, but preserve original declared edges before architecture tests. (R07, R11.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:126–136`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L126-L136); [`server/app/services/typescript/typescript_analysis.py:66–66`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L66-L66); [`server/app/services/deps/graph.py:37–63`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/deps/graph.py#L37-L63).


### `tsx_hardcoded_string_volume` — DEMOTE
**Kind:** localization/content diagnostic. **R/S:** yes / yes.

**File:** Sum of character lengths of whitespace-trimmed JSX text and selected immediately contained string literals with quote characters stripped. Literal interior whitespace is not uniformly trimmed. Not bytes or all user-visible strings. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which literal UI text might merit localization/content review? **Overlap/limits:** Overlaps LOC/payload/attributes. Includes identifiers such as class names or test IDs; excludes some nested expression strings and has no localization policy.

**Proposed disposition:** Rename and constrain to an opt-in localization lens with literal/source evidence. Do not equate raw character volume with poor code. (R07, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:138–153`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L138-L153).


### `tsx_duplicated_string_count` — DEMOTE
**Kind:** literal repetition/context. **R/S:** yes / yes.

**File:** Count of distinct captured normalized string values occurring more than once within a file: JSX text is whitespace-trimmed, selected literals are quote-stripped. A value repeated 2 or 200 times contributes one. **Scope:** Not computed in FunctionMetrics or copied into scope nodes; scope value remains zero. **Folder:** Not assigned by aggregate_metrics; folder value remains zero rather than the documented sum/max.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Which captured literals recur in this file? **Overlap/limits:** Not token/block duplication or clone topology. Common labels and CSS classes can repeat legitimately; larger files provide more repetition opportunities.

**Proposed disposition:** Keep a literal-inspection diagnostic, explicitly not code duplication. Use clone families and matched source ranges for coordinated-change questions. (R07, R08, R12.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:69–69`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L69-L69); [`server/app/services/typescript/typescript_analysis.py:138–153`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L138-L153).


### `ts_type_interface_count` — DEMOTE
**Kind:** structure/context. **R/S:** yes / yes.

**File:** Count of type alias and interface declarations across the custom TS traversal. **Scope:** Incremented on the active enclosing scope before the declaration's own scope is created; the declaration scope does not count itself. Only the innermost active scope is incremented. **Folder:** Sum file values.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Where are type declarations organized? **Overlap/limits:** Counts organization and type use, not type unsafety. More types can improve clarity; nested declarations and file size affect counts.

**Proposed disposition:** Keep neutral structure metadata; remove positive risk weight from the TypeScript profile. Clarify scope attribution and remove the duplicated dataclass annotation without adding a second metric. (R04, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:218–220`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L218-L220); [`server/app/services/typescript/typescript_analysis.py:272–273`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L272-L273); [`server/app/services/analysis_types.py:62–65`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis_types.py#L62-L65).


### `ts_export_count` — DEMOTE
**Kind:** module surface/context. **R/S:** yes / yes.

**File:** Count of export statement/declaration nodes, not distinct exported bindings, symbols or externally used APIs. **Scope:** Not copied; default zero. **Folder:** Sum file counts.

**Support and display:** Custom .ts/.tsx analyzer only. .js/.jsx and other JS/TS extensions use Lizard in the metric dispatcher; unrelated languages inherit default zero. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** How is a module's export syntax organized? **Overlap/limits:** Often overlaps module size/type organization; one export statement can expose many names and a barrel is intentionally export-heavy.

**Proposed disposition:** Retain neutral declaration count; never infer API breadth or dead exports without binding/use resolution. Avoid penalizing barrel syntax twice through coupling. (R07, R08.)

Evidence: [`server/app/services/typescript/typescript_analysis.py:121–125`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/typescript/typescript_analysis.py#L121-L125).


### `python_import_count` — CHANGE
**Kind:** dependency syntax/context. **R/S:** yes / yes.

**File:** Count of import and from-import statements anywhere in the Python AST, including nested and TYPE_CHECKING imports; not distinct modules or imported names. **Scope:** Not copied into scopes; default zero. **Folder:** Sum file counts.

**Support and display:** Custom .py only. Notebook code is not passed through the Python analyzer. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Where is Python import syntax concentrated? **Overlap/limits:** Overlaps LOC; one statement can import multiple names, while repeated statements inflate counts. Not coupling topology.

**Proposed disposition:** Relabel statement count; replace default coupling ranking with resolved distinct dependencies and source witnesses. Separate type-checking/lazy imports. (R08, R11.)

Evidence: [`server/app/services/python/python_analysis.py:85–115`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/python/python_analysis.py#L85-L115); [`server/app/services/analysis.py:154–158`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L154-L158); [`server/app/services/ipynb/ipynb_analysis.py:18–87`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/ipynb/ipynb_analysis.py#L18-L87).


### `md_data_url_count` — DEMOTE
**Kind:** payload/content diagnostic. **R/S:** yes / yes.

**File:** Count of case-sensitive raw data: matches found by the Markdown analyzer, including examples/prose; not necessarily validated embedded asset URIs. **Scope:** Each match gets a synthetic scope with count one and LOC one. Section parents are not rolled up, so their own count may stay zero. **Folder:** Sum file counts; no URI-set union.

**Support and display:** Custom .md/.markdown only. Multiple matches on one physical line can produce overlapping leaf area. Selector supplies hotspot values, first-selected treemap color and modal metric row. Most units use generic numeric formatting; unsupported zeros remain visible.

**Distinct question:** Where are potentially embedded payloads worth inspecting? **Overlap/limits:** Related to payload size but a tiny repeated URI and a huge embedded image both count equally. Not a universal maintainability problem.

**Proposed disposition:** Keep an asset lens with URI validation, media kind and byte contribution where available. Do not make docs quality depend on raw match count. (R03, R08.)

Evidence: [`server/app/services/markdown/markdown_analysis.py:313–394`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/markdown/markdown_analysis.py#L313-L394); [`server/app/services/analysis.py:143–145`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L143-L145).


### `analysis_status` — CHANGE
**Kind:** operational availability. **R/S:** no / no.

**File:** File outcome defaults to ok; timeout/error/crash/too_large mark explicit fallback paths. A successful parser returning partial syntax and unsupported/general fallback can still appear ok. **Scope:** New scope nodes default ok; this is not per-metric support. **Folder:** Usually remains default ok; failure count is a separate rollup.

**Support and display:** File execution outcome only; not complete syntax, resolution or metric capability status. Explicit file outcomes appear in treemap tooltip warning paths; not a quality selector. Folder status is not a completeness summary.

**Distinct question:** Was analysis performed successfully enough to trust this value? **Overlap/limits:** Must be a prerequisite for interpretation, never another risk score.

**Proposed disposition:** Retain outcome but add per-metric applicability/provenance and parse completeness; distinguish unsupported, skipped, failed, partial and measured. (R01, R02.)

Evidence: [`server/app/models.py:47–54`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/models.py#L47-L54); [`server/app/services/analysis.py:895–927`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L895-L927); [`server/app/services/analysis.py:1038–1071`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1038-L1071).


### `analysis_error` — KEEP
**Kind:** operational metadata. **R/S:** no / no.

**File:** Text detail for explicit analyzer fallback outcomes; default empty string. **Scope:** Empty by default. **Folder:** Not aggregated into a combined diagnostic.

**Support and display:** Only failures recorded by the relevant error path. Failure detail is available in raw results/tooltip support paths, not as a numeric quality display.

**Distinct question:** Why was this file's analysis unavailable? **Overlap/limits:** No quality dimension; errors may reflect environment or analyzer defects, not source quality.

**Proposed disposition:** Keep structured reason/code and bounded readable detail; link affected files from parent availability summaries and avoid leaking unnecessary absolute paths in shared exports. (R02.)

Evidence: [`server/app/services/analysis.py:1038–1045`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1038-L1045); [`server/app/models.py:53–53`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/models.py#L53-L53).


### `analysis_failed_count` — CHANGE
**Kind:** operational availability. **R/S:** no / no.

**File:** One for explicit failed fallback, except intentionally too-large files count zero. **Scope:** Zero. **Folder:** Sum retained file failures.

**Support and display:** Does not include too_large, unsupported metrics, unreported parse errors or dependency-resolver omissions. Folder/file failure-warning context; too-large and unsupported analysis are not included by this count.

**Distinct question:** How many retained files failed analysis, and what remains unknown? **Overlap/limits:** A denominator/trust signal, not code complexity.

**Proposed disposition:** Keep explicit failures; add separate analyzed/skipped-too-large/unsupported/partial totals and eligible denominators. Never turn an empty failure count into a healthy-quality claim. (R02.)

Evidence: [`server/app/services/analysis.py:1038–1045`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L1038-L1045); [`server/app/services/analysis.py:872–893`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L872-L893).


## 4. CRAP: attribution, mathematics, evidence and implementation fit

### 4.1 Origin and what the original measure meant

The creator accounts identify **Alberto Savoia and Bob Evans**, working on CRAP in 2007. Robert C. Martin (“Uncle Bob”) is not the co-creator named by these primary sources. The 2007 article used *Change Risk Analysis and Prediction*; the 2011 account used *Change Risk Anti-Patterns*. Preserve that historical naming variation rather than silently treating one expansion as the only original wording. [S01](https://testing.googleblog.com/2011/02/this-code-is-crap.html), [S02](https://www.artima.com/weblogs/viewpost.jsp?thread=215899)

For a method with cyclomatic complexity C and automated coverage percentage p, the documented formula is:

```text
CRAP(C, p) = C² × (1 − p/100)³ + C       p ∈ [0, 100]
CRAP(C, q) = C² × (1 − q)³ + C          q = p/100 ∈ [0, 1]
```

The creator descriptions specify **basis-path coverage**. It is not safe to substitute a line, statement, branch/condition or function-entry percentage without naming the adaptation. GMetrics explicitly supports a configurable coverage provider and illustrates a line-coverage provider, demonstrating that tools bearing the CRAP name can use different inputs. “CRAP with line coverage” can be a declared practical variant, but not an assertion that the original input was measured. [S01](https://testing.googleblog.com/2011/02/this-code-is-crap.html), [S02](https://www.artima.com/weblogs/viewpost.jsp?thread=215899), [S03](https://dx42.github.io/gmetrics/metrics/CrapMetric.html)

### 4.2 Exact consequences and edge cases

The following are direct arithmetic consequences of the formula, **not repository measurements**:

| CCN C | Coverage | CRAP |
|---:|---:|---:|
| 5 | 0% | 30 |
| 6 | 0% | 42 |
| 10 | 50% | 22.5 |
| 15 | 57% | 32.889075 |
| 20 | 80% | 23.2 |
| 30 | 100% | 30 |
| 31 | 100% | 31 |

At no coverage, `CRAP=C²+C`; at full coverage, `CRAP=C`. Increasing coverage cannot reduce the result below C. Thus a policy that flags values above 30 can never be satisfied by coverage alone when C>30. More test execution cannot make a very complex method structurally simple.

For C≥0 and q∈[0,1]:

```text
∂CRAP/∂C = 1 + 2C(1−q)³                 > 0
∂CRAP/∂q = −3C²(1−q)²                  ≤ 0
```

For positive C≤T, meeting `CRAP≤T` requires:

```text
q ≥ max(0, 1 − ((T−C)/C²)^(1/3))
```

For C>T it is impossible; at C=T it requires q=1. A *strictly less than* rule changes boundary acceptance. The historical table's C=15 / 57% example does not satisfy a threshold of 30: the exact minimum for `≤30` is approximately **59.4519867%**. C=5 at zero coverage is exactly 30, not below it. These are reasons to verify formulas and comparators rather than copy a table mechanically. [S02](https://www.artima.com/weblogs/viewpost.jsp?thread=215899)

An executable function normally has at least one path under the chosen CC model. A stored C=0 in this Srcly snapshot often represents a document, synthetic scope, unmeasured value or non-executable container. Do not turn that zero into “perfect CRAP.” For methods with no eligible coverage opportunities, an undefined ratio stays N/A. Reject invalid percentages, NaN and out-of-range input rather than silently clipping them.

**Missing coverage is not zero coverage.** No scalar should be calculated for an unknown q. When useful, a known C permits the explicitly unknown bound `[C, C²+C]`; this is an interval of possibilities, not an observation or a reason to rank the upper bound as actual risk. Coverage exclusions and instrumentation eligibility must be retained, because they change the denominator.

### 4.3 Threshold evidence is weaker than the formula's precision

The 2007 introduction explicitly called the formula and interpretation experimental and used `>=30` in its project discussion. The 2011 description used `>30` and described informal iterative calibration with colleagues/projects. These are consequential comparator differences at the boundary. Neither inspected creator account establishes a general, externally validated defect-prediction boundary for Srcly's languages and scope model. Do not present “30” as a scientific law, and do not infer reliable remediation hours from the related experimental CRAP-load idea. [S01](https://testing.googleblog.com/2011/02/this-code-is-crap.html), [S02](https://www.artima.com/weblogs/viewpost.jsp?thread=215899)

A proposed optional Srcly lens may use **“review when CRAP > 30, policy version X”** for familiarity, but must show its two components and label the boundary as a chosen review heuristic. A threshold counter is not a percent probability of a defect.

### 4.4 Does complexity get counted twice?

Within the formula, C appears in a quadratic uncovered-path penalty and a linear baseline. That is the definition's deliberate interaction: the baseline remains even at full coverage. It is not an accidental arithmetic duplication.

Across a portfolio, however, adding CCN, uncovered coverage and CRAP as three supposedly independent votes **reuses the same evidence**. Once C and q are known exactly, CRAP is determined; two methods with the same components cannot receive different CRAP. It supplies no additional mathematical information conditional on those components. It can still provide **decision value** by making a particular nonlinear policy easier to notice. That distinction is precisely what the evaluation should test.

Consider C=10, q=50% and C=20, q=80%: their CRAP values are close, but the first has weaker execution evidence and the second more structural complexity. A scalar hides the difference in likely next action. Prefer a component table or scatterplot with an optional CRAP contour: x=CCN, y=uncovered fraction, mark source status, and show the exact function on selection. Do not substitute color for coverage completeness.

### 4.5 How it could fit Srcly without manufacturing certainty

Compute per real executable method **only after** ownership and coverage mapping are correct. Then roll up with max+witness, eligible-method count, selected-policy exceedance count and unknown-method count. Do not calculate `CRAP(max file CCN, average file coverage)`; those values can refer to different methods. Do not sum overlapping class, function and body representations. Do not silently average method coverage percentages with different opportunity counts.

For TypeScript, source maps and instrumented source versions must match the snapshot. For Python, provider line/branch opportunities must be assigned to the right nested executable scope. Notebook display coordinates are compressed virtual cell text, not raw `.ipynb` line numbers. A notebook needs cell/source mapping or remains unsupported for method-level CRAP. These restrictions follow directly from the baseline scope model and external coverage conventions. [`server/app/services/analysis.py:207–251`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/analysis.py#L207-L251); [`server/app/services/ipynb/ipynb_analysis.py:18–126`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/ipynb/ipynb_analysis.py#L18-L126); [S33](https://coverage.readthedocs.io/en/latest/branch.html), [S34](https://github.com/istanbuljs/nyc).

Coverage proves some execution under a declared test run, not sound assertions or intended behavior. Exclusions, assertion-free tests, trivial method splitting and equivalent-looking syntactic rewrites can improve a score without improving the program. Mutation evidence can sometimes expose weak assertions, but brings its own operator and equivalent-mutant limits. The recommendation is therefore **C10/R16: investigate a derived component lens, not a new independent default metric**. A useful file-level coverage view may ship even when method-level CRAP is rejected.

## 5. Competitor workflows: the important differences

`tool-survey.md` provides nineteen comparison entries with primary URLs, input/cost/licensing qualifications and exact inspection levels. Four official static UI images were inspected; no interactive product session or analyzer execution occurred. The strongest transferable patterns are not more metric names:

| Workflow | Exemplars and evidence | Srcly application |
|---|---|---|
| Prioritize with context, then inspect source | CodeScene hotspot details and X-Ray: [S08](https://docs.enterprise.codescene.io/latest/guides/technical/hotspots.html), [S10](https://docs.enterprise.codescene.io/latest/guides/technical/xray.html), [S11](https://docs.enterprise.codescene.io/latest/_images/HotspotsContextMenu.png). | Activity and structural difficulty side by side; retain direct source and on-demand deeper evidence. |
| Explain why a finding exists | Qodana, ESLint/typed rules: [S28](https://eslint.org/docs/latest/rules/complexity), [S29](https://typescript-eslint.io/rules/no-unsafe-assignment/), [S32](https://www.jetbrains.com/help/qodana/ui-overview.html). | Rule/metric definition, exact source, baseline/suppression state and a bounded next action. |
| Explore an architectural question | NDepend, CppDepend, Understand, dependency-cruiser: [S13](https://www.ndepend.com/docs/treemap-visualization-of-code-metrics), [S18](https://www.cppdepend.com/images/docs/matrix_dsm.png), [S19](https://docs.scitools.com/help/reference/graph-catalog.html), [S37](https://github.com/sverweij/dependency-cruiser). | A cycle witness or direct dependent set first; large matrices only when they answer a specific boundary question. |
| Follow repeated changes or logic | CodeScene coupling and CPD/jscpd: [S09](https://docs.enterprise.codescene.io/latest/guides/technical/change-coupling.html), [S12](https://docs.enterprise.codescene.io/latest/_images/changeCouplingSidebar.png), [S25](https://pmd.github.io/pmd/pmd_userdocs_cpd.html), [S26](https://github.com/kucherenko/jscpd). | Separate static dependencies, observed co-change and clone families; they are not interchangeable forms of “coupling.” |
| Inspect testing evidence, not only a ratio | coverage.py/nyc, Stryker/PIT: [S33](https://coverage.readthedocs.io/en/latest/branch.html), [S34](https://github.com/istanbuljs/nyc), [S35](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/), [S36](https://pitest.org/quickstart/basic_concepts/). | Distinguish execution gaps from surviving behavior mutations, with source/configuration matching. |
| Keep cheap headless workflows viable | Lizard, Radon/Xenon, scc: [S21](https://github.com/terryyin/lizard), [S22](https://radon.readthedocs.io/en/master/intro.html), [S23](https://github.com/rubik/xenon), [S24](https://github.com/boyter/scc). | Clear local artifacts and explicit thresholds; avoid requiring a hosted platform or a semantic compiler for the baseline view. |

SonarQube's documented project complexity total and Srcly's maximum answer different aggregation questions. Importing a label without its population and rollup is a semantic change, not feature parity. Similarly, a CPD clone block is not Srcly's repeated-literal count, and a type-aware unsafe-value diagnostic is not an explicit `any` token. [S04](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition), [S25](https://pmd.github.io/pmd/pmd_userdocs_cpd.html), [S29](https://typescript-eslint.io/rules/no-unsafe-assignment/)

Important current implementation-fit findings: jscpd's public main documents a Rust v5 family separately from legacy Node v4; scc now documents optional cognitive/history capabilities; Semgrep-maintained rules have restrictions separate from its open-source engine. These materially affect an adapter or redistribution plan. Pin versions and licenses before integration rather than designing from old tool reputations. [S24](https://github.com/boyter/scc), [S26](https://github.com/kucherenko/jscpd), [S27](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md), [S30](https://docs.semgrep.dev/licensing)

### 5.1 Preserve the dependency work already in this baseline

The existing dependency initiative defines a bounded hierarchy/focus workflow with roughly 30–50 boxes, direct incoming/focus/outgoing regions, symbol detail when practical and hierarchy-based aggregation. Current code implements TS and Python collection, test/type-only/external filtering, symbol projection, caching and URL focus. The initiative map records all five milestones completed, while some narrative status remains historical. Treat those records as context, not permission to duplicate the work.

The current graph is **not a lossless declared-import graph**: barrels can resolve to defining modules, symbol endpoints are projected, coincident edges merge, self-edges disappear, some unresolved/oversized inputs are omitted, and original import lines are not retained in the API edge. Its source-file timestamp signature also misses resolution-only changes in configuration. Direct-dependency metrics are still promising, but must name the projection and expose unknowns. [`server/app/services/deps/graph.py:27–79`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/deps/graph.py#L27-L79); [`server/app/services/deps/graph.py:118–171`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/deps/graph.py#L118-L171); [`server/app/services/deps/common.py:1–191`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/app/services/deps/common.py#L1-L191); [`docs/intent/dependency-view/shape-brief.md:9–70`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/docs/intent/dependency-view/shape-brief.md#L9-L70)

Add original declared-edge evidence, resolution status and configuration fingerprints; compute SCCs on the intended edge set; then render the witness inside the current focused view. Keep projected-symbol exploration too, but do not label every projected cycle a runtime initialization fault. Coupling counts should union unique neighbors rather than count every imported symbol. **This is an extension to dependency-view, not a replacement graph initiative.**


## 6. Ranked portfolio and rejected alternatives

### 6.1 Smallest useful default is a decision portfolio, not a numeric bundle

A source-only scan should open on **real executable complexity with a worst-function witness**, sized by a clearly declared source measure. Show language/analyzer, support status and eligible function count. Nesting and arity are optional diagnostics for a selected function. File averages and totals belong in context, not as extra independent votes.

After their first proofs, enable three complementary question-based lenses: **change frequency** to prioritize attention, **dependency cycle evidence** to inspect separability, and **clone families** to inspect coordinated change. Each is absent/N/A when its required input is absent. Unique incoming degree belongs beside dependency evidence as exposure context, not a fourth architecture penalty. An imported specific rule finding can outrank a vague metric suspicion in an evidence queue, but its severity must remain attributed to its producer.

Coverage and mutation answer different testing questions and remain separate optional views. CRAP can draw a contour over complexity and coverage; it does not earn a new measurement axis. Cognitive complexity is a candidate to improve or replace the structural diagnostic mix—not a presumed fourth structural vote alongside CCN, depth and size.

This recommendation favors a small default **interface** while retaining a rich inspectable evidence model. It does not pretend every repository supports the same number of active lenses.

### 6.2 Candidate priority

Priority is for a bounded proof, not a claim of measured predictive merit. Exact definitions, formulas where appropriate, scopes, rollups, requirements, unsupported behavior, false positives, costs and rejection gates are in `candidate-metrics.json`.


| Candidate | Proposed place | Distinct decision / reason |
|---|---|---|
| C01 — Recent change frequency with separate churn context | adopt; conditional default | Which structurally difficult code is actively costing attention, versus stable code that can be left alone? |
| C02 — Dependency cycle membership with an explicit cycle witness | adopt; conditional default | Which dependency loop prevents clean separation or introduces order-sensitive initialization risk? |
| C03 — Clone families and coordinated-change topology | adopt; conditional default | What other code must be changed consistently when this logic changes? |
| C04 — Type-aware/static findings with rule evidence | adopt; optional imported evidence | Is there a specific type-safety, correctness or security issue that simple source counts cannot reveal? |
| C05 — Matched line/branch coverage gaps | adopt; optional imported evidence | Which executable choices have not been exercised by this test run? |
| C06 — Cognitive complexity | investigate; experimental structural diagnostic | Does this code impose reading difficulty not adequately revealed by CCN, depth and size together? |
| C07 — Unique incoming dependency exposure and outgoing fan-out | adopt; architecture context | How many direct dependents deserve review when a public behavior changes? |
| C08 — Temporal coupling with support and direction | investigate; optional history diagnostic | What hidden companion change is easy to miss because it is not visible in the static import graph? |
| C09 — Mutation survival evidence | defer; targeted test diagnostic | Do tests actually notice plausible behavior changes in important exercised code? |
| C10 — CRAP component lens and optional derived value | investigate; derived test/structure diagnostic | Does a chosen nonlinear complexity/coverage policy change a test-versus-refactor decision? |
| C11 — Executable complexity and length distributions | adopt; replacement summary | Is this one exceptional function or a broad concentration of difficult code? |
| C12 — Declared architectural boundary violations | investigate; optional architecture rule | Does this change cross a boundary the project explicitly intends to preserve? |
| C13 — Classified type escape hatches | adopt; replacement diagnostic | Which bypass is broad, unexplained or surprising rather than deliberately tested? |
| C14 — Function-local nesting with contributing spans | adopt; replacement optional diagnostic | Would flattening nested control flow improve this particular function? |
| C15 — Object-oriented cohesion (LCOM variants) | defer; language-specific diagnostic | Does this class contain separable stateful responsibilities? |
| C16 — Graph centrality / transitive blast-radius scores | defer; architecture research | Would a transitive impact view reveal a relevant change obligation beyond direct dependents? |
| C17 — Maintainability Index | reject; not a default metric | Would this composite improve a decision over displaying its components? |
| C18 — Halstead volume/effort and implied bug estimates | reject; not a default metric | What actionable issue would token vocabulary reveal beyond size and structural evidence? |
| C19 — New/changed finding and metric deltas | investigate; optional longitudinal workflow | What changed since the last relevant checkpoint and deserves attention now? |
| C20 — Framework-specific effect/render anti-pattern rules | defer; opt-in framework diagnostic | Is there a concrete framework contract violation that can be fixed? |
| C21 — Developer ownership / bus-factor scoring | defer; outside the first portfolio | Is maintenance knowledge concentrated enough to require documentation or pairing? |

### 6.3 Why not simply keep every metric and organize it?

The strongest counterproposal is **all metrics, grouped and searchable**, without permanent removals. It preserves expert freedom, avoids prematurely deleting a useful niche signal and has low compatibility risk. This is a good diagnostic catalog.

It is a weaker default ranking policy. All-fields organization alone does not fix unsupported zeros, shared evidence, mixed populations, misleading direction or attention cost. A user can still combine several size-linked counters and interpret the result as corroboration. More controls also create a larger explanation burden.

Test three product alternatives: (A) current/default structural view after semantic fixes; (B) compact question-based portfolio plus neutral diagnostics; (C) all-organized catalog with equal access to every field but no unsafe composite. Compare real tasks, not the number of available metrics. Prefer B provisionally. Keep C available for expert investigation, and allow the evaluation to overturn the default.

**Rejected for the default:** MI, Halstead effort/bug forecasts, low-comment badness, unqualified useEffect/handler/prop penalties and global centrality-as-quality. They either reuse existing evidence without a distinct demonstrated action, attach unsupported quality claims to descriptive quantities, or impose poor-fit infrastructure. **Deferred:** class cohesion without semantic class bindings, author/bus-factor scoring for this personal project, and always-on mutation or whole-history analysis. Reconsider only with a named missed decision and a cheaper comparator. Radon's MI warning and distinct formula variants reinforce caution, not an argument that composites can never be useful. [S22](https://radon.readthedocs.io/en/master/intro.html)

### 6.4 Contrasting failure cases that the evaluation must retain

Two equal-size/equal-CCN functions may differ because one is repeatedly changed, one participates in a clone family, or one has an uncovered branch. A tiny acyclic module can violate a declared architecture boundary; a highly connected utility can be intentionally stable and healthy. A flat dispatch function and a deeply nested function can have similar CCN but different reading costs. A negative type test can intentionally contain `@ts-expect-error`, while an untyped dependency can introduce unsafe values without an explicit `any` token in the file.

These are **conceptual counterexamples**, not observations from a scanned corpus. They specify the different decisions a metric must reveal and prevent correlation-only elimination of a useful signal.

## 7. How to establish incremental information empirically

### 7.1 Gate 0: semantic correctness before statistical analysis

Construct a gold fixture matrix before collecting correlations. Each fixture has hand-declared expected executable population, source ranges, metric support, units, own/inclusive attribution and rollups. Cover all 32 API fields—including genuine zero, unsupported and failure outcomes—and reconcile the 27/22 registries automatically.

Required cases include imports-only files; class methods and nested functions; objects and JSX wrappers containing functions; unparenthesized/destructured/default parameters; switch/elif/comprehension/optional-chain variants; JSX branching before versus after first JSX visitation; two Markdown payload matches on one line; comments and blank spans; equal-span child/parent; mixed notebook cell kinds; unknown readers; too-large input; graph unresolved/type-only/barrel/lazy edges; and stale external coverage. Syntax cases whose installed grammar behavior was not executed in this research remain **test hypotheses**, not confirmed runtime defects.

The existing tests prove intent on selected examples but not this entire matrix. Reporting fixtures manually set several scope-level TS values that the actual pipeline does not produce, so passing those tests would not prove propagation. Existing body-LOC tests cover a useful nested example, not general area conservation. Retain those tests and add end-to-end fixtures rather than replacing them with large numerical snapshots. [`server/tests/test_reporting.py:1–288`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/tests/test_reporting.py#L1-L288); [`server/tests/test_function_body_loc.py:1–57`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/tests/test_function_body_loc.py#L1-L57); [`server/tests/test_tsx_metrics.py:1–125`](https://github.com/byronwall/srcly/blob/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4/server/tests/test_tsx_metrics.py#L1-L125)

### 7.2 A feasible three-then-twelve repository design

Start with three local, authorized repositories: Srcly itself, one substantially different TS/JS project, and one Python project. Freeze commit/content hashes and all analyzer/configuration versions. Use this pilot to debug eligibility and reduce review burden, not to claim generality.

For the subsequent **proposed twelve-repository cohort**, reserve four TS/JS slots (React TSX, Solid TSX, server TypeScript, plain JavaScript), four Python slots (service, library/CLI, scientific package, notebook-heavy project) and four generic-Lizard slots (Go, Java, C, C++). These are sampling slots, not a claim that specific repositories were already selected or scanned. Include small and medium repositories practical for a local tool; do not let one monorepo supply nearly all observations. Obtain any needed coverage/clone/static artifacts through the repository's existing authorized workflow, outside Srcly's normal scan.

Record a reproducibility row per node: repository/revision, language, framework when known, analyzer/config version, real scope kind, parent/module identity, line-measure kind, log-size bin, generated/vendor/test/production classification, support state, metric value, missing reason and relevant artifact provenance. Keep file, function and folder analyses separate. Never pool ancestor and descendant rows as independent observations or count a generated client as ordinary production logic by default.

Use population statistics for cheap counts and stratified samples for expensive review. A practical pilot is twenty candidate targets per comparison arm per repository, deduplicated by underlying source decision; use a balanced, smaller adjudication subset before expanding. These are cost-control choices, not a power calculation or measured sufficiency.

### 7.3 Separate three questions

**Conceptual overlap:** inspect definitions and shared inputs. CRAP is exactly determined by CCN and coverage; density is determined by its numerator and denominator; most volume counts scale with code opportunity. This can be established without a corpus.

**Measured association:** estimate within eligible language/scope strata, not from a single pooled number. Report sample size, support rate, missingness, zero prevalence and ties beside every coefficient. Use Spearman rank association for monotonic relationships, top-k intersection/Jaccard and optionally rank-biased overlap for actual queues. Compare multiple k values, not just one cherry-picked overlap. Constant or nearly empty measures yield undefined/uninformative associations, not proof of independence.

**Unique decision value:** ask whether a metric changes a justified action or investigation target after cheaper evidence is available. High correlation can coexist with a few extremely useful complementary cases. Low correlation can be caused by noise, missing support or a broken detector; it does not earn a default slot.

The authors' CC/SLOC research summary emphasizes sensitivity to aggregation and transformations; the cognitive-complexity study supplies evidence about understandability outcomes, not a guarantee of incremental benefit for this explorer. Neither replaces the proposed local decision evaluation. The publisher lists a correction to the CC/SLOC paper; no numerical coefficient from that study is relied upon here. [S06](https://arxiv.org/abs/2007.12520), [S07](https://www.rascal-mpl.org/blog/2016/01/01/empirical-analysis-of-the-relationship-between-CC-and-SLOC/)

### 7.4 Account for size without dividing everything by LOC

Use at least two adjustment approaches. First, compare ranks within language × scope × coarse log-size strata. Second, fit a flexible expected relationship with size—such as a robust spline of log(LOC+1)—on training repositories, then analyze held-out residuals. Account separately for code kind and analyzer support. A residual answers “unusual for this amount/type of code,” not automatically “bad.”

Ratios can introduce their own denominator artifacts, especially for tiny functions, so compare raw and adjusted analyses. A sensitivity model can include additional size descriptors only when they are not duplicate versions of the same measure. If ordinary regression models are used, report collinearity diagnostics such as variance inflation factors/condition numbers, but treat them as model warnings rather than automatic metric deletion.

Rank correlation misses non-monotonic and interaction effects. Inspect binned scatterplots and partial relationships; exploratory mutual information or a shallow nonlinear model may identify interactions, but requires held-out checks and enough eligible data. CRAP can be tested as a specified interaction against C and coverage components; it cannot be advertised as new conditional measurement information.

Split by repository for cross-validation, then test leave-one-language/framework-out transfer where meaningful. Bootstrap repositories or modules—not millions of correlated nested rows—to summarize uncertainty. Examine zero-inflated counts separately as occurrence/presence and magnitude when necessary. Do not impute unsupported values to zero or casually combine languages to increase sample size.

### 7.5 Compare portfolios on actual review decisions

Use these arms: size-only context; corrected CCN+size; corrected CCN+nesting+size; proposed compact portfolio; compact plus one candidate; and all-organized diagnostics. Add ablations that remove one candidate at a time. Ensure the same eligible cohort, selection budget and reference normalization are used.

Reviewers receive source evidence with metric identity/order masked where practical. Record: useful next action, reason, duplicate evidence, false alarm, confidence, time to find the relevant source, and whether a cheaper existing signal already supplied the same decision. Two reviewers with adjudication are preferable; if only Byron is available, use delayed, reordered repeat review and explicitly label single-reviewer limitations. A reviewer's “useful” decision is not a ground-truth software defect.

A **proposed acceptance policy**, to be revised after the pilot, is at least three independently adjudicated new useful cases across at least two repositories/contexts, acceptable noise for the intended task, and no systematic unsupported/zero failures. A provisional 70% useful-evidence target for a reviewed queue may help allocate time, but is not a validated benchmark or statistical significance test. Rare high-impact cases can justify an optional diagnostic even if they cannot justify permanent default space.

Reject or demote when the signal provides no new justified action, duplicates cheaper evidence at higher attention cost, has poor source fidelity, or fails its runtime/privacy/license budget. **Do not reject solely at a Spearman cutoff.** Before permanent removal, review complementary failure cases and compatibility obligations; the experiment must also be allowed to reject the proposed compact portfolio.

### 7.6 Cost and predictive claims

Measure cold/warm p50/p95 elapsed time, CPU, peak memory, artifact size and support rate on the actual local hardware and pinned tools. Separate AST scan, history retrieval, graph resolution, report ingestion and rendering. A proposed initial source-pass overhead budget of roughly 20% is a planning constraint to negotiate, not a measured property. Bound history windows and commit pair expansion, and keep test/mutation execution external.

No defect prediction claim follows from this study design. A future predictive claim would require temporally separated outcomes, credible defect labels, exposure/confounding controls, size/history baselines, calibration and external validation. Mutation outcomes are not automatically real bugs, and coverage-study effectiveness proxies must not be relabeled production defect rates. [S35](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/), [S36](https://pitest.org/quickstart/basic_concepts/), [S39](https://dl.acm.org/doi/10.1145/2568225.2568271)


## 8. Exploration and headless reporting proposals

### 8.1 A source-first local workflow

Start with a question: **hard to understand**, **worth changing now**, **architecturally entangled**, **repeated elsewhere**, **specific finding**, or **missing test evidence**. Each lane explains required inputs and selects an appropriate population. Do not rank files, methods, Markdown sections and synthetic bodies as peers.

Keep the treemap as inventory, with area from the conserved display measure and color from one explicitly named metric. Separate **area**, **color** and **rank** controls instead of making the first selected ranking metric implicitly control color. Use a list beside the map so a tiny important function is not hidden by area. Equal values should have equal semantic color; express depth through hierarchy/borders, not a change in measured severity. Show unavailable data with a neutral label/pattern and accessible text.

A selected row should show the definition, own versus rolled-up value, source contribution/witness, supported denominator, analysis version and comparison cohort. Keep the current light design and source modal; repair selected-scope synchronization before adding more panels. Suggested actions should say “inspect these branches” or “compare these clone peers,” not “refactor because this count is high.”

### 8.2 Bivariate evidence beats hidden addition

Useful small views are CCN versus size, CCN versus recent change frequency, and CCN versus uncovered fraction. Keep raw components visible; logarithmic axes and excluded populations must be labelled. A lasso/filter should produce the same eligible source list and export. Graph and clone peer selections should open the same source evidence drawer, not create separate versions of node identity.

Do not add cognitive complexity, nesting, average CCN and max CCN as four independent default risk contributions. For optional user-defined combinations, publish the transform, weights, direction, source/cohort and complete contribution breakdown. Fixing the positive-only denominator is necessary but **not sufficient**: scores based on different supported feature subsets are not automatically comparable. Use a common supported feature set within a declared cohort, or keep the lanes separate; mark partial assessments without silently renormalizing them into apparent certainty.

Relative percentile/rank views can be less dominated by one outlier than max normalization, but still change with the cohort and ties. Label them as within-cohort position, not quality. Keep a visible choice between a fixed reference cohort and recomputing the selected cohort. Do not let zoom, exclusions and headless output silently choose different reference populations.

### 8.3 Dependency and clone drilldown

A dependency badge opens a **witness**, not a larger colored hairball: original importer → imported edges, source line, relation kind, resolution status and the named cycle/component or boundary rule. Preserve the existing bounded one-hop view and hierarchy rollup. Counts distinguish unique files from symbol links. Type-only and lazy relationships remain selectable context.

A clone badge opens a family with source-aligned peers, detector configuration and affected files. Provide “intentional duplication” as a valid reviewed outcome. A co-change badge instead shows supporting commits and directional/support statistics; do not imply that every co-change peer is a clone or a static dependency.

### 8.4 Honest triage and trends

Use stable finding/evidence fingerprints based on semantic identity, source region and rule/metric contract—not rank. Separate reviewed, accepted, deferred, false-positive, hidden-from-view and excluded-from-analysis states. A hidden result is not resolved; an excluded file is not tested; a failed analyzer is not clean.

Initially store local scan/report artifacts rather than a trend service. Compare only matching metric contracts and support populations. Mark a changed analyzer, source mapping or exclusion policy as incomparable where necessary. Renames and moved/split functions need explicit identity handling; otherwise “resolved/new” counts are not reliable trends. These are proposals motivated by documented baseline/triage patterns, not a request for an enterprise workflow. [S04](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition), [S32](https://www.jetbrains.com/help/qodana/ui-overview.html)

### 8.5 Headless reports need the same epistemic contract

Add the following concepts to a versioned observation/report contract: metric ID and definition version; analyzer/provider version; scope ID/kind and own/inclusive relation; source revision/content hash; value/unit; covered/eligible denominator when relevant; applicability/status and missing reason; comparison cohort; source witness; and optional ranking contribution.

The JSON report should preserve **zero versus absent versus unsupported**, not discard all nonpositive values in compact evidence. Report coverage of analysis itself: how many eligible files/functions were measured, skipped, partial or unmapped. Include all enabled/available lens names without claiming missing lanes are healthy. Put scoring policy and provenance in the manifest, not only in prose.

Emit a small top-target queue with evidence IDs and source references, plus a fuller diagnostic inventory. The human report, machine inventory and browser should be generated from the same metric contract. Test one synthetic cohort across all three paths. A single shared schema/data definition is more useful than adding yet another selector field by hand.

## 9. Proposed initiative sequence and proof gates

The full independent shapes, relevant paths and stable recommendation IDs are in `recommendations.md`. They are **planning input only**; Codex owns final Software Design Sleuth artifacts, validation and any PR.


| Initiative | First visible proof | Cut line |
|---|---|---|
| I01 — Metric semantics and trustworthy availability | Gold fixture grid across real functions, display scopes, synthetic imports/bodies and all supported analyzer families. Assert exact units, ownership, maxima, denominators and N/A. | No new metric family, no coverage join, no replacement analyzer engine in the first proof. |
| I02 — One explainable explorer/report contract | Use one manually specified cohort to prove monotonic scoring, UI/report parity, stable identities, missing states, filter consistency and source-linked selected-scope evidence. | No hosted dashboards, trend database, global graph renderer or visual redesign. |
| I03 — Portfolio evidence and selection | Three-repository pilot with pinned commits, stratified metric table, size-conditioned comparisons and blinded action review; only then expand to twelve. | No defect prediction model, automatic feature selection or new aggregate before basic decision-value evidence. |
| I04 — Architecture evidence on the existing dependency view | Original import witnesses survive barrel/symbol projection; config-only changes invalidate resolution; TS/Python cycle/type-only/lazy/unresolved fixtures preserve view budget and geometry. | No call graph, whole-repository hairball, continuous semantic zoom or replacement layout. |
| I05 — Bounded local Git activity | Manually verified file histories plus a blind CCN/LOC versus activity-aware triage comparison. Rename, merge and bulk-change policies are visible. | No ticket integration, author score, always-on service or function history reconstruction. |
| I06 — Clone family evidence import | One pinned artifact format provides matched peers, stable family IDs and unioned extents; intentional duplication is visibly retained as a legitimate outcome. | No near-miss/embedding engine or all-history repeated scans in the first proof. |
| I07 — Coverage joins and test-confidence diagnostics | One file-level coverage format first: stale/missing/excluded/zero-opportunity data abstains correctly. Method joins and CRAP edge cases are a separate second gate. | No test runners, mutation runners or CRAP-first feature work inside a normal scan. |
| I08 — Authorized static-finding import | One project's existing typed diagnostics join to source, deduplicate across tools and distinguish expected-error tests, suppressed and new findings. | No remote platform, untrusted project configuration execution or redistribution of rule packs without appropriate rights. |

Cost bands in the companion are deliberately rough human engineering planning estimates: S=1–3, M=4–8 and L=>8 engineer-days for bounded work. They are not measured implementation times or promises. Coverage source-map/method identity and semantic cohesion are materially different appetites from arithmetic over existing fields.

I01/I02 and the I03 pilot are the first release-sized investment. Then choose one new evidence workflow. File-level Git activity is the recommended first prioritization input; trustworthy dependency cycles first need declared-edge and completeness repair. A clone importer should precede a clone engine. File coverage can precede method-level CRAP. Mutation and full semantic framework rules remain below the cut line.

## 10. Important uncertainties and contract status

**Complete within the assignment:** the static API/report/selector inventory reconciles; all current fields have dispositions; nineteen complementary tool entries are supported by primary links; CRAP origin/formula/coverage kind/edge cases/threshold evidence/conditional redundancy are treated explicitly; candidates have inputs, unsupported behavior, unique actions, proof/rejection and cost; proposed initiatives reuse the current dependency work and have visible cut lines.

**Not established:** measured cross-metric correlations, predictive validity, actual runtime/GUI impact, analyzer parity on unexecuted grammar cases, or the comparative usefulness of any proposed default. Tree-sitter switch/parameter constructs and certain selection/area failures should be reproduced in fixtures/browser before being promoted from source-derived hypotheses to runtime bug claims. No repository-wide numeric scan results were invented.

**Source limits:** selected text is not an installed/resolved dependency environment or an authenticated Git object. Tool documentation and public main branches can differ from packaged stable releases. The PMD snapshot page's future date is explicitly not a release assertion. Four static vendor screenshots were inspected, not live products. The coverage paper's direct publisher page was unavailable; its publisher search abstract supplied supporting context only. Research references do not grant rights to copy commercial implementations or restricted rules.

There is no missing required deliverable. The requested legacy dependency component is superseded by readable current code, and this substitution is documented rather than hidden. Tests/builds and final initiatives are deliberately left to Codex's authorized follow-through, as required by the prompt—not reported as completed here.

## 11. Primary source register

All sources below were retrieved **2026-10-15**. Primary sources establish definitions, documented capabilities, creator attribution or the stated research findings. Vendor benefit claims are not adopted as measured effectiveness for Srcly. `sources.json` provides machine-readable evidence types and limitations; `reading-manifest.json` preserves input hashes and code-path offsets.


**S01 — [Savoia, This Code is CRAP (2011)](https://testing.googleblog.com/2011/02/this-code-is-crap.html)**. creator article. Retrieved 2026-10-15. Origin, basis-path input, formula, >30 heuristic; not a validated defect model.

**S02 — [Savoia, Introducing crap4j (2007)](https://www.artima.com/weblogs/viewpost.jsp?thread=215899)**. creator article. Retrieved 2026-10-15. Experimental formula, Evans collaboration, historical name, >=30 convention; example table contains an arithmetic inconsistency.

**S03 — [GMetrics CrapMetric](https://dx42.github.io/gmetrics/metrics/CrapMetric.html)**. official documentation. Retrieved 2026-10-15. Configurable coverage provider; Cobertura line-coverage example is a variant of the original coverage kind.

**S04 — [SonarQube Server metric definitions](https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition)**. official documentation. Retrieved 2026-10-15. Rolling page identifies 2026.5. Metric definitions and overall/new-code distinction; not an independent release verification.

**S05 — [Sonar cognitive-complexity rationale](https://www.sonarsource.com/blog/cognitive-complexity-because-testability-understandability/)**. metric author's vendor article. Retrieved 2026-10-15. Understandability rationale and nesting/flow principles; historical article, not a complete current language implementation specification.

**S06 — [Muñoz Barón, Wyrich, Wagner: empirical cognitive-complexity validation](https://arxiv.org/abs/2007.12520)**. original research abstract. Retrieved 2026-10-15. Evidence about understandability outcomes; does not establish incremental value in Srcly.

**S07 — [Landman et al.: relationship between CC and SLOC](https://www.rascal-mpl.org/blog/2016/01/01/empirical-analysis-of-the-relationship-between-CC-and-SLOC/)**. authors' research summary. Retrieved 2026-10-15. Aggregation and transformations affect relationships; association is not a metric-removal rule. Publisher lists a corrigendum; no numerical coefficient is relied upon here.

**S08 — [CodeScene hotspots](https://docs.enterprise.codescene.io/latest/guides/technical/hotspots.html)**. official documentation. Retrieved 2026-10-15. Activity plus structural context and drilldown; vendor benefit claims are not treated as Srcly validation.

**S09 — [CodeScene change coupling](https://docs.enterprise.codescene.io/latest/guides/technical/change-coupling.html)**. official documentation. Retrieved 2026-10-15. Co-change investigation and interpretation, including useful and problematic coupling.

**S10 — [CodeScene X-Ray](https://docs.enterprise.codescene.io/latest/guides/technical/xray.html)**. official documentation. Retrieved 2026-10-15. On-demand method-level investigation, trends and coupling.

**S11 — [CodeScene hotspot details example](https://docs.enterprise.codescene.io/latest/_images/HotspotsContextMenu.png)**. official static screenshot inspected. Retrieved 2026-10-15. Visually inspected circle map, filters, selected-file metrics, source/review/X-Ray controls. Example numbers are not study data.

**S12 — [CodeScene coupling sidebar example](https://docs.enterprise.codescene.io/latest/_images/changeCouplingSidebar.png)**. official static screenshot inspected. Retrieved 2026-10-15. Visually inspected peer list, coupling-source label and highlighted relationships.

**S13 — [NDepend treemap documentation](https://www.ndepend.com/docs/treemap-visualization-of-code-metrics)**. official documentation. Retrieved 2026-10-15. Independent level/size/color selection and linked inspection.

**S14 — [NDepend metric definitions](https://www.ndepend.com/docs/code-metrics)**. official documentation. Retrieved 2026-10-15. Type-level coupling and named LCOM variants; language/model dependence.

**S15 — [NDepend size-metric menu example](https://www.ndepend.com/Doc/Treemap/TreemapSizeMetrics.png)**. official static screenshot inspected. Retrieved 2026-10-15. Only the dropdown/level controls were visually inspected; not a running full treemap.

**S16 — [JArchitect metrics](https://www.jarchitect.com/Metrics)**. official documentation. Retrieved 2026-10-15. Java-oriented metric reference; grouped as a related family rather than independent validation.

**S17 — [CppDepend product overview](https://www.cppdepend.com/)**. official product documentation. Retrieved 2026-10-15. Current page advertises C/C++, Java and Rust; no claim of complete feature parity among languages.

**S18 — [CppDepend dependency matrix example](https://www.cppdepend.com/images/docs/matrix_dsm.png)**. official static screenshot inspected. Retrieved 2026-10-15. Visually inspected hierarchical dependency matrix, numerical cells and selected-type details.

**S19 — [Understand graph catalog](https://docs.scitools.com/help/reference/graph-catalog.html)**. official documentation. Retrieved 2026-10-15. Question-specific graph catalog; no interactive session or screenshot inspection claimed.

**S20 — [SciTools Understand overview](https://scitools.com/understand)**. official product documentation. Retrieved 2026-10-15. Semantic exploration product; vendor positioning, not measured comparative performance.

**S21 — [Lizard public repository](https://github.com/terryyin/lizard)**. official public code/documentation. Retrieved 2026-10-15. Lightweight function CCN, LOC and parameter analysis; Srcly's resolved dependency version remains unknown.

**S22 — [Radon metric definitions](https://radon.readthedocs.io/en/master/intro.html)**. official documentation. Retrieved 2026-10-15. Python CC construct rules, Halstead and MI formulas; MI experimental warning.

**S23 — [Xenon public repository](https://github.com/rubik/xenon)**. official public code/documentation. Retrieved 2026-10-15. Radon-backed enforcement of block/module/total complexity limits.

**S24 — [scc public repository](https://github.com/boyter/scc)**. official public code/documentation. Retrieved 2026-10-15. Current main documents counting, optional approximate cognitive complexity and Git hotspot/coupling capabilities; pin a release before integration.

**S25 — [PMD/CPD duplication documentation](https://pmd.github.io/pmd/pmd_userdocs_cpd.html)**. official documentation. Retrieved 2026-10-15. Established token-clone workflow. Page is a development snapshot with a future-dated 2026-10-30 header; not evidence that that release is available on retrieval date.

**S26 — [jscpd public repository](https://github.com/kucherenko/jscpd)**. official public code/documentation. Retrieved 2026-10-15. Current main documents Rust v5 and legacy Node v4; no executable was installed or run.

**S27 — [jscpd Rust documentation](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md)**. official public code/documentation. Retrieved 2026-10-15. Artifact and baseline workflows; verify a pinned release's schema before an adapter.

**S28 — [ESLint complexity rule](https://eslint.org/docs/latest/rules/complexity)**. official documentation. Retrieved 2026-10-15. Configurable classic/modified cyclomatic counting and JavaScript-specific branch cases.

**S29 — [typescript-eslint no-unsafe-assignment](https://typescript-eslint.io/rules/no-unsafe-assignment/)**. official documentation. Retrieved 2026-10-15. Type-aware unsafe-any flows require type information; explicit token counts are not equivalent.

**S30 — [Semgrep licensing](https://docs.semgrep.dev/licensing)**. official licensing documentation. Retrieved 2026-10-15. CE LGPL-2.1 versus proprietary capabilities and separate restrictive Semgrep-maintained rule license. Integration needs license review; this is not legal advice.

**S31 — [Semgrep triage and remediation](https://docs.semgrep.dev/semgrep-code/triage-remediation)**. official documentation. Retrieved 2026-10-15. Finding triage workflow; no proprietary engine or web UI session was exercised.

**S32 — [Qodana UI overview](https://www.jetbrains.com/help/qodana/ui-overview.html)**. official documentation. Retrieved 2026-10-15. Problems/baseline views, source/rule detail, hide versus exclude versus baseline; page updated 2026-10-12.

**S33 — [coverage.py branch measurement](https://coverage.readthedocs.io/en/latest/branch.html)**. official documentation. Retrieved 2026-10-15. Line/arc distinctions, partial-branch evidence and exclusions; combined percentages are not pure branch coverage.

**S34 — [Istanbul nyc repository](https://github.com/istanbuljs/nyc)**. official public code/documentation. Retrieved 2026-10-15. Source maps, reporting and all-files eligibility; unvisited files need not appear under defaults.

**S35 — [Stryker mutant states and metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)**. official documentation. Retrieved 2026-10-15. Detected/undetected/invalid states and denominators; killed plus timeout in documented score.

**S36 — [PIT basic concepts](https://pitest.org/quickstart/basic_concepts/)**. official documentation. Retrieved 2026-10-15. Java bytecode mutation, test selection and equivalent-mutant limitation.

**S37 — [dependency-cruiser repository](https://github.com/sverweij/dependency-cruiser)**. official public code/documentation. Retrieved 2026-10-15. Declarative architectural constraints and textual/graphical violation reports; MIT.

**S38 — [Git log manual](https://git-scm.com/docs/git-log)**. official documentation. Retrieved 2026-10-15. History traversal, merge policy, numstat and rename limitations; --follow is single-file only.

**S39 — [Inozemtseva and Holmes: Coverage Is Not Strongly Correlated with Test Suite Effectiveness](https://dl.acm.org/doi/10.1145/2568225.2568271)**. original research, publisher search abstract only. Retrieved 2026-10-15. Publisher search abstract retrieved; direct open failed. Supporting context only; effectiveness uses a testing proxy, not proof of real defect prediction.

## 12. Handoff summary

Files: `research-report.md`, `current-metrics.json`, `candidate-metrics.json`, `tool-survey.md`, `recommendations.md`, plus source/provenance/validation companions in `srcly-metrics-research.zip`.

Inspected baseline: the attached selected-source snapshot at `83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4`. Top decisions: repair meaning/support first; retain a compact source core plus neutral diagnostics; prove history, architecture and clone evidence separately; import test/static evidence rather than executing tools during scans; keep CRAP component-first and optional.

The central uncertainty is empirical incremental value, not whether more numbers can be computed. Codex should independently verify decisive claims, disposition the stable recommendations, run the prescribed real-checkout tests, create the final initiatives and open any review PR under its separate authorization. No integration or repository write occurred in this research.
