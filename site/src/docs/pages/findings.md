# Findings and check coverage

Findings bring selected checker results into Srcly's explorer, code viewer, and reports. Use them to locate code that may need attention, then inspect the source and confirm the issue. A finding is a triage signal, not a confirmed bug.

## Checks Srcly can run

Srcly selects checks based on the code and tools it finds:

- For TypeScript projects, it runs the project's TypeScript compiler when `tsc` and a TypeScript configuration are available.
- It runs ESLint when the project has ESLint and its configuration.
- It runs Ruff for Python. Srcly uses the project's Ruff configuration when present; otherwise it uses a small built-in set of bug-finding rules, identified as Srcly defaults.
- For TypeScript files outside project checker coverage, Srcly has rules for selected patterns, including explicit `any`, suppression directives without a reason, and chains of non-null assertions.
- Srcly also checks selected TypeScript patterns, including Solid-specific rules, await-in-loop patterns, and import-graph reachability.
- Optional ast-grep YAML rules under `.srcly/rules/` can add project-specific checks when ast-grep is installed.

Checks run independently and have time limits. If a required tool is missing, fails, or times out, Srcly reports that status and reason. It does not turn a missing check into a clean result or a count of zero. Check the tool coverage line in the report before using findings as a complete review.

## Understand the findings queue

The report queue ranks code files using a selected profile. Profiles include `general`, `frontend`, `backend`, `typescript`, `python`, and `docs`. They weight available risk-related metrics to help choose a review order. You can also rank files and functions by one metric with `hotspots`.

Some paths are classified as tests, documentation, styles, fixtures, generated files, vendored code, configuration, or data. The report explains which classes it left out and why. Use `--include-class` when you want one of those classes ranked too.

When you open a finding, review its location, checker, rule, message, and evidence. Different checkers can have different assumptions and coverage. A finding score does not replace the checker's own output or your review.

## Improve coverage

Install and configure the checkers your project uses, then rerun with `--refresh` to bypass cached results:

```bash
uvx srcly report . --refresh --out .srcly
```

For reachability findings, Srcly detects common entries from routes, package metadata, scripts, and configuration. If your TypeScript entry points are not detected, add them under `[reachability] entries` in `srcly.toml`; see [Configuration](../configuration/).

See [Metrics](../metrics/) for N/A values and [Reports](../reports/) for checker coverage artifacts.
