# Markdown Analysis

## Overview

Markdown files (`.md`, `.markdown`) are analyzed using `tree-sitter-markdown` to treat documents as hierarchical structures rather than flat text.

## Structure Analysis

### Sections as Scopes

The analysis mirrors the document outline:

- **Headings**: Each ATX (`#`) or Setext (underlined) heading starts a new scope.
- **Hierarchy**: `## H2` is nested under `# H1` in the visualization.

### Block Scopes

Special blocks are identified as child nodes:

- **Code Blocks**: Fenced (```` ``` ````) and indented code blocks.
  - Named by language (e.g., ``` `python` ````).
- **Block Quotes**: Treated as distinct scopes, with a preview of the text as the name.

## Data Analysis

### Data URLs

The analyzer scans for `data:` URIs (Base64 encoded images/fonts) embedded in the text.

- **Metric**: `md_data_url_count` tracks the number of embedded assets.
- **Visualization**: Each data URL is created as a tiny 1-line scope so it can be identified and potentially filtered or highlighted in the treemap (as these often inflate file size without adding "code").
