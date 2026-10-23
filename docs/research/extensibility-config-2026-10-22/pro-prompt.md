# Srcly: custom metrics and repository settings

https://github.com/byronwall/srcly

Baseline: aea1015258f56dd45b8e175f7288e2fef3abc6cf (1.2.0 plus graph changes).
Research branch: codex/extensibility-config-research. Mode: Design.
The attached source packet is the exact baseline. Use it if connected GitHub cannot read this ref.

## Mission

What should Srcly build so developers can use its visualizations with their own checks and metrics, and save useful settings per repository?

A coworker likes Srcly's data visualization and UX but wants their own metrics processed. Byron also wants repository-specific limits, thresholds, settings, and defaults. Design these as one coherent capability, with independently useful stages. Support a decision and a new implementation initiative. Do not implement code.

Act as a senior developer-tool designer with experience in static analysis, data visualization, artifact interchange, and local configuration. Give candid tradeoffs and a strong recommendation.

## Access check

First confirm access to the baseline or attached source packet. If decisive source is absent from both, stop and name the smallest missing input. Do not infer code behavior from filenames alone. The packet includes selected complete source files, not the whole repository. State any resulting limits.

## Read at minimum

1. AGENTS.md, README.md, docs/CODE_MAP.md, client/package.json, server/pyproject.toml.
2. server/app/models.py, server/app/services/analysis_types.py, metric_catalog.py, analysis.py, reporting.py, quadrants.py.
3. server/app/services/findings/model.py, tools.py, runner.py, overlay.py, jobs.py; server/app/services/activity.py and scan_jobs.py.
4. server/app/config.py, run.py, services/cache.py, routers/metrics.py, routers/scans.py.
5. client/src/utils/metricsStore.tsx, metricApplicability.ts, hotSpotRanking.ts, explorerColumns.ts; client/src/components/Explorer.tsx; client/src/state/scanStore.ts; client/src/viz/treemap/utils/colors.ts.
6. docs/intent/imported-quality-evidence/{intent-brief,shape-brief,implementation-plan,initiative-map}. Explain overlap. That older plan rejects a general plugin system; it is historical context, not a veto on this new request.
7. server/tests/test_metric_catalog.py, test_ranking_parity.py, and tests for findings, cache, and quadrants in the packet.

## Ranked questions

1. **Custom results in Srcly:** Compare imported artifacts, a small native results contract, command-based producers, and in-process plugins. Which first route best lets a coworker bring their own metrics without forking Srcly? Distinguish numeric measurements from diagnostics, coverage, and graph evidence. Should one contract cover them? Show a concrete file-metric example and a line-finding example through UI and reports. Explain the simplest credible first proof and the ambitious end state.
2. **Metric semantics and integration:** Define identity, units, applicability, measured zero versus unknown, coverage/completeness, aggregation, direction, thresholds, provenance, source matching, duplicate/conflicting producers, and optional line evidence. Explain registration in the catalog, type-safe storage, file/scope joins, folder rollups, ranking, colors, code viewer, headless reports, and compare. Address files outside the scan, renamed paths, stale artifacts, and arbitrary metric IDs. Recommend which cases to defer.
3. **Repository configuration:** What belongs in a checked-in config versus user preference, a CLI override, or a session control? Compare formats and discovery rules, including pyproject.toml and a dedicated file. Recommend exact precedence and root behavior for nested scans, monorepos, and worktrees. Separate analyzer rules, visualization color stops, risk thresholds, quadrant cutoffs, profile weights, scan exclusions/resource settings, default selected metric/view/activity window, producer settings, and CI gates. Show a minimal config plus one richer example; avoid making every internal constant configurable.
4. **Runtime and trust:** Should Srcly run custom checks itself, import their outputs, or offer both in stages? Explain explicit execution versus scan defaults, command argv/cwd/environment, cancellation/timeouts, tool failure, cache keys, config-only invalidation, artifact updates, and compare snapshots without dependencies. Prefer a simple local-tool boundary to speculative sandbox or marketplace infrastructure. Identify concrete pitfalls that justify safeguards.
5. **Research and plan:** How do strong tools solve these jobs? Use current primary documentation for useful named comparisons, such as SARIF, coverage formats, Sonar external issues/metrics, ESLint rules/config, Ruff config, and visualization interchange where relevant. Do not assume a standard diagnostics format supports arbitrary measurements. Recommend an approach, rejected alternatives, rollout order, runnable examples, targeted tests, and explicit cut lines. Reconcile with the older imported-evidence initiative and current findings runner.

## Evidence and scope

Cite repository paths and symbols for current-code claims. Cite current primary documentation or source code with URLs for decisive external claims. Separate facts, inferences, and proposals. State uncertainties. The owner supplies demand; do not require customer validation before proposing the design.

Srcly is a local Python/FastAPI analysis tool with a SolidJS/TypeScript client. Use uv for Python and pnpm for the client. Byron is a personal developer: prefer direct code and one server/client version. Avoid default compatibility layers, remote services, multi-tenant design, package marketplaces, and a generic plugin platform unless a concrete requirement earns them. An ambitious direction is welcome when staged behind useful small proofs. Preserve N/A versus measured zero. Do not silently replace raw metrics when configuring interpretation.

This is research and planning only. Codex will verify the findings, write the initiative, and own all repository changes. No production changes or code implementation are requested.

## Deliverables

Provide downloadable Markdown files, each linked in the final message:

- research-report.md: Lead with one paragraph saying what to build. Answer all ranked questions. Include concrete contracts/config examples, UX flow, meaningful alternatives, and primary sources.
- implementation-plan.md: Ordered outcome milestones. Each leaves a usable system, names actual modules, a runnable example, focused tests, main risk, and observable proof. Lead with a fast local end-to-end proof; isolate uncertain dependencies. Include rollback/bypass, cut line, and at most three unresolved decisions.
- recommendations.md: Stable recommendation IDs, classified Build, Explore, Defer, or Avoid, with one-line reasons. Build means plan inclusion, not approval to implement.

Keep the report decision-focused. Do not generate manifests or hashes. If downloads are unavailable, give complete Markdown inline. End with access status, files read, what was checked versus proposed, links, and open questions.
