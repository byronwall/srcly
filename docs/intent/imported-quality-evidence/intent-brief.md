# Complementary evidence without another analyzer platform

## My read

Byron wants Srcly to reveal different kinds of code quality information. Static counters cannot identify every dependency obligation, repeated region, unsafe typed flow, or untested choice. Existing graphs and external artifacts can supply those facts without turning Srcly into a build, lint, and test runner.

This initiative defines a gated route to inspect such evidence beside source. Each addition must answer its own question. A cycle shows a relationship to investigate. A clone family identifies peers that may need coordinated changes. A typed finding names a rule and source region. Coverage shows what a particular test run exercised. None should become another unexplained vote in a health score.

The primary audience remains a local developer. The tool should read one known artifact format when that is enough. It must explain missing data and mismatched source rather than guess. Every workflow can be rejected independently if its information does not justify its cost.

## What matters most

- Link evidence to exact source and supporting relationships.
- Reuse the existing dependency view and its bounded layout.
- Import test and analyzer artifacts before considering embedded engines.
- Compare CRAP with its components rather than treating it as independent information.

## Boundaries

The [custom results initiative](../custom-metrics-and-repo-config/shape-brief.md) now owns the shared import contract and diagnostics path. This initiative retains graph, clone, and coverage goals. Its no-execution boundary describes these imported workflows; current Srcly scans already run native checks.

This is a sequence of conditional proofs, not a commitment to build every integration. Choose one artifact format per milestone. Do not add a plugin framework, run project configuration, launch tests, bundle rule packs, or call remote analysis services during a normal scan.

Missing coverage is unknown. A clone is not an instruction to extract an abstraction. A dependency cycle is not proof of a runtime fault. These distinctions must survive the report and UI.

## What seems settled

The dependency-view initiative already defines hierarchy, focus and geometry. Extend its evidence, not its renderer. Current import and duplicated-string counts do not provide resolved dependency or logic-clone evidence.

CRAP originated with Savoia and Evans. Its formula depends on complexity and coverage. Reliable function ownership and artifact joins are prerequisites; arithmetic alone is insufficient.

## Next step after confirmation

Prove that an existing graph relationship preserves the original declaration. Then evaluate clone, typed-finding, and coverage imports one at a time. The [implementation plan](implementation-plan.md) gives each a rejection gate. Mutation and broader architecture rules stay deferred. All execution remains planned.
