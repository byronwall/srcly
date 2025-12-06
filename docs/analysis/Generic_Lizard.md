# Generic Analysis & Lizard Support

## Overview

For languages without a dedicated `tree-sitter` analyzer (e.g., Python, Java, C++, Go), the system falls back to [Lizard](https://github.com/terryyin/lizard), a language-agnostic Cyclomatic Complexity analyzer.

## Catch-All Analysis

### Supported Languages

Lizard supports a wide variety of languages including:

- Python
- Java
- C/C++
- C#
- JavaScript (fallback if specialized analyzer fails)
- Go
- Rust
- Ruby
- Swift
- PHP

### Metrics

For these languages, metrics are limited to what Lizard provides:

- **NLOC**: Non-Comment Lines of Code.
- **CCN**: Cyclomatic Complexity Number.
- **Token Count**: Number of tokens in the code.
- **Parameter Count**: Number of function parameters.

### Structure

- **File Level**: Aggregate stats for the file.
- **Function Level**: Lizard identifies functions and methods, providing a basic 1-level deep list of functions. Nested functions or classes are often flattened or not fully detected depending on the language support in Lizard.

## Ignore Logic

The analysis engine respects exclusion rules to avoid scanning unrelated files (dependencies, build artifacts, etc.).

### .gitignore Support

- The system parses `.gitignore` files relative to the repository root.
- Supports nested `.gitignore` files in subdirectories.
- Implements standard git-style matching (wildcards, negations).

### Built-in Ignores

The following are automatically ignored via configuration:

- **Directories**: `.git`, `node_modules`, `venv`, `__pycache__`, `.pytest_cache`, `dist`, `build`, `coverage`.
- **Files**: `.DS_Store`, `package-lock.json`, `yarn.lock`.
- **Extensions**: Binary files (images, zips) are skipped for analysis to save performance, though they may appear in file listings.
