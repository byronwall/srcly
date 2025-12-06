# Jupyter Notebook Analysis

## Overview

Jupyter Notebooks (`.ipynb`) are processed by parsing the underlying JSON structure directly.

## Analysis Logic

### Cell-Based Scopes

Each cell in the notebook acts as a function-like scope for visualization purposes.

- **Naming**: `[code] cell 1`, `[markdown] cell 2`, etc.
- **Content**: Both Code and Markdown cells are included.

### Metrics

- **Virtual LOC**: Lines of Code are counted based on the `source` field of the cells.
  - **Output Ignored**: Large outputs (images, logs, tables) stored in the JSON are **excluded** from the LOC count. This ensures the treemap represents the *written code/text*, not the *execution artifacts*.
- **Virtual Content**: The analyzer can reconstruct a "virtual file" consisting only of the source lines, enabling accurate line-referenced previews in the UI.

### Limitations

- No deep AST analysis of the Python code inside cells is currently performed (e.g., function definitions inside a cell are not split further).
