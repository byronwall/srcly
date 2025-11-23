# Srcly

Srcly is an interactive codebase treemap and metrics viewer. It scans your code with [Lizard](https://github.com/terryyin/lizard), builds a hierarchical model of folders, files, and functions, and renders an explorable treemap in your browser.

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

## What Srcly shows you

- **Treemap of your codebase**
  - Each rectangle is a piece of your code: folders contain files, files contain functions and glue code.
  - Rectangle **area** ≈ lines of code (LOC) for that node.
  - Rectangle **color** ≈ cyclomatic complexity (cooler = simpler, warmer = more complex).
- **Folder/file explorer sidebar**
  - A tree view of your codebase mirrored from the analysis model.
  - Quick LOC + complexity indicator for each node.
  - Click any entry to focus the corresponding file in the treemap and open its contents.
- **Code viewer with syntax highlighting**
  - Click any file or function tile to open a modal with the underlying source.
  - Uses [Shiki](https://github.com/shikijs/shiki) for fast, dark-theme syntax highlighting.
  - Supports common languages (`.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.html`, `.css`, `.json`, `.md`, shell, etc.).
- **Path picker and recent folders**
  - Autocomplete-backed path input that talks to the server (`/api/files/suggest`).
  - Maintains a small list of recently analyzed paths in local storage for quick switching.

## How the analysis engine works

The backend lives in the `server/app` package and is exposed as a FastAPI app.

- **Repository discovery & traversal**
  - Uses the working directory (or the path you pass to `srcly`) as the scan root.
  - Attempts to locate the repository root by walking up until it finds a `.git` folder.
  - Recursively walks the directory tree, skipping ignored directories like `node_modules`, `dist`, `.git`, and any patterns from `.gitignore`.
- **Static analysis**
  - Uses `lizard` to analyze each source file, in parallel, via a `ProcessPoolExecutor`.
  - Extracts function definitions, cyclomatic complexity, and LOC per file and per function.
- **Structure building**
  - Constructs a hierarchical tree of `Node` objects mirroring your filesystem:
    - **Folders**: nested directory structure.
    - **Files**: each source file is a node.
    - **Functions**: each function inside a file becomes a child node.
    - **Glue code**: Srcly adds a `(misc/imports)` node for code outside functions (imports, module-level code), computed as `file LOC - sum(function LOCs)`.
  - Aggregates metrics up the tree so every folder and file has useful rollups.
- **Caching**
  - Stores the full tree as `codebase_mri.json` in the analyzed root directory.
  - Subsequent requests reuse the cache until you explicitly refresh.

### API surface (used by the UI)

- **Analysis**
  - `GET /api/analysis?path=/path/to/repo` — return the full analysis tree; uses `codebase_mri.json` if present, otherwise scans.
  - `POST /api/analysis/refresh` — force a rescan of the current root.
- **Files**
  - `GET /api/files/content?path=/absolute/path/to/file` — fetch raw file contents for the code viewer.
  - `GET /api/files/suggest?path=/some/path` — return directory contents to power the path picker.

## Metrics

For every node (folder, file, function, or glue-code fragment), Srcly computes a consistent set of metrics and aggregates them into the `codebase_mri.json` output:

| Metric             | Description                               | Aggregation Logic                                                                              |
| :----------------- | :---------------------------------------- | :--------------------------------------------------------------------------------------------- |
| **LOC**            | Lines of Code (excluding comments/blanks) | **Sum** — folder LOC is the sum of all children                                               |
| **Complexity**     | Cyclomatic Complexity                     | **Max** for folders (shows the worst case)<br>**Average** for files<br>**Exact** for functions |
| **Function Count** | Number of functions detected              | **Sum**                                                                                        |

These metrics are what power both the treemap sizing/coloring and the sidebar summaries.

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
   pnpm install   # or npm install / yarn install
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

## Screenshot

![Srcly UI](./docs/00-main.png)
