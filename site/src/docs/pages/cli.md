# Command-line reference

Srcly has an interactive command and headless commands for scripts, agents, and CI. Run `uvx srcly --help` or `uvx srcly <command> --help` to see options in the version you installed.

## Open the interactive app

```bash
uvx srcly
uvx srcly /path/to/repository
```

The server binds to `127.0.0.1` by default, selects an available port, and opens the browser. Use `--port` to select a port or `--host` to select another interface. Keep the server on a trusted local interface because the app reads repository files through it. Keep the terminal open while using the app; stop it with `Ctrl+C`.

## Scan and summarize

`scan` writes the raw analysis tree as JSON. Its default filename is `codebase_mri.json`:

```bash
uvx srcly scan . --out tree.json
```

`report` writes a Markdown summary and JSON artifacts. Choose an output directory and profile:

```bash
uvx srcly report . --out .srcly --profile frontend
```

Use `--stdout` for a bundled JSON payload, `--refresh` to rescan and rerun checks, and `--verbose` to print per-file progress to stderr. To include the full raw tree, use `--include-tree`; to include TypeScript and TSX imports, use `--include-dependencies`. Select the output format with `--format markdown`, `--format json`, or `--format both`. Add `--dataflow` to run the TypeScript data-flow engine too: it writes `dataflow.md` and adds data-flow metrics and findings (see [Data-flow analysis](../data-flow/)).

The findings profile and the top-table metric are different settings. Use `--profile` for the weighted findings queue; use `--metric` for top files and functions. For example:

```bash
uvx srcly report . --profile frontend --metric complexity --limit 30 --out .srcly
```

Add `--quadrant activity`, `blast_radius`, `component_weight`, `comment_noise`, or `findings` to add a 2×2 breakdown. Use `--quadrant-cohort file`, `function`, or `component` when the preset supports it.

## Rank or explain

`hotspots` ranks files or functions by one metric. The default metric is complexity and the default cohort is files:

```bash
uvx srcly hotspots . --metric complexity --cohort function --limit 20 --format json
```

`explain` summarizes a repository, folder, file, or symbol. Use a path relative to the analyzed root, `file::symbol`, or a `file::name@line` value when names repeat:

```bash
uvx srcly explain . --at src
uvx srcly explain . --at src/app.tsx
uvx srcly explain . --at "src/app.tsx::App"
```

`refs` lists every declaration of a name and the symbols that reference each one, from the symbol index. Run it before you move or delete a symbol, and again after, to see that no caller is left. A bare name shows every copy, so a type declared in three files shows three times. `file::symbol` picks one declaration:

```bash
uvx srcly refs DocDetail .
uvx srcly refs "src/services/docs.queries.ts::fetchDoc" . --format json
```

You can also pass a `path:line name` Start at location printed by the report. `explain` reports scan provenance and checker coverage so you can see whether it reused a scan and what remains unmeasured.

## Compare refs

`compare` compares Git refs. By default it compares the merge base with the current working tree, including uncommitted edits. Give two refs to compare explicit revisions, or request JSON:

```bash
uvx srcly compare
uvx srcly compare main HEAD --json
uvx srcly compare main pr:42 --json
uvx srcly compare --dataflow
```

Unavailable measurements stay null. If a file is measured on one side only, Srcly records a coverage change and does not count the missing value as a zero delta. A file absent from one dependency graph has unknown fan-in and fan-out.

## Review recent changes

`changes` prints the code chunks a window of Git history edited, as Markdown: the resolved base and head, the review buckets, then the chunks grouped by folder with before → after complexity. It is the text form of the app's **Changes** view.

```bash
uvx srcly changes
uvx srcly changes . --window 7d
uvx srcly changes . --window branch --mode net --json
uvx srcly changes . --window custom --base main --head my-branch
uvx srcly changes . --window custom --since 2026-11-01T00:00:00 --until 2026-11-08T00:00:00
```

`--window` is `branch` (the default: this branch against its merge base), `24h`, `7d`, or `custom` with `--base`/`--head` or `--since`/`--until`. `--mode touched` (the default) lists every chunk a commit changed, with reverted work; `--mode net` compares the base and head snapshots only. `--ref` picks the branch whose first-parent history is read. Uncommitted edits are included when the head is the checked-out commit; `--no-worktree` leaves them out. `--json` prints the same payload the app reads. See [Review changes](../changes/) for the window, chunk and bucket rules.

## List findings

`findings` prints each lint, type and srcly finding as `path:line rule message`, then a count per rule. Paths are relative to the analyzed folder. `--rule` filters by rule id (`duplicate-type`, `F401`, `TS2322`) and may be repeated:

```bash
uvx srcly findings . --rule duplicate-type
uvx srcly findings . --rule duplicate-type --rule await-in-loop --format json
```

It runs the same checks as `report` and shares their cache, so a second run on unchanged files is quick. The first run takes as long as all the checks, even with `--rule`. `--refresh` reruns them.

A count is N/A, with the reason, when a checker that could report the rule failed, timed out, was configured but not run (no `node_modules/.bin` binary, or over the project limit) or checked no file. In JSON, `count` is then `null` and `found` holds what the other checkers reported. Only the rule's own checkers matter: Srcly's own rules and ast-grep rule ids are known, a `TS2322` rule belongs to tsc, an `F401` rule to ruff, and any other name to eslint. The total without `--rule` needs every checker. A misspelled rule is N/A or is named in a note (`unknown_rules`), so it does not pass for a clean 0. The exit code is 0 either way, so read the count.

## Fix and check

`fix` prints a diff of supported mechanical fixes. It applies changes only with `--write`:

```bash
uvx srcly fix .
uvx srcly fix . --write
```

The `unreachable-file` rule can delete a file. Name that rule to run it, and inspect the diff before applying it:

```bash
uvx srcly fix . --rule unreachable-file
uvx srcly fix . --rule unreachable-file --write
```

`check` requires `--ratchet` and an existing size budget. Create that budget with `report`; the default report writes `.srcly/size_budget.json`:

```bash
uvx srcly report . --out .srcly
uvx srcly check . --ratchet
```

The budget tracks code files over 5,000 estimated tokens, based on file bytes divided by four. The baseline only goes down. The check exits nonzero when a tracked file grows above its baseline or a new file crosses the threshold. Use `--budget` to pass a budget from another report directory.

For supported settings see [Configuration](../configuration/). For the report artifacts and review order, see [Reports](../reports/).
