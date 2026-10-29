# Srcly custom results and repository policy — implementation plan

## Outcome and handoff

Deliver a usable native file-metric import with repository defaults first. Then make imports dependable, expand repository policy, add a saved-diagnostics adapter, offer explicit local producers, and make accepted results portable across saved snapshots.

This is a **proposed plan**, not an initiative already created or authorization to implement. Codex should verify it against the full checkout of `aea1015258f56dd45b8e175f7288e2fef3abc6cf`, reconcile the older imported-quality-evidence initiative, and create the new initiative. The selected source packet was read only; no repository changes or test execution were performed.

**All new config syntax, result fields, flags, and subcommands below are proposed.** The runsheets are acceptance examples to run after the corresponding milestone exists. They do not claim these commands work on the supplied baseline. Use a full checkout with its normal dependency setup, `uv` for Python, and `pnpm` for the client.

## 1. Fast local end-to-end proof

### M1 — One imported metric and one line finding reach the UI and reports

**Usable outcome:** a coworker can generate a small JSON file and view a new metric without editing Srcly's metric model for that ID. A repository can save its import, default selected metric, and color stops. Ordinary source analysis remains useful when the import is missing.

**Scope:**

- Native JSON v1, file observations only; strict integer/number types; measured zero, unknown, applicability, source association.
- One producer and namespaced metric, with `sum`, `max`, or `none` folder aggregation.
- Clean Git, file-local dependency scope, plain source bytes; unsupported identity cases visibly unverified.
- Complete diagnostic runs with declared applicability, exact checked-file sets, and optional line ranges.
- Minimal `srcly.toml`: `version`, `checks.mode`, `imports` including `expected_metrics`, `defaults.metric/view`, and metric `color_stops`.
- `checks.mode=off` truly suppresses bundled and project findings tools, on both fresh and cached scans.
- Isolate the M1 scan/job identity by effective config and execution mode so a checks-off request cannot join an already planned project-check job for the same root.
- Scan-specific catalog/context installed atomically in the client.
- A lossless measurement representation and separate actual diagnostics in headless output.

**Actual edit targets:**

| Area | Modules and purpose |
| --- | --- |
| Contract and values | `server/app/models.py`, `services/analysis.py` at the analyzed-source identity boundary; new proposed `services/results/model.py`, `load.py`, `overlay.py` for validation, file joins, and custom rollups. Leave built-in `Metrics` fields and analyzer tables intact. |
| Catalog/context | `services/metric_catalog.py`, `routers/metrics.py`, `services/scan_jobs.py`, `routers/scans.py`; new proposed `services/scan_context.py` to carry tree/catalog/settings/evidence together. |
| Minimal policy | `server/app/config.py`, `run.py`; new proposed `services/repo_config.py`. Implement only M1 keys, with unknown-key errors rather than silently accepting future settings. |
| Headless | `run.py`, `services/reporting.py`: delay metric validation until context exists; replace direct custom-value attribute access with a small accessor; preserve zero. |
| Diagnostics | `services/findings/model.py`, `overlay.py`, `runner.py`, `jobs.py`: accept normalized imported diagnostics and explicit checks-off behavior without faking a successful execution. |
| Client | `metricsStore.tsx`, `metricApplicability.ts`, `hotSpotRanking.ts`, `explorerColumns.ts`, `Explorer.tsx`, `scanStore.ts`, `viz/treemap/utils/colors.ts`: typed values, dynamic catalog, correct colors/ranking/N/A. |

**Inspect before editing, because these files are map-only in the packet:** `server/app/routers/files.py`, `services/markers.py`, `client/src/components/CodeModal/FileFindings.tsx`, `MetricsSidebar.tsx`, `MetricsTable.tsx`, `CodeModal.tsx`, and `hooks/useMetricMarkers.ts`. Inspect the analyzer input/read boundary as well before claiming an imported result matches the bytes represented by a cached tree. `docs/CODE_MAP.md` identifies these roles, but their implementations were not supplied.

### M1 acceptance runsheet

Set `srcly_checkout` to the full working checkout after M1. This creates an independent temporary fixture, not a change to Srcly's source. Keep `proof_root` for later runsheets in the same shell. JSON uses the fixture's existing commit ID; no separate manifest or checksum file is created.

~~~bash
set -eu
srcly_checkout="/absolute/path/to/full/srcly-checkout"
proof_root="$(mktemp -d -t srcly-results-proof.XXXXXX)"

mkdir -p "$proof_root/src" "$proof_root/.srcly/results"

cat > "$proof_root/src/a.ts" <<'SOURCE'
export const a = 1;
// REVIEW_DEBT: missing owner
// REVIEW_DEBT(owner=team): tracked follow-up
SOURCE

cat > "$proof_root/src/b.ts" <<'SOURCE'
export const b = 2;
SOURCE

cat > "$proof_root/src/c.ts" <<'SOURCE'
export const c = 3;
SOURCE

cat > "$proof_root/.gitignore" <<'IGNORE'
.srcly/
IGNORE

cat > "$proof_root/srcly.toml" <<'TOML'
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
TOML

git -C "$proof_root" init
git -C "$proof_root" add src .gitignore srcly.toml
git -C "$proof_root" -c user.name="Srcly proof" -c user.email="proof@example.invalid" commit -m "Create results proof fixture"
proof_revision="$(git -C "$proof_root" rev-parse HEAD)"

cat > "$proof_root/.srcly/results/team-review.json" <<JSON
{
  "format": "srcly-results",
  "version": 1,
  "producer": {"id": "acme.review", "version": "0.1.0"},
  "run": {"id": "review-001", "status": "complete"},
  "source": {
    "kind": "git-clean",
    "revision": "$proof_revision",
    "dependency_scope": "file",
    "shared_inputs": []
  },
  "metrics": [{
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
    "applies_to": {"scope": "file", "extensions": [".ts"]}
  }],
  "observations": [
    {"path": "src/a.ts", "metric": "acme.review/debt_count",
     "state": "measured", "value": 2,
     "evidence": [{"line": 2, "end_line": 3, "message": "Two review markers."}]},
    {"path": "src/b.ts", "metric": "acme.review/debt_count",
     "state": "measured", "value": 0},
    {"path": "src/c.ts", "metric": "acme.review/debt_count",
     "state": "unknown", "reason": "producer-skipped"}
  ],
  "diagnostic_runs": [{
    "id": "owner-check",
    "status": "complete",
    "applies_to": {"scope": "file", "extensions": [".ts"]},
    "checked_files": ["src/a.ts", "src/b.ts"],
    "findings": [{
      "path": "src/a.ts", "line": 2, "end_line": 2,
      "rule_id": "missing-owner", "severity": "warning",
      "message": "This review marker has no owner."
    }]
  }]
}
JSON

uv run --project "$srcly_checkout/server" pytest "$srcly_checkout/server/tests/test_results_import.py" "$srcly_checkout/server/tests/test_results_end_to_end.py" "$srcly_checkout/server/tests/test_metric_catalog.py" "$srcly_checkout/server/tests/test_ranking_parity.py"
pnpm --dir "$srcly_checkout/client" test -- results
pnpm --dir "$srcly_checkout/client" run build

uv run --project "$srcly_checkout/server" srcly hotspots "$proof_root" --metric acme.review/debt_count --format json
uv run --project "$srcly_checkout/server" srcly report "$proof_root" --metric acme.review/debt_count --include-tree --out "$proof_root/.srcly/report"
uv run --project "$srcly_checkout/server" srcly "$proof_root"
~~~

The proposed new test names above are implementation targets, not files present in the packet. The client `results` filter should match focused tests added with this milestone. The final command runs the interactive application until stopped.

**Observable proof:**

- Picker/Explorer/tree/report show `acme.review/debt_count`, correct label/unit, and values `a=2`, `b=0`, `c=unknown`.
- Hot Spots orders `a`, `b`; `c` is in the N/A group. No fabricated zero.
- Folder subtotal is `2`, clearly `2/3` eligible files measured.
- Selecting the line diagnostic opens `a.ts:2`, naming its producer and rule. A scalar's range evidence remains separate.
- The report's `tree.json` preserves all three custom observations, `metrics.schema.json` contains their effective definition, and `diagnostics.json` contains the real line warning separately from metric-derived triage findings.
- Changing only color stops changes display without changing values.
- No findings subprocess starts with checks off, including a raw-cache hit.
- Switching to a second repository cannot retain the first repository's catalog or colors.

**Focused tests:** contract states and strict number validation; file join and sum/max completeness; unknown metric accepted after import; zero/unknown UI-and-Python parity; lower-worse zero and signed-value bounded bars; neutral metric not risk-ranked; atomic catalog replacement; checks-off fresh/cached paths and project-mode → off at the same source fingerprint; one source-mismatch case; one line-navigation integration.

**Main risk:** touching many consumers before proving the storage/catalog boundary. Keep the custom accessor and separate rollup pass small; do not rewrite the built-in analyzer pipeline.

**Rollback/bypass:** remove the import or use `--no-config --checks off --no-results`; built-in metrics remain available. New custom data stays outside built-in `Metrics`. No automatic commands or data migrations are introduced.

**M1 cut line:** no scope joins, coverage, SARIF parser, custom execution, nested policy inheritance, custom profiles, gate engine, or saved-snapshot compare. An unknown future config key is an error, not a half-supported feature.

## 2. M2 — Dependable imports, source association, and reload

**Usable outcome:** private producers can supply file-local results from dirty or non-Git trees; users can see exactly which observations are current, missing, conflicting, or stale. Updating an artifact does not require rescanning all source.

**Changes:**

- Add producer-supplied content identity for each subject/shared input within the bundle; verify exact analyzed bytes.
- Compute source-match state independently of schema validity. Keep unverified repository-dependent output inspectable, not rankable.
- Define metric eligibility from scan files and descriptor applicability. Define diagnostic eligibility from run applicability; `checked_files` establishes completed coverage only.
- Extend M1 per-file unknown reasons and completeness across multiple/reloaded imports. Malformed diagnostic rows must prevent clean-zero assertions for the affected file/run.
- Implement idempotent duplicate handling and conflict quarantine. No last-wins or automatic cross-producer summing.
- Harden M1 `expected_metrics` validation: missing import means declared IDs unavailable; missing expected ID in an available valid bundle is an error, including after reload.
- Add `srcly results validate FILE --root PATH`: exit 0 for structurally valid, source-matched evidence even with explicit unknown observations; 1 for invalid structure/config; 2 for valid but mismatched/unverified source, or an unmet explicit `--require-complete` request. Report completeness separately from ordinary validation success.
- Add **Reload results**, bounded artifact reads, separate parse/source-match/overlay identities, and scan-bound code-viewer requests.
- Fix headless shared-context use and real `refresh` behavior; remove misleading no-op cache assumptions.

**Actual targets:** `services/cache.py`, `scan_jobs.py`, `reporting.py`, `run.py`, `routers/scans.py`; `findings/model.py`, `overlay.py`, `jobs.py`; M1 results/context modules; `scanStore.ts`, `metricsStore.tsx`; map-only files/marker router after inspection.

Do not globally replace the stat-oriented AST cache with full-content scanning solely for this feature. Artifact source matching has a stronger, separate identity requirement.

### M2 acceptance runsheet

The content-identity fixtures are covered by targeted tests. This interactive example proves conservative mismatch handling against the M1 fixture, then restores only that temporary source file.

~~~bash
set -eu

uv run --project "$srcly_checkout/server" pytest "$srcly_checkout/server/tests/test_results_sources.py" "$srcly_checkout/server/tests/test_results_cache.py" "$srcly_checkout/server/tests/test_analysis_cache.py"
uv run --project "$srcly_checkout/server" srcly results validate "$proof_root/.srcly/results/team-review.json" --root "$proof_root"

cat >> "$proof_root/src/a.ts" <<'SOURCE'
// A deliberate post-analysis edit for stale-evidence testing.
SOURCE

set +e
uv run --project "$srcly_checkout/server" srcly results validate "$proof_root/.srcly/results/team-review.json" --root "$proof_root"
validation_status="$?"
set -e
test "$validation_status" -eq 2

uv run --project "$srcly_checkout/server" srcly hotspots "$proof_root" --metric acme.review/debt_count --format json
git -C "$proof_root" restore src/a.ts

uv run --project "$srcly_checkout/server" srcly results validate "$proof_root/.srcly/results/team-review.json" --root "$proof_root"
uv run --project "$srcly_checkout/server" srcly scan "$proof_root" --no-config --checks off --no-results --out "$proof_root/.srcly/source-only.json"
~~~

**Observable proof:** after the edit, `a.ts` becomes source-mismatched and loses current-line markers; `b.ts=0` remains valid. Its disappearance from trusted ranking does not reduce the eligible denominator. Restoring the file restores association. Updating only the JSON is picked up through Reload results, with an AST cache hit confirmed by an instrumented test.

**Focused tests:**

- Dirty/non-Git content matches; CRLF and Unicode exact-byte behavior; per-file versus shared-input invalidation.
- Imported evidence and built-in values represent the same accepted source bytes; stale raw cache entries or mid-scan edits trigger reanalysis/retry or quarantine, not mixed-snapshot joins.
- Added/deleted/untracked repository inputs stay unverified where closure is undeclared.
- Absolute/traversal/sibling-prefix/symlink escape, case-sensitive paths, files outside a nested scan, unknown paths.
- Same producer and same content deduplicate; conflicting definitions or observations quarantine; changed producer version preserves version metadata.
- Missing import, malformed file, malformed diagnostic, partial run, complete checked-file zero, and unknown c-file.
- Known diagnostics remain visible when another producer fails; combined count is incomplete.
- Artifact update under `.srcly` refreshes evidence; interpretation-only change does not run AST analysis.
- Code viewer rejects stale live bytes and cannot select an unrelated older finished job.

**Main risk:** treating file matching as proof of a repository-dependent computation. Support the verified file-local slice explicitly; unknown dependency closure stays unverified.

**Rollback/bypass:** bypass results independently of analysis; retain prior accepted output only as clearly previous/stale. A bad import must not poison the raw source cache or the whole source tree.

**M2 cut line:** no implicit rename matching, source maps, generated-source attribution, arbitrary external source-root remaps, or general dependency-aware execution caching.

## 3. M3 — Repeatable repository policy and explicit gates

**Usable outcome:** repository members share exclusions, measurement interpretation, useful defaults, named profiles, and gate definitions while keeping personal session choices separate.

**Changes:**

- Finish `srcly.toml` and equivalent `[tool.srcly]` parsing with standard TOML support.
- Enforce one selected config at the worktree root; error on competing dedicated/embedded sources unless `--config` selects one. No nested merge.
- Apply config-directory-relative paths and invocation-relative CLI paths.
- Implement documented precedence with explicit/unset CLI values.
- Add `srcly config show PATH` with value origins and redaction.
- Add additive exclusions, max file bytes, workers/file timeout requests, and settings-specific invalidation.
- Add explicit raw risk bands, named preset quadrant cutoffs, and named anchor-based profiles.
- Add gate evaluation by explicit invocation, with pass/breach/indeterminate statuses.
- Keep existing triage-priority `--fail-on` behavior separate; reject simultaneous `--fail-on` and `--gate` in the first gate release.
- Scope saved UI preferences to repository/worktree; add reset-to-repository-defaults.
- Keep custom raw definitions producer-owned. Do not move native Ruff/ESLint rules into Srcly config.

**Actual targets:** `config.py`, `run.py`, `services/repo_config.py`, `analysis.py`, `scan_jobs.py`, `cache.py`, `metric_catalog.py`, `reporting.py`, `quadrants.py`, `activity.py`, `routers/scans.py`, `routers/metrics.py`; client `metricsStore.tsx`, `scanStore.ts`, `colors.ts`, Explorer and settings UI integration.

`quadrants.build_quadrants(cutoffs=...)` is an existing seam. Keep named preset cutoffs first; do not build a generic visualization-expression DSL. Verify the comment-ratio convention in full analyzer source before making new claims about its units.

### M3 acceptance runsheet

Replace only the temporary fixture's policy. The gate is deliberately strict and the c-file deliberately unknown, so its expected result is **indeterminate evidence**, not a numeric pass.

~~~bash
set -eu

cat > "$proof_root/srcly.toml" <<'TOML'
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
profile = "review"
activity_window = "30d"

[metrics."acme.review/debt_count"]
color_stops = [0, 5, 15]
risk = [
  { level = "warning", operator = ">=", value = 1 },
  { level = "critical", operator = ">=", value = 2 },
]

[profiles.review]
cohort = "file"
normalization = "anchors"

[profiles.review.metrics."acme.review/debt_count"]
weight = 1.0
good = 0
bad = 10

[[gates]]
id = "review-debt-limit"
metric = "acme.review/debt_count"
cohort = "file"
operator = "<"
value = 10
require_complete = true
TOML

uv run --project "$srcly_checkout/server" pytest "$srcly_checkout/server/tests/test_repo_config.py" "$srcly_checkout/server/tests/test_results_gates.py" "$srcly_checkout/server/tests/test_quadrants.py"
pnpm --dir "$srcly_checkout/client" test -- results

uv run --project "$srcly_checkout/server" srcly config show "$proof_root"
uv run --project "$srcly_checkout/server" srcly config show "$proof_root/src"
uv run --project "$srcly_checkout/server" srcly report "$proof_root" --profile review --out "$proof_root/.srcly/policy-report"

set +e
uv run --project "$srcly_checkout/server" srcly report "$proof_root" --gate review-debt-limit --out "$proof_root/.srcly/gated-report"
gate_status="$?"
set -e
test "$gate_status" -eq 2

uv run --project "$srcly_checkout/server" srcly report "$proof_root" --no-config --checks off --no-results --metric complexity --out "$proof_root/.srcly/builtin-report"
~~~

**Observable proof:** root and nested scans select the same policy but retain different scan roots; colors change while raw a/b values remain 2/0; the report labels anchor-based scoring; the gate returns 2 for missing required evidence before issuing a numeric verdict. Removing the c-file from the applicable scan yields a complete cohort that can be evaluated numerically.

**Focused tests:**

- Dedicated/embedded equivalence; both-present error; unknown keys; bad types; invalid metric IDs; missing declared imports versus typo.
- Omitted path versus explicit `.`; nested scan; explicit package config; non-Git file target; linked worktrees.
- CLI override beats repo value only when explicitly passed; lists replace, `extend_exclude` adds.
- Config-relative globs versus invocation-relative CLI files, with normalization and containment.
- Colors independent of raw values; direction-aware zero; invalid stops; risk boundary equality.
- Lower-worse anchors, zero measured, missing member, zero available weight => N/A, partial profile completeness.
- Gate pass 0, breach 1, missing/stale/conflicting/unverified/empty cohort 2, cancellation 130.
- Existing `--fail-on` remains a triage-priority operation; mixing it with `--gate` produces a clear argument error.
- Profile-member unavailable import fails a requested headless profile clearly; UI can show partial scores with completeness.
- Exclusion/size-limit edits invalidate raw analysis; color/profile/gate edits do not.
- Selected Srcly control metadata is not measured as source; external tools still track native config inputs.

**Main risk:** one setting accidentally doing several jobs. Keep raw definition, rendering, risk, quadrant membership, score normalization, and gate predicates separate in types and tests.

**Rollback/bypass:** `--no-config` plus explicit metric/profile/checks selection; reset personal preferences without rewriting policy. Invalid policy returns a located error and an explicit bypass route; no silent fallback in headless CI.

**M3 cut line:** no per-path policy inheritance, executable config, arbitrary formulas, auto-writing config from sliders, every-internal-constant settings, or automatic gate evaluation.

**Release checkpoint:** M1–M3 are a complete useful product slice for this mission. Do not wait for adapters or command execution to use the coworker's native results.

## 4. M4 — One useful saved-diagnostic adapter

**Usable outcome:** a developer opens an existing diagnostics artifact without modifying the producer or running it inside Srcly.

**Default:** SARIF 2.1.0. If the coworker's actual first artifact is saved ESLint JSON, build that adapter first and keep SARIF next; this is a format-selection dependency, not a blocker on native metrics.

**Changes:**

- Add a named import format and one bounded adapter into M1/M2 normalized diagnostics.
- Preserve producer/rule identity, primary file/line, severity, invocation success/partial status, and source-association uncertainty.
- Normalize URI bases carefully. No network retrieval, automatic source download, or traversal.
- Do not infer a clean checked-file universe from absence of SARIF results.
- Positive diagnostics can be inspected when source identity is unverified; trusted overlays/gates require matched source and established completeness.
- Keep unsupported related locations/fixes as inspectable metadata or a clear capability note, not silently applied edits.
- Do not interpret arbitrary SARIF property numbers as registered custom metrics.

**Actual targets:** proposed `services/results/adapters/sarif.py` (or `eslint_json.py`), existing results loader/model, `findings/model.py` and `overlay.py`, `reporting.py`, `run.py`, code-viewer integration already inspected in M1.

### M4 acceptance runsheet

Use a representative captured producer artifact. The path variable is an explicit user-supplied input; the plan does not fabricate a supported producer output.

~~~bash
set -eu
saved_sarif="/absolute/path/to/captured/results.sarif"
sarif_source_root="/absolute/path/to/source-associated-with-the-artifact"

uv run --project "$srcly_checkout/server" pytest "$srcly_checkout/server/tests/test_results_sarif.py"
set +e
uv run --project "$srcly_checkout/server" srcly results validate "$saved_sarif" --format sarif --root "$sarif_source_root"
sarif_validation_status="$?"
set -e
case "$sarif_validation_status" in
  0|2) ;;
  *) exit "$sarif_validation_status" ;;
esac
uv run --project "$srcly_checkout/server" srcly report "$sarif_source_root" --no-config --checks off --import "$saved_sarif" --import-format sarif --metric complexity --out "$sarif_source_root/.srcly/sarif-report"
~~~

Validation may correctly return 2 for an otherwise valid SARIF file lacking usable source identity or having a mismatch. This inspection example accepts that outcome and the report preserves the unverified/stale status; it does not promote the evidence into trusted ranking. Invalid structure returns 1 and stops the runsheet. Missing checked-file completeness is reported as metadata and becomes fatal only under an explicit completeness requirement or gate. A separate captured fixture with sufficient source identity proves trusted line association.

**Observable proof:** rule IDs/messages/line locations survive normalization; zero is asserted only where coverage is established; no producer command runs; saved diagnostics appear alongside native imports without overwriting their measurements.

**Focused tests:** producer-generated positive/empty/error artifacts; URI bases and escaped path components; execution-success versus exit-code semantics; missing locations; missing hashes/source identity; partial invocation; unsupported column encoding; external paths; oversized input. Include a realistic captured fixture, not only handcrafted minimal JSON.

**Main risk:** a broadly valid standard carries less information than Srcly needs to claim freshness or complete zero. Preserve uncertainty instead of inventing it.

**Rollback/bypass:** remove/disable that import; native results and built-ins remain usable.

**M4 cut line:** no autofix application, remote URI retrieval, arbitrary SARIF metrics, complete SARIF feature coverage, coverage adapter, or graph adapter.

## 5. M5 — Explicit local producers with reliable lifecycle

**Usable outcome:** a repository declares a reproducible producer and the user runs it explicitly, then receives the same validated evidence as an imported file.

**Changes:**

- Add `srcly checks run PRODUCER PATH` and a matching explicit UI action.
- Resolve argv/cwd/env/output from policy; show the chosen command before a UI run. A deliberate CLI invocation already expresses execution intent.
- Never invoke a custom producer during config discovery, normal scans, Reload results, or saved-snapshot compare.
- No shell, automatic dependency install, or hidden argument templating.
- Bound output/time, capture to temporary storage, validate accepted exit status and complete/partial schema, verify source, atomically accept output.
- Track cancellation through jobs to process trees; test platform support.
- Keep custom execution cache off. Retain last accepted result only as previous/stale after failure.
- Harden existing checks where shared execution behavior requires it: disable Ruff fixes explicitly, fix checked-file completeness, ensure config/mode changes cannot reuse a wrong job, and retain successful diagnostics when another checker fails.
- Do not claim that an explicit custom command is read-only or sandboxed.

**Actual targets:** `findings/tools.py`, `runner.py`, `jobs.py`, `ruff.py`, `typescript.py`, `builtin_ts.py`, `overlay.py`; `scan_jobs.py`, `routers/scans.py`, `run.py`; proposed `services/results/producers.py`; config/results modules; explicit-run UI and `scanStore.ts`.

### M5 acceptance runsheet

This example uses a deterministic producer fixture to be added during M5 at the proposed path `server/tests/fixtures/results/review-checks.mjs`; Node must already be installed. The fixture emits the M2 content-identity contract for current source and declared shared inputs, so unrelated dirty display policy does not block it. Srcly manages the output file. The coworker's real producer is a separate integration proof, not a prerequisite for process-lifecycle tests.

~~~bash
set -eu

mkdir -p "$proof_root/tools"
cp "$srcly_checkout/server/tests/fixtures/results/review-checks.mjs" "$proof_root/tools/review-checks.mjs"

cat >> "$proof_root/srcly.toml" <<'TOML'

[[producers]]
id = "team-review"
argv = ["node", "tools/review-checks.mjs"]
cwd = "."
output = ".srcly/results/team-review.json"
timeout_seconds = 60
accepted_exit_codes = [0]
inherit_env = ["PATH"]
env = { CI = "1" }
TOML

test -f "$proof_root/tools/review-checks.mjs"
uv run --project "$srcly_checkout/server" pytest "$srcly_checkout/server/tests/test_results_producers.py" "$srcly_checkout/server/tests/test_findings.py"

uv run --project "$srcly_checkout/server" srcly checks run team-review "$proof_root"
uv run --project "$srcly_checkout/server" srcly results validate "$proof_root/.srcly/results/team-review.json" --root "$proof_root"
uv run --project "$srcly_checkout/server" srcly report "$proof_root" --metric acme.review/debt_count --out "$proof_root/.srcly/producer-report"
~~~

A minimal test producer should be supplied **as a fixture in the implementation**, with deliberate success, timeout, malformed-output, nonzero-accepted, and child-process cases. Do not require the coworker's analyzer to test lifecycle behavior.

**Observable proof:** scanning the same repo does not run the custom producer; explicitly running it updates output only on acceptance. Cancellation stops descendants. A failed rerun cannot leave the UI displaying the prior result as current. An import still works when the executable is removed.

**Focused tests:**

- Literal argv including spaces/metacharacters; no shell evaluation; cwd/output containment after realpath.
- Environment allowlist, documented platform essentials, secret redaction; accepted exit codes are producer-specific.
- Missing executable, timeout, stdout/stderr caps, malformed JSON, partial results, source changes during execution.
- POSIX descendants and Windows descendants if supported; cancel before start/during output/after process exit; no abandoned background process.
- Atomic output replacement; no existing-good-file clobber on invalid output.
- Config/argv/environment/tool-input changes invalidate execution/job identities.
- Ruff `fix=true` and `fix-only=true` project fixtures: files unchanged and diagnostics still emitted.
- Unreadable files not counted clean; successful diagnostics retained under another tool's failure.

**Main risk:** confusing UI cancellation or a completed thread with subprocess termination. A supported-platform test is mandatory before claiming cancellation.

**Rollback/bypass:** keep custom execution disabled and continue importing the same contract manually. `--checks off` controls ordinary check planning; it does not retroactively cancel an explicit producer invocation.

**M5 cut line:** no sandbox claim, marketplace, in-process API, arbitrary automatic run triggers, producer execution cache, automatic installation, or unsupported-platform execution guarantee.

## 6. M6 — Self-contained result snapshots and honest comparison

**Usable outcome:** save two accepted scan contexts and compare their measurements and policy without running project dependencies or private producers.

**Inspect first:** `docs/CODE_MAP.md` names `services/compare/snapshots.py`, `diff.py`, `service.py`, `jobs.py`, and client compare files. They were not supplied. Verify their actual shapes before choosing the smallest change; do not infer implementation from the map.

**Changes:**

- Add a snapshot envelope containing tree, raw observations, effective metric semantics, source association, diagnostics/completeness, and selected interpretation. Normalize subject/tree identity to repository-relative POSIX paths bound to each snapshot's logical source root; original absolute locations are optional provenance, not comparison keys.
- Include compare role and profile semantics explicitly; current `MetricSpec.to_json` omits some of them.
- Read snapshots with no check planning or producer discovery.
- Compare equivalent definitions/producer identity only; per-side missing evidence stays noncomparable.
- Show raw deltas, policy differences, and a judgment under one named interpretation; default to base policy.
- No inferred rename association or invented zero for an added/missing measurement.
- Offer source-line browsing only from embedded matching bytes or independently verified source. Do not fetch source or open an unrelated current file just because an old absolute path exists.
- Preserve one server/client format release; an unsupported artifact version gets an actionable error, not a generic migration/plugin framework.

**Actual targets:** `models.py`, `metric_catalog.py`, `reporting.py`, `run.py`, context/results modules; after inspection, the compare modules and UI identified above.

### M6 acceptance runsheet

The two repositories/sources must already contain matching accepted artifacts. These are proposed flags on the existing scan/compare entry points, not baseline capabilities.

~~~bash
set -eu
base_repo="/absolute/path/to/base-fixture"
head_repo="/absolute/path/to/head-fixture"
snapshot_dir="$(mktemp -d -t srcly-snapshot-proof.XXXXXX)"

uv run --project "$srcly_checkout/server" pytest "$srcly_checkout/server/tests/test_results_snapshots.py"
uv run --project "$srcly_checkout/server" srcly scan "$base_repo" --checks off --snapshot --out "$snapshot_dir/base.snapshot.json"
uv run --project "$srcly_checkout/server" srcly scan "$head_repo" --checks off --snapshot --out "$snapshot_dir/head.snapshot.json"
uv run --project "$srcly_checkout/server" srcly compare --base-snapshot "$snapshot_dir/base.snapshot.json" --head-snapshot "$snapshot_dir/head.snapshot.json" --policy base --json
~~~

**Observable proof:** comparison still works in a test environment with producer executables unavailable and base/head in different physical directories; relative subject paths join correctly and source associations remain explainable. A threshold-only edit is shown as a policy change, not a changed raw measurement. Missing head data does not appear as an improvement to zero.

**Focused tests:** matching definitions; changed definition version/unit/aggregation/applicability; producer-version warning versus semantic incompatibility; independently matched base/head sources; empty/missing/partial evidence; threshold-only changes; wrong source association; added/deleted/renamed paths; no subprocess launch while loading or comparing.

**Main risk:** carrying incomplete semantics into a snapshot and then reconstructing them from current config. Freeze the necessary effective context with the data.

**Rollback/bypass:** ordinary scans and reports remain available; reject unsupported snapshot formats explicitly.

**M6 cut line:** no automatic source checkout/fetch for imported snapshots, no producer installation, no historical trend service, and no rename heuristics.

## 7. Test strategy and integration gates

The packet's tests are evidence about intended baseline behavior, not a passing test run. Keep their invariants:

- `test_metric_catalog.py`: maintain the exact built-in Metrics/catalog agreement. Add separate dynamic-definition tests; do not weaken the existing check to “any string is acceptable.”
- `test_ranking_parity.py`: add shared Python/TypeScript cases for arbitrary IDs, measured zero, unknown, lower-worse, tie order, signed values where declared, and partial evidence.
- `test_findings.py`: preserve tool-specific accepted exit codes and portable planning; add explicit off mode, execution cancellation, complete checked-file semantics, and partial-success visibility.
- `test_analysis_cache.py`: test independent source/evidence/interpretation invalidation and correctly keyed jobs.
- `test_quadrants.py`: preserve axis meaning and equality boundaries while accepting named cutoff overrides.

Tests should prove user-visible semantic boundaries or concrete failure modes, not mirror each implementation branch. Use new focused tests plus the relevant baseline suites at each milestone. Run the full normal repository gates at integration/release, after obtaining missing fixtures and the full checkout; do not repeatedly run unrelated suites without a remaining risk.

For validation in this design task, only Markdown structure, example JSON/TOML, recommendation references, and archive contents are checked. Application tests remain future work.

## 8. Reconciliation and rollout discipline

Before the initiative is written:

1. Confirm the supplied revision and full source paths; do not silently redesign against a newer revision.
2. Mark overlapping typed diagnostics/source-match work in `docs/intent/imported-quality-evidence` as reused or superseded by the new initiative.
3. Keep graph-edge fidelity, clone relationships, coverage attribution, and CRAP work independently tracked.
4. Document that normal baseline scans already execute some checks; the historical no-execution statement is not current behavior.
5. Update `docs/CODE_MAP.md` when actual feature files are added, as `AGENTS.md` requires.

No generalized compatibility layer, remote service, plugin registry, or owner-demand discovery gate is needed. Keep the implementation local and release the server/client together.

## 9. Explicit cut lines and rollback

**Commit to the product direction, not every extension at once.** Build recommendations mean inclusion in this plan; Codex still verifies and scopes the actual initiative.

| Release boundary | Supported value and deferred work |
| --- | --- |
| M1 | End-to-end native scalar and line diagnostic; clean Git/file-local slice. |
| M1–M3 | Recommended first release: dependable file imports plus repository policy and explicit gates. |
| M4 | One real diagnostics format; coverage remains separate exploration. |
| M5 | Explicit local producer execution on tested platforms; imports remain the fallback. |
| M6 | Dependency-free saved-snapshot comparison; no trends or historical re-execution. |

Universal bypass: use built-in source analysis with `--no-config --checks off --no-results` and an explicit built-in metric for reports. This is proposed syntax to implement and document, not a baseline command.

Invalid imports do not contaminate raw source caches. Invalid policy gets a located error and a documented bypass. Failed execution preserves previous output only as stale. No config load, report open, or snapshot read automatically executes a new custom command.

## 10. Unresolved decisions — maximum three

1. **First diagnostic adapter:** default SARIF; choose saved ESLint JSON instead if that is the first actual producer output. Native metric import proceeds regardless.
2. **Command execution platforms:** default to imports on all supported platforms and explicit execution only where descendant termination is tested; decide whether Windows is required in M5.
3. **First producer dependency scope:** default file-local plus declared shared inputs. If the coworker's metric is repository-dependent or generated-input-dependent, define that closure before claiming verified freshness.

No other discovery question blocks M1. The source/config/metric decisions in the report are recommendations to implement and test, not open-ended alternatives.

## 11. Access and deliverables

- **Access:** exact attached 43-file baseline; adequate for this design. Full-checkout gaps are explicitly marked above.
- **Files read:** full inventory and source-symbol evidence are in [research-report.md](research-report.md), section 11; all minimum files named in the prompt were included.
- **Checked:** source and tests read, primary sources researched, proposed examples checked structurally.
- **Proposed:** all new contracts, settings, commands, tests, and module additions. No repository implementation or test execution occurred.
- **Downloads:** [research-report.md](research-report.md), [implementation-plan.md](implementation-plan.md), [recommendations.md](recommendations.md).
- **Open questions:** the three nonblocking decisions immediately above; each has a default.

