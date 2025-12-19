# Commit 14888fc — Phase 1 “Flow Overlay” implementation summary

Commit: `14888fcdee459ffb2111795b95790aafdd6af63f`  
Message: **feat: Implement flow overlays in code visualization with new FlowOverlayCode component and backend support for focus overlays**

## Overview

This commit adds an end-to-end **identifier provenance overlay** on top of the existing Shiki-rendered code view:

- **Backend**: a new API endpoint that computes a minimal “overlay model” for a file + focus selection, returning **identifier ranges** with a **category**, **stable-ish symbol id**, and **tooltip text**.
- **Frontend**: a decoration pass that injects `<span class="flow ...">` wrappers into Shiki HTML and a UI layer that provides:
  - **hover → tooltip + highlight all occurrences** of the same symbol in the focus region
  - **click → pin** the current symbol (click again to unpin)
  - **ESC → clear pin** without closing the modal

## Frontend features

### 1) Flow overlay interaction layer (`FlowOverlayCode`)

Added `client/src/components/FlowOverlayCode.tsx`.

It renders the Shiki HTML (via `innerHTML`) and adds interaction via event delegation:

- **Hover behavior**

  - Tracks a `hoveredSym` (`data-sym`) and applies `.flow-hovered` to **all** elements inside the container with the same `data-sym`.
  - Displays tooltip text from `data-tip`.
  - If no `.flow` element is under the pointer, hover highlighting is cleared.

- **Click-to-pin behavior**

  - Clicking a `.flow` element pins its `data-sym`, clears any hover styling, and applies `.flow-pinned` to all occurrences.
  - Clicking the same pinned symbol again toggles it off (unpins).
  - Click handler calls `stopPropagation()` so the modal backdrop doesn’t treat it as an “outside click”.

- **ESC-to-clear**

  - Adds a `window` keydown handler in **capture phase** so `Escape` clears the pin before the CodeModal closes.

- **Tooltip positioning**
  - Tooltip follows the cursor (offset by +12px/+12px).
  - When pinned, the tooltip continues to follow the cursor position but does not change the selected symbol.

### 2) Tooltip component (`FlowTooltip`)

Added `client/src/components/FlowTooltip.tsx`.

- Uses `Portal` so the tooltip is not constrained by the code container.
- Positions via `position: fixed` and clamps into the viewport (uses tooltip element dimensions + `window.innerWidth/innerHeight`).
- Uses `pointer-events: none` to avoid interfering with hover.
- Renders the text verbatim with `white-space: pre-wrap`.

### 3) Decorating Shiki HTML with overlay spans (`applyFlowDecorations`)

Added `client/src/utils/flowDecorations.ts` and tests in `client/src/utils/flowDecorations.test.ts` (Vitest with JSDOM).

**Purpose**: inject wrapper spans inside Shiki output while preserving Shiki’s line structure.

Key behavior:

- Assumes Shiki output contains `span.line` elements per code line.
- Accepts overlay tokens expressed in **file line** + **column range** and maps them to **display slice lines**:
  - `displayLineIndex = fileLine - sliceStartLine + 1` (1-based)
- Adjusts columns when the UI reduces indentation:
  - subtracts `removedIndentByLine[displayLineIndex - 1]` from both `startCol` and `endCol`.
- Walks **text nodes** under each `span.line` and wraps overlaps from **right-to-left** so earlier offsets remain stable while splitting text nodes.

Injected wrapper shape:

- `class="flow flow-${category}"`
- `data-sym="${symbolId}"`
- `data-tip="${tooltip}"`
- `data-cat="${category}"`

### 4) Wiring overlays into the Shiki rendering pipeline (`useHighlightedCode`)

Updated `client/src/hooks/useHighlightedCode.ts`:

- After Shiki renders HTML, if a `target` focus range exists, it calls:
  - `POST /api/analysis/focus/overlay`
  - body:
    - `path`
    - `sliceStartLine`, `sliceEndLine`
    - `focusStartLine`, `focusEndLine`
- On success, it applies `applyFlowDecorations(...)` to inject `.flow` wrappers into the returned Shiki HTML.
- Overlay failures are **non-fatal**: they are swallowed so syntax highlighting still renders.

### 5) Flow styling (subtle backgrounds + hover/pin affordances)

Updated `client/src/index.css` to add:

- Base `.flow` styling (rounded background, tiny inline padding, transition)
- `.flow-hovered` and `.flow-pinned` box-shadow treatments
- Category background colors:
  - `.flow-param`
  - `.flow-local`
  - `.flow-capture`
  - `.flow-module`
  - `.flow-importInternal`
  - `.flow-importExternal`
  - `.flow-builtin`
  - `.flow-unresolved`

### 6) Adoption across code viewers

Updated components to render code via `FlowOverlayCode` instead of raw `innerHTML`:

- `client/src/components/CodeModal/CodePane.tsx`
- `client/src/components/DataFlowViz.tsx`
- `client/src/components/InlineCodePreview.tsx`

### 7) Stale UI prevention (keyed remount)

Updated:

- `client/src/components/CodeModal/CodeModal.tsx`
  - Uses Solid’s keyed `<Show ... keyed>` to remount modal contents when `filePath` changes and avoid a “one-frame flash” of stale highlighted HTML.
- `client/src/components/DataFlowViz.tsx`
  - Uses keyed `<Show ... keyed>` for the sidebar selection, also encouraging clean remount on node switches.

### 8) Indentation metadata for column correctness

Updated `client/src/utils/indentation.ts`:

- `reduceCommonIndent(...)` now returns:
  - `lines`
  - `reduced`
  - `removedIndentByLine` (per output line)
- This supports correct overlay placement when indentation is reduced for display.

### 9) Test tooling

Updated client dependencies:

- Added `jsdom` so `flowDecorations` tests can parse and assert on generated HTML.

## Backend features

### 1) New overlay request/response models

Updated `server/app/models.py` with:

- `FocusOverlayRequest`
  - `path: str`
  - `sliceStartLine: int`
  - `sliceEndLine: int`
  - `focusStartLine: int | None`
  - `focusEndLine: int | None`
- `OverlayToken`
  - `fileLine: int` (1-based)
  - `startCol: int` (0-based)
  - `endCol: int` (exclusive)
  - `category: str`
  - `symbolId: str`
  - `tooltip: str`
- `FocusOverlayResponse`
  - `tokens: List[OverlayToken]`

### 2) New API endpoint: `POST /api/analysis/focus/overlay`

Added in `server/app/routers/analysis.py`:

- **404** if file doesn’t exist
- Returns `{ tokens: [] }` if `focusStartLine`/`focusEndLine` are missing
- Otherwise calls `compute_focus_overlay(...)` and returns its output

### 3) New analysis implementation: `compute_focus_overlay`

Added `server/app/services/focus_overlay.py`.

High-level pipeline:

- Parses the file with **tree-sitter** (`tree_sitter_typescript`), choosing TSX grammar for `.tsx`.
- Walks the AST to build:
  - a minimal **scope stack** (`global`, `function`, `block`)
  - **definitions** for:
    - imports (non-type)
    - function params
    - local variables (incl. destructuring patterns)
    - function/class names (classified as module vs local depending on parent scope)
  - **identifier usages** with best-effort resolution against the scope stack
- Determines the “focus function scope” as the **smallest containing function scope** for the focus line range (falls back to global if none).
- Emits overlay tokens only for identifier usages that are:
  - within the **slice** `[sliceStartLine..sliceEndLine]`
  - and within the **focus** `[focusStartLine..focusEndLine]`

#### Categories emitted

For each identifier usage in-focus:

- **importExternal / importInternal**
  - Tooltip: `Import (external): <source>` / `Import (internal): <source>`
  - Symbol id: `imp:<file_path>:<import_source>:<local_name>`
- **param**
  - Only if the resolved definition is a parameter of the selected containing focus function scope
  - Tooltip: `Parameter`
- **local**
  - Tooltip: `Local declaration (line N)` (or `Declaration (line N)` if scope details are missing)
- **module**
  - Tooltip: `Module scope (line N)` for definitions in global / top scope
- **capture**
  - Tooltip: `Captured from outer scope (line N)` for definitions that live outside the focus function but within its ancestor chain (excluding global)
- **builtin**
  - A small Phase 1 heuristic set (e.g., `console`, `Math`, `Promise`, `fetch`, `window`, etc.)
  - Tooltip: `Builtin/global`
  - Symbol id: `builtin:<name>`
- **unresolved**
  - Tooltip: `Unresolved identifier`
  - Symbol id: `unresolved:<name>`

#### Import classification: internal vs external

The service classifies import sources as internal if:

- The specifier is **relative** (`./` or `../`) and resolves to an existing TS/TSX module file, or
- It matches `tsconfig` `compilerOptions.paths` mappings (supports basic `baseUrl` + `paths`), attempting to resolve to an existing module file.

Notes:

- It includes a JSON-with-comments stripper to parse `tsconfig`-like files.
- It intentionally ignores common asset extensions (css/images/json, etc.) when deciding if a module exists.

### 4) Backend tests

Added `server/tests/test_focus_overlay.py`:

- Validates the presence of key categories (capture/module/importExternal/builtin/unresolved) in a nested function scenario.
- Validates internal import classification for `import { x } from "./b"`.

## What this commit enables end-to-end

- Selecting a focus region in the UI triggers:
  - backend overlay computation → a list of in-focus identifier ranges
  - frontend injection of `.flow` spans into Shiki HTML
  - interactive hover/pin tooltips and occurrence-highlighting
