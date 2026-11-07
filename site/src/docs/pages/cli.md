# Command-line reference

Srcly has an interactive command and headless commands for scripts, agents, and CI. Run `uvx srcly --help` or `uvx srcly <command> --help` for the options available in your installed version.

## Open the interactive app

```bash
uvx srcly
uvx srcly /path/to/repository
```

The server binds to `127.0.0.1` by default and opens the browser. You can set `--port` to choose a port or `--host` to choose an interface. The app reads local repository files through this server. Keep the server on a trusted local interface.

## Scan and summarize

`scan` writes the raw analysis tree as JSON. The default filename is `codebase_mri.json`.

```bash
uvx srcly scan . --out tree.json
```

`report` writes the Markdown and JSON artifacts described in [Reports](../reports/). Use `--stdout` for one bundled JSON payload, `--refresh` to rerun analysis and checks, and `--verbose` for progress.

```bash
uvx srcly report . --out .srcly --profile python
```

## Rank or explain

`hotspots` ranks files or functions by one metric. The default metric is complexity; the default cohort is files.

```bash
uvx srcly hotspots . --metric complexity --cohort function --limit 20 --format json
```

`explain` prints a summary for a repository, folder, file, or symbol. Use `file::symbol` to select a symbol. Paths are relative to the analyzed root; `--at` can also use a line location copied from the report.

```bash
uvx srcly explain . --at src/app.tsx
uvx srcly explain . --at "src/app.tsx::App"
```

## Compare refs

`compare` compares Git refs. By default, it compares the merge base with the current working tree, including uncommitted edits. You can provide explicit refs or output JSON:

```bash
uvx srcly compare main HEAD --json
```

Unavailable measurements stay null. If a file is measured on only one side, Srcly records a coverage change and does not count that missing measurement as a zero delta.

## Fix and check

`fix` prints a diff of supported mechanical fixes. It only applies them with `--write`:

```bash
uvx srcly fix .
uvx srcly fix . --write
```

The `unreachable-file` rule can delete files. It runs only when you name it, and only with `--write`; inspect its diff first:

```bash
uvx srcly fix . --rule unreachable-file
```

`check` requires `--ratchet` and an existing budget. First create the budget with `report`:

```bash
uvx srcly report . --out .srcly
uvx srcly check . --ratchet
```

The budget tracks code files above 5,000 estimated tokens (file bytes divided by four). The check exits 1 when a tracked file grows above its baseline, or a new file crosses that threshold. A missing budget exits 2.

The budget comes from `.srcly/size_budget.json`. If you use another report directory, pass its budget file with `--budget`:

```bash
uvx srcly check . --ratchet --budget /tmp/srcly-report/size_budget.json
```

See [Configuration](../configuration/) and [Reports](../reports/) for related settings and artifacts.
