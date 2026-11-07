# Findings and check coverage

Findings bring selected checker results into Srcly's explorer, code viewer, and reports. Use them to find code worth reviewing, then confirm the issue with its source and tool. A finding is a triage signal, not a confirmed bug.

## Check coverage before reading the queue

Srcly selects checks based on the files and tools it finds. Checks run independently and have time limits. Missing tools, failures, and timeouts leave measurements unavailable with a reason. They do not count as zero findings. Read the coverage summary in the report or the checker status in the app before treating the queue as complete.

| Check | When Srcly runs it | What an unavailable result means |
| --- | --- | --- |
| TypeScript compiler (`tsc --noEmit`) | TypeScript project configuration and compiler are available | The project configuration or compiler was not available, or the run failed or timed out. |
| ESLint | The project has ESLint and its configuration | ESLint was not detected, or its run failed or timed out. |
| Ruff | Python files are present; Srcly ships Ruff | The run failed or timed out. Srcly uses project Ruff settings when present, otherwise labeled Srcly defaults. |
| Srcly TypeScript rules | TS files are outside project checker coverage | A selected built-in pattern matched, or that rule set did not cover the file. |
| Reachability and Solid rules | Supported TypeScript graph and patterns are available | Entry-point detection or language coverage may not match the project. Configure entries when needed. |
| ast-grep rules | `.srcly/rules/` files exist and ast-grep is available | The optional binary or rule run is unavailable. |

The exact checks vary by project. Srcly runs `tsc` per detected TypeScript project, expands solution configurations, runs ESLint when configured, and runs Ruff for Python. Its built-in TS checks include selected patterns such as explicit `any`, suppression directives without a reason, and non-null assertion chains when project tools do not cover those files. It also reports selected reachability, Solid, and await-in-loop signals. Optional ast-grep YAML rules can add project-specific checks. See [Configuration](../configuration/) for setup.

## Read a finding

When you open a finding, check these fields:

| Field | Review question |
| --- | --- |
| Tool and rule | Which checker produced this result, and what pattern does the rule detect? |
| Location | Where should you inspect the source? |
| Message and evidence | What specific code caused the result? |
| Coverage | Which files did this checker analyze, and which did it leave unavailable? |
| Profile or rank | Why did this file appear in the queue, and which metric drove its position? |

The report's findings queue uses a profile such as `general`, `frontend`, `backend`, `typescript`, `python`, or `docs`. A profile weights available risk-related metrics to suggest a review order. It does not replace the checker's diagnostic. Hot Spots ranks one selected metric. A queue score and a checker message are different kinds of evidence.

## Files outside the default queue

The report classifies files as code, tests, docs, styles, fixtures, generated, vendored, config, or data based on their paths. It explains which classes were left out and why. This keeps a README, fixture, or generated file from becoming a refactor target by accident, while preserving the count and reason. Use `--include-class` when you intentionally want to rank one class.

Example: in the included `solid-route` project at revision `653037aa`, the `frontend` profile reported five ranked findings. Its first row pointed to `src/data/records.ts::isRecordItem` with complexity 8 and 24 LOC. That is an example of a review starting point, not a claim that the function contains a defect. Inspect the named source and tests before deciding what to do.

## Improve coverage when the answer matters

If a result is unavailable, use the stated reason to decide whether to install or configure the relevant checker. For TypeScript reachability, Srcly detects common entries from routes, package metadata, scripts, and configuration. If the app has an entry pattern Srcly does not detect, add it to `srcly.toml`:

```toml
[reachability]
entries = ["app/scripts/**/*.ts"]
```

Then rescan so the result reflects the new setup:

```bash
uvx srcly report . --refresh --out .srcly
```

For a particular report run, check `Analysis:`. It names the scan state, Git HEAD, uncommitted files, checkers and their coverage, code files no checker covers, and files that failed analysis. If you need source-level review, use [Reports](../reports/) to find the relevant artifact, then [Metrics](../metrics/) for N/A and aggregation rules.
