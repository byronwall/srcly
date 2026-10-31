# Srcly agent reporting: audit and redesign

https://github.com/byronwall/srcly

Baseline: `aa56155c9268ce9da3a54180cb6a77ae6635d190` (1.8.0). Mode: Design, grounded in a code review.

## Mission

What should Srcly's CLI reporting become so an agent can audit a repository and plan safe refactoring with the best possible evidence at repository, folder, file, and symbol levels? Audit what exists and how well it works, then recommend a radically better end-to-end design and a buildable refactoring plan. The owner wants ambitious 10x structural improvement and 100x attention to output quality, completeness, and edge cases. Favor concise, actionable evidence over extra output. This is a plan for future implementation, not a request to edit the repository.

Act as a senior developer-tools designer and static-analysis engineer. Be candid about what works, defects, tradeoffs, rejected options, and uncertainty. Consider removing or consolidating features as well as adding them. Srcly is a personal project: prefer direct designs over enterprise infrastructure or compatibility scaffolding.

## Access check

First confirm you can read the repository at the exact baseline, using connected GitHub or public source. If decisive source cannot be read, stop and identify the smallest missing input. Do not present a complete audit based only on this prompt.

## Reading route

Read at minimum `AGENTS.md`, `README.md`, `docs/CODE_MAP.md` (headless reports and dataflow sections), `server/app/run.py`, `server/app/services/reporting.py`, `server/app/services/metric_catalog.py`, `server/app/services/quadrants.py`, `server/app/services/compare/service.py`, `server/app/services/analysis.py`, `server/app/models.py`, `server/tests/test_reporting.py`, `server/tests/test_ranking_parity.py`, `skills/srcly-code-quality/SKILL.md`, `docs/analysis/2026-05-03-product-grid-prod-run-retrospective.md`, and the plans and findings under `docs/intent/metric-trust/`, `docs/intent/metric-portfolio/`, and `docs/research/metric-pilot-2026-10/`. Discover other relevant code, tests, API capabilities and research, including dependencies, findings, metrics, compare, and dataflow. Distinguish what the CLI exposes from capabilities available only elsewhere.

## Local observations to verify

A local run of this exact checkout used `PYTHONPATH=server /Users/byronwall/Projects/srcly/server/.venv/bin/python -m app.run report . --out /private/tmp/srcly-agent-audit --agent-compact --limit 10`. It scanned 1,035 files. The 10-finding queue included `docs/CODE_MAP.md` and a golden snapshot as refactor targets. The report had 10,636 bytes; nine artifacts totaled 97,464 bytes. It had useful complexity witnesses but generic action suggestions, absolute paths in the findings table, and a tree summary dominated by root documentation. Cache writes were denied by the sandbox; the process used another checkout's Python environment, whose installed version banner said 1.2.0, while source was the baseline above. Treat this as a local observation, not an independently verified product benchmark. A separate `explain . --file server/app/services/reporting.py --format json` scan emitted extensive progress on stderr. Check current code and distinguish stderr from machine-readable stdout. Do not assume these observations generalize.

## Ranked questions

1. **Audit and priorities.** Inventory the CLI's current user journeys, commands, outputs, options, scope levels and underlying evidence, including availability, omissions, duplicated paths, incorrect or misleading behavior, cost, and tests. Rank problems by impact on an agent performing a refactor audit. Provide code paths and concrete examples. Separate metrics from proven defects. Identify the strongest current features to retain.
2. **Desired workflow and contract.** Design the ideal progressive workflow from repository triage to folder, file and symbol investigation and refactor verification. Show realistic exact example commands and representative concise outputs. Address discovery, scope, ranking, citations to source lines, reasons and uncertainty, coverage and missing analysis, provenance, stale/dirty data, deterministic machine consumption, token and latency budgets, errors and exit codes. Identify which analyses should be on demand. Decide whether folder and symbol reports need first-class commands or a more coherent alternative.
3. **Leverage.** Generate at least eight distinct ideas, including four structural changes and removals. Compare at least three coherent approaches against task-specific criteria and select a direction, with explicit rejections and tradeoffs. Consider repository context, code categories, checks, dependency and data-flow evidence, compare workflows, related tests and work-queue design without assuming every capability should be included by default. Examine local instructions as context, without claiming automatic policy enforcement is reliable.
4. **Correctness and craft.** Audit score normalization, ranking, witness semantics, paths and identities, null versus zero, aggregation, tie handling, limits, failure/partial coverage, CLI input handling, stdout/stderr separation, schemas and determinism. Give high-value counterexamples and concrete verification cases. Explain how to measure usefulness, precision, token consumption and latency against an immutable baseline, including representative repositories and known edge cases.
5. **Implementation.** Give independently shippable milestones that refactor the present system toward the selected design. Name actual modules, contracts, caller and documentation changes, evidence-based tests, risks and explicit non-goals. Do not preserve old behavior merely from habit; identify any proposed breaking changes. The project uses Python/uv for the server and pnpm for JS. Dataflow has named outcomes and generation rules; do not imply missing analysis is zero.

## Evidence and scope

Cite repository paths and symbols for code claims. Use current primary documentation, papers or source code for decisive external comparisons, with direct links. Separate observed facts, inference and proposals. State what was not checked and unresolved conflicts. Review the CLI and its supporting analysis, not a visual redesign. Do not claim a defect from a metric alone. Do not add compatibility layers by default. Do not commit, push, or execute code from downloaded artifacts.

## Deliverables

Provide downloadable Markdown files and link each in the final response:

1. `report.md`: one-paragraph decision first, current capability and defect inventory, ranked answers, examples, options comparison, evidence and sources.
2. `implementation-plan.md`: milestones with files, contracts, runnable examples, meaningful tests, acceptance criteria, risks and dependencies. Include a baseline-based evaluation plan.
3. `recommendations.md`: stable IDs, each classified Build, Explore, Defer or Avoid, with a one-line reason and evidence. Include a 100x craft and edge-case ledger for the proposed CLI experience.

If files cannot be produced, provide their complete content inline. Codex will verify claims, integrate findings and do all repository changes. End with access status, files read, what was checked versus proposed, deliverable links and open questions.
