# Complementary source evidence — implementation plan

## Plan at a glance

Repair graph evidence first. Then evaluate clone peers, typed findings, and coverage independently. Method coverage and CRAP require a separate mapping gate. Each milestone can stop without blocking the useful prior system. These are conditional plans, not concurrent feature commitments.

## Implementation strategy

Depend on metric trust's scope/support contract and use the portfolio decision protocol. Reuse `server/app/services/deps/`, `client/src/viz/deps/`, the code viewer and `reporting.py`. The existing [dependency-view shape](../dependency-view/shape-brief.md) owns graph layout and navigation. This initiative owns original edge evidence, completeness and derived relationship observations.

Use saved small artifacts for first proofs. One direct parser per selected format is sufficient. Each reader accepts an artifact plus a scan manifest and returns source-linked observations or a mismatch reason. No universal ingestion framework is required.

Fast loop begins with `cd server && uv run pytest tests/test_dependency_graph_ts.py tests/test_dependency_graph_py.py tests/test_dependency_graph_symbols.py`, plus the relevant new importer test when introduced. Client checks use `cd client && pnpm test`. No shared service or network is needed. Inject stale hashes, missing files, overlaps, exclusions and malformed records.

Generated fixture artifacts prove application behavior only. Before accepting an adapter, compare against one real output from the pinned tool/version. Use an existing authorized report or a temporary fixture project; never execute arbitrary project configuration through Srcly. No deployed proof is needed for local file readers. Omit or revert an adapter to roll it back.

## Milestone 1: Architecture observations explain their original edges

Preserve declared imports and source locations before barrel/symbol projection in `deps/graph.py` and `deps/common.py`. Carry type-only, dynamic/lazy and unresolved distinctions. Include resolver configuration in cache fingerprints. Keep the current graph geometry and view budget.

Compute strongly connected components on a named projection. Show original-edge witnesses and unique file neighbors. Do not label a static cycle a proven runtime defect. Verify TS and Python cases and a config-only resolution change. Use local fixture repositories for browser checks.

### Desired end state

- A cycle or dependent count opens its source evidence.
- Partial graphs do not make clean-state claims.
- Existing graph tests and geometry checks still pass.

## Milestone 2: Clone families reveal coordinated source changes

Select one pinned CPD or jscpd JSON output after inspecting its real schema. Add a small artifact reader and source-region comparison in the code viewer. Record detector configuration and union overlapping extents; do not call repeated literals logic clones.

Verify three real families, two intentional duplicates, and stale/overlapping-region cases. Compare the review action against LOC/CCN alone. Reject default adoption if peers cannot be reproduced or mostly encourage harmful abstractions.

### Desired end state

- Each family opens matched source peers with reproducible regions.
- No detector runs during a normal scan.
- One real pinned output and focused parser tests prove the format.

## Milestone 3: Typed diagnostics supply concrete rule evidence

Import one existing project report, initially typed ESLint JSON if suitable. Preserve tool/rule/config identity, location, suppression and source match. Compare explicit-any tokens with unsafe assignments that token counting misses. Distinguish negative type tests and duplicate reports.

Prefer the existing project's diagnostics over a new type checker. Inspect actual rule output before declaring support. Defer baseline persistence and cross-tool semantic deduplication; collapse exact duplicates only. Reject default visibility when source matching fails or style noise overwhelms useful findings.

### Desired end state

- A concrete typed issue leads to its rule and source evidence.
- Expected errors and unsupported artifacts remain distinct.
- Source scanning works without any report or rule engine.

## Milestone 4: Coverage gaps remain honest before CRAP is considered

Start with one coverage.py JSON format and matched Python files. Keep line/branch opportunities separate, including partial branches and exclusions. Require matching source content evidence from the producing workflow; revision alone cannot establish unchanged dirty files. Abstain if provenance is insufficient. Use an existing report or a temporary fixture test run outside Srcly to verify counts.

Test missing, stale, zero-opportunity and excluded files. Add method coverage only after nested ownership is proven. Keep TS source maps and notebook cell mapping unsupported until separate fidelity tests exist.

After that gate, compare components with an optional `C²(1-q)³+C` view. Label ordinary coverage as an adaptation of original basis-path CRAP. Test C=5/q=0 →30, C=10/q=.5 →22.5, C=31/q=1 →31, missing input, and > versus ≥ threshold boundaries. Never calculate from file maximum CCN and unrelated average coverage.

### Desired end state

- Imported coverage shows exact opportunities and source matching.
- Unknown coverage never becomes zero or a risk penalty.
- CRAP remains optional and earns adoption only through a changed useful decision beyond its components.

## Below the cut line

- Test/mutation runners, hosted analysis, embedded clone engines and rule-pack redistribution.
- Full call graphs, a replacement graph renderer, and dependency matrices without a failed focus task.
- Mutation evidence until an existing targeted report shows a missed assertion beyond coverage.
- Boundary rules until the project supplies a concrete allowed/forbidden relationship.
- Trends, general plugin infrastructure and support for multiple artifact versions at once.
