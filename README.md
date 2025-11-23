# Srcly

Srcly is a tool for visualizing codebases using treemaps of static analysis results.

## How to Use

1. **Generate the Analysis Data**
   Run the `code-steward.py` script to analyze your codebase. This will generate a `codebase_mri.json` file in your project root.

   ```bash
   pip install lizard
   python3 server/code-steward.py
   ```

2. **Visualize the Results**
   Open `client/code-viz.html` in your web browser.

3. **Load Data**
   Drag and drop the generated `codebase_mri.json` file onto the browser window to visualize your codebase.

## Static Analysis Implementation

The static code analysis is implemented in `server/code-steward.py` and primarily uses the **Lizard** library to parse and analyze source code.

1. **Discovery & Traversal**:

   - Identifies the repository root by looking for a `.git` folder.
   - Recursively walks the directory tree, skipping defined ignore lists (e.g., `node_modules`, `dist`, `.git`) and non-code file extensions.

2. **Analysis**:

   - Uses `lizard.analyze_files` to process valid source files in parallel.
   - Parses each file to extract function definitions and calculate metrics.

3. **Structure Building**:
   - Constructs a hierarchical JSON tree mirroring the file system.
   - **Granularity**: Goes deeper than files. Each file node contains children for:
     - **Functions**: Individual functions defined in the file.
     - **Glue Code**: A virtual node `(misc/imports)` representing code outside of functions (imports, global variables). Calculated as `Total File LOC - Sum(Function LOCs)`.

## Available Metrics

For every node (Folder, File, Function), the following metrics are available in the `codebase_mri.json` output:

| Metric             | Description                               | Aggregation Logic                                                                              |
| :----------------- | :---------------------------------------- | :--------------------------------------------------------------------------------------------- |
| **LOC**            | Lines of Code (excluding comments/blanks) | **Sum** (Folder LOC is the sum of all children)                                                |
| **Complexity**     | Cyclomatic Complexity                     | **Max** for Folders (shows the worst case)<br>**Average** for Files<br>**Exact** for Functions |
| **Function Count** | Number of functions detected              | **Sum**                                                                                        |

## Screenshot

![alt text](./docs/00-main.png)
