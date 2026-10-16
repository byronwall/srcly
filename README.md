# Srcly

Srcly is an interactive codebase treemap and metrics viewer. It combines [Lizard](https://github.com/terryyin/lizard) with tree-sitter analyzers for richer language-specific signals, builds a hierarchical model of folders, files, functions, and nested scopes, and renders explorable views in your browser.

Project background and screenshots: [Srcly project page](https://byroni.us/projects/srcly).

To try it in your current folder, run:

```
uvx srcly
```

## Screenshot

![Srcly UI](./docs/00-main.png)

## Run it with `uvx srcly`

The easiest way to use Srcly is via [`uvx`](https://docs.astral.sh/uv/guides/tools/), no global install required.

```bash
uvx srcly           # analyze the current directory
uvx srcly ..        # analyze the parent directory
uvx srcly /path/to/repo
```

This will:

- start a FastAPI server backed by the Srcly analysis engine
- open your browser to the bundled single-page app
- default the analysis root to the directory you passed (or the current working directory)

Once the UI opens:

1. Type or paste a path into the path bar at the top, or leave it empty to analyze the directory you started `srcly` from.
2. Click **Analyze**.
3. Explore the treemap and click into files and functions to understand where complexity and LOC live in your codebase.

## Headless reports for agents

Srcly can also run without opening the UI and emit agent-ready artifacts:

```bash
uvx srcly report . --out .srcly
uvx srcly scan . --out .srcly/tree.json
uvx srcly hotspots . --metric complexity --limit 25
uvx srcly explain . --file client/src/App.tsx
```

By default, `uvx srcly report` writes compact artifacts intended to be safe for agents to inspect:

- `report.md` — human-readable summary, the top files and functions by one metric (`--metric`, default the profile's lead metric, e.g. `complexity`), the profile's findings queue, and a compact tree breakdown.
- `findings.json` — machine-readable code-quality findings with metric evidence and agent prompts.
- `tree.summary.json` — compressed tree for quick agent context.
- `hotspots.json` — ranked metric hotspots.
- `metrics.schema.json` — metric definitions and interpretation hints.
- `agent-skill.md` — reusable guidance for agents consuming the report.

Add `--quadrant <preset>` (`activity`, `blast_radius`, `component_weight`, `comment_noise`, `findings`) to place every file, function or component in a named 2x2: `report.md` gains a section listing each quadrant's members, worst first, and `quadrants.json` holds the full lists. `--quadrant-cohort` picks the point type. The same presets drive the UI's **2x2** view next to the treemap, where the cut-offs can be dragged.

```bash
uvx srcly report . --out .srcly --quadrant activity
```

**Findings** (`finding_count`, `error_count`) come from lint and type checkers, with no setup. If the project has `node_modules/.bin/tsc` and a tsconfig, srcly runs `tsc --noEmit` per project, and it runs `eslint` when the project has eslint and a config. Python files always get `ruff`, which ships with srcly. It uses the project's ruff config when there is one, otherwise a small set of bug-finding rules labelled "srcly defaults". TS files with no project tool get srcly's own rules: explicit `any`, `@ts-ignore` without a reason, `@ts-nocheck`, and chains of non-null assertions. Each tool runs in the background with a timeout. A tool that is missing, fails or times out leaves its files N/A with the reason, never 0. The code viewer lists each finding with its rule and the tool that reported it.

`report` is quiet by default and prints only a compact artifact summary. Add `--verbose` when you want per-file scan progress on stderr:

```bash
uvx srcly report . --out .srcly --verbose
```

Use `uvx srcly scan . --out .srcly/tree.json` or `uvx srcly report . --include-tree` when you need the full raw tree. Use `--include-dependencies` to add the TypeScript/TSX dependency graph artifact.

## What Srcly shows you

- **Treemap of your codebase**
  - Each rectangle is a piece of your code: folders contain files, files contain functions and glue code.
  - Rectangle **area** ≈ lines of code (LOC) for that node.
  - Rectangle **color** is selectable from the hotspot metrics, such as complexity, LOC, comment noise, nesting depth, React/Solid component metrics, TS metrics, and Markdown data URLs.
  - Zoom into folders/files/scopes, isolate or exclude paths, filter by file type, and inspect metric legends from the treemap header.
- **Folder/file explorer sidebar**
  - A tree view of your codebase mirrored from the analysis model.
  - Sortable columns for LOC, complexity, file size, file count, ignored files, and supported language-specific metrics.
  - Hot Spots mode ranks files and scopes by one or more selected metrics.
  - Click any entry to focus the corresponding file in the treemap and open its contents.
- **Code viewer with syntax highlighting**
  - Click any file or function tile to open a modal with the underlying source.
  - Uses [Shiki](https://github.com/shikijs/shiki) for fast, dark-theme syntax highlighting.
  - Supports common languages (`.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.html`, `.css`, `.json`, `.md`, shell, etc.).
  - Markdown files render as a preview, and notebooks are converted to virtual text for inspection.
- **Dependency graph**
  - Shows TypeScript/TSX import relationships, including external packages and nearby `tsconfig` path aliases.
- **Path picker and recent folders**
  - Autocomplete-backed path input that talks to the server (`/api/files/suggest`).
  - Maintains a small list of recently analyzed paths in local storage for quick switching.
  - On first load, the UI can offer the server's current working directory and detected Git repository root.

## How the analysis engine works

The backend lives in the `server/app` package and is exposed as a FastAPI app.

- **Repository discovery & traversal**
  - Uses the working directory (or the path you pass to `srcly`) as the scan root.
  - Attempts to locate the repository root by walking up until it finds a `.git` folder.
  - Recursively walks the directory tree, skipping ignored directories like `node_modules`, `dist`, `.git`, and any patterns from `.gitignore`.
- **Static analysis**
  - Uses `lizard` for broad source-file coverage.
  - Uses tree-sitter analyzers for TypeScript/TSX, CSS/SCSS, Markdown, notebooks, and Python-specific enrichment.
  - Extracts function/scope definitions, cyclomatic complexity, LOC, comment noise, nesting, React/Solid components, and language-specific metrics per file and per function where available.
  - Runs files in separate worker processes with per-file hard timeouts so one bad file does not hang the full scan.
- **Structure building**
  - Constructs a hierarchical tree of `Node` objects mirroring your filesystem:
    - **Folders**: nested directory structure.
    - **Files**: each source file is a node.
    - **Functions/scopes**: each detected function or nested scope inside a file becomes a child node.
    - **Body fragments**: leftover lines inside parent scopes are represented separately so treemap area does not double-count nested scopes.
  - Aggregates metrics up the tree so every folder and file has useful rollups.
- **Caching**
  - Saves each finished analysis in your user cache directory, never in the analyzed repo:
    - macOS: `~/Library/Caches/srcly/analysis`
    - Linux: `$XDG_CACHE_HOME/srcly/analysis` (default `~/.cache/srcly/analysis`)
    - Windows: `%LOCALAPPDATA%\srcly\Cache\analysis`
    - Set `SRCLY_CACHE_DIR` to use another location.
  - Entries are keyed by the resolved path and checked against a fingerprint of every file's path, modification time and size (skipping `node_modules`, `.git` and the other ignored directories) plus the Srcly version. Any change triggers a fresh scan; reopening an unchanged repo loads instantly.
  - The 20 most recent repos are kept on disk (gzipped), and the last 2 also in memory. Delete the folder to clear it.
  - `POST /api/analysis/refresh` or `POST /api/scans` with `"force": true` ignores the cache and rescans.

### API surface (used by the UI)

- **Analysis**
  - `GET /api/analysis?path=/path/to/repo` — return the full analysis tree; uses the cached analysis if no files changed, otherwise scans. Concurrent requests for one path share a single scan.
  - `GET /api/analysis/context` — return the current server root and detected repository root with estimated file/folder counts.
  - `GET /api/analysis/dependencies?path=/path/to/repo` — build a TypeScript/TSX dependency graph.
  - `POST /api/analysis/refresh?path=/path/to/repo` — force a rescan (defaults to the current root) and replace the cached analysis.
- **Scan jobs** (what the UI uses, with live progress)
  - `POST /api/scans` with `{"path": "...", "force": false}` — start a scan, join the running one for that path, or return an already-complete job when the cache is fresh (`"cached": true`).
  - `GET /api/scans/{id}/events` — Server-Sent Events stream of progress snapshots; `GET /api/scans/{id}` polls the same snapshot.
  - `GET /api/scans/{id}/result` — the analysis tree once complete; `DELETE /api/scans/{id}` cancels.
- **Files**
  - `GET /api/files/content?path=/absolute/path/to/file` — fetch raw file contents for the code viewer.
  - `GET /api/files/suggest?path=/some/path` — return directory contents to power the path picker.

## Metrics

For every node (folder, file, function, or glue-code fragment), Srcly computes a consistent set of metrics and aggregates them into the analysis tree:

| Metric              | Description                               | Aggregation Logic                                                                              |
| :------------------ | :---------------------------------------- | :--------------------------------------------------------------------------------------------- |
| **LOC**             | Lines of Code (excluding comments/blanks) | **Sum** — folder LOC is the sum of all children                                                |
| **Complexity**      | Cyclomatic complexity (CCN)               | **Exact** for a function<br>**Max** over a file's or folder's functions, naming the function that sets it<br>**Complexity (avg)** is the mean per function |
| **Function Count**  | Number of executable functions            | **Sum**                                                                                        |
| **File Count/Size** | Number of files and bytes on disk          | **Sum**                                                                                        |
| **Comment noise**   | Flags for over-commenting on fixed thresholds: a function over 50% comments (with 10+ code lines), a docblock 8+ lines long and over 1.5× its body, and 3+ line runs of commented-out code | **Sum** of flags; each flag marks its lines in the code viewer |
| **Structure**       | Max nesting depth, average function length, parameter count | **Max**, **average**, or **sum** depending on the metric                         |
| **React/Solid components** | Per component (a capitalized function returning JSX): LOC, hooks, effects, JSX depth, declared props, inline handlers, JSX conditionals | **Max** over a file's or folder's components, naming the component |
| **TS**              | `any` usage, TS ignore directives          | **Sum**                                                                                        |
| **Detail**          | TODOs, comment lines, classes, types/interfaces, exports, imports | **Sum**. Shown for context; never ranked as risk                          |
| **Markdown**        | Markdown data URL count                    | **Sum**                                                                                        |

A metric that doesn't apply to a node (a Python metric on a TS file, component metrics on a file with no components) is N/A, never 0.

These metrics power treemap sizing/coloring, the Hot Spots ranking, explorer sorting, tooltips, and dependency graph coloring.

## Developing locally

If you want to hack on Srcly itself instead of running the packaged tool:

1. **Install server dependencies (with `uv`)**

   ```bash
   cd server
   uv sync
   ```

2. **Install client dependencies**

   ```bash
   cd client
   pnpm install
   pnpm dev       # start the Vite dev server on http://localhost:5173
   ```

3. **Run the API server**

   In another terminal:

   ```bash
   cd server
   uv run uvicorn app.main:app --reload --port 8000
   ```

   The SPA will be served from the Vite dev server in this setup. For a preview closer to the packaged experience, build the client and let FastAPI serve the static assets:

   ```bash
   cd client
   pnpm build

   cd ../server
   uv run uvicorn app.main:app --reload --port 8000
   ```

You can also use the `dev.sh` helper script in the repository root to start both the API server and the client dev server together (it assumes `pnpm` and `uv` are available).

## Releases

Use a Conventional Commit PR title, such as `fix: correct scan progress` or `feat: add a metric`.
Squash merge the PR after its title and build checks pass.

[Release Please](https://github.com/byronwall/srcly/actions/workflows/release-please.yml) maintains a release PR with the version bump and changelog.
Merge that PR when ready to publish. It creates the tag and GitHub release automatically.
The [Release workflow](https://github.com/byronwall/srcly/actions/workflows/release.yml) tests and builds the package, then publishes it to PyPI.

See [release guidance](docs/releases.md) for version rules, credentials, and recovery steps.
