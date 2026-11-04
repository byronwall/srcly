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

2. Read `.srcly/report.md` first. Its findings rank code files only; each row names the function to start at. A "Not ranked as code" line counts tests, docs, fixtures, generated, vendored, config and data files with the reason.
3. Drill down with `explain`, one scope at a time. Each call reuses the saved analysis (about a second) while no file has changed:

   ```bash
   uvx srcly explain .                                    # folders worst first, worst files, what was left out
   uvx srcly explain . --at server/app                    # one folder
   uvx srcly explain . --at server/app/run.py             # its functions and classes, most complex first
   uvx srcly explain . --at 'server/app/run.py::_main'    # one symbol: lines, every measured metric
   ```

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
