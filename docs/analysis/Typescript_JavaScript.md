# TypeScript & JavaScript Analysis

## Overview

The analysis engine uses [tree-sitter](https://tree-sitter.github.io/tree-sitter/) to perform deep static analysis of TypeScript (`.ts`, `.tsx`) and JavaScript files. It goes beyond simple line counting to understand the semantic structure of the code, including function definitions, class hierarchies, and React component structures.

## Static Analysis

### Scope Detection

The analyzer builds a hierarchy of "scopes" to visualize code structure in the treemap. Supported scopes include:

- **Functions**: Declarations, expressions, arrow functions, and methods.
- **Classes & Interfaces**: Full support for object-oriented constructs.
- **Types**: Type aliases and interface definitions.
- **Object Literals**: Groups properties and methods within objects.
- **JSX/TSX**:
  - **Components**: Functional components are detected and named.
  - **Elements**: JSX elements that define inline functions or have complex logic are treated as scopes.
  - **Fragments**: Virtual `<fragment>` roots are created to group TSX structures within a function.

### Metrics Computed

Field-specific metrics are calculated and attached to the file and function nodes:

| Metric                    | Description                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- |
| **LOC**                   | Physical Lines of Code (non-empty).                                          |
| **Cyclomatic Complexity** | Calculated using control flow keywords (`if`, `for`, `while`, `catch`, `&&`, |
| **Max Nesting Depth**     | The deepest level of nested control flow structures.                         |
| **Comment Lines**         | Total lines of comments (including block comments).                          |
| **TODO Count**            | Occurrences of `TODO` or `FIXME` in comments.                                |
| **Parameter Count**       | Number of arguments in function definitions.                                 |

### TypeScript-Specific Metrics

- **Type/Interface Count**: Number of type definitions.
- **Any Usage**: Counts of explicit `any` types.
- **Ignore Count**: Counts of `@ts-ignore` and `@ts-expect-error` directives.
- **Import Coupling**: Number of unique external modules imported.
- **Export Count**: Number of exported symbols (named and default).

### React/TSX Metrics

- **Prop Count**: Number of props passed to JSX elements.
- **UseEffect Count**: Number of `useEffect` hooks used.
- **Anonymous Handlers**: Inline arrow functions used in event handlers (e.g., `onClick={() => ...}`).
- **Render Branching**: Ternary or logical operators used within JSX expressions.
- **Hardcoded Strings**: Volume of raw string literals inside JSX.

## Dataflow Analysis

A specialized `DataFlowAnalyzer` builds a graph of variable definitions and usages to support advanced visualization (e.g., flow charts).

- **Scope Resolution**: Tracks variables across Global, Module, Function, and Block scopes.
- **Variable Defs**: Identifies `var`, `let`, `const`, parameters, classes, and imports.
- **Usages**: Links identifier usages back to their definitions.
- **JSX Attributes**: Tracks which attributes (like `onClick`) capture which variables.
- **Declaration Clustering**: visually groups variable definitions with their immediate usage on the same line (e.g. `const [val, setVal] = useState(0)`).

## Dependency Analysis

The analyzer extracts import and export statements to understand module coupling:

- **Imports**: Resolves source paths and imported symbols (named or default). Ignores `import type` to focus on runtime dependencies.
- **Exports**: Identifies named exports (`export const x = ...`) and default exports.

## Optimization & Extensibility

### Single-Pass Analysis

The analysis engine uses a **single-pass visitor pattern** to maximize performance. Instead of traversing the AST multiple times for different metrics (which becomes exponentially slower with large files), the `_scan_tree` method visits each node exactly once.

During this single traversal, it:

1. Updates file-level metrics (e.g., classes, exports, imports).
2. Maintains a stack of `active_scopes` to attribute code to the correct function/container.
3. Calculates complexity, nesting, and TSX-specific metrics for the current scope.
4. Detects new scopes (functions, interfaces, etc.) and pushes them onto the stack.

### How to Add a New Metric

To add a new metric, you must integrate it into the single-pass traversal. Do **not** create a new recursive method.

1. **Define the Metric**: Add the field to `FunctionMetrics` or `FileMetrics` in `app/services/analysis_types.py`.
2. **Initialize**:
    - For file-level metrics: Initialize the counter in `TreeSitterAnalyzer.analyze_file` (e.g. `self._file_new_metric = 0`).
    - For scope-level metrics: Initialize in `_create_scope_metrics`.
3. **Implement Logic in `_scan_tree`**:
    - Locate the `node_type` check relevant to your metric.
    - Update the file-level counter or `active_scopes[-1]['metrics'].new_metric`.
4. **Expose**: Update the return value in `analyze_file` to include your new file-level metric.
