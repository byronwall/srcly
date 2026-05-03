# Precision Light Console Conversion Summary

Date: 2026-05-03
Related audit: `docs/design-audits/2026-05-03-srcly-design-audit.md`

## Purpose

This pass addressed the largest mismatch from the design audit: the app was visually anchored in a dark IDE-style interface while `DESIGN.md` defines Srcly as a compact, data-heavy, light-mode professional console.

The goal was not to finish every screen. The goal was to move the primary product frame and reusable UI primitives onto a light token foundation so later work can proceed from the right baseline.

## What Changed

### Design Tokens And Shared Utilities

Added a Precision Light Console token layer in `client/src/index.css`.

The new token layer includes:

- Core color variables such as `--plc-neutral`, `--plc-surface`, `--plc-border`, `--plc-accent`, and slate text tokens.
- Semantic status variables for success, warning, and error.
- Chart color variables for future visualization cleanup.
- Floating and dialog shadow recipes that match the shallow depth guidance in `DESIGN.md`.
- Shared utility classes such as `plc-app-shell`, `plc-topbar`, `plc-panel`, `plc-toolbar`, `plc-table-header`, `plc-row`, `plc-label-caps`, `plc-body-sm`, `plc-data-md`, and `plc-floating`.

This gives future UI work a concrete implementation surface instead of repeatedly re-entering raw Tailwind colors and arbitrary values.

### App Shell And First-Run States

Updated `client/src/App.tsx` to use the light shell foundation:

- Root app shell moved from dark `#121212` styling to `plc-app-shell`.
- Top bar moved to the white 48px `plc-topbar` treatment.
- The Srcly title and status copy now use design-system text tokens.
- Empty, loading, error, and initial analysis-choice states now render as light console surfaces with bordered panels and compact typography.
- The split-pane drag handle now uses border/accent tokens instead of dark gray/blue literals.

### Shared UI Primitives

Reworked the core primitives so they stop reintroducing the old dark visual language:

- `Button.tsx`
  - Tokenized primary, secondary/default, ghost, chip, tab, success, and danger variants.
  - Added fixed density heights for `xs`, `sm`, and `md`.
  - Added no-wrap behavior to prevent toolbar labels from breaking.

- `TextInput.tsx`
  - Tokenized background, border, text, placeholder, and focus treatment.
  - Added explicit 28px/32px density sizing.

- `IconButton.tsx`
  - Tokenized hover, focus, and text states.

- `PopoverPanel.tsx`
  - Converted popovers to white floating panels with `border-strong` and the shallow menu shadow.
  - Updated option rows and section labels to use light selected/hover states.

- `CheckboxRow.tsx`
  - Tokenized checkbox row text and accent color.

- `DialogShell.tsx`
  - Converted the overlay, dialog surface, border, text, shadow, and header to light design-system values.

- `States.tsx`
  - Converted generic loading, empty, and error states to tokenized light-mode copy.

### Primary Data Surfaces

Updated the most visible loaded-state surfaces:

- `Explorer.tsx`
  - Explorer panel moved from dark IDE sidebar styling to a light bordered panel.
  - Toolbar and segmented Tree/Hot Spots controls moved to tokenized compact styling.
  - Table header moved to `plc-table-header` and `label-caps`.
  - Hot spot metric chips now use the design-system chip treatment.

- `TreeNode.tsx`
  - Rows moved to `plc-row` with 32px density.
  - Metric cells now use `plc-data-md` for monospaced, tabular-style numeric scanning.
  - Row text, hover, hidden state, and inline hide/show affordance were tokenized.

- `HotSpotItem.tsx`
  - Hot spot rows now use the same light row treatment.
  - Rank and metric values use data typography.
  - The isolate action moved to a subtle accent treatment.

### Treemap Chrome

Updated the treemap frame and header:

- `Treemap.tsx`
  - Container moved to a light bordered panel.
  - Folder fills/strokes were changed away from dark IDE colors.
  - Empty-filter state uses tokenized muted text.

- `TreemapHeader.tsx`
  - Header moved to `plc-toolbar`.
  - Breadcrumbs, color selector, legend, and mode buttons were tokenized.
  - Header now allows horizontal overflow instead of wrapping long toolbar labels in narrow panes.

### File Picker

Updated `FilePicker.tsx` so the path picker and recent-path popovers inherit the tokenized primitives rather than overriding them with dark classes.

## Verification

Ran:

```bash
cd client && pnpm build
```

Result: build passed.

Also performed an in-app browser smoke check at:

```text
http://127.0.0.1:5173/
```

Checked:

- First-run/empty state.
- Loading state.
- Loaded repo-root Explorer and Treemap view.

Observed result:

- The app now reads as a light console rather than a dark IDE.
- Explorer rows and metrics are substantially closer to the intended compact data-table model.
- The treemap frame and toolbar now sit within the light console system.

## Intentional Limits Of This Pass

This pass focused on the largest visual/systemic mismatches. It did not attempt to complete every UI surface.

Still intentionally left for follow-up:

- `FileTypeFilter` internal panel details.
- Code modal internals and markdown/code preview styling.
- DataFlow and DependencyGraph overlay styling.
- Flow tooltip and inline code preview dark theme boundaries.
- Treemap and graph color-scale normalization against chart tokens.
- Replacement of text/emoji toolbar controls like `[+]`, `[-]`, and gear with proper icon buttons.
- Lint or CI enforcement to prevent raw color/shadow/radius drift.

## Remaining Design Risks

The largest remaining risk is mixed visual language in secondary/detail surfaces. The top-level shell, primitives, Explorer, and treemap chrome now point in the right direction, but modals, graph overlays, code panes, and filters still include dark UI patterns and raw color literals.

The second major risk is visualization color meaning. Treemap and graph colors are now framed by a light UI, but the underlying palettes still need a dedicated token-aware pass so chart colors, metric scales, and semantic status colors do not conflict.

## Suggested Next Pass

Recommended next sequence:

1. Convert `FileTypeFilter` and the remaining toolbar popovers to the same `PopoverPanel`, `OptionRow`, chip, and form-control patterns.
2. Define a token-aware visualization color module for treemap, hotspot, dependency graph, and data-flow colors.
3. Convert `CodeModal` shell/sidebar/header surfaces while keeping syntax highlighting as a scoped code-theme exception.
4. Replace text/emoji controls with proper icon buttons and consistent accessible labels.
5. Add an enforcement check for disallowed raw dark colors in non-code-theme UI files.

## Files Touched In This Conversion

- `client/src/index.css`
- `client/src/App.tsx`
- `client/src/components/FilePicker.tsx`
- `client/src/components/Explorer.tsx`
- `client/src/components/TreeNode.tsx`
- `client/src/components/HotSpotItem.tsx`
- `client/src/components/Treemap.tsx`
- `client/src/viz/treemap/components/TreemapHeader.tsx`
- `client/src/components/ui/Button.tsx`
- `client/src/components/ui/TextInput.tsx`
- `client/src/components/ui/IconButton.tsx`
- `client/src/components/ui/PopoverPanel.tsx`
- `client/src/components/ui/CheckboxRow.tsx`
- `client/src/components/dialog/DialogShell.tsx`
- `client/src/components/feedback/States.tsx`
