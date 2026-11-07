# Srcly: custom results and repository policy — design research

Build a small, file-first results import boundary and a declarative repository policy around the same per-scan context. Let a developer emit a native JSON bundle containing typed numeric observations and separately typed diagnostics, then use those observations in Srcly's existing tree, metric picker, Explorer, Hot Spots, code viewer, and headless reports without adding fields to Srcly for every metric. Put repeatable interpretation and defaults in `srcly.toml`, with an equivalent `[tool.srcly]` form. Start with imported files and an explicit zero/unknown/source-match contract; add dependable repository configuration, a diagnostic adapter, explicit local command execution, and saved-snapshot comparison in useful stages. Keep coverage denominators and graph relationships as distinct evidence types, and keep arbitrary producer code outside the Srcly process.

**Status:** Design recommendation, not an implementation or approval to change the repository.  
**Baseline:** supplied packet for `aea1015258f56dd45b8e175f7288e2fef3abc6cf`, described as 1.2.0 plus graph changes.  
**Research date:** October 22, 2026, America/Indianapolis; web retrieval completed October 23 UTC.  
**Handoff:** Codex verifies the findings against a full checkout, writes the new initiative, and owns all code changes.

## 1. Decision and boundaries

### Recommended route

| Route | Decision and tradeoff |
| --- | --- |
| Import an existing artifact | Useful immediately when the artifact carries the required semantics. Adapt diagnostics and coverage independently. Import alone is an execution strategy, not a definition of arbitrary metrics. |
| Small native results contract | **Build first.** A coworker can write JSON from any language, keep their analyzer private, and supply units, completeness, source identity, and aggregation explicitly. Srcly owns validation and presentation. |
| Command-based producer | **Build later over the same contract.** Adds convenience and repeatability, but also process lifetime, environment, failure, and freshness obligations. Execution must be explicit. |
| In-process plugin | **Avoid for this initiative.** It couples producer code to Srcly's Python environment, internals, and release lifecycle without improving the first visualization use case. |

These are not four mutually exclusive file formats. The native bundle is the interchange boundary; imports consume it, adapters create its normalized equivalent, and optional commands produce it. This leaves one consumer pipeline.

**First proof:** a clean, temporary Git fixture with three TypeScript files, one namespaced file metric, values `2`, `0`, and unknown, plus one line diagnostic. A minimal config selects the import and metric. Demonstrate the same accepted evidence in the UI and report. Do not begin with an analyzer SDK, coverage attribution, or command scheduler.

**Ambitious end state:** a repository can combine built-in metrics, private file measurements, saved diagnostic output, and later coverage or graph evidence; choose explicit interpretations; run selected local producers; and compare self-contained snapshots without installing those producers. It remains one local Python/FastAPI application with one matching SolidJS client release.

### Evidence categories used here

- **Observed:** behavior supported by supplied complete source files or tests read as source.
- **Inference:** a consequence of that code and documented external behavior; not reproduced here.
- **Proposed:** a new contract, command, setting, UI behavior, or implementation change.
- **Unverified:** an integration whose implementation was omitted from the packet.

No application, repository test suite, project checker, or producer was executed for this research. No production file was modified.

## 2. What the supplied baseline actually supports

The existing catalog is a strong presentation seam, but it is not yet an arbitrary-metric storage or execution interface.

| Observed boundary | Consequence for this design |
| --- | --- |
| `models.Metrics` has named Pydantic fields. `analysis_types.MEASURED_FILE_METRICS` and `MEASURED_SCOPE_METRICS` determine what analyzer values are copied. | Adding a catalog entry alone cannot store an external metric. Preserve this built-in path and add a typed custom-observation map. [R1] |
| `metric_catalog.METRICS`, `METRICS_BY_ID`, and `RANKABLE_IDS` are static. `routers/metrics.get_metric_catalog` serves a global catalog. | Build an effective catalog for a scan rather than mutating module globals. [R2] |
| `run._run_headless` uses fixed argparse metric choices; `reporting.PROFILE_WEIGHTS` is created at import time. | Resolve config and imports before validating IDs; pass catalog and profile context into reporting. [R2, R3] |
| `analysis.aggregate_metrics` uses hard-coded sum/max/mean rules; existing means use function-count weights. | Catalog aggregation labels are not an executable custom-aggregation engine. Add a bounded custom rollup pass. [R1] |
| `metricsStore` has string metric IDs but a global catalog/map. Applicability comes from language/scope assumptions. | String IDs help, but definitions, observation states, and catalog updates still need explicit types and reactive context. [R4] |
| `rank_by_metric` supports numeric ordering and N/A, but composite `rank_nodes` divides by cohort maxima. | Distinguish raw ranking from composite scores; do not silently apply current composite math to lower-worse imports. [R3] |
| `reporting.build_findings` produces metric-derived triage items, while `findings.model.Finding` represents checker diagnostics. | Export real diagnostics separately. Reusing the word “findings” must not collapse the two data models. [R3, R5] |
| Normal and cached UI scans start findings jobs. Headless `reporting.scan_tree` also runs checks. Portable findings planning still includes bundled Ruff and Srcly TS checks. | “Import-only” needs a real checks-off policy. Portable is not a no-execution mode. [R5, R6] |
| `config.py` contains constants, not repository policy resolution. Activity preference uses a global localStorage key. | Introduce one resolver and repository-scoped personal preferences; do not scatter TOML reads through consumers. [R7] |

Additional integration details matter:

- `MetricSpec.to_json` does not include compare role or profile weights. A saved effective catalog must deliberately include comparison semantics and the selected interpretation. [R2]
- `reporting._metrics_subset` and `_format_evidence` suppress falsey zero in some summaries. These summaries cannot serve as lossless results interchange. [R3]
- `colors.domainOf` falls back to complexity for unknown IDs, `treemapRampPosition` clamps nonpositive values, and `scaleValue` can divide folder sums by all files. Those shortcuts are wrong for some custom or partially measured metrics. [R4]
- `explorerColumns.metricCellIsFaint` treats zero as faint. Lower-worse zero may be the most important measured value; missing-data presentation cannot be reused for it. [R4]
- The nested `analysis.attach_file_metrics.convert_function` creates Srcly scope paths from file and scope names. These are not an external stable symbol identity contract. [R1]
- `models.Witness` identifies a function or component responsible for a maximum. An imported line range should be its own evidence reference, not a fabricated function witness. [R1]

## 3. Primary-source comparisons and the lessons to borrow

The following are current primary documentation or official source. They guide the design; none is treated as proof of behavior in the attached Srcly baseline.

| Reference | Useful lesson for Srcly |
| --- | --- |
| **OASIS SARIF 2.1.0** | Rules, results, locations, URI bases, invocation status, and extensible properties make it a strong diagnostics interchange. It can carry numbers in property bags and has graph facilities; it does not establish Srcly's arbitrary-metric units, applicability, zero semantics, or folder aggregation. Use a diagnostics adapter, not a claim that SARIF is a complete metric model. [S1] |
| **SonarQube generic external issues** | Separates rule identity from issue instances and lets externally generated issues be imported. External rule management remains distinct from native quality profiles. Borrow that ownership separation. [S2] |
| **SonarQube generic test data** | Coverage represents line opportunities and covered branches; test execution is another format. This supports a typed coverage record, not one overloaded “quality number.” [S3] |
| **coverage.py JSON and LCOV** | Import counts and opportunities as well as display percentages. coverage.py's summaries distinguish statements and branches; LCOV has file, line, and branch records. Pin representative producer outputs before building an adapter; do not average file percentages. [S4, S5, S6] |
| **ESLint configuration and plugins** | Matching configuration objects can layer rules; local and virtual plugins support project-specific checks. Let a coworker keep AST rule authoring in an appropriate tool and export its output. Srcly does not need to reproduce that rule framework. [S7, S8] |
| **Ruff configuration** | Dedicated TOML and `pyproject.toml` are practical, while discovery, precedence, and explicit extension are real product semantics. Srcly should document its own simpler one-policy rule instead of accidentally imitating part of Ruff's per-file behavior. [S9] |
| **PyPA pyproject specification** | `[tool.srcly]` is a natural Python-project accommodation. A dedicated file remains the language-neutral default. [S10] |
| **CodeCharta** | Separation between analysis/import and local visualization supports an artifact boundary. Its interchange/versioning documentation is useful precedent for explicit data contracts, not a reason to copy its full schema or compatibility strategy. [S11, S12] |
| **SonarQube plugin development** | In-process extension brings a plugin API and packaging lifecycle. The documented import routes are the closer fit here. The research does not claim that Sonar cannot support custom measures through other extensions; detailed current custom-metric plugin APIs were not established. [S13] |

For execution status, SARIF explicitly distinguishes successful execution from the numeric exit code. Srcly already has tool-specific accepted codes for tsc and ESLint. A generic “nonzero means no usable result” rule would regress that distinction. [S1; R5]

## 4. One envelope, several typed result families

### Native bundle v1

**Proposed:** JSON, strict parsing, one versioned envelope, no executable expressions. The first supported payloads are file measurements and diagnostics. Coverage and graph evidence may later share producer/source metadata but get their own record types and validators.

The following is a complete illustrative bundle. Replace the revision placeholder with the full commit ID of the fixture; it is not an artifact generated during this research.

~~~json
{
  "format": "srcly-results",
  "version": 1,
  "producer": {
    "id": "acme.review",
    "version": "0.1.0"
  },
  "run": {
    "id": "review-001",
    "status": "complete"
  },
  "source": {
    "kind": "git-clean",
    "revision": "<full immutable fixture commit ID>",
    "dependency_scope": "file",
    "shared_inputs": []
  },
  "metrics": [
    {
      "id": "acme.review/debt_count",
      "definition_version": 1,
      "label": "Review debt",
      "short_label": "Debt",
      "description": "Count of REVIEW_DEBT markers in the file.",
      "value_type": "integer",
      "minimum": 0,
      "unit": "markers",
      "unit_one": "marker",
      "direction": "higher-worse",
      "aggregation": "sum",
      "compare": "direction",
      "applies_to": {
        "scope": "file",
        "extensions": [".ts"]
      }
    }
  ],
  "observations": [
    {
      "path": "src/a.ts",
      "metric": "acme.review/debt_count",
      "state": "measured",
      "value": 2,
      "evidence": [
        { "line": 2, "end_line": 3, "message": "Two review markers." }
      ]
    },
    {
      "path": "src/b.ts",
      "metric": "acme.review/debt_count",
      "state": "measured",
      "value": 0
    },
    {
      "path": "src/c.ts",
      "metric": "acme.review/debt_count",
      "state": "unknown",
      "reason": "producer-skipped"
    }
  ],
  "diagnostic_runs": [
    {
      "id": "owner-check",
      "status": "complete",
      "applies_to": { "scope": "file", "extensions": [".ts"] },
      "checked_files": ["src/a.ts", "src/b.ts"],
      "findings": [
        {
          "path": "src/a.ts",
          "line": 2,
          "end_line": 2,
          "rule_id": "missing-owner",
          "severity": "warning",
          "message": "This review marker has no owner."
        }
      ]
    }
  ]
}
~~~

The scalar counts **all** review markers; the diagnostic reports **one** marker with a missing owner. They are related evidence, not interchangeable totals.

### Contract rules

| Concern | Proposed v1 rule |
| --- | --- |
| Identity | Custom IDs are bounded, namespaced strings, such as `acme.review/debt_count`. Use one slash, lowercase ASCII namespace/name tokens with letters, digits, dot, underscore, or hyphen; each token begins with a letter, total length at most 128. Reserve unnamespaced built-ins and namespaces `srcly` and `srcly.*`. |
| Definition ownership | The producer owns meaning, unit, value type, applicability, aggregation, and direction. Config may interpret the value but cannot redefine these fields. A semantic change requires a new definition version or ID. |
| Numeric validation | Accept finite JSON numbers with strict integer/number checks and optional bounds. Reject booleans, strings, NaN/infinity, inconsistent states, duplicate object keys, and out-of-bounds values. |
| Applicability | V1 is file-only with an explicit extension set; the importer intersects it with files actually present in the scan. No inherited analyzer-language assumption. Extension matching uses the scanned path's exact suffix; case is not silently folded. |
| Measured zero | `state=measured, value=0` is an observation. It remains in exports, completeness, ranking, and any weighted denominator. |
| Unknown | Eligible but missing, skipped, failed, stale, or unverified is unknown with a reason. Omission never means zero. Unknown carries no numeric value. |
| Not applicable | A target outside the definition's declared applicability is N/A, not part of its eligible cohort. V1 must not let a producer relabel an eligible missing file as “not applicable” to improve completeness. Later denominator-based types can define valid no-opportunity cases. |
| Evidence | Optional file-relative, one-based inclusive line ranges. Validate range order and source bounds. Absence of line evidence does not invalidate a file measurement. Column encodings and external symbol joins are deferred. |
| Completion | A completed invocation does not imply every eligible file was measured. Per-file observations and checked-file sets establish completeness. |
| Diagnostic absence | Run applicability defines eligible files. A source-matched eligible file in a complete run's `checked_files` with no findings has zero for that check set. All other eligible files remain unknown. Findings/checked paths must respect applicability. |
| Failed/partial runs | Preserve accepted positive diagnostic evidence as partial where appropriate; do not rank it as a complete count. A failed run cannot assert successful measurements merely by including parseable values. |
| Bounded input | Apply file-size, record-count, string-length, and nesting limits. Reject invalid records without shrinking the eligible-file denominator; reject structural or definition ambiguity for the affected import. |

Use `Map`/validated dictionaries for IDs. Never interpolate an ID into a Python attribute, filesystem path, SQL expression, or executable text. Render labels and messages as text.

Wire observation states are exactly `measured`, `unknown`, and `not_applicable`. Native run status is `complete`, `partial`, or `failed`; local execution also records `cancelled`. In v1 only a complete top-level run supplies trusted scalar observations. An explicit unknown observation is compatible with a complete invocation. Partial/failed/cancelled runs can preserve inspectable positive diagnostic evidence, but cannot establish complete counts or trusted scalar values.

Diagnostic check sets use the same native completion statuses. Normalized severity is `error`, `warning`, or `note`; retain an adapter's original severity separately when normalization loses detail. A diagnostic may be file-level without a line range; it does not need a fabricated line 1.

Preserve the original producer observation when source matching fails. Its effective accessor state becomes unavailable/unknown with a source reason; do not rewrite a producer's raw measured value into a fabricated unknown record. Malformed diagnostic rows invalidate clean-zero assertions for the affected file, or quarantine the check set if the affected target cannot be identified.

### Storage and access

Add a typed field such as `Node.measurements: dict[str, MeasurementObservation]` beside the existing `Node.metrics`. Use a discriminated union for measured/unknown/N/A states, separate source-match status, and evidence references. Do not add arbitrary attributes to `Metrics` or overload `na_reason` with an unstructured second data model.

Introduce small accessors, for example `metric_observation(node, id, context)` in Python and `metricObservation(node, id, context)` in TypeScript. They adapt existing built-in values and the custom map to one consumer shape. This is a deliberate boundary, not an application-wide typing rewrite.

Build `EffectiveCatalog = built-in definitions + validated imported definitions + allowed interpretation overrides`. Keep immutable built-in definitions and per-scan effective objects. Resolve duplicates before exposing a selectable metric.

### Conflicts and provenance

- Record producer ID/version, definition version, run ID/status, source reference, import location, import time, and match status. Time alone is never freshness proof.
- A metric ID has one selected producer. Identical repeated imports are idempotent. Different definitions or values for the same producer/subject/metric in simultaneously selected inputs do not use “last file wins.”
- Reloading one configured import atomically replaces its previous accepted evidence snapshot after validation. The previous snapshot is historical, not a competing producer; failed reloads leave it explicitly previous/stale.
- Reject ambiguous definitions; quarantine conflicting observations and explain which imports disagree. Do not silently sum independently computed results.
- A later explicit producer selection may disambiguate two sources of one metric. Do not need a configurable conflict-expression language.
- Top-level `run.id` identifies an invocation; `diagnostic_runs[].id` identifies a stable check set such as `owner-check`. Derive counts per producer plus check set, with exact duplicate normalization inside that set. Reserve generated identities; a producer cannot redefine them with a contradictory scalar.
- Do not automatically add overlapping check-set counts to each other or to built-in counts. Successful check-set findings remain visible; an optional selected combined count is unavailable or explicitly partial while any required covering set is incomplete.
- Custom metrics get no built-in report-profile weight by default. A diagnostic count and a correlated custom metric must not accidentally be counted twice.

### What coverage and graphs need beyond scalars

**Coverage:** preserve covered and total opportunities for lines and branches, plus line/branch evidence. A folder ratio is `sum(covered) / sum(total)`, not the mean of percentages. No opportunities should be N/A with an explicit reason. Statement coverage, branch coverage, and a combined producer-specific percentage are distinct metrics. A scalar percentage may be displayed as a file measurement with `aggregation=none`, but that does not make it a coverage implementation. [S3–S6]

**Graphs:** preserve typed endpoints, edges, original source witnesses, and graph completeness. An imported fan-out count does not reconstruct a graph, and a graph can contain meaningful incomplete or external endpoints. Clone peers are relationships, not merely a duplication percentage. Keep these as later consumers of common provenance and source matching.

**Scopes:** defer external function/component observations. Matching by function name, nearest line, or Srcly's synthetic `::` path is insufficient for overloaded functions, nesting, transformations, and renames. A future scope identity contract must be earned by a real producer.

## 5. Source matching and joins

A valid artifact is not automatically a current artifact. Srcly computes source-match state; it never trusts a producer-supplied `matched=true`.

### Small verified first slice

Support `source.kind=git-clean` and `dependency_scope=file` first.

- Resolve the repository root as the enclosing Git worktree top level.
- Measurement subjects, diagnostic paths, and checked-file paths are repository-relative POSIX paths.
- Validate regular tracked files, reject absolute paths, traversal, NULs, sibling-prefix tricks, and symlink escapes.
- Verify that bytes represented by the accepted scan snapshot match the recorded revision's blobs; separately check current bytes before displaying live-line evidence. Source changes during scanning/joining trigger retry or quarantine. HEAD equality, clean status, or stat metadata alone is insufficient.
- Compare every declared shared producer input with its revision blob as well. A file-local rule can still depend on shared configuration.
- A changed subject quarantines that subject. A changed shared rule/config input quarantines all dependent records.
- The first fixture intentionally uses plain UTF-8 files with no checkout filters or line-ending transformation. M1 may conservatively report transformed files as unverified; broader byte identity belongs in M2.

This is consistency with the producer's claimed inputs, not proof that the producer computed honestly. Imports must not require the original executable to be installed.

### Dirty trees and non-Git projects

Add `source.kind=content` in the next milestone, with producer-supplied per-file content identities embedded in the bundle for subjects and shared inputs. Verify exact analyzed bytes. This is a contract proposal, not a request for a separate manifest or checksum deliverable.

A file-local producer must declare shared computation inputs. A repository-dependent producer needs an input-set identity that includes relevant file additions/deletions, generated inputs, configuration, and other dependencies. Unknown dependency closure stays **unverified**; declaring “repository” does not magically establish freshness. General repository-wide dependency verification can follow file-local support.

| Computed association | UI/report behavior |
| --- | --- |
| Matched | Join accepted observations; permit ranking and applicable gates. |
| Mismatched | Explain stale source; exclude current numeric overlays and line markers. |
| Unverified | Allow inspection of producer output with its reason; exclude trusted ranking/gates. |
| Outside scan | Count skipped associations; do not create source nodes or widen the scan. |
| Unknown path inside root | Report unmatched path; do not silently attach to a similar filename. |

Narrowing a scan to `packages/web` does not reinterpret artifact paths relative to that directory. The source root remains the worktree root; only the join is filtered.

For non-Git projects, the selected scan directory, or the parent of a single-file target, is the source root in the first content-identity implementation. Scanning a different subtree is a different context; explicit alternate artifact source roots can wait.

### Renames and code display

- Do not guess renames or normalize case across case-sensitive paths.
- A renamed file requires a regenerated artifact or a later explicit, verified mapping. Git activity's own rename-following behavior is not permission to reuse stale imported line evidence.
- Associate code-viewer requests with the scan/evidence ID. Recheck current bytes before showing live-line evidence, or display saved matching source when available.
- If the file changed since import, retain an inspectable stale diagnostic, but do not mark its old line as a current defect.

## 6. Rollups, ranking, colors, reports, and comparison

### Numeric rollups

Build only `sum`, `max`, and `none` for custom file metrics initially.

- The eligible set is scanned files matching the descriptor. Missing or malformed observations never remove files from it.
- Track measured, unknown, and inapplicable counts independently.
- No measured files means N/A.
- A partial sum is a **subtotal**, with “2 of 3 eligible files measured.” It is a lower bound only for a nonnegative metric.
- A partial maximum is the maximum of the measured subset, not the complete folder maximum.
- `none` leaves a folder value unavailable while retaining file values.
- Do not sum a file's custom value again through its function children.
- Keep partial folder values out of complete-value comparisons and gates unless a future explicit partial-data operation is designed.

Defer weighted means, minimum, ratios, distributions, and percentile aggregation until a producer supplies the necessary sufficient statistics. Do not reuse built-in `function_count` weights for arbitrary means.

### Four independent interpretation concepts

| Concept | Exact responsibility |
| --- | --- |
| Color stops | Numeric low/mid/high interpolation points for display. Always strictly increasing; invert attention colors for lower-worse metrics. Neutral metrics show magnitude without “good/bad” claims. |
| Risk bands | Explicit raw-value comparisons such as warning `>= 5`, critical `>= 10`. Highest matching severity wins. No mutation of the measurement. |
| Quadrant cutoffs | Thresholds on the axes of a named preset. A quadrant's raw axis is not automatically a normalized risk score. |
| Profile weights | Contributions to a composite prioritization score, with a declared normalization method and completeness. They are not color stops or CI rules. |

The rich config below introduces named, explicit-anchor profiles. For each risk metric:

~~~text
contribution = clamp((value - good) / (bad - good), 0, 1)
score = sum(weight × contribution) / sum(available weights)
~~~

Require finite distinct anchors, direction-consistent order, nonnegative weights, and at least one positive weight. Lower-worse has `bad < good`. If no positive-weight measurement is available, the score is N/A. Otherwise emit available-weight/total-weight completeness. A partial score is visibly partial and does not imply a complete gate result.

Existing built-in profiles currently normalize against cohort maxima. Preserve and label that existing method until intentionally changed; a new configured profile uses anchors for **every** member, including any built-in metric it selects. Do not silently mix normalization methods within one profile. Initial repository profiles use new names rather than redefining a shipped profile behind its familiar name. [R3]

For a custom metric without color stops, show values and a neutral unavailable-scale treatment until configured; do not borrow complexity's scale. This makes a missing interpretation explicit. Later producer-suggested display defaults can be validated without becoming raw semantics.

Raw file ordering remains direction-aware for signed values as well as nonnegative counts. Custom Hot Spots bars use the configured bounded color/attention transform, with lower-worse inversion; omit the bar when no scale exists. Do not retain `value / cohort_max` for custom bars: negative-only or mixed-sign values can produce invalid or misleading scores. Apply the same rule in `reporting.rank_by_metric` and `hotSpotRanking.rankHotSpots`; profile bars separately use the explicitly selected profile's anchor score.

### UI flow

1. Open a repository. The scan resolves policy and import metadata, then shows source analysis progress and a separate results status.
2. An **Imported results** section shows producer, matched/stale/unverified status, eligible/measured counts, and any unavailable import.
3. The metric picker lists **Review debt** with its producer and unit. Selecting it updates Explorer, tree colors, tooltip, legend, and Hot Spots together.
4. In the proof, `a.ts=2` ranks above `b.ts=0`; `c.ts` is in the unknown/N/A group. The folder reads “2 markers · 2/3 measured.”
5. The code viewer shows the scalar's optional range evidence separately from the warning “missing-owner” at line 2. Both show provenance.
6. **Reload results** rereads artifacts without rerunning a producer. **Refresh source** redoes analysis. **Run check…** is a separate explicit action introduced later.
7. A repository-default metric is offered when available. If it is unavailable, show the reason and a visible built-in fallback; do not override a deliberate current-session selection when the import later appears.
8. A settings inspector shows selected config, path bases, effective values, and their origins. Changing a slider remains a session action; saving repository policy is a separate deliberate edit.

Install tree, effective catalog, resolved interpretation, and evidence status as one immutable scan context. In Solid, make catalog lookup reactive to its context/revision; replacing a plain global map without a reactive dependency can leave derived colors stale. [R4]

### Reports

- Accept arbitrary validated metric IDs after resolving the effective context.
- Use the same observation accessor, ordering, applicability, and interpretation as the UI.
- Preserve raw measured zero, unknown reasons, completeness, definitions, producer provenance, and source-match status in machine-readable output.
- For the first proof, `report --include-tree` writes every observation in `tree.json`, its effective definition in `metrics.schema.json`, and actual checker records in the new `diagnostics.json`. Compact default report summaries are not a substitute for that lossless export.
- Keep actual diagnostics in a dedicated section/artifact such as `diagnostics.json`; keep existing metric-derived `findings.json` meaning explicit.
- Include context-specific definitions in the metrics schema output. Summaries can remain compact, but they are not the canonical lossless representation.
- A requested headless metric that is unavailable fails with an actionable error. Do not silently substitute complexity for `--metric acme.review/debt_count` or for a repository default selected for that report.
- No new standalone manifest is necessary for this capability; embed required context in the report/snapshot structures that need it.

The supplied headless `scan_tree` directly invokes analysis and findings rather than the UI raw-cache route, and `write_scan`/`build_report_payload` discard `refresh` with a stale cache comment. A shared context builder is required; current parity must not be assumed. [R3, R6]

### Saved-snapshot comparison

Each saved snapshot should contain raw observations, complete effective definitions, accepted diagnostics, source association, and the interpretation needed to explain its report. It must be readable without the producer or project dependencies installed.

Snapshot subject identity is a repository-relative POSIX path bound to that snapshot's logical source root. Compare relative subjects across base/head, not absolute `Node.path` values from different physical worktrees. Original checkout locations are provenance only. Source-line browsing requires embedded matching bytes or independently verified source; comparison does not fetch missing source.

- Match each side's artifact to **its own** source snapshot; base and head are expected to be different source revisions.
- Compare only equivalent IDs and entire semantic descriptors, including definition version, value type, units, bounds, aggregation, applicability, direction, and compare role, with matching producer identity. A producer executable-version change is visible metadata; if it changes measurement semantics, the producer must change definition version.
- Honor `compare=skip` by excluding the metric, `compare=neutral` by showing raw deltas only, and `compare=direction` by adding a directional verdict.
- Missing/unknown/stale on either side is noncomparable, not zero.
- Show raw deltas separately from better/worse judgments.
- Display config differences. For a judgment across two snapshots, use one explicitly named policy, defaulting to the base snapshot's interpretation, so weakening head thresholds does not silently make a regression favorable.
- Treat renamed paths as unmatched until an explicit source-backed mapping is supported.
- Do not run checks when opening or comparing saved snapshots.

The packet includes the compare CLI entry but omits compare implementation. Inspect the real comparison modules before editing; this section is a proposed contract, not a claim about existing snapshot support. [R8]

## 7. Repository configuration

### Format choice

| Format | Decision |
| --- | --- |
| Dedicated `srcly.toml` | Default: language-neutral, readable, comments, straightforward standard-library parsing. |
| `pyproject.toml [tool.srcly]` | Supported equivalent for Python repositories; identical normalized schema. |
| JSON | Good results interchange; less convenient for hand-maintained policy because standard JSON has no comments. |
| YAML or executable JS/Python | Defer YAML's extra parser surface; avoid executable policy. Neither is needed for the requested settings. |

Do not merge the dedicated and embedded forms automatically. If both exist at the selected policy root, error with both filenames unless an explicit `--config` selects one. A `pyproject.toml` without `[tool.srcly]` is not a Srcly config.

Ruff chooses nearest per-file configuration and has specific dedicated-file precedence; ESLint composes matching config objects. Those solve their own analyzer needs. Srcly's initial scan needs one stable catalog and interpretation, so adopt one policy per scan with no implicit nested inheritance. [S7, S9]

### Roots and discovery

| Term | Exact proposed meaning |
| --- | --- |
| Invocation directory | Resolve CLI paths here before any server working-directory change. |
| Scan root | The actual requested file/directory scope. Preserve an explicit narrow path. |
| Repository/source root | Git worktree top level; for non-Git content imports, the selected scan directory or parent of a file target initially. |
| Policy root | Git worktree top level; outside Git, scan directory or parent of a file target. |
| Config directory | Parent of the selected config. All config paths and globs are relative to this directory, including explicit `--config`. |

Default discovery inspects only the policy root. A root scan does not discover or merge `packages/a/srcly.toml`. An explicit `--config packages/a/srcly.toml` opts into that package policy without widening the scan. Config paths are normalized before containment checks.

A worktree uses its own checked-out policy, not the Git common directory. Cache identity and saved local preferences distinguish worktrees. Git's documented `--show-toplevel` supplies the relevant top-level worktree path. [S14]

The existing CLI already distinguishes omitted path (enclosing repository) from explicit `.` (the current narrower location); keep that distinction. [R7]

### Precedence and ownership

Read arrows as increasing precedence.

| Category | Rule |
| --- | --- |
| Semantic scan/report/gate settings | Built-in defaults → selected repo config → explicit CLI/API operation override. Use unset sentinels so parser defaults do not masquerade as explicit overrides. |
| UI defaults | Built-ins → generic personal convenience preferences → repository defaults → saved repository-specific personal choices → explicit launch/deep link → current session. |
| Machine resources | Built-ins → user/environment machine defaults → repository requests → explicit invocation; supported local ceilings apply last and are reported. |
| Execution | A producer declaration never authorizes itself. A selected explicit command/UI run authorizes that invocation. |
| Secrets | Local process environment only; never checked-in examples, diagnostics, report provenance, or config-inspector output. |

Lists replace lists. Named tables merge only through defined keys. `extend_exclude` is explicitly additive; there is no accidental “append every array” rule.

`--no-config` skips repository policy and its declared imports/producers; it does **not** secretly mean “run no checks.” A source-only bypass also specifies `--checks off --no-results`. With no new config, preserve the current built-in/project findings default initially, while clearly labeling it. The proposed modes are:

- `off`: no findings tools, built-in or project; ordinary source analysis still runs.
- `portable`: bundled checks only; not a sandbox and not no execution.
- `project`: current project-aware check planning plus bundled tools.
- Custom producers never join ordinary scans solely because they appear in config.

### What belongs where

- **Repository policy:** repeatable import locations, exclusions, requested resource budgets, metric interpretation, named profiles, named quadrant cutoff overrides, default metric/view/activity window, producer declarations, explicitly invoked gate definitions.
- **Native analyzer configuration:** Ruff rule selection, ESLint rules/plugins, TypeScript compiler options. Srcly should respect and report those inputs, not duplicate their configuration languages.
- **Personal preferences:** last selected view/metric per repository, panel sizes, optional local executable location preferences.
- **CLI/API overrides:** operation target, explicit metric/profile/window, config path, result import, resource limit, execution request, gate selection.
- **Session controls:** temporary colors, selected columns, filter/sort state, view controls; no automatic TOML writes.

Do not expose sniffing heuristics, SSE cadence, cache capacities, every thread scheduling constant, or internal palette implementation. Expose a resource knob only when its effect and invalidation are testable.

### Minimal proposed config

~~~toml
version = 1

[checks]
mode = "off"

[[imports]]
id = "team-review"
path = ".srcly/results/team-review.json"
expected_metrics = ["acme.review/debt_count"]

[defaults]
metric = "acme.review/debt_count"
view = "treemap"

[metrics."acme.review/debt_count"]
color_stops = [0, 1, 5]
~~~

This is enough for the first proof. Missing optional input leaves source analysis usable and the imported choice visibly unavailable; it never triggers execution.

### Richer proposed config

This shows distinct settings, not a requirement to implement every table in M1.

~~~toml
version = 1

[checks]
mode = "off"

[scan]
extend_exclude = ["generated/**", "vendor/**"]
max_file_bytes = 2097152

[resources]
workers = 4
file_timeout_seconds = 10

[defaults]
metric = "acme.review/debt_count"
view = "treemap"
activity_window = "30d"
profile = "review"

[[imports]]
id = "team-review"
path = ".srcly/results/team-review.json"
expected_metrics = ["acme.review/debt_count"]

[metrics."acme.review/debt_count"]
color_stops = [0, 5, 15]
risk = [
  { level = "warning", operator = ">=", value = 5 },
  { level = "critical", operator = ">=", value = 10 },
]

[quadrants.activity]
x_cutoff = 15
y_cutoff = 8

[profiles.review]
cohort = "file"
normalization = "anchors"

[profiles.review.metrics.complexity]
weight = 1.0
good = 5
bad = 20

[profiles.review.metrics."acme.review/debt_count"]
weight = 1.0
good = 0
bad = 10

# Declaring this command does not authorize an ordinary scan to run it.
[[producers]]
id = "team-review"
argv = ["node", "tools/review-checks.mjs"]
cwd = "."
output = ".srcly/results/team-review.json"
timeout_seconds = 60
accepted_exit_codes = [0]
inherit_env = ["PATH"]
env = { CI = "1" }

[[gates]]
id = "review-debt-limit"
metric = "acme.review/debt_count"
cohort = "file"
operator = "<"
value = 10
require_complete = true
~~~

Clarifications:

- The activity preset uses its named axes; these cutoffs do not redefine metric units or direction.
- The `review` profile applies explicit anchors to both members; it does not inherit the shipped general profile.
- The producer writes the native JSON bundle to stdout. Srcly owns the configured output path and atomically replaces it only after acceptance; it does not append an output argument.
- `inherit_env` is an allowlist for custom execution, with literal `env` additions. Platform-required variables must be explicit/documented, not a hidden inherit-all fallback.
- Gate `cohort=file` means every eligible file must satisfy the raw comparison. Zero eligible files is indeterminate by default, not a vacuous pass.
- Gate outcomes: pass `0`, numeric breach `1`, invalid/incomplete/unverified evidence `2`; cancellation `130`. The gate is evaluated only when requested.
- With `require_complete=true`, check completeness before issuing a numeric verdict; visible partial values cannot change an indeterminate result into a pass or breach.
- Risk rules and gates use raw values in declared units; profile scores and colors cannot change their result.

The existing `run._enforce_fail_on_payload` checks priority on metric-derived triage findings, so existing `--fail-on` is not the new raw-value gate contract. Preserve its documented behavior and reject combining `--fail-on` with `--gate` initially; the user must select the intended decision model. [R3]

Validate unknown keys and shape immediately. `expected_metrics` declares only expected identities, not their units or definitions; validate that list against an available bundle. It lets Srcly associate missing artifacts with unavailable metric IDs. Resolve other referenced IDs after loading imports. An unavailable declared import is an availability problem; an undeclared or misspelled ID is a configuration error. An explicit report request for an unavailable metric or a profile whose metric definitions are unavailable fails clearly; the interactive source tree remains usable. Available definitions with unknown per-file observations instead yield explicit partial/N/A values and score completeness.

The proposed `srcly config show PATH` prints the selected config, four relevant roots, resolved values and origins, with sensitive values redacted. “Reset to repository defaults” clears only personal view choices.

The proposed `srcly results validate FILE --root PATH` distinguishes artifact validation from gate evaluation: 0 means structurally valid and source-matched, even with explicit unknown observations; 1 means invalid structure/config; 2 means valid but mismatched/unverified source, or failure of an explicitly requested `--require-complete`. Ordinary incomplete cohorts remain visible metadata until a completeness requirement is requested.

## 8. Runtime, failure, and invalidation

### Execution stages and trust boundary

1. **Import:** read already generated files; no producer discovery or execution.
2. **Adapters:** normalize saved diagnostic/coverage formats without starting their tools.
3. **Explicit command:** run a named local producer through the same accepted-results boundary.
4. **Later automation, if requested:** explicit recurring/local orchestration can be considered; config discovery alone never grants execution authority.

A local producer is trusted code running with the user's permissions. An argv array, schema validator, or environment allowlist is not a sandbox. Do not promise network isolation or read-only behavior. Do not install missing project dependencies.

For custom execution, require an argv array, no shell, a configured cwd and managed output contained within the repository/source root after realpath resolution, bounded stdout/stderr and wall time, explicit accepted exit codes, and a cancellation handle wired to process-tree termination. Config-directory-relative paths do not change that containment boundary. Capture stdout provisionally, validate envelope/status/source association, then atomically accept it. A timeout, crash, malformed output, source mutation, or cancellation cannot turn the prior successful result into the current run's success.

Default custom execution caching **off**. Explicit rerun executes again. Import parsing and normalized overlays can still be cached independently. Dependency-aware producer execution caching should wait for a real closed input declaration.

### Concrete baseline pitfalls

| Observed/inferred pitfall | Required response |
| --- | --- |
| `tools.run_process` inherits the environment, collects unbounded output, and has timeout process-group handling but no findings cancellation token. `ScanJob.cancel` only cancels analysis. | Add output limits and wire job cancellation to actual subprocess lifetime; do not confuse dropping a job reference with stopping work. [R5, R6] |
| `FindingsJobManager.start` deduplicates on root and source fingerprint before the fuller runner key; scan jobs also deduplicate too coarsely. | Include relevant settings/execution identity in the job key. A new config cannot silently reuse a job planned with old inputs. [R5, R6] |
| Tool signatures use selected paths/mtimes and do not fully capture argv, environment, tool version, or transitive config. | Make native tool dependencies explicit or conservatively rerun. Do not claim exact freshness from an incomplete signature. [R5] |
| `overlay.file_findings` hides successful findings when another covering tool fails. | Retain positive evidence per producer while marking combined completeness unavailable/partial. [R5] |
| `typescript.TscTool.check`/`EslintTool.check` use prefix filtering in places. | New joins use resolved path containment, not string-prefix tests that accept sibling prefixes. [R5] |
| Ruff invocation lacks explicit no-fix overrides; Ruff allows config-driven fixing and fix-only behavior. | **Inference:** current project configuration may cause mutation or suppressed diagnostics. Verify with a targeted fixture, then force diagnostic-only flags for Srcly's bundled check path. No mutation was reproduced here. [R5; S15] |
| Ruff project-config signature discovery orders dedicated files differently from Ruff's documented precedence. | Match the tool's actual selected config and explicit extensions, or invalidate conservatively. [R5; S9] |
| Built-in TS can skip unreadable files while returning a broader checked list. | Verify unreadable-file completeness; an unread file must not become “checked clean.” [R5] |
| `FindingsJobManager.for_file` can prefer a finished job over a newer running one. | Bind code-viewer evidence to the requested scan/evidence identity. [R5] |

POSIX timeout behavior has supplied tests. Windows descendant termination and user cancellation are not established by the packet. Require a platform-specific test before claiming support; explicit producer execution may initially be unavailable on Windows while imports remain supported.

### Cache boundaries

| Identity | Included inputs and invalidation |
| --- | --- |
| Raw source analysis | Source fingerprint, Srcly/analyzer version, selected exclusions, size/time limits, and analysis-affecting settings. Worker scheduling alone need not change metric identity. |
| Accepted imported evidence | Artifact content, parser/contract version, producer/definition identities, source matching, checked-file completeness, and source dependency identity. |
| Existing check execution | Planned tools, accepted tool config inputs, argv/environment policy, tool identity, source dependency identity, and execution mode. |
| Interpretation | Effective catalog, color/risk settings, profile anchors/weights, quadrant cutoffs, and gate rules. |
| Activity | Existing repository/revision/window/day dimensions, kept separate from AST analysis. |
| UI view | Personal/session choices scoped to repository/worktree and active scan context. |

The current cache fingerprint is stat-oriented, and both source analysis and cache walking prune `.srcly*` directories. An imported artifact updated under `.srcly/results` therefore needs its own change detection; source-cache invalidation cannot stand in for it. The current overlaid-result signature also lacks full artifact/config identity. [R6]

Practical rules:

- Changing only color stops reuses accepted observations and AST results.
- Changing risk bands, gates, or profile anchors recomputes interpretation, not raw measurements.
- Changing exclusions or measurement-affecting limits rebuilds the relevant source tree.
- Changing a producer's native rule configuration invalidates dependent evidence, even if source files did not change.
- Changing the artifact rereads/revalidates it on the next request or explicit **Reload results**. A file watcher is optional later.
- Treat the selected Srcly policy and managed result files as control inputs, not code to be measured. Track normalized analysis-relevant Srcly settings in the raw identity. Do not ignore the rest of a shared `pyproject.toml` for external tools that depend on it.
- A stale prior result can remain inspectable as previous evidence, never silently current.
- Fix headless `refresh` through the shared context path; do not preserve the existing no-op behavior under a new promise.

## 9. Relationship to imported-quality-evidence

The four supplied initiative documents describe planned work, with an older baseline and a graph-first sequence. Their “no generic plugin” boundary is useful historical reasoning, not a veto on the owner's expanded request. The supplied initiative map marks the work planned; it is not implementation evidence. [R9]

| Earlier intent | New initiative treatment |
| --- | --- |
| Original graph-edge witnesses, cycles, clone-peer fidelity | Keep as distinct work or later consumers. Do not make them prerequisites for the custom-scalar proof. |
| Imported ESLint diagnostics | Reuse the objective and any later verified implementation; replace duplicate importer designs with the shared normalized diagnostic boundary. |
| coverage.py JSON and line coverage | Preserve as a concrete exploration after source matching and typed denominator rules. |
| Method coverage/CRAP | Defer: source/scope attribution and denominator semantics need separate proof. |
| No project execution during a normal scan | Historical boundary differs from the actual current findings runner, which already launches checks. Document and make current modes explicit. |
| No general plugin system | Retain the practical limit on in-process plugin infrastructure; optional command producers meet the expanded need without it. |

The new initiative should own native scalar results, common source/provenance/completeness, repository policy, explicit producer execution, and the consumer integration. Codex should reconcile overlapping old stages rather than leave two competing diagnostic pipelines. The owner has supplied demand; further customer validation is not a prerequisite.

## 10. Recommended rollout and cut line

1. **M1 — Visible native import:** the three-file fixture, minimal config, typed file values, one line diagnostic, UI/report parity.
2. **M2 — Trustworthy reusable imports:** dirty/non-Git file identities, strict validation, completeness/conflicts, reload, and separated cache identities.
3. **M3 — Repository policy:** exact discovery/precedence, settings inspector, resource/exclusion controls, risk/profile/quadrant interpretation, and explicit gates.
4. **M4 — Saved diagnostic adapter:** SARIF as the default first external format, preserving producer status and source certainty; use saved ESLint JSON first only if that is the actual initial artifact.
5. **M5 — Explicit producers:** bounded local command lifecycle over the same contract, with cancellation and native-check reliability fixes.
6. **M6 — Portable snapshots:** compare accepted evidence and policy without executing dependencies.

**Useful release cut:** M1–M3 already satisfy custom file metrics and repository settings. M4–M6 are independently useful additions, not reasons to delay that release.

**Deferred:** external scopes, means/ratios/distributions, full coverage rendering, graph interchange, rename heuristics, arbitrary expressions, repository-wide producer caching, automatic custom execution, remote producer services, marketplaces, and in-process plugin ABI.

The companion implementation plan gives runnable acceptance examples, actual edit targets, focused tests, and rollback/bypass per milestone.

## 11. Access, audit, and remaining questions

**Access status:** sufficient for a concrete design. All 43 selected files in the supplied archive were read. The attached prompt was read in full. No newer repository revision was substituted.

**Limits:** the packet is not a full checkout. It omits the compare implementation, actual code-viewer/marker routers and components, analyzer implementations, workers, shared snapshot fixtures, and lockfiles. Names drawn only from `docs/CODE_MAP.md` are navigation targets to inspect, not verified behavior. The report does not claim tests passed.

**Checked:** source-level data flow, runtime planning/caches, current selected tests, historical intent, and primary documentation. **Proposed:** all native bundle/config syntax, new commands, effective-context types, adapters, new exports, gates, and snapshot behavior.

**Nonblocking questions, with defaults:**

1. Which saved artifact will the coworker provide first? Default to native JSON for scalar measurements and SARIF for the first diagnostic adapter; use a representative real output before locking an adapter's details.
2. Does the first command-producer release need Windows support? Default to imports everywhere and explicit execution only on platforms with tested descendant termination.
3. Does the first real metric depend only on each file plus declared shared configuration? Default to that verified slice; repository-wide or generated-input dependency closure gets a separate extension rather than a guessed freshness guarantee.

### Complete repository file inventory

~~~text
AGENTS.md
README.md
docs/CODE_MAP.md
client/package.json
server/pyproject.toml
server/app/models.py
server/app/config.py
server/app/run.py
server/app/routers/metrics.py
server/app/routers/scans.py
server/app/services/analysis_types.py
server/app/services/metric_catalog.py
server/app/services/analysis.py
server/app/services/reporting.py
server/app/services/quadrants.py
server/app/services/activity.py
server/app/services/scan_jobs.py
server/app/services/cache.py
server/app/services/findings/__init__.py
server/app/services/findings/model.py
server/app/services/findings/tools.py
server/app/services/findings/runner.py
server/app/services/findings/overlay.py
server/app/services/findings/jobs.py
server/app/services/findings/builtin_ts.py
server/app/services/findings/ruff.py
server/app/services/findings/typescript.py
client/src/utils/metricsStore.tsx
client/src/utils/metricApplicability.ts
client/src/utils/hotSpotRanking.ts
client/src/utils/explorerColumns.ts
client/src/components/Explorer.tsx
client/src/state/scanStore.ts
client/src/viz/treemap/utils/colors.ts
docs/intent/imported-quality-evidence/intent-brief.md
docs/intent/imported-quality-evidence/shape-brief.md
docs/intent/imported-quality-evidence/implementation-plan.md
docs/intent/imported-quality-evidence/initiative-map.json
server/tests/test_metric_catalog.py
server/tests/test_ranking_parity.py
server/tests/test_findings.py
server/tests/test_analysis_cache.py
server/tests/test_quadrants.py
~~~

### Repository evidence index

All paths below refer to the exact supplied snapshot, not the current upstream repository.

- **R1 — Models and analysis:** `server/app/models.py:Metrics, Node, Witness, OPTIONAL_METRIC_FIELDS`; `server/app/services/analysis_types.py:MEASURED_FILE_METRICS, MEASURED_SCOPE_METRICS, iter_executable_scopes`; `server/app/services/analysis.py:attach_file_metrics` and its nested `convert_function`, `aggregate_metrics, _MAX_ROLLUP, _MEAN_ROLLUP`.
- **R2 — Catalog:** `server/app/services/metric_catalog.py:MetricSpec, MetricSpec.to_json, METRICS, METRICS_BY_ID, RANKABLE_IDS, profile_weights, catalog_payload`; `server/app/routers/metrics.py:get_metric_catalog`; `server/tests/test_metric_catalog.py`.
- **R3 — Headless and ranking:** `server/app/run.py:_run_headless, _enforce_fail_on_payload`; `server/app/services/reporting.py:PROFILE_WEIGHTS, scan_tree, write_scan, build_report_payload, rank_by_metric, rank_nodes, build_findings, _metrics_subset, _format_evidence`; `server/tests/test_ranking_parity.py`.
- **R4 — Client:** `client/src/utils/metricsStore.tsx:MetricId, metricDef, catalog state`; `metricApplicability.ts`; `hotSpotRanking.ts:rankHotSpots`; `explorerColumns.ts:metricCellText, metricCellIsFaint`; `client/src/components/Explorer.tsx`; `client/src/state/scanStore.ts`; `client/src/viz/treemap/utils/colors.ts:domainOf, scaleValue, treemapRampPosition`.
- **R5 — Findings:** `server/app/services/findings/model.py:Finding, ToolRun, FindingsResult`; `tools.py:run_process, Tool.signature`; `runner.py:plan_tools, run_tools, cache_key`; `overlay.py:file_counts, file_findings, apply_to_tree, markers_for`; `jobs.py:FindingsJobManager.start, for_file`; `builtin_ts.py`; `ruff.py:RuffTool`; `typescript.py:TscTool, EslintTool`; `server/tests/test_findings.py`.
- **R6 — Jobs and caches:** `server/app/services/scan_jobs.py:ScanJob.run, from_cache, cancel, result_json_overlaid, ScanJobManager`; `server/app/services/cache.py:fingerprint, _is_pruned_dir`; `server/app/services/analysis.py:_is_pruned_dir_name`; `server/app/routers/scans.py`; `server/app/services/activity.py`; `server/tests/test_analysis_cache.py`.
- **R7 — Config and defaults:** `server/app/config.py`; `server/app/run.py:_find_repo_root, _resolve_target_path`; `client/src/state/scanStore.ts` activity preference; `server/app/services/quadrants.py:Axis, Preset, axis_value, assign_quadrant, build_quadrants`; `server/tests/test_quadrants.py`. The comment-ratio prose/LOC conventions are not fully consistent across supplied descriptions; verify analyzer semantics before exposing that ratio as a configurable promise.
- **R8 — Navigation and limits:** `AGENTS.md`, `README.md`, `docs/CODE_MAP.md`, `client/package.json`, `server/pyproject.toml`; `server/app/run.py:_run_compare`. Compare and code-viewer implementation omitted.
- **R9 — Historical initiative:** all four `docs/intent/imported-quality-evidence/{intent-brief.md,shape-brief.md,implementation-plan.md,initiative-map.json}` files.

### Primary sources

- **S1:** OASIS, [SARIF 2.1.0 standard](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html), especially property bags, results/locations, and invocation execution status.
- **S2:** SonarSource, [Generic external issue import format](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/importing-external-issues/generic-issue-import-format).
- **S3:** SonarSource, [Generic test data](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/generic-test-data).
- **S4:** coverage.py, [JSON reporting](https://coverage.readthedocs.io/en/latest/commands/cmd_json.html).
- **S5:** coverage.py, [FAQ](https://coverage.readthedocs.io/en/latest/faq.html), coverage summaries and line/branch totals.
- **S6:** Linux Test Project, [LCOV geninfo documentation](https://github.com/linux-test-project/lcov/blob/master/docs/man/geninfo.rst).
- **S7:** ESLint, [Configuration files](https://eslint.org/docs/latest/use/configure/configuration-files).
- **S8:** ESLint, [Configure plugins](https://eslint.org/docs/latest/use/configure/plugins).
- **S9:** Astral, [Ruff configuration](https://docs.astral.sh/ruff/configuration/).
- **S10:** Python Packaging Authority, [pyproject.toml specification](https://packaging.python.org/en/latest/specifications/pyproject-toml/).
- **S11:** CodeCharta, [Introduction](https://codecharta.com/docs/overview/introduction/).
- **S12:** CodeCharta, [Versioning](https://codecharta.com/docs/about/versioning/).
- **S13:** SonarSource, [Plugin basics](https://docs.sonarsource.com/sonarqube-server/extension-guide/developing-a-plugin/plugin-basics).
- **S14:** Git, [git-rev-parse](https://git-scm.com/docs/git-rev-parse), `--show-toplevel`.
- **S15:** Astral, [Ruff settings](https://docs.astral.sh/ruff/settings/), `fix` and `fix-only`.

### Deliverables

- [research-report.md](research-report.md)
- [implementation-plan.md](implementation-plan.md)
- [recommendations.md](recommendations.md)

