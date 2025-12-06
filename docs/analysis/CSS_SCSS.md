# CSS & SCSS Analysis

## Overview

Style sheets are analyzed using `tree-sitter-css` and `tree-sitter-scss` to provide structural insights into styling logic.

## Static Analysis

### Scope Detection

The analyzer treats rule blocks and control structures as "scopes" to visualize nesting in the treemap.

- **Standard CSS**:
  - **Rule Sets**: Selectors and their declarations (e.g., `.container { ... }`).
  - **At-Rules**: `@media`, `@supports`, `@keyframes`, etc.
  
- **SCSS Specifics**:
  - **Nested Rules**: Nested selectors are treated as child scopes.
  - **Mixins**: `@mixin` definitions.
  - **Functions**: `@function` definitions.
  - **Control Flow**: `@if`, `@for`, `@each`, `@while` blocks.

### Naming Heuristics

Scopes are named based on their content:

1. **Selectors**: The first line (up to the `{`) is used as the name (e.g., `.header .nav`).
2. **At-Rules**: The full declaration (e.g., `@media (min-width: 768px)`).
3. **Truncation**: Long selectors are truncated to 80 characters for readability.

### Metrics

- **LOC**: Standard non-empty line count.
- **Complexity**: Currently defaults to 0 (CSS complexity is essentially structural nesting).
- **Scope Size**: LOC count for each individual rule block.
