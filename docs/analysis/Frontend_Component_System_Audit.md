# Frontend Component System Audit

## Executive Summary

The frontend is a compact SolidJS application with useful feature components, but it does not yet have a real shared component system. Most UI is assembled directly in page and feature files with inline Tailwind class strings, local control markup, and repeated dark-panel styling. The current maturity is early: there is a shared `Popover` and a small `Toast`, and the code modal has been split into subcomponents, but common primitives such as `Button`, `IconButton`, `TextInput`, `Checkbox`, `Panel`, `Toolbar`, `SegmentedControl`, `Dialog`, and `EmptyState` are missing.

The main sources of duplication are toolbar controls, filter popovers, selectable metric chips, panel shells, modal overlays, input styling, checkbox rows, table-like explorer columns, and loading/error/empty states. The highest-risk inconsistencies are manual accessibility behavior in popovers, hidden custom checkboxes, clickable `div` table headers, icon-only controls with mixed labeling, and multiple modal/dialog shells with different close semantics.

The best first refactor is a small shared UI layer focused on primitive controls and surfaces, not a broad design-system rewrite. Start with `Button`, `IconButton`, `TextInput`, `CheckboxRow`, `PanelHeader`, `PopoverPanel`, `Dialog`, `EmptyState`, and `SegmentedControl`; then migrate `Explorer`, `TreemapHeader`, `FileTypeFilter`, `FilePicker`, `CodeModalHeader`, and `DependencyGraph` incrementally.

## UI Surface Area

| Category | Current locations |
|---|---|
| App shell / layout | `client/src/App.tsx`, `client/src/components/Explorer.tsx`, `client/src/components/Treemap.tsx` |
| Navigation / hierarchy | `Explorer`, `TreeNode`, `HotSpotItem`, `CodeModal/StructurePanel`, `CodeModal/StickyBreadcrumb`, `viz/treemap/components/TreemapHeader` |
| Forms / filters | `FilePicker`, `FileTypeFilter`, `Explorer` search and column picker, `TreemapHeader` metric picker, `DependencyGraph` controls, `CodeModalHeader` toggles |
| Buttons / actions | Inline across `App`, `Explorer`, `TreemapHeader`, `FilePicker`, `FileTypeFilter`, `CodeModalHeader`, `DependencyGraph`, `DataFlowViz`, `TreeNode` |
| Tables / data grids | `Explorer` + `TreeNode` implement a custom sortable file table/tree; `DependencyGraph` sidebar implements grouped list navigation |
| Cards / panels | Empty analysis cards in `App`, modal sidebars, dependency graph legend, metric panels, tooltip panels |
| Modals / overlays | `CodeModal`, `DataFlowViz`, `DependencyGraph`, popovers, tooltips, toast |
| Feedback states | App error/loading/empty states, graph loading/error states, file picker loading, code pane loading/error, toast |
| Visualizations | `Treemap`, `DataFlowViz`, `DependencyGraph`, `FlowTooltip`, `TreemapTooltip` |

## Top Findings

### Finding: Inline Button Variants Are Reimplemented Across The App

- **Priority:** P1
- **Area:** Buttons / Actions / Styling
- **Evidence:** Button classes are hand-authored in `App.tsx` for retry/analyze cards, `FilePicker.tsx` for `Recent` and `Analyze`, `Explorer.tsx` for tabs, icon actions, metric chips, column picker controls, `TreemapHeader.tsx` for metric dropdown and graph toggles, `CodeModalHeader.tsx` for `Close`, `Copy`, `Open`, and `DependencyGraph.tsx` for `Fit View` and `Close`.
- **Problem:** Button color, padding, border, focus, active, disabled, and icon-only behavior will drift. Keyboard focus is inconsistent: some buttons define focus rings, most only define hover. Icon controls use text glyphs, emoji, or symbols directly, which makes accessible labeling uneven.
- **Recommendation:** Create shared `Button`, `IconButton`, and `ToggleButton` primitives with a small variant set: `default`, `primary`, `danger`, `success`, `ghost`, `chip`, and `tab`.
- **Suggested abstraction:** `Button(props: { variant?: ButtonVariant; size?: "xs" | "sm" | "md"; active?: boolean; disabled?: boolean; title?: string; children: JSX.Element; onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>; })`.
- **Migration path:** First migrate `CodeModalHeader` actions and `TreemapHeader` view toggles, then `Explorer` toolbar/icon buttons, then small card buttons in `App`.
- **Risk:** Low
- **Estimated effort:** Medium

### Finding: Popover Content And Selectable Lists Are Duplicated

- **Priority:** P1
- **Area:** Popovers / Filters / Forms
- **Evidence:** `Popover` exists, but every caller owns its panel styling and option markup: `Explorer.tsx` column picker, `FilePicker.tsx` suggestions/recent paths, `FileTypeFilter.tsx` filter menu, and `TreemapHeader.tsx` metric picker. Repeated classes include `bg-[#252526] border border-[#333]/[#3e3e42] rounded shadow-xl z-50 p-*` and repeated `text-xs font-bold text-gray-400 mb-2` section headers.
- **Problem:** The app has one positioning primitive but not a popover content primitive. Every menu must re-solve spacing, max height, section headings, option rows, selected states, empty states, and close behavior.
- **Recommendation:** Keep `Popover` for positioning, and add `PopoverPanel`, `PopoverSection`, `OptionRow`, and `CheckboxOptionRow`.
- **Suggested abstraction:** `PopoverPanel(props: { width?: "sm" | "md" | "lg"; children: JSX.Element })`; `OptionRow(props: { selected?: boolean; disabled?: boolean; trailing?: JSX.Element; onSelect: () => void; children: JSX.Element })`.
- **Migration path:** Move `TreemapHeader` metric picker first because it is simple, then `Explorer` column picker, then split `FileTypeFilter` into panel sections.
- **Risk:** Low
- **Estimated effort:** Medium

### Finding: Form Fields Lack Shared Field, Input, And Checkbox Primitives

- **Priority:** P1
- **Area:** Forms / Accessibility
- **Evidence:** Text and number inputs are styled separately in `FilePicker.tsx`, `Explorer.tsx`, `FileTypeFilter.tsx`, `CodeModalHeader.tsx`, and `DependencyGraph.tsx`. Checkbox rows are repeated in `Explorer`, `FileTypeFilter`, `CodeModalHeader`, and `DependencyGraph`. `FileTypeFilter.tsx` hides the native checkbox and renders a custom checkbox box beside it.
- **Problem:** Focus treatment, labels, disabled states, sizes, and screen-reader behavior are inconsistent. The hidden checkbox pattern in `FileTypeFilter` makes the visual checkbox a sibling of the input, so the focus indicator and checked state are easy to desynchronize from the actual control.
- **Recommendation:** Add `TextInput`, `NumberInput`, `SelectInput`, `Checkbox`, `CheckboxRow`, and `Field` primitives. Use native controls visibly or ensure custom controls forward focus and `aria-checked` correctly.
- **Suggested abstraction:** `Field(props: { label?: string; hint?: string; error?: string; children: JSX.Element })`; `CheckboxRow(props: { checked: boolean; disabled?: boolean; label: JSX.Element; onChange: (checked: boolean) => void })`.
- **Migration path:** Convert `CodeModalHeader` and `DependencyGraph` checkboxes first, then `FileTypeFilter`, then the column picker.
- **Risk:** Medium
- **Estimated effort:** Medium

### Finding: Explorer Reimplements A Table/Data Grid Locally

- **Priority:** P1
- **Area:** Tables / Data Display / Navigation
- **Evidence:** `Explorer.tsx` renders a sortable header with repeated column cells, while `TreeNode.tsx` renders matching row cells with duplicated widths (`w-10`, `w-12`, `w-16`), metric formatting, and clickable row/action behavior.
- **Problem:** Adding or changing metrics requires editing column visibility controls, sort headers, row cells, widths, labels, and formatting in separate locations. This creates a high maintenance cost for the metrics pipeline.
- **Recommendation:** Introduce a `ColumnDef` model and small `TreeTable`/`TreeTableHeader`/`TreeTableRow` components, or at minimum a shared metric column definition consumed by `Explorer` and `TreeNode`.
- **Suggested abstraction:** `type MetricColumn = { id: SortField; label: string; title?: string; widthClass: string; getValue: (node: Node) => number | string; format?: (value: unknown) => string; }`.
- **Migration path:** Start by extracting column metadata only. Render the existing header and row from that metadata without changing behavior. Then split row rendering into reusable cells.
- **Risk:** Medium
- **Estimated effort:** Medium

### Finding: Dialog And Overlay Shells Are Inconsistent

- **Priority:** P1
- **Area:** Modals / Feedback / Accessibility
- **Evidence:** `CodeModal.tsx` uses `fixed inset-0 z-50 flex items-center justify-center bg-black/60`; `DataFlowViz.tsx` uses `fixed inset-0 bg-black/80 z-50 ... backdrop-blur-sm`; `DependencyGraph.tsx` uses `absolute inset-0 bg-[#1e1e1e] z-50`; `Toast.tsx` uses another fixed overlay layer. None share a `Dialog` shell.
- **Problem:** Escape handling, focus trapping, scroll locking, backdrop click behavior, `role="dialog"`, `aria-modal`, and header/action layout are not standardized. This is the most likely place for accessibility regressions as more overlays are added.
- **Recommendation:** Create `Dialog`, `FullScreenOverlay`, and `DialogHeader` primitives. Keep visualization-specific canvases local, but standardize the shell.
- **Suggested abstraction:** `Dialog(props: { open: boolean; title?: string; size?: "md" | "lg" | "fullscreen"; onClose: () => void; children: JSX.Element; footer?: JSX.Element })`.
- **Migration path:** Wrap `CodeModal` first, because it already has a clear shell and header. Then adapt `DataFlowViz` and `DependencyGraph`.
- **Risk:** Medium
- **Estimated effort:** Large

### Finding: Panel And Header Styling Is Repeated Without A Layout Layer

- **Priority:** P2
- **Area:** Layout / Panels / Styling
- **Evidence:** Repeated dark surface classes appear in `App.tsx`, `Explorer.tsx`, `TreemapHeader.tsx`, `MetricsSidebar.tsx`, `CodeModalHeader.tsx`, `DependencyGraph.tsx`, `DataFlowViz.tsx`, and tooltip files. Header rows repeatedly use `bg-[#252526]`, `border-b border-[#333]`, compact text, and right-aligned controls.
- **Problem:** The app has a consistent visual language, but it is encoded by copy-pasted utility strings rather than named surfaces. Any future color, border, or density change will be broad and manual.
- **Recommendation:** Add `Panel`, `PanelHeader`, `Toolbar`, `Sidebar`, and `SectionHeading` layout components, plus CSS variables for core colors.
- **Suggested abstraction:** `Panel(props: { variant?: "base" | "raised" | "toolbar"; border?: "all" | "x" | "y" | "none"; children: JSX.Element })`.
- **Migration path:** Introduce design tokens in `index.css` first, then migrate only repeated shell containers while leaving feature content untouched.
- **Risk:** Low
- **Estimated effort:** Medium

### Finding: Empty, Loading, And Error States Are One-Off

- **Priority:** P2
- **Area:** Feedback
- **Evidence:** `App.tsx` has multiple empty/loading/error branches; `Explorer.tsx` has `No hot spots found`; `FileTypeFilter.tsx` has `No file types found`; `FilePicker.tsx` has `Loading...`; `DependencyGraph.tsx` has graph loading/error states; `DataFlowViz.tsx` has loading/no-data states; `InlineCodePreview.tsx` has loading/error/empty states.
- **Problem:** Copy, spacing, severity color, and action placement vary. This weakens user feedback and requires every feature to invent its own state layout.
- **Recommendation:** Add `EmptyState`, `LoadingState`, `ErrorState`, and `InlineAlert`.
- **Suggested abstraction:** `EmptyState(props: { title?: string; message?: string; action?: JSX.Element; compact?: boolean })`; `ErrorState(props: { message: string; action?: JSX.Element; compact?: boolean })`.
- **Migration path:** Convert small inline states first (`Explorer`, `FileTypeFilter`, `FilePicker`), then the larger app-level empty analysis state.
- **Risk:** Low
- **Estimated effort:** Small

### Finding: Visualization Feature Components Mix Shell UI With Domain Logic

- **Priority:** P2
- **Area:** Visualization / Feature Components
- **Evidence:** `DependencyGraph.tsx` is over 2,000 lines and owns graph layout, controls, sidebar, legend, loading/error state, overlay shell, and canvas rendering. `DataFlowViz.tsx` and `ScopeFlowPane.tsx` are also large and combine rendering, interaction, and panel UI.
- **Problem:** The visualization code is where abstraction can easily go wrong. The graph/canvas logic is feature-specific, but the toolbar, sidebar shell, legend, and overlay pieces are reusable and currently buried in large files.
- **Recommendation:** Split only the UI shell pieces out: `VisualizationOverlay`, `VisualizationToolbar`, `GraphSidebar`, `LegendPanel`, and shared form controls. Leave graph layout and SVG/canvas rendering local.
- **Suggested abstraction:** `VisualizationOverlay(props: { title: JSX.Element; actions?: JSX.Element; sidebar?: JSX.Element; children: JSX.Element; onClose: () => void })`.
- **Migration path:** Start with the overlay/header controls in `DependencyGraph`, not the layout engine. Extract sidebar list rendering only after column/filter primitives exist.
- **Risk:** Medium
- **Estimated effort:** Large

### Finding: Existing Components Are Useful But Too Feature-Shaped To Be The Shared Layer

- **Priority:** P2
- **Area:** Architecture
- **Evidence:** `MetricsSection`, `MetricItem`, `StructurePanel`, `SidebarTree`, `HotSpotItem`, `TreemapHeader`, `FileTypeFilter`, and `CodeModalHeader` are named around features and import feature data such as `HOTSPOT_METRICS` or tree nodes.
- **Problem:** These should not become generic UI primitives as-is. Promoting them directly would pull feature concepts into shared UI and create rigid, prop-heavy components.
- **Recommendation:** Keep these as feature components, but extract primitives below them.
- **Suggested abstraction:** Put primitives in `components/ui`, shell/layout pieces in `components/layout`, and feature-specific shared parts under `components/feature` or next to the owning feature.
- **Migration path:** Extract small leaf controls first. Then decide whether `MetricPicker`, `MetricChipList`, and `MetricList` deserve a feature-level shared module.
- **Risk:** Low
- **Estimated effort:** Small

### Finding: Tokens Exist Implicitly, Not As A System

- **Priority:** P2
- **Area:** Styling / Design Tokens
- **Evidence:** Hardcoded colors recur across many files: `#1e1e1e`, `#252526`, `#333`, `#3e3e42`, `#007acc`, plus gray/blue/red Tailwind variants. `index.css` contains markdown and code-view styles, but no app surface tokens.
- **Problem:** The app has a VS Code-like theme, but it is not documented or centralized. This makes styling drift likely and raises the cost of changing density or contrast.
- **Recommendation:** Define CSS custom properties for app surfaces, borders, text, focus, and semantic statuses, then use either Tailwind arbitrary values backed by variables or small semantic utility classes.
- **Suggested abstraction:** `--surface-app`, `--surface-panel`, `--surface-toolbar`, `--border-default`, `--text-muted`, `--accent-primary`, `--danger-surface`.
- **Migration path:** Add variables to `index.css`, then update new shared components to consume them. Do not churn every existing class immediately.
- **Risk:** Low
- **Estimated effort:** Small

## Component Opportunities

| Opportunity | Current pattern | Recommended component | Priority | Effort |
|---|---|---|---|---|
| Repeated button variants | Inline button class strings across headers, toolbars, modals, filters | `Button`, `IconButton`, `ToggleButton` | P1 | Medium |
| Duplicate popover panels | Every `Popover` caller owns panel shell and list rows | `PopoverPanel`, `PopoverSection`, `OptionRow` | P1 | Medium |
| Repeated form fields | Inputs/checklists styled separately in five components | `TextInput`, `NumberInput`, `SelectInput`, `CheckboxRow`, `Field` | P1 | Medium |
| Explorer table columns | Header and row cells manually mirrored | `MetricColumn` definitions, `TreeTableHeader`, `TreeTableRow` | P1 | Medium |
| Multiple modal shells | `CodeModal`, `DataFlowViz`, `DependencyGraph` each own overlay behavior | `Dialog`, `FullScreenOverlay`, `DialogHeader` | P1 | Large |
| Repeated toolbar/header surfaces | Dark compact headers with right-side controls | `Toolbar`, `PanelHeader`, `VisualizationToolbar` | P2 | Medium |
| Feedback state drift | One-off loading, error, and empty markup | `LoadingState`, `ErrorState`, `EmptyState`, `InlineAlert` | P2 | Small |
| Metric picker/chips | Treemap color metric picker and Explorer hot spot chips use similar metric data | `MetricPicker`, `MetricChipList` under feature-level metrics UI | P2 | Medium |
| Tokens and theme | Repeated hardcoded VS Code-like colors | CSS variables + semantic surface classes | P2 | Small |
| Tooltip/panel styling | Flow and treemap tooltip shells are separate | `TooltipSurface` or shared tooltip class | P3 | Small |

## Suggested Component Architecture

```txt
client/src/
  components/
    ui/
      Button.tsx
      IconButton.tsx
      ToggleButton.tsx
      TextInput.tsx
      NumberInput.tsx
      SelectInput.tsx
      Checkbox.tsx
      CheckboxRow.tsx
      Field.tsx
      Popover.tsx
      PopoverPanel.tsx
      Dialog.tsx
      TooltipSurface.tsx
    layout/
      Panel.tsx
      PanelHeader.tsx
      Toolbar.tsx
      Sidebar.tsx
      SectionHeading.tsx
      EmptyState.tsx
      LoadingState.tsx
      ErrorState.tsx
    feedback/
      Toast.tsx
      InlineAlert.tsx
      ConfirmDialog.tsx
    data-display/
      MetricList.tsx
      TreeTable.tsx
      TreeTableHeader.tsx
      TreeTableRow.tsx
    feature/
      metrics/
        MetricChipList.tsx
        MetricPicker.tsx
        metricColumns.ts
      code-modal/
      dependency-graph/
      treemap/
```

Notes:

- `Popover.tsx` can stay as the positioning primitive, but its panel/content styling should move out of each caller.
- `Toast.tsx` can move to `feedback/Toast.tsx` after it grows support for multiple toasts, status icons, and `role="status"` / `role="alert"`.
- Feature components should remain feature-named when they know about code metrics, tree nodes, graph layout, file paths, or API state.

## Component Classification

| Component / area | Classification | Rationale |
|---|---|---|
| `Popover` | Keep, then extend | Useful positioning primitive; missing keyboard/focus behavior and shared panel components. |
| `Toast` | Promote / Replace | Useful start, but should become a feedback primitive with accessibility roles and optional actions. |
| `FilePicker` | Split | Mixes API fetching, recent path persistence, input UI, suggestions menu, and analyze action. |
| `FileTypeFilter` | Split | Good feature component, but popover sections, checkbox rows, option rows, and number input should be shared. |
| `Explorer` | Split | Owns toolbar, segmented control, column picker, search input, sort header, and hot spot chips. Extract UI primitives and column metadata. |
| `TreeNode` | Split | Tree row logic is useful, but metric cells should come from shared column definitions. |
| `HotSpotItem` | Leave local / feature shared | Tied to metric and node behavior; could move under `feature/metrics` with `MetricChipList`. |
| `TreemapHeader` | Split | Breadcrumbs and graph toggles are feature-level; popover/list/button pieces should be primitives. |
| `CodeModalHeader` | Split | Header is feature-level, but action buttons, segmented markdown toggle, checkboxes, and number input should be shared. |
| `MetricsSidebar`, `MetricsSection`, `MetricItem` | Keep / feature shared | Appropriately code-metrics-specific; use shared section heading and metric row styling later. |
| `StructurePanel`, `SidebarTree`, `StickyBreadcrumb` | Keep / feature shared | Specific to code structure navigation; avoid forcing into generic navigation primitives. |
| `DependencyGraph` | Split | Extract overlay, toolbar, sidebar, legend, and form controls; keep graph engine/rendering local. |
| `DataFlowViz` | Split | Extract overlay/header shell only; keep nested flow rendering local. |
| `TreemapTooltip`, `FlowTooltip` | Merge surface styling only | Tooltips have different content, but can share a visual shell. |

## Prioritized Refactor Plan

1. **Create the primitive control layer.** Add `Button`, `IconButton`, `ToggleButton`, `TextInput`, `NumberInput`, `SelectInput`, `CheckboxRow`, `Field`, `PanelHeader`, and `PopoverPanel`. Keep APIs small and composition-first.

2. **Migrate the obvious repeated controls.** Update `CodeModalHeader`, `TreemapHeader`, `Explorer` toolbar, and `FilePicker` actions. This will remove the most repeated button/input classes without touching complex visualization logic.

3. **Extract popover/list building blocks.** Convert `TreemapHeader` metric picker, `Explorer` column picker, and `FileTypeFilter` option rows to `PopoverPanel`, `PopoverSection`, and `OptionRow`.

4. **Centralize Explorer metric columns.** Create `metricColumns.ts` and use it for visible-column picker labels, sort header rendering, row cell rendering, and value formatting.

5. **Standardize overlay shells.** Add `Dialog` / `FullScreenOverlay` and migrate `CodeModal`, then `DataFlowViz`, then `DependencyGraph`.

6. **Add feedback components.** Replace scattered loading/error/empty blocks where they are small and mechanical.

7. **Introduce theme tokens gradually.** Add CSS variables to `index.css` and use them in new shared components. Avoid a repo-wide class rewrite until the primitives are stable.

## What Not To Abstract Yet

- Do not turn `DependencyGraph` layout/rendering into a generic graph component. The graph behavior is domain-specific and tightly coupled to import/export semantics.
- Do not make a mega `FilterPanel` for all filters. `FileTypeFilter`, metric selection, and column visibility look similar but carry different business rules.
- Do not promote `CodeModalHeader` as a shared header. Extract its controls, but keep the code-file behavior local.
- Do not force `StructurePanel`, `StickyBreadcrumb`, or `SidebarTree` into generic navigation primitives until another feature needs the same code-structure semantics.
- Do not abstract visual metric color logic away from `HOTSPOT_METRICS` yet. That shared data source is already the right feature-level boundary.

## Validation Checklist For Refactors

- Keyboard users can tab to every action, trigger, checkbox, menu item, and dialog close control.
- Popovers close on outside click and Escape, and do not trap focus unless they become modal.
- Dialogs use `role="dialog"` and `aria-modal="true"`, restore focus on close, and support Escape.
- Inputs, selects, and checkboxes have labels or accessible names.
- Shared buttons preserve current visual density and do not shift Explorer/Treemap layouts.
- Explorer column values, sorting, and visibility remain aligned after moving to column definitions.
- Metric selectors still drive both Hot Spots and treemap color behavior.

