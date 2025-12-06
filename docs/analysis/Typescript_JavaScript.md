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
