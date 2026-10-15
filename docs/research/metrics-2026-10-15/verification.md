# Independent checks and limits

Checked on 2026-10-15 against baseline `83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4`. Application files remain unchanged in this work.

## Collected artifacts

The ZIP contains eight regular files. CRC integrity passed. Entry inspection found no absolute paths, traversal entries or symbolic links. Every JSON companion parsed. Seven companion hashes and byte sizes match Pro's `audit-validation.json`; the validation record itself has a separately recorded collection hash. The collection manifest includes the original ZIP.

The browser download event timed out, but the expected 112,480-byte ZIP existed in Downloads. It was inspected before any retry. All companions were extracted from that verified archive. Separate copies were unnecessary; no research was rerun to recover them.

## Current metric coverage

A local identifier comparison reconciled the original inventory with source: all 32 API fields, 27 report definitions and 22 selector entries match. The 21 candidate records parse. All 18 recommendation IDs and 21 candidate IDs have a final disposition in `reconciliation.md`.

These checks establish inventory coverage, not the correctness of every prose assertion. The original report's 34 checks are Pro's artifact checks. They are not local application tests.

## Consequential source findings

| Finding | Independent evidence | Confidence and limit |
| --- | --- | --- |
| Maximum CCN differs from average | `models.py`, `analysis.py:_max_scope_complexity`, existing `test_complexity_semantics.py` | Confirmed source contract; tests inspected, not run. |
| Ten TS/TSX fields lack folder assignments | `analysis.py:aggregate_metrics`, `analysis_types.py`, API fields | Confirmed source omission; no runtime propagation experiment in this PR. |
| Scope conversion loses executable kind | `analysis.py:convert_function` creates type `function` for every analyzer scope | Confirmed source behavior; language-specific classification changes need fixtures. |
| Report denominator changes with positive values | `reporting.py:rank_nodes` skips `value <= 0` before accumulating weights | Confirmed source rule. Independent arithmetic: score 1 becomes 0.62875 when a second positive normalized value of .01 enters with weights 1.5 and .9. Fixed peers/maxima assumed. |
| UI ranks a different mixed population | `Explorer.tsx` flattens nonfolders and sums normalized selections | Confirmed source rule; proposed parity is not implemented. |
| Graph projection lacks original import source locations | `deps/common.py:DepEdge`, `deps/graph.py:_assemble` | Confirmed contract limitation. Runtime fault claims remain withheld. |
| Resolver cache omits config inputs | `deps/graph.py:build_dependency_graph` fingerprints selected source files | Confirmed source design. Config-change behavior needs the planned fixture proof. |
| Area/selected-scope issues | Body attribution, client tree supplementation, `MetricsSidebar.tsx` | Source-derived hypotheses retained as reproduction tasks, not executed browser findings. |

## External claims independently checked

- The [creator's 2007 CRAP article](https://www.artima.com/weblogs/viewpost.jsp?thread=215899) confirms Savoia/Evans, the formula, basis-path coverage, and experimental thresholds. Arithmetic checks passed for C=5/q=0, C=10/q=.5 and C=31/q=1.
- [CodeScene's documentation](https://docs.enterprise.codescene.io/latest/guides/technical/hotspots.html) supports combining activity context with structural investigation. Its benefit claims do not establish Srcly effectiveness.
- [coverage.py's branch documentation](https://coverage.readthedocs.io/en/latest/branch.html) distinguishes branch destinations, exclusions, and opportunity counts.
- [typescript-eslint](https://typescript-eslint.io/rules/no-unsafe-assignment/) confirms that unsafe assignment analysis needs type information. Counting explicit `any` cannot substitute for it.
- The [Git log manual](https://git-scm.com/docs/git-log) supports explicit history traversal and warns that `--follow` handles a single file.
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) documents project rules and dependency evidence. [Radon](https://radon.readthedocs.io/en/master/intro.html) documents formula variants and warns about Maintainability Index interpretation.

The Google testing blog was blocked by an access challenge during independent retrieval. The accessible creator article supports the decisive CRAP claims. The original report retains its separate 2011 source and notes historical comparator differences. No claim of independently reading that blocked page is made.

Other competitor details remain Pro research rather than independently exercised products. Version, licensing, and four static-image inspection caveats remain in the original tool survey.

## Planning validation

All four new initiatives passed `validate-sleuth.mjs` with zero warnings. `audit-sleuth.mjs` ran for each. Its structural audit found no requested improvements. Those heuristics do not prove product value or implementation success.

Each map uses lifecycle `planned`, current phase `plan`, and planned milestones. New evaluation scripts and tests named in the plans do not exist yet. Commands for them are proposed implementation loops.

All 418 structured metric-inventory source anchors fall within the pinned baseline files. All 23 authored relative document links resolve locally. Authored-document whitespace checks pass. The unchanged original report retains two Markdown hard-break spaces; the full Git whitespace check reports those two lines. Originals remain byte-identical to preserve their recorded hashes.

Application pytest, client tests/build, real repository scans, browser product tests, empirical correlations, pilot adjudication, and predictive validity checks were not run. This PR changes research/planning documents only. The checkout has no installed server environment; no dependencies were installed for document work.
