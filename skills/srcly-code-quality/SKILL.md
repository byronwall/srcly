---
name: srcly-code-quality
description: Use Srcly headless reports to triage code quality hotspots, inspect repository structure, and prioritize safe refactors from compact metrics artifacts.
---

# Srcly Code Quality

Use this skill when asked to review a codebase, find refactor targets, prioritize technical debt, explain code quality risks, or plan agentic follow-up work using Srcly.

## Core Workflow

1. From the repository root, run:

   ```bash
   uvx srcly report . --out .srcly --format both
   ```

2. `report` prints its top high and medium findings, an `Analysis:` line and a `Next:` explain command. Read `.srcly/report.md` for the rest. Its findings rank code files only; each row names the function to start at. A "Not ranked as code" line counts tests, docs, stylesheets, fixtures, generated, vendored, config and data files with the reason.
3. Drill down with `explain`, one scope at a time. Each call reuses the saved analysis (about a second) while no file has changed:

   ```bash
   uvx srcly explain .                                    # folders worst first, worst files, what was left out
   uvx srcly explain . --at server/app                    # one folder
   uvx srcly explain . --at server/app/run.py             # its functions and classes, most complex first
   uvx srcly explain . --at 'server/app/run.py::_main'    # one symbol: lines, every measured metric
   uvx srcly explain . --at 'server/app/run.py:208 _main' # any "Start at" value, pasted as-is
   ```

   `--at` (and every path that `explain` and `hotspots` print) is relative to the analyzed path: `hotspots server` prints `app/...`, so pass it to `explain server --at app/...`, or analyze `.` throughout. Without it, `explain` reads the folder you are in. A method can be named by its bare name (`file.py::parse`) when only one symbol in the file has it. When several share a name (`(anonymous)`), the file table gives `file::name@line`, and a bare name lists each match, most complex first. Every answer ends with a `Next:` command you can run as-is. "Start at" is `path:line name`, and an anonymous callback also names its enclosing function. Pass it to `--at` unchanged: the name finds the function even when the line has moved, and a note says when the answer is not exactly what you asked for (a moved line, an unknown name, a line outside every function).

   A symbol answer adds two leads. `Branches:` splits its CCN into statements (`if`, `for`, `catch`) and short-circuit or ternary operators (`&&`, `||`, `?:`), and lists the deepest lines. A high CCN that is mostly operators is flat matching, such as a router, not tangled control flow. `Tests that import ...` lists test files that import the module and name the symbol, and a file answer lists test files that import the module. Both are name matches, not proof that a test runs the code, so open the test before you claim coverage.

   The `Analysis:` line says what the answer rests on: a reused or a fresh scan, the Git HEAD that history counts come from (and uncommitted files it leaves out), each lint or type checker that ran, and how many code files none covers. `finding_count` is N/A, not 0, for those files. Quote the line when you report findings.

4. Inspect the referenced source files and nearby tests before proposing or making changes.
5. Treat metrics as triage signals, not proof of defects.

## Token Discipline

Default to compact artifacts:

- Prefer `.srcly/report.md` and the top entries in `.srcly/findings.json`.
- Do not load `.srcly/tree.summary.json` wholesale unless the repo is small; query or sample it.
- Do not request full raw tree data by default.

Opt into heavier artifacts only when needed:

```bash
uvx srcly scan . --out .srcly/tree.json
uvx srcly report . --out .srcly --include-tree
uvx srcly report . --out .srcly --include-dependencies
```

Use `uvx srcly scan . --out -` only when a caller explicitly wants raw tree JSON on stdout.

## Command Selection

- Broad review: `uvx srcly report . --out .srcly --format both`
- Single metric list: `uvx srcly hotspots . --metric complexity --limit 20` (any non-neutral id from `metrics.schema.json`; `--cohort function` ranks functions)
- Report ranked by another metric: `uvx srcly report . --out .srcly --metric comment_noise`
- Named 2x2 (members per quadrant in `report.md` + `quadrants.json`): `uvx srcly report . --out .srcly --quadrant activity` ("Hot mess" = complex and changing often; also `blast_radius`, `component_weight`, `comment_noise`)
- Drill into a folder, file or `file::symbol`: `uvx srcly explain . --at <path>` (relative to the analyzed path, not the cwd; `--file` still works)
- Rank another file class too: `--include-class test` (also `docs`, `fixture`, `generated`, `vendored`, `config`, `data`)
- Compare two refs: `uvx srcly compare` (merge-base → working tree) or `uvx srcly compare pr:<n>`
- TypeScript/TSX data flow (needs Node 18+, takes minutes on a big app): `uvx srcly report . --out .srcly --dataflow`; diff its metrics with `uvx srcly compare --dataflow`
- Full raw tree: `uvx srcly scan . --out .srcly/tree.json`
- CI gate: `uvx srcly report . --out .srcly --fail-on high`

Reports are quiet by default and print a compact artifact summary. Add `--verbose` when you need per-file progress on stderr:

```bash
uvx srcly report . --out .srcly --format both --verbose
```

Machine-readable stdout is available through:

```bash
uvx srcly report . --stdout
uvx srcly hotspots . --format json
uvx srcly explain . --at path/to/file --format json
uvx srcly scan . --out -
uvx srcly compare --json
```

Progress, version banners and cache warnings go to stderr, so stdout stays parseable even when a cache write fails. `--limit`, `--tree-depth` and `--tree-top` must be 1 or more.

## How To Interpret Findings

- High complexity: inspect control flow and tests before suggesting simplification.
- High LOC: look for separable responsibilities; do not split files blindly.
- TSX render branching, prop count, inline handlers, and nesting: UI complexity and test-surface risk.
- `any` usage and TS ignore directives: type-safety debt.
- Import coupling and dependency graph density: dependency-boundary review targets.
- TODOs in complex files: maintenance markers worth validating.
- Low comment density only matters when paired with complexity, public API behavior, or non-obvious domain logic.
- Compare: `null` is unavailable, never zero. A file measured on one side only shows under `coverage` (lost or gained) and stays out of the metric totals; report coverage changes apart from real improvements or regressions. A file missing from a side's dependency graph has unknown `fan_in`/`fan_out`.

## Data Flow

`--dataflow` runs the TypeScript checker over every render path, from a prop, signal or local to the JSX that renders it. It adds:

- `dataflow.md`: ranked work packets with candidate edits and the risk queue, then the defensive ledger, repeated forks, prop relay, context relay and fan-out.
- A `## Data flow` section in `report.md` that lists each finding by line.
- Metrics per TS/TSX file: `dataflow_impossible_defenses`, `dataflow_repeated_forks`, `dataflow_relay_hops`, `dataflow_representation_changes`, `dataflow_path_depth` and `dataflow_fan_out`. The app colors the treemap and marks the code viewer from them while the files stay unchanged.

The two finding rules:

- `impossible-defense`: a `??` or `?.` whose guarded value the types say is never null or undefined. Remove it only when the runtime contract agrees with the types (no external JSON, no unchecked cast, no SSR first render).
- `repeated-fork`: a component tests the same discriminant at several sibling branch sites (ternary, `&&`, Solid `<Show>` or `<Match>`). Split it into one sub-component per branch, and move each branch-only value into its sub-component.

Read `dataflow.md` in this order, and fix one slice at a time:

1. Pick the worst grounded ownership problem, not the highest-scored sink. Prefer prop relay, repeated shape changes across components, wide fan-out, broad prop bundles, and state that a feature store or context should own. Skip a compact local parser or style object next to JSX unless nothing larger is left.
2. Read **Feature Clusters**. Treat "Provider/Context audit" as work only when its Evidence column shows provider, context, feature-hook or same-feature relay evidence.
3. Prefer a **Grouped Recommendation** (such as `BarTick[]` or `BarRectangle[]`) to edits on each attribute sink.
4. Read the **Pack verdict** before you create or delete a render model. Keep a `normalization boundary` or `cohesive render model`. Split an `overpacked bag`, `mirror object` or `relay bag` by render responsibility.
5. Follow the **Extraction shape check**: build a cohesive repeated item, never a mirror singleton. A generic name such as `renderValue` or `ItemModel` is a reason to rename, not a design.
6. For repeated optional Solid prop defaults, use one `mergeProps(defaults, props)` boundary. Keep a caller-precedence fallback (`tooltip ?? user.name`) where it states the API's priority.
7. Keep SVG shell values (`width`, `height`, `viewBox`) inline or in a small local thunk; they are not fields of the repeated item. Use local aliases for repeated scalar geometry such as `size() / 2`.
8. Leave **Background Findings** alone: they are true paths, not cleanup work.
9. When you add or extend a feature Provider/Context, finish the job: convert children that receive context-owned state or actions through props to the feature hook. Check every Context Relay row and call it converted, a presentational leaf, or a follow-up.
10. Stop when the **Stop Recommendation** says `yes`. More local flattening after that is churn.

After a fix, run the project's checks, run `report --dataflow` again, and compare `dataflow.md` and the metrics with `uvx srcly compare --dataflow`.

## Response Pattern

When reporting back:

1. List the top 3-5 targets.
2. Include the metric evidence that made each target stand out.
3. Explain the likely maintenance risk in plain language.
4. Recommend the next action and the tests or verification needed.
5. If making edits, keep them small and behavior-preserving unless the user asks for a larger refactor.

## Safety Rules

- Do not claim Srcly findings are bugs without reading the code.
- Do not paste large JSON artifacts into chat.
- Do not edit based only on metric rank; inspect implementation and tests first.
- After code changes, rerun the command. The saved analysis is checked against every file and rescanned when anything changed; `--refresh` forces a rescan and fresh lint and type checks.
