# Reports for agents and CI

Use `report` to scan a repository and write a Markdown summary plus JSON artifacts. The output gives a developer or coding agent a starting point for review. It does not change the analyzed source tree, except for files you choose in the report output directory.

## Create a report for a review

From a checkout that has Srcly installed, this command reports on the included `solid-route` example:

```bash
uvx srcly report engine/examples/solid-route --out tmp/solid-route-report --profile frontend --limit 5
```

With the published command, use `uvx srcly report /path/to/repository --out /path/to/report`. Review `report.md` first. It names the selected profile and ranking metric, gives scan and checker coverage, lists ranked findings, and shows a compact folder breakdown. Then use the printed `Start at` location or a folder path with `explain`:

```bash
uvx srcly explain /path/to/repository --at src/data
uvx srcly explain /path/to/repository --at "src/data/records.ts::isRecordItem"
```

In the included example at revision `653037aa`, the frontend report ranked `src/data/records.ts` with a high complexity signal. It named `isRecordItem` at line 18 as the witness (complexity 8, 24 LOC). The folder explanation for `src/` covers 10 code files. These facts show how to follow a report; they do not establish a defect in that function. Re-run against your checkout to get current evidence.

## Match each artifact to a question

The default report writes these artifacts:

| Artifact | Use it to answer |
| --- | --- |
| `report.md` | What did the scan find, what ranked highest, and what should I inspect first? |
| `manifest.json` | Which revision, scan state, checkers, and coverage details produced this report? |
| `findings.top.json` | What evidence should an agent load first from the findings queue? |
| `action-plan.md` | What review tasks did Srcly derive from the ranked evidence? Inspect the cited source before acting. |
| `tree.summary.json` | Which folders and files make up the compact repository summary? |
| `findings.json` | What are the machine-readable ranked findings up to `--limit`, with their evidence? |
| `hotspots.json` | Which files or functions rank highest for the selected single metric? |
| `metrics.schema.json` | What do metrics mean, and how should an agent interpret them? |
| `agent-skill.md` | What guidance should an agent follow when it consumes the report? |
| `size_budget.json` | Which code files exceed the token-size threshold, and what baseline does the ratchet use? |

The manifest identifies artifact paths and scan provenance. `report.md` is a practical first read; the JSON files support targeted tools and agent workflows. Use `--include-tree` to include the full raw tree or `--include-dependencies` to include the TypeScript and TSX import graph.

If you add `--quadrant <preset>`, Srcly also writes `quadrants.json` with the full member lists for the selected 2×2. The report's Markdown section gives a compact readable summary.

## Choose a profile and ranking metric

The findings queue uses one profile: `general`, `frontend`, `backend`, `typescript`, `python`, or `docs`. Profiles weight available risk-related metrics to suggest a review order. The top files and functions tables rank by one metric. If you omit `--metric`, Srcly chooses the profile's lead metric. Specify one when you need consistent rankings across runs:

```bash
uvx srcly report . --profile frontend --metric complexity --limit 20 --out .srcly
```

The findings profile score and a Hot Spots metric rank answer different questions. Do not compare their scores as if they were the same scale. N/A remains unavailable and is not a zero. A file measured on one side of a comparison only is a coverage change without a metric delta.

Add a named 2×2 preset when you want to inspect two metric axes:

```bash
uvx srcly report . --quadrant blast_radius --quadrant-cohort file --out .srcly
```

Presets include `activity`, `blast_radius`, `component_weight`, `comment_noise`, and `findings`. Some presets or cohorts do not apply to every project.

## Check freshness and coverage

Srcly reuses cached analysis when the files and checker signatures are unchanged. Use `--refresh` to rescan and rerun checks; use `--verbose` for per-file progress on stderr:

```bash
uvx srcly report . --refresh --out .srcly --verbose
```

Read the `Analysis:` line and manifest before taking action. They report whether the scan was reused or fresh, the Git HEAD, uncommitted files, checker status and file counts, code files no checker covers, and analysis failures. If a checker is missing or fails, its coverage is unavailable with a reason. Do not read that as a clean run.

## Use stdout for a one-shot agent call

`report --stdout` emits a bundled JSON payload to standard output:

```bash
uvx srcly report . --stdout
```

Machine-readable output is kept on stdout; progress and cache warnings go to stderr. The static metric schema and agent guide are written only by `report --out`. Use `--format markdown`, `json`, or `both` when you want a chosen file format in an output directory.

Reports help you choose what to inspect. Confirm each claim with its source, checker evidence, and project tests. See [Findings](../findings/) for coverage and [CLI](../cli/) for commands such as `explain`, `hotspots`, and `compare`.
