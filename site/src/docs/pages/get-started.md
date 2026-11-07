# Get started

Srcly turns a local codebase into an interactive map. Use the treemap and file explorer to find areas to inspect, then open code and metrics in context. You can also generate Markdown and JSON reports for scripts and coding agents.

## Install and launch

Install [uv](https://docs.astral.sh/uv/) if it is not already available. Then run Srcly with `uvx`; this downloads and runs the tool without a global Srcly install.

```bash
uvx srcly
```

Srcly starts a local web server and opens the app in your browser. By default, the server binds to `127.0.0.1` and selects an available port. Keep the terminal open while you use the app. Press `Ctrl+C` there to stop the server.

The command uses the enclosing Git repository as its initial root. If the current directory is not in a Git repository, it uses that directory. You can pass a path to choose another root:

```bash
uvx srcly .
uvx srcly ../another-project
uvx srcly /path/to/repository
```

The packaged Srcly release requires Python 3.13 or newer. The Python files you analyze do not need to use that Python version.

## Run your first scan

When the app opens, enter or paste a path in the path bar, or keep the suggested path. Click **Analyze**. Srcly reads source files under that path and shows scan progress. The first scan can take longer than later visits; unchanged results are cached on your computer.

Start in the treemap. Each rectangle represents a folder, file, function, or code fragment. Area represents lines of code. Choose a color metric from the view controls, then select a folder or file to inspect it. The explorer and Hot Spots list provide sortable and ranked views of the same analysis.

Use the code viewer to inspect the source behind a metric or finding. Srcly's measurements help you choose where to look; they do not prove that code is wrong or unsafe. See [Explore the views](../explore/) and [Understand metrics](../metrics/) for details.

## Generate a report

For a terminal workflow, create a report without opening the browser:

```bash
uvx srcly report . --out .srcly
```

This writes a Markdown summary and JSON artifacts under `.srcly/`. Review `report.md` first. The report includes measurement coverage and names unavailable results where applicable. See [Reports for agents and CI](../reports/) for output details.

## What Srcly analyzes

Srcly uses Lizard for broad source metrics and adds tree-sitter analysis for TypeScript and TSX, CSS and SCSS, Markdown, notebooks, and Python. The metrics differ by language and file type. A metric that does not apply or could not be measured is shown as N/A, not zero.

The optional data-flow views require Node.js 18 or newer. Without Node.js, the treemap, metrics, and other scan features remain available. Read [Data-flow analysis](../data-flow/) for its language scope and limits.

## Next steps

- [Explore the views](../explore/)
- [Read findings and coverage](../findings/)
- [Use the headless CLI](../cli/)
- [Configure entries and rules](../configuration/)
