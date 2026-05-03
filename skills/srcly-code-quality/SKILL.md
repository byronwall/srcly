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

2. Read `.srcly/report.md` first. It is the compact, human-readable entry point.
3. Read `.srcly/findings.json` for machine-readable targets with metric evidence and suggested actions.
4. Read `.srcly/tree.summary.json` only when you need repository shape or sibling context around a target.
5. Inspect the referenced source files and nearby tests before proposing or making changes.
6. Treat metrics as triage signals, not proof of defects.

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
- Single metric list: `uvx srcly hotspots . --metric complexity --limit 20`
- Focus one file: `uvx srcly explain . --file path/to/file`
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
uvx srcly explain . --file path/to/file --format json
uvx srcly scan . --out -
```

## How To Interpret Findings

- High complexity: inspect control flow and tests before suggesting simplification.
- High LOC: look for separable responsibilities; do not split files blindly.
- TSX render branching, prop count, inline handlers, and nesting: UI complexity and test-surface risk.
- `any` usage and TS ignore directives: type-safety debt.
- Import coupling and dependency graph density: dependency-boundary review targets.
- TODOs in complex files: maintenance markers worth validating.
- Low comment density only matters when paired with complexity, public API behavior, or non-obvious domain logic.

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
- If generated artifacts are stale after code changes, rerun `uvx srcly report . --out .srcly --refresh`.
