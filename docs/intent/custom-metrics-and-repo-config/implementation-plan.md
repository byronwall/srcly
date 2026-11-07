# Custom metrics and repository settings — implementation plan

## Plan at a glance

Prove a small native import before building extension infrastructure. Three files establish the important behavior: one positive value, one measured zero, and one unknown value. Add one separate line diagnostic. Minimal repo config selects the import, default metric, and colors. Both the browser and report must agree.

Then support routine use: dirty and non-Git source, reload, conflicts, and exact policy discovery. Add useful interpretation settings after values and source identity are dependable. These first three milestones form the recommended release.

A saved diagnostics adapter and explicit local commands follow through the same result boundary. Neither blocks a coworker who can emit JSON. Snapshot comparison remains a later proof. Custom scoring and CI gates stay below the first-release cut line.

This plan changes the order and size of Pro's proposal. Pro placed profiles and gates in the first release. They add decision rules beyond the stated need. Keep their designs as later candidates. One selected policy, file values, colors, thresholds, and defaults prove the requested capability first.

All commands, types, flags, and proposed files below are future implementation targets. This planning change adds no product capability.

## Implementation strategy

Use one results loader with a typed custom observation map beside fixed `Node.metrics`. Keep built-in analyzer fields and catalog invariants. Add small Python and TypeScript accessors at consumers. Do not rewrite the analyzer pipeline.

A native bundle contains producer identity, source identity, metric definitions, observations, and separate diagnostic runs. Definitions own unit, applicability, direction, and aggregation. Start with file-level `sum`, `max`, and `none`. A diagnostic run lists checked files; absence from its findings means zero only for a successfully checked, matched file.

Install tree, effective catalog, interpretation, and result status together as a scan context. Current module globals cannot hold different repositories' custom definitions. Pass context through headless reporting too.

**Fast local loop:** Add `server/tests/test_results_end_to_end.py`, then run:

```sh
cd server && uv run pytest tests/test_results_end_to_end.py
```

That test creates a temporary source fixture and result bundle. No live service, private analyzer, or network is required. Use focused client parity tests and `pnpm --dir client run build` for the client changes. Use `./dev.sh` for browser proof against the temporary fixture. Keep screenshots in `tmp/` for implementation PRs.

The first proof substitutes a deterministic bundle for the coworker's analyzer. A later real artifact proves the input contract. A captured SARIF file proves its adapter. A local fixture executable proves process behavior before a real producer. No cloud proof or deployment is required.

Each milestone leaves built-in analysis usable. Proposed bypass flags are `--no-config --no-results --checks off`. Implement and document them with the first slice. They are distinct controls: skipping config does not implicitly stop current native checks.

## Milestone 1: One imported metric and line diagnostic reach views and reports

Keep this slice to one producer and plain tracked UTF-8 files in a temporary Git repo. First inspect `analysis.analyze_single_file` and the worker read boundary. Capture the bytes represented by accepted analysis. Current cache fingerprints use paths, sizes, and times; they do not establish exact content identity.

**Change:** Add results types, loader, and overlay under proposed `server/app/services/results/`. Extend `models.py:Node` with typed custom observations. Preserve measured, unknown, and inapplicable states. Validate finite numbers, IDs, bounds, paths, and line ranges. Missing eligible files remain unknown. Roll up files once, without counting function children again.

**Change:** Add a small repo-config resolver for `version`, imports, expected IDs, defaults, color stops, and checks-off. Use `srcly.toml` only initially. Resolve the worktree root and config directory separately from scan scope. Existing `config.py` retains internal constants.

**Change:** Update `metric_catalog.py`, `routers/metrics.py`, `scan_jobs.py`, `routers/scans.py`, `run.py`, and `reporting.py`. Resolve custom IDs after import. Bind job identity to selected settings and check mode. Checks-off must suppress project and bundled checks on fresh and cached paths. Export observations in `tree.json`, effective definitions in `metrics.schema.json`, and diagnostics separately in `diagnostics.json`.

**Change:** Update `metricsStore.tsx`, `scanStore.ts`, `metricApplicability.ts`, `hotSpotRanking.ts`, `explorerColumns.ts`, and treemap `colors.ts`. Use reactive per-scan definitions. Do not borrow complexity colors or cohort-max bars for unknown/custom scales. Handle lower-worse zero and signed values correctly. Neutral metrics do not rank as risk.

Bind imported evidence requests to the scan in `routers/files.py`, `useMetricMarkers.ts`, and CodeModal's findings/metrics components. The current findings endpoint selects the latest finished job by path. It cannot identify the correct imported run. Keep line evidence separate from function witnesses.

**Proof:** Fixture `src/a.ts=2`, `src/b.ts=0`, `src/c.ts=unknown`; descriptor `acme.review/debt_count`, unit markers, nonnegative sum. One warning points to `a.ts:2`. Its count is independent of the scalar's value. The artifact names an immutable fixture revision. Verify subject and shared-input bytes against that revision; check live bytes again before line marks. Unsupported checkout transformations remain unverified.

The focused integration test checks raw exports and folder subtotal `2`, with `2/3` measured. Add shared Python/client ranking cases for zero, unknown, lower-worse, and signed values. Browser proof selects the metric, opens the diagnostic, and switches repositories without stale colors. Instrument checks-off to prove no tool starts, including a cache hit and a project-mode-to-off switch.

### Desired end state

A coworker can supply a file without adding a Srcly metric field. Views and reports agree. Source analysis works when the import is absent. Rollback removes the import or uses the explicit bypass.

## Milestone 2: Imports remain useful after edits and reloads

**Change:** Add file-content identity for dirty and non-Git sources. Use exact analyzed bytes and declared shared inputs. Keep repository-dependent computations unverified until their input set is defined. Preserve raw observations when effective source status becomes stale.

Add Reload results without an AST rescan or custom execution. Separate source, artifact, and interpretation identities in `cache.py`, `scan_jobs.py`, `reporting.py`, and results modules. Fix the current headless refresh no-op comment/path as these entry points converge. Avoid a global content-cache rewrite.

Validate expected metric IDs after reload. Identical repeats are idempotent. Conflicting definitions or values produce a visible conflict; do not use last-wins. Preserve positive diagnostics when another check set fails. Combined counts remain incomplete. Reject path escapes; outside-scan files do not create nodes.

**Proof:** Edit `a.ts` after producing results. Its old value remains inspectable but leaves trusted ranking and current line marks. `b.ts=0` remains valid; the denominator stays three. Restore source and reload. Change only the artifact under `.srcly/`; an instrumented test proves evidence refresh with AST reuse. Test one shared-input edit, malformed diagnostic, conflicting import, and missing artifact.

Add proposed `srcly results validate FILE --root PATH`. Distinguish invalid structure from valid but unmatched source. Ordinary partial measurement remains metadata unless completeness is explicitly requested.

### Desired end state

Users can explain which results are current. Dirty and non-Git file-local inputs work. A bad reload leaves prior data visibly stale. Bypass results independently of source analysis.

## Milestone 3: Repository settings give repeatable interpretation

**Change:** Complete discovery in proposed `repo_config.py` and CLI/API entry points. Support equivalent `[tool.srcly]`. If both sources exist, require explicit `--config`. Discover only at the worktree root; outside Git, use the requested directory or file parent. Do not merge child policies. Config paths use the config directory; CLI paths use the invocation directory.

Use unset CLI values to distinguish explicit overrides. Precedence for scan/report settings is built-ins → repo policy → explicit operation. UI defaults then allow saved repo-specific personal choices, deep links, and current session changes. Scope preferences by repository/worktree. Do not persist view changes into repo policy automatically.

**Change:** Add effective-config inspection with value origins. Support additive exclusions, maximum file size, selected worker/time budgets, default metric/view/activity window, raw risk bands, and cutoffs for existing named quadrants. Keep Ruff, ESLint, and tsc rule configuration in their native files. Do not expose internal sniff, cache, or SSE constants.

Color stops are finite and increasing. Lower-worse reverses attention. Risk rules use explicit raw comparisons and defined equality. Quadrant cutoffs retain axis units. Keep built-in profile scoring unchanged. A custom scale does not become a gate or profile normalization rule.

Touch `run.py`, `config.py`, `analysis.py`, `scan_workers.py`, `quadrants.py`, the shared scan context, metric store, and settings/status presentation. Analysis-affecting config invalidates source analysis. Interpretation-only edits reuse values. Selected control files/results are inputs, not source metrics; external check signatures still track relevant native config.

**Proof:** Temporary root and package fixtures prove root discovery, narrow scope, explicit child policy, duplicate-source errors, and worktree separation. Change colors and thresholds without changing values. Change exclusions and verify the source tree changes. Check threshold equality and invalid config errors. Browser proof inspects effective values and resets personal choices.

### Desired end state

The first useful release is complete. Repo settings explain repeatable behavior across UI and CLI. Explicit config bypass remains available. Invalid policy produces a located error rather than a silent default.

## Milestone 4: One existing diagnostics format works without its tool

**Change:** Add one adapter under `services/results/adapters/`, default SARIF 2.1.0. Use saved ESLint JSON first only if the coworker's actual output makes that cheaper. Normalize producer/rule, location, severity, and execution status into the existing results contract.

Preserve incomplete source and checked-file information. A SARIF file with no results does not prove every source file was checked. Do not register arbitrary property-bag numbers as metrics. Do not apply fixes or fetch remote sources.

**Proof:** Use one producer-generated artifact with positive, empty, and failed cases. Check URI bases, source uncertainty, missing locations, and one real line navigation. Run the same normalized-diagnostic assertions used for native bundles.

### Desired end state

An existing artifact supplies inspectable diagnostics. No analyzer installation or invocation is required. Removing that import restores native-only behavior.

## Milestone 5: A developer explicitly runs their own check

**Change:** Add proposed `srcly checks run PRODUCER PATH` and one explicit UI action. A declaration uses literal argv, cwd, output path, accepted exit codes, and timeout. Show the selected command. Do not run it during discovery, ordinary scans, or Reload results. Never install dependencies automatically.

Reuse `findings/tools.py` only after adding bounded output and cancellation through actual child processes. Extend `findings/jobs.py` identity beyond root/fingerprint. Accept output atomically after validation and source matching. Keep execution caching off. A failed rerun cannot present the old result as current.

Before reusing native checks, verify diagnostic-only Ruff flags against `fix=true` and `fix-only=true` fixtures. The current invocation lacks explicit overrides. Also check unreadable-file completeness and partial producer failures. These are identified risks, not reproduced bugs in this research.

**Proof:** A local `.mjs` fixture emits native results. Select success, malformed output, accepted nonzero status, timeout, and child-process modes. Test cancellation and descendant termination on each claimed platform. Then run one real coworker command. Remove its executable and confirm manual imports still work.

### Desired end state

A deliberate action runs a local producer and updates accepted results. Custom commands retain user permissions; no sandbox or read-only claim is made. Imports remain the bypass.

## Milestone 6: Evaluate portable result comparison

This is a follow-on proof, outside the first release. Extend only after real import use shows a comparison need.

**Change:** Inspect `compare/snapshots.py`, `diff.py`, `service.py`, and client compare consumers. Current side caches contain tree/graph data and use SHA/Srcly identity; they are not portable effective-context artifacts. Freeze definitions, raw observations, diagnostics, source association, and selected interpretation together.

Join repository-relative subjects across physical directories. Compare equivalent semantics only. Missing data stays noncomparable. Show policy differences and judge under one named policy, default base. Loading a saved snapshot must not plan or execute checks.

**Proof:** Compare fixture snapshots after removing producer executables. A threshold-only change is a policy change, not a raw-value improvement. Missing head evidence must not become zero. Test changed units/definition versions and unrelated source paths.

### Desired end state

Either a small dependency-free compare route is proven, or the extension remains deferred with a concrete reason. Reject unsupported formats directly; omit snapshot use to return to ordinary scans.

## Open decisions and spikes

1. Obtain one real producer sample before finalizing its dependency scope. Default to file-local inputs plus declared shared config.
2. Select the first diagnostic adapter from actual output. Default SARIF; native JSON proceeds independently.
3. Verify process termination per platform before promising execution support. Imports do not depend on that result.

No current open PR overlaps these modules; `gh pr list` returned none on October 23, 2026. Recheck before implementation. Update `docs/CODE_MAP.md` as new feature files land. Use one coherent implementation PR per milestone, with visible-change screenshots.

## Below the cut line

- Custom anchored profiles and explicit CI gates. Preserve Pro's designs for a later outcome-specific request.
- External function identities, source maps, rename guesses, arbitrary path remapping, and repository-wide dependency closure.
- Coverage ratios, weighted means, distributions, and graph interchange. They require distinct evidence shapes and proofs.
- Automatic custom execution, watchers, execution caching, trends, remote services, marketplaces, and in-process plugins.
- Compatibility layers or a built-in analyzer rewrite.

## Preserved Pro result materials

[Original Pro reports and artifacts for #100](assets/pro-results/extensibility-config-2026-10-22/ASSET_INDEX.md)

All extracted result materials are preserved without ZIP containers. Original bytes and attribution are unchanged.
