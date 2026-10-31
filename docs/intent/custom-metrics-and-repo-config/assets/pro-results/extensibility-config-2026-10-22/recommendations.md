# Srcly custom results and repository policy — recommendations

**Recommendation:** build a native file-results import and a declarative repository policy as one capability, then add adapters, explicit command execution, and saved-snapshot comparison over the same evidence boundary.

**Status:** research and planning only. **Build** means inclusion in the proposed implementation plan, not approval to implement. Codex verifies the exact baseline, creates the initiative, and owns changes.

Stable IDs below identify decisions independently of their current classification. The rationale is intentionally one line per recommendation; detailed contracts, evidence, and tradeoffs are in [research-report.md](research-report.md), with milestones and tests in [implementation-plan.md](implementation-plan.md).

## Build

| ID | Recommendation | One-line reason |
| --- | --- | --- |
| SR-001 | Native JSON envelope with distinct measurements and diagnostics — M1 | Gives private producers one language-independent boundary without pretending every result is a scalar or diagnostic. |
| SR-002 | Typed custom observations beside fixed built-in Metrics — M1 | Supports arbitrary namespaced IDs while preserving existing built-in analyzer invariants and measured zero. |
| SR-003 | Explicit applicability, unknown reasons, and completeness — M1–M2 | Missing, skipped, stale, failed, or malformed evidence must never become zero or reduce the eligible denominator. |
| SR-004 | Verified file/source association plus producer/shared-input identity — M1–M2 | A valid artifact can still describe different source; exact association must precede trusted overlays or line markers. |
| SR-005 | Per-scan effective catalog and atomic client context — M1 | Tree values, definitions, colors, settings, and evidence status must belong to the same scan and update together. |
| SR-006 | File-only sum/max/none rollups with explicit partial totals — M1 | Delivers useful folder views without averaging averages, inventing denominators, or double-counting scope children. |
| SR-007 | Dynamic-ID UI and headless integration through shared accessors — M1 | Current fixed fields, CLI choices, global profiles, and direct getters otherwise stop a custom metric midway through the product. |
| SR-008 | Dedicated srcly.toml plus equivalent tool.srcly — M1/M3 | Offers a language-neutral default and Python accommodation while retaining one normalized policy schema. |
| SR-009 | One worktree-root policy, explicit config selection, no nested merge — M3 | Makes narrow scans, monorepos, and worktrees predictable without mixing incompatible catalogs or hidden inheritance. |
| SR-010 | Import expected-metric declarations and located config errors — M1–M3 | Distinguishes an unavailable producer artifact from a misspelled metric without duplicating the producer's full definition. |
| SR-011 | Separate color stops, risk rules, quadrant cutoffs, profile anchors, and gates — M3 | Interpretation changes should be explicit and must never replace raw measurements or silently alter another decision. |
| SR-012 | Repository-scoped personal preferences and an effective-config inspector — M3 | Preserves useful shared defaults while explaining overrides and allowing personal exploration without editing policy. |
| SR-013 | Lossless raw measurement export and a separate diagnostics export — M1–M2 | Existing metric-derived triage findings and compact summaries cannot faithfully stand in for imported checker evidence. |
| SR-014 | Independent source/evidence/interpretation invalidation and result reload — M2 | Artifact or color changes must refresh the right data without needless AST analysis or stale job reuse. |
| SR-015 | One saved-diagnostic adapter, default SARIF — M4 | Reuses real tool output while preserving uncertainty about source matching and complete checked-file coverage. |
| SR-016 | Explicit argv-based local producers over the same results contract — M5 | Adds repeatable convenience without introducing an in-process plugin API or execution during config discovery. |
| SR-017 | Cancellation, output bounds, no-fix native checks, and honest partial success — M5 | Concrete current runner gaps justify safeguards before offering configurable commands as a supported feature. |
| SR-018 | Explicit raw-value gates with distinct incomplete-evidence outcomes — M3 | CI must distinguish a breached threshold from missing or stale evidence, and neither colors nor partial scores should imply success. |
| SR-019 | Self-contained snapshots and comparison under explicit interpretation — M6 | Makes review reproducible without producer installation and prevents missing data or changed thresholds from looking like improvement. |
| SR-020 | Reconcile the earlier imported-evidence plan instead of duplicating it — Before initiative creation | Reuses its diagnostics/coverage intent while keeping graph-first sequencing from blocking the new scalar/configuration capability. |

## Explore

These are targeted proofs after the first useful import/policy release, not prerequisite discovery projects.

| ID | Recommendation | One-line reason |
| --- | --- | --- |
| SR-021 | A coverage.py JSON or LCOV adapter with typed counts/opportunities | Coverage becomes useful only when denominator, source association, and line/branch distinctions survive import and rollup. |
| SR-022 | A real repository-dependent producer input closure | File-local matching cannot establish freshness for whole-repository, generated-input, or external-dependency computations. |
| SR-023 | Explicit source-root/prefix remapping for saved CI artifacts | Useful path portability may justify a small mapping mechanism once a real artifact demonstrates the need. |
| SR-024 | Graph evidence using shared provenance/source association | Existing graph/clone witness work can reuse the evidence boundary while retaining endpoints, edges, and original witnesses. |

## Defer

| ID | Recommendation | One-line reason |
| --- | --- | --- |
| SR-025 | External function/component observations and symbol joins | Names and line proximity are insufficient stable identities across tools, nesting, transformations, and renames. |
| SR-026 | Weighted means, ratios, distributions, and percentile rollups | Each needs its own sufficient statistics; generic scalar averaging would give plausible but wrong folder values. |
| SR-027 | Method coverage, CRAP, mutation-test fusion, and source-map attribution | Their attribution and denominator requirements are substantially beyond the first file-metric proof. |
| SR-028 | Per-path policy inheritance and arbitrary custom quadrant definitions | One selected policy and named cutoff overrides meet the initial need with much more explainable behavior. |
| SR-029 | Producer execution caching, automatic custom runs, watchers, and trends | Manual imports and explicit reruns provide useful behavior before dependency closure and automation policy are established. |
| SR-030 | Column-level imported markers and rename heuristics | Line evidence and exact paths are sufficient initially; encoding and identity ambiguity should not be hidden by guesses. |

## Avoid

| ID | Recommendation | One-line reason |
| --- | --- | --- |
| SR-031 | In-process plugin ABI, package marketplace, or remote producer service | No demonstrated requirement justifies their dependency, lifecycle, or operational costs for this local application. |
| SR-032 | Treating SARIF or a generic issue format as the arbitrary-metric schema | Extensible diagnostic properties do not define units, applicability, aggregation, or measured-zero semantics for Srcly. |
| SR-033 | Treating partial/missing/stale results as zero or complete folder totals | It hides analysis gaps and can make rankings and gates reward the absence of evidence. |
| SR-034 | Silently rewriting raw units, formulas, direction, or aggregation through config | Repository interpretation should explain a measurement rather than change what the producer claims it measured. |
| SR-035 | Last-wins metric conflicts or unconditional producer-count summing | Conflicting definitions and overlapping check sets need explicit identity and completeness, not silent arithmetic. |
| SR-036 | Executable configuration, shell command strings, or automatic dependency installation | A declarative policy and explicit local argv boundary meet the need with fewer hidden actions. |
| SR-037 | Claiming sandboxing or read-only execution from an argv/env wrapper | Local commands retain user permissions and may mutate source or access the network. |
| SR-038 | Global mutable custom catalogs, profiles, or user preference keys | Concurrent scans and different worktrees must not inherit each other's metric semantics or personal state. |
| SR-039 | New compatibility frameworks or a complete analyzer rewrite | Direct typed boundaries and one coordinated server/client release fit the actual project and requested scope. |

## Priority and acceptance

- **First proof:** SR-001 through SR-008 as needed for the small import/config path, plus SR-010 and SR-013. Demonstrate `2`, measured `0`, unknown, and a line diagnostic end to end.
- **First useful release:** M1–M3, including source certainty, reload, complete repository policy, and explicit gates. The coworker can use native outputs without waiting for a standard-format adapter.
- **Subsequent additions:** M4 saved diagnostics, M5 explicit local producers, M6 portable snapshots.
- **No demand-validation gate:** the owner has supplied the requirement; a representative producer artifact is technical input for adapter correctness, not a request to revalidate demand.

## Defaults already settled

| Decision | Default |
| --- | --- |
| First interchange | Native JSON file measurements and separately typed diagnostics. |
| Config source | srcly.toml; equivalent tool.srcly; competing sources error unless explicitly selected. |
| Discovery | One worktree-root policy; config-relative paths; narrow scans stay narrow. |
| Execution | Imports first; new custom producers explicit only; no automatic install. |
| Missing values | Preserve producer observations; effective unavailability and reasons remain distinct from measured zero. |
| Ranking | Direction-aware raw numeric order; bounded custom display bars only when a scale exists. |
| Profile method | Explicit anchors for new repository profiles; current built-in relative method remains identified as such. |
| Gates | Explicit invocation, raw values, completeness before numeric verdict, no empty-cohort pass. |
| Comparison | Equivalent semantic descriptors; each side matches its own source; policy differences visible. |
| Compatibility | One server/client release; unsupported result versions get an actionable error. |

## Access, checks, links, and open questions

**Access:** all 43 selected complete repository files from the attached packet and the prompt were read. The exact baseline was used; no newer upstream source was substituted. Full inventory, symbol citations, primary-source URLs, and omitted-file limitations are in [research-report.md](research-report.md).

**Checked versus proposed:** code and selected tests were reviewed as text, current primary documentation was researched, and examples were structurally checked. New types, settings, commands, tests, adapters, and snapshot behavior are proposals. No application suite was run and no repository implementation was performed.

**Deliverables:** [research-report.md](research-report.md), [implementation-plan.md](implementation-plan.md), [recommendations.md](recommendations.md).

**Three nonblocking open questions:** the first diagnostic artifact (default SARIF after native metrics), whether M5 needs Windows execution (default only tested platforms), and the first real producer's dependency scope (default file-local plus declared shared inputs).

