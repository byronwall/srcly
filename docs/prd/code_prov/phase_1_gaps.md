# Phase 1 gaps: proposal vs implementation

This document compares the **Phase 1 proposal** in `docs/prd/code_prov/phase_1.md` against what was implemented in commit `14888fcdee459ffb2111795b95790aafdd6af63f` (see `docs/commit_14888fc_flow_overlays.md`).

## What matches the Phase 1 proposal well

### Minimal overlay model exists and is used to decorate Shiki HTML

- **Proposal**: a minimal “Overlay Model” response containing tokens with range + category + tooltip, then a decoration pass to inject spans into Shiki HTML.
- **Implemented**:
  - Backend returns `FocusOverlayResponse { tokens: OverlayToken[] }` from `POST /api/analysis/focus/overlay`.
  - Frontend calls the endpoint in `useHighlightedCode`, then runs `applyFlowDecorations` to inject `.flow` wrappers into the Shiki HTML.

### Hover tooltip + click-to-pin UX is implemented

- **Proposal**: hover shows tooltip; click pins; highlight all occurrences of same symbol within focus; ESC clears pin.
- **Implemented**:
  - `FlowOverlayCode` highlights all `[data-sym="..."]` occurrences within the rendered code container.
  - `FlowTooltip` shows tooltip near cursor, clamps to viewport.
  - Click toggles pin; ESC clears pin (capturing phase to avoid modal close).

### Category palette aligns with proposal’s Phase 1 acceptance criteria

- **Proposal categories** (v1): `importExternal`, `importInternal`, `param`, `local`, `module`, `capture`, `builtin`, `unresolved`.
- **Implemented categories**: the same set (as strings), plus CSS backgrounds for each.

### Indentation reduction mapping is implemented

- **Proposal**: update indentation reducer to return `removedIndentByLine` so columns map correctly after reducing indentation.
- **Implemented**: `reduceCommonIndent` now returns `removedIndentByLine`, and `applyFlowDecorations` subtracts it during wrapping.

## Gaps / missing pieces vs the proposal

### 1) “Crib from existing” reuse is not done (new analyzer instead)

- **Proposal**: reuse existing dependency analyzer + data-flow analyzer machinery (scope stack, destructuring binding logic, tsconfig path resolution) to generate the overlay model.
- **Implemented**: `server/app/services/focus_overlay.py` is a **new** tree-sitter traversal that re-implements:
  - scope tracking
  - definition collection
  - usage collection + resolution
  - a separate tsconfig `paths` resolver

**Why it matters**

- Higher maintenance risk: the overlay analyzer can drift from the “real” analyzer behavior.
- Potential inconsistencies: overlay classification may disagree with other backend endpoints.

### 2) Tooltip detail is more limited than described

- **Proposal examples**: tooltips like “local const”, “captured from outer scope”, “imported from X”, possibly “Declared at path:line”.
- **Implemented**:
  - params: “Parameter”
  - locals/module/capture: include **line number only**, not file path, not declaration kind (`const` vs `let`), not type of binding
  - imports: “Import (internal/external): <source>” (does not include “as written” import statement text)

### 3) Shadowing / borders for shadowed symbols (explicitly deferred in proposal) are still missing

- **Proposal**: “shadowing borders” are deferred to later phases, but called out as a planned affordance.
- **Implemented**: no shadowing detection and no border/outline differences beyond hover/pin.

### 4) Member access highlighting semantics are not implemented

- **Proposal**: member access highlighting based on the object reference (`obj` in `obj.prop`), and deemphasize type-related syntax.
- **Implemented**:
  - The analyzer explicitly skips highlighting `property_identifier`, which avoids highlighting the `.prop` half.
  - There’s no additional semantic treatment (e.g., ensuring `obj` is consistently categorized in member expressions beyond normal resolution).

### 5) Focus boundary visualization improvements are not introduced here

- **Proposal**: suggests visible focus boundary (faint block background for selection lines or gutter bracket).
- **Implemented**: this commit focuses on identifier overlays + tooltip/pin. It relies on pre-existing focus line rendering (e.g., line filtering / non-focus dimming) rather than introducing new boundary UI.

### 6) Cross-file navigation preview for imports is not implemented

- **Proposal**: following an import should open the target in a secondary pane without changing the active focus boundary.
- **Implemented**: imports are classified and tooltipped, but there’s no click-to-preview import target behavior wired to the UI.

### 7) Overlay is line-range based (as proposed), but not selection-byte based

- **Proposal**: suggests line/col contract (recommended) and also earlier mentions byte offsets as an alternative.
- **Implemented**: line/col only (good match to the recommended approach), but there is no byte-offset option for precise mapping if needed later.

## Behavioral/accuracy risks (not necessarily “gaps”, but important deltas)

### 1) “Smallest containing function scope” assumption

The backend determines param/local/capture semantics relative to the **smallest function scope that contains the focus range**.

- Works well if the user’s focus selection is “a function body” or a region fully inside a single function.
- Can be surprising if the focus selection is arbitrary and spans multiple functions/blocks, or if the user selects a region that is not best described by one function scope.

### 2) Builtins are heuristic and incomplete by design

The proposal explicitly allowed heuristics for builtins/unresolved in Phase 1. The implementation hardcodes a small builtin set; anything missing becomes `unresolved`.

### 3) Import classification re-implements tsconfig resolution

The proposal emphasized reusing the dependency analyzer for internal/external classification. The implementation does its own best-effort `paths` matching and file existence checks; behavior may diverge from the dependency endpoint in edge cases.

## Recommended next steps to close the biggest gaps

- **Reuse existing analyzers**:
  - Replace (or incrementally supplement) the new `focus_overlay.py` traversal with existing scope/usage resolution logic from the data-flow analyzer and internal/external import classification from the dependency resolver.
- **Richer tooltip strings**:
  - Include declaration kind (`const`/`let`/`function`/`class`/`param`), and include `path:line` (even if same file).
  - Optionally include import statement snippet “as written” in tooltip.
- **Import preview navigation**:
  - Add click behavior on `.flow-importInternal` tokens to open a preview pane (without altering focus boundary).
- **Shadowing**:
  - Add shadowing detection in overlay model and a “shadowed” visual affordance (border) on the frontend.
