# Reports for agents and CI

Use `report` to scan a repository and write a compact Markdown summary plus JSON artifacts. The output gives a developer or coding agent a starting point for review. It does not make changes to the analyzed source tree beyond the output directory you choose.

## Create a report

```bash
uvx srcly report . --out .srcly
```

The default output directory is `.srcly`. The report command scans the current repository when you omit the path. Choose a different path when needed:

```bash
uvx srcly report /path/to/repository --out /tmp/srcly-report
```

The main files include:

- `report.md`: summary, scan and checker coverage, ranked file and function tables, and a compact tree breakdown.
- `findings.json`: machine-readable ranked findings with evidence and suggested prompts.
- `findings.top.json`: a compact top set for an agent to read first.
- `tree.summary.json`: a compressed repository tree.
- `hotspots.json`: file and function rankings for the selected metric.
- `metrics.schema.json`: metric definitions and interpretation hints.
- `agent-skill.md`: guidance for an agent that reads the generated artifacts.
- `size_budget.json`: baseline for the size ratchet used by `check`.

Artifact formats can be set with `--format markdown`, `--format json`, or `--format both`. The default is `both`. To include the complete analysis tree, add `--include-tree`. To include the TypeScript and TSX dependency graph, add `--include-dependencies`.

## Choose the ranking

The findings queue uses a profile. Set one of `general`, `frontend`, `backend`, `typescript`, `python`, or `docs`:

```bash
uvx srcly report . --profile frontend --out .srcly
```

The top file and function tables use one metric. If you omit `--metric`, Srcly chooses the profile's lead metric. Select one explicitly when you want to focus on it:

```bash
uvx srcly report . --metric complexity --limit 30 --out .srcly
```

Add a named 2×2 preset to the report with `--quadrant activity`, `blast_radius`, `component_weight`, `comment_noise`, or `findings`. The `quadrants.json` artifact contains the member lists. Use `--quadrant-cohort file`, `function`, or `component` to choose the point type where the preset supports it.

## Use JSON on stdout

For a one-shot agent call, emit the bundled report as JSON on standard output:

```bash
uvx srcly report . --stdout
```

Machine-readable output is kept on stdout. Version information and progress go to stderr. The static metric schema and agent guide are written with `--out`, not included as generated files when using stdout alone.

## Refresh and interpret results

Srcly reuses cached results when files and checker signatures are unchanged. Pass `--refresh` to rescan and rerun the checks. `--verbose` prints per-file progress to stderr.

Read the report's analysis and coverage information before acting on a finding. Missing or failed tools can leave coverage N/A with a reason. Metric N/A values remain different from zero. Rankings help prioritize code review; they are not proof of a defect. See [Findings](../findings/) and [Metrics](../metrics/) for interpretation guidance.
