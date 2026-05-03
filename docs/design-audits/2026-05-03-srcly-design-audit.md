# Srcly Design Audit Against DESIGN.md

Date: 2026-05-03
Scope: `DESIGN.md`, `client/src` styling architecture, and `docs/00-main.png`

## 1. Executive Summary

- Risk: The product currently contradicts the design system's light-mode foundation. Impact: the whole app reads as a dark IDE surface instead of a professional light console. Where: `App.tsx`, `Explorer.tsx`, `Treemap.tsx`, global CSS, and `docs/00-main.png`. What is wrong: dark backgrounds, white text, and VS Code-like grays replace the required `neutral`, `surface`, slate text, and border tokens. How to fix: introduce app-level design tokens and migrate shell, panels, explorer, treemap frame, and modal surfaces to the Precision Light Console palette first.
- Risk: Token bypass is systemic. Impact: every future feature can drift further because there is no enforced mapping from `DESIGN.md` tokens to implementation primitives. Where: repeated hardcoded hex values and Tailwind literals across `client/src`. What is wrong: values like `#121212`, `#1e1e1e`, `#333`, `bg-blue-900`, `shadow-xl`, and arbitrary text sizes are used directly. How to fix: add CSS variables or Tailwind theme tokens matching `DESIGN.md`, then make component primitives consume them.
- Risk: Shared primitives encode the wrong visual language. Impact: fixing page-level screens will not hold because buttons, inputs, icon buttons, and popovers keep reintroducing dark surfaces and non-token sizing. Where: `client/src/components/ui/Button.tsx`, `TextInput.tsx`, `IconButton.tsx`, `PopoverPanel.tsx`. What is wrong: variants use dark fills, saturated status backgrounds, loose vertical padding, and generic `rounded`. How to fix: rewrite primitive variants around `button-primary`, `button-secondary`, `button-ghost`, `input`, `popover`, and density tokens.
- Risk: Primary data surfaces do not follow table and scanability rules. Impact: users lose the intended dense, stable comparison model for code metrics. Where: `Explorer.tsx`, `TreeNode.tsx`, `HotSpotItem.tsx`, screenshot right panel. What is wrong: the explorer is visually a dark file tree, not a compact light table with 32px rows, `label-caps` headers, `data-md` numeric cells, and selected/hover tokens. How to fix: treat the explorer as a table-like data panel with explicit row, header, numeric, and selected-state classes.
- Risk: Visualization colors are unmanaged. Impact: metric meaning can change by surface and status colors are used decoratively. Where: `treemap/utils/colors.ts`, `metricsStore.tsx`, `DependencyGraph.tsx`, `DataFlowViz.tsx`. What is wrong: custom D3 scales and Tailwind status colors bypass the chart palette and status-use rules. How to fix: centralize chart colors from `chart-1` through `chart-6`, reserve red/green for semantic status, and document special metric color scales where needed.
- Risk: Depth treatment conflicts with the system. Impact: floating UI and modals feel heavier and more decorative than intended. Where: `PopoverPanel.tsx`, `CodeModal.tsx`, `DataFlowViz.tsx`, `Explorer.tsx`. What is wrong: `shadow-xl`, `shadow-2xl`, `backdrop-blur`, and dark overlays are common. How to fix: use the two recommended shadow recipes only for floating menus and dialogs, and rely on 1px borders for normal panels.

## 2. Design Intent Map

Product personality:

- Professional, compact, clear, quiet, and actionable.
- Optimized for dense dashboards, internal tools, observability surfaces, code/technical workflows, and repeated scanning.
- Light mode is the primary target, with `neutral` page background, white `surface` panels, slate text, restrained blue accent, and border-led hierarchy.

Must-use tokens:

- Colors: `neutral #F8FAFC`, `surface #FFFFFF`, `surface-subtle #F8FAFC`, `surface-muted #F1F5F9`, `border #E2E8F0`, `border-strong #CBD5E1`, `accent #2563EB`, `on-surface #0F172A`, muted slate text, semantic status token triplets, and chart tokens.
- Typography: Inter for UI, IBM Plex Mono for data/code; `body-sm` for dense tables, `label-caps` for table headers, `data-md` for numeric and technical cells.
- Layout: 16px page margins, 12px gutters and panel padding, 8px/4px dense inner spacing, 48px topbar, 40px toolbar rows, 32px default rows and controls.
- Shapes: `rounded.md` for buttons/inputs, `rounded.lg` for panels/popovers/tables, `rounded.sm` for badges, `rounded.full` only for chips/pills.
- Depth: borders and tonal surfaces before shadows; shallow shadows only for floating UI.

Must-avoid patterns:

- Dark-mode default screens.
- Decorative color, saturated status fills, deep shadows, large rounded cards, and visual novelty over scan speed.
- Multiple competing primary actions in one region.
- Truncating operational values without reveal or copy affordances.
- Repeated raw values that bypass the design system.

Component rules:

- Topbar must be 48px, white, bordered.
- Panels and cards use white background, 1px border, `rounded.lg`, 12px padding.
- Buttons are 32px by default, 28px compact, with one primary action per region.
- Inputs/selects are 32px, white, bordered, with blue focus.
- Tables use 32px headers and rows, sticky headers for long datasets, label caps headers, body/data typography, hover and selected tokens.
- Popovers use white overlay, `border-strong`, `rounded.lg`, 8px padding, and subtle shadow.

Ambiguities or conflicts:

- `DESIGN.md` is internally consistent, but the product includes treemap/code visualization surfaces that may need explicit token extensions for code highlighting, treemap folder fills, focus overlays, and graph node palettes. Those extensions should still inherit the light foundation and chart/status rules.

## 3. Highest Priority Findings

#### Finding 1: App shell is dark-mode, while the design system is explicitly light-mode

- **Priority:** P0
- **Classification:** systemic
- **Confidence:** High
- **Where:** `client/src/App.tsx`, `client/src/index.css`, `docs/00-main.png`
- **What is wrong:** `DESIGN.md` requires a light `neutral` app canvas, white topbar/surfaces, dark slate text, and border-led hierarchy. The implementation sets the root app to `bg-[#121212] text-white`, the topbar to `bg-[#1e1e1e]`, and the body to `bg-gray-900 text-white`.
- **Why it matters:** This is the highest-level personality mismatch. It changes perceived product category from compact enterprise console to dark developer IDE, and every nested component inherits the wrong contrast, tone, and color assumptions.
- **Evidence:**
  - `DESIGN.md` defines the app shell background as `{colors.neutral}` and topbar background as `{colors.surface}`.
  - `client/src/App.tsx:271` uses `bg-[#121212] text-white`.
  - `client/src/App.tsx:272` uses `border-[#333]` and `bg-[#1e1e1e]`.
  - `client/src/index.css:18` applies `bg-gray-900 text-white` to `body`.
  - `docs/00-main.png` shows a dark explorer/sidebar and dark treemap frame.
- **Minimal fix:** Add root CSS variables for the `DESIGN.md` color tokens and change `body`, the app shell, topbar, main split panes, and primary panels to the light tokens before touching lower-priority component polish.
- **Hardening fix:** Add a stylelint or ESLint rule that blocks raw dark hex values and non-token gray/blue utility classes in product UI files, with an escape hatch for code syntax themes.
- **Suggested owner:** design-system

#### Finding 2: Hardcoded visual values bypass the design system across the client

- **Priority:** P0
- **Classification:** systemic
- **Confidence:** High
- **Where:** `client/src/App.tsx`, `Explorer.tsx`, `Button.tsx`, `TextInput.tsx`, `PopoverPanel.tsx`, `TreemapHeader.tsx`, `DependencyGraph.tsx`, `DataFlowViz.tsx`, `index.css`
- **What is wrong:** The implementation repeatedly uses raw hex, Tailwind palette utilities, arbitrary text sizes, and local D3 color scales instead of named tokens from `DESIGN.md`.
- **Why it matters:** Even after a visual pass, new components will keep drifting because there is no normative implementation layer. Maintenance cost stays high and audits will repeatedly find the same issues.
- **Evidence:**
  - `rg` found many raw color literals in `client/src`, including `#121212`, `#1e1e1e`, `#252526`, `#333`, `#3e3e42`, `#007acc`, and D3 scale colors.
  - `client/src/components/ui/Button.tsx:33-54` hardcodes every variant color.
  - `client/src/components/ui/TextInput.tsx:18` hardcodes input border, background, text, placeholder, and focus colors.
  - `client/src/viz/treemap/utils/colors.ts:8-30` defines color scales outside the chart token palette.
- **Minimal fix:** Create `client/src/styles/tokens.css` or a Tailwind theme layer from `DESIGN.md` frontmatter and migrate shared primitives first.
- **Hardening fix:** Generate implementation tokens from `DESIGN.md` frontmatter and add CI checks for banned raw color/radius/shadow values outside approved visualization or syntax-highlight files.
- **Suggested owner:** infra/tooling

#### Finding 3: Shared UI primitives encode dark IDE variants instead of Precision Console components

- **Priority:** P1
- **Classification:** systemic
- **Confidence:** High
- **Where:** `client/src/components/ui/Button.tsx`, `TextInput.tsx`, `IconButton.tsx`, `PopoverPanel.tsx`
- **What is wrong:** Component primitives should be the enforcement point for `button-primary`, `button-secondary`, `button-ghost`, `input`, and `popover` tokens. Instead they define dark backgrounds, saturated state fills, generic radius, and padding-based sizing.
- **Why it matters:** Page-level migration will be brittle if primitives keep exporting the wrong visual language. This also prevents consistent control heights, focus behavior, and disabled states.
- **Evidence:**
  - `Button.tsx:23` uses `rounded`, `gap-1`, and `focus-visible:ring-blue-500` rather than tokenized `rounded.md`, 32px/28px heights, and `border-focus`.
  - `Button.tsx:35-47` uses red/green filled variants and red selected chips, while `DESIGN.md` says status colors must communicate real operational meaning and chips use subtle fill/border tokens.
  - `TextInput.tsx:12` uses padding and text size but no explicit 28px/32px height.
  - `PopoverPanel.tsx:25` uses dark fill plus `shadow-xl`, while `DESIGN.md` specifies white overlay, `border-strong`, 8px padding, and subtle shadow.
- **Minimal fix:** Replace primitive class maps with token classes and explicit `h-7`/`h-8` density sizes. Keep only variants that match the design document unless a product-specific variant is added intentionally.
- **Hardening fix:** Add Storybook or a local component preview route with visual baselines for Button, TextInput, IconButton, Popover, badges, chips, and table rows.
- **Suggested owner:** design-system

#### Finding 4: Explorer is implemented as a dark file tree, not a compact metrics table

- **Priority:** P1
- **Classification:** systemic
- **Confidence:** High
- **Where:** `client/src/components/Explorer.tsx`, `TreeNode.tsx`, `HotSpotItem.tsx`, `docs/00-main.png`
- **What is wrong:** The explorer is the primary comparison surface, but its visual model is a dark tree/sidebar. `DESIGN.md` positions dense tables as the center of the system with 32px headers/rows, label caps headers, right-aligned data cells, sticky headers, and explicit selected/hover/focus states.
- **Why it matters:** The app's main task is scanning code metrics and hotspots. If the main comparison surface does not behave and read like a data table, users have weaker hierarchy and less predictable metric scanning.
- **Evidence:**
  - `Explorer.tsx:332-334` wraps the panel in `bg-[#1e1e1e] text-white` and a dark toolbar.
  - `Explorer.tsx:489-606` implements a table-like header but with dark colors, `text-xs font-bold`, and no tokenized table header role.
  - `TreeNode.tsx` uses rows with `text-sm py-0.5`, dark hover, and raw gray text classes rather than explicit row density tokens.
  - Screenshot right panel shows large "Explorer" title and a dark tree rather than a light table-like metrics panel.
- **Minimal fix:** Introduce `TableHeader`, `MetricRow`, and `DataCell` classes/components using `table-header`, `table-row`, `table-cell-text`, and `table-cell-data` tokens, then migrate Explorer and HotSpot rows.
- **Hardening fix:** Add a design checklist for new data panes: sticky header, numeric alignment, tabular numeric font, row height token, hover token, selected token, and keyboard focus state.
- **Suggested owner:** product surface owner

#### Finding 5: Depth and floating UI are heavier than allowed by the design system

- **Priority:** P1
- **Classification:** systemic
- **Confidence:** High
- **Where:** `PopoverPanel.tsx`, `Explorer.tsx`, `TreemapHeader.tsx`, `CodeModal.tsx`, `DataFlowViz.tsx`, `Toast.tsx`
- **What is wrong:** `DESIGN.md` says normal hierarchy should come from surfaces, borders, dividers, and subtle contrast, with shallow shadows only for floating UI. The implementation uses `shadow-xl`, `shadow-2xl`, dark overlays, `backdrop-blur`, and rounded modal cards as common layout language.
- **Why it matters:** Heavy depth competes with dense data and makes the app feel more decorative and modal than precise. It also obscures the intended hierarchy of panels versus transient UI.
- **Evidence:**
  - `PopoverPanel.tsx:25` uses `shadow-xl`.
  - `Explorer.tsx:391` and `TreemapHeader.tsx:186` use dark popovers with `shadow-xl`.
  - `CodeModal.tsx:315` uses `shadow-2xl`.
  - `DataFlowViz.tsx:656-657` uses `bg-black/80`, `backdrop-blur-sm`, and `shadow-2xl`.
- **Minimal fix:** Replace normal panel shadows with borders. Keep only the documented floating menu and dialog shadow recipes, expressed as tokens.
- **Hardening fix:** Add shadow tokens and ban raw `shadow-xl`, `shadow-2xl`, `backdrop-blur`, and unreviewed overlay styles in app UI.
- **Suggested owner:** design-system

#### Finding 6: Treemap and graph color semantics are detached from the chart palette

- **Priority:** P1
- **Classification:** systemic
- **Confidence:** Medium
- **Where:** `client/src/viz/treemap/utils/colors.ts`, `Treemap.tsx`, `DependencyGraph.tsx`, `DataFlowViz.tsx`, `metricsStore.tsx`
- **What is wrong:** `DESIGN.md` requires stable chart colors and restrained status color use. The implementation defines multiple independent palettes and uses red/green/purple/yellow as metric ornamentation rather than documented operational status or stable series mapping.
- **Why it matters:** Users learn colors as meaning. If red sometimes means complexity, sometimes TODO count, sometimes destructive/error, and sometimes hover/alt behavior, the product becomes harder to scan and trust.
- **Evidence:**
  - `treemap/utils/colors.ts:8-30` uses custom complexity, comment density, nesting depth, and TODO scales rather than `chart-1` through `chart-6`.
  - `metricsStore.tsx` assigns hotspot text colors like `text-red-400`, `text-purple-400`, `text-yellow-400`, and `text-green-400`.
  - `DependencyGraph.tsx` includes several separate palettes, including saturated `#ff0000`.
- **Minimal fix:** Define `CHART_COLORS` from `DESIGN.md` and remap default treemap, hotspot, and graph series colors to those tokens. Reserve semantic red/green fills for actual error/success states.
- **Hardening fix:** Document approved visualization-specific scales in a single module and require each scale to state whether it is sequential, categorical, or semantic status.
- **Suggested owner:** feature team

#### Finding 7: Typography is visually compact but not token-conformant

- **Priority:** P2
- **Classification:** systemic
- **Confidence:** Medium
- **Where:** `client/src/index.css`, `Explorer.tsx`, `TreeNode.tsx`, `CodeModal/*`, `DataFlowViz.tsx`
- **What is wrong:** The app uses many local Tailwind sizes (`text-lg`, `text-sm`, `text-xs`, `text-[10px]`, `text-[11px]`) and font weights rather than role tokens. Mono usage exists, but data typography is not centralized around IBM Plex Mono or `data-md`/`data-sm`.
- **Why it matters:** The density is directionally right, but uncontrolled typography causes hierarchy drift and makes dense panes harder to normalize. It also makes future light-mode migration harder because text color, size, and role are intermingled in component classes.
- **Evidence:**
  - `App.tsx:274` uses `text-lg font-bold` for the product title, while `DESIGN.md` recommends `headline-lg` or `display-sm` only for landmarks and compact headers.
  - `Explorer.tsx:489` uses `text-xs font-bold` for table headers instead of `label-caps`.
  - `TreeNode.tsx` and `CodeModal` components repeatedly use `text-[10px]` and `text-[11px]`.
  - `index.css:4` defines Inter fallback but does not include the full Inter stack or IBM Plex Mono data font.
- **Minimal fix:** Add typography utility classes for `body-sm`, `label-md`, `label-caps`, `data-md`, `data-sm`, and `caption`, then migrate Explorer, HotSpot, modal metric, and toolbar text.
- **Hardening fix:** Add a typography role table to component docs and discourage arbitrary text sizes except in explicitly approved code/visualization contexts.
- **Suggested owner:** design-system

#### Finding 8: Several controls are built with text glyphs or emoji instead of polished icon controls

- **Priority:** P2
- **Classification:** one-off
- **Confidence:** High
- **Where:** `client/src/components/Explorer.tsx`
- **What is wrong:** Expand/collapse controls use `[+]` and `[-]`, and the columns trigger uses a gear emoji. The design language calls for precise, professional controls and icon-only buttons with accessible labels and visible hover states.
- **Why it matters:** These are visible in a primary toolbar. They make the product feel like a prototype and weaken the otherwise technical professional tone.
- **Evidence:**
  - `Explorer.tsx:360-388` renders `[+]`, `[-]`, and `⚙️`.
  - Buttons have `title` attributes but are not using the shared `IconButton` primitive or consistent sizing tokens.
- **Minimal fix:** Use lucide icons or a shared icon set for expand, collapse, and columns/settings controls, wrapped in tokenized `IconButton`.
- **Hardening fix:** Add a toolbar primitive that standardizes icon-only buttons, labels, 28px/32px sizing, and 4px groups.
- **Suggested owner:** product surface owner

## 4. Systemic Patterns

Pattern name: Dark IDE inheritance

- Symptoms: dark root, dark panels, dark explorer, dark modal surfaces, white text, VS Code-like hex colors.
- Root cause: the app predates or has not adopted the light design system as the source of truth.
- Affected surfaces: app shell, explorer, treemap frame, code modal, file picker, popovers, data flow and dependency graph overlays.
- Recommended system-level fix: migrate the root theme and shared primitives first, then update page surfaces from top-level containers inward.
- How to verify improvement on the next run: `rg '#121212|#1e1e1e|#252526|#333|bg-gray-900|text-white' client/src` should return only approved syntax/code-theme exceptions.

Pattern name: Tokenless component layer

- Symptoms: every primitive maps variants to literals rather than semantic tokens.
- Root cause: `DESIGN.md` frontmatter has not been transformed into CSS variables, Tailwind tokens, or component classes.
- Affected surfaces: all reusable UI primitives and any page that consumes them.
- Recommended system-level fix: create an implementation token layer and make primitives the only source for common control styling.
- How to verify improvement on the next run: Button, TextInput, IconButton, PopoverPanel, badge/chip classes reference token utilities rather than raw colors.

Pattern name: Data UI implemented as file explorer

- Symptoms: tree rows look like a file browser, not a table; metric columns exist but are not styled as table cells.
- Root cause: Explorer blends navigation, tree, and metric table behavior without table-specific primitives.
- Affected surfaces: Explorer tree, hot spots list, file picker menus, sidebar tree in CodeModal.
- Recommended system-level fix: create data-row/table primitives for dense technical values and migrate Explorer/HotSpot first.
- How to verify improvement on the next run: headers use `label-caps`, numeric columns use mono/tabular styles, row height is tokenized, and selected/hover states use light tokens.

Pattern name: Visualization palettes are local inventions

- Symptoms: treemap, graph, flow, and hotspot colors each define their own palette.
- Root cause: chart and semantic colors are not centralized with documented exceptions for code-analysis overlays.
- Affected surfaces: Treemap, DependencyGraph, DataFlowViz, Flow overlays, HotSpot metrics.
- Recommended system-level fix: centralize visualization tokens and force each color scale to declare its meaning.
- How to verify improvement on the next run: D3 scales and metric color metadata import from one visualization color module.

## 5. One-Off Issues Worth Fixing

- Location: `client/src/components/Explorer.tsx:360-388`.
- What is wrong: toolbar controls render `[+]`, `[-]`, and `⚙️`.
- Why it is not systemic: the issue is concentrated in one high-visibility toolbar, even though it reflects broader primitive gaps.
- Why it still matters: it is visible on the main screen and undermines the professional, precise tone.
- Minimal fix: replace with accessible icon buttons using a shared `IconButton` and tokenized hover/focus states.

- Location: `client/src/App.tsx:332-381`.
- What is wrong: initial analysis choices are styled as dark cards with `bg-black/20` and broad `space-y-2`.
- Why it is not systemic: this is an empty/first-run state rather than the main loaded workflow.
- Why it still matters: it is the first impression for new users and contradicts the light, compact shell before any data loads.
- Minimal fix: restyle as light bordered panels or compact action rows using `card` and `button-primary` tokens.

## 6. Token And Component Adoption Review

Tokens used correctly:

- Inter is partially present in `index.css`.
- Some numeric/data values use `font-mono` and right alignment in tree rows.
- Blue focus and primary action concepts appear, but use Tailwind values instead of exact tokens.

Tokens missing or bypassed:

- No implementation layer was found for `DESIGN.md` color, typography, spacing, radius, or component tokens.
- Light shell tokens are bypassed by dark root and panel classes.
- Component tokens for buttons, inputs, popovers, tables, chips, badges, and tooltips are not implemented.
- Chart tokens are bypassed by local D3 scales and hardcoded palettes.

Hardcoded values that should become tokens:

- Dark colors: `#121212`, `#1e1e1e`, `#252526`, `#333`, `#3e3e42`, `#007acc`.
- Shadows: `shadow-xl`, `shadow-2xl`, `shadow-lg`, `backdrop-blur`.
- Control sizes: padding-only classes such as `px-3 py-1`, `px-4 py-2`, `py-1.5` where explicit 28px/32px control heights are required.
- Typography: `text-[10px]`, `text-[11px]`, ad hoc `font-bold`, `uppercase tracking-wide`, and `tracking-widest`.
- Radius: generic `rounded`, `rounded-lg`, `rounded-xl` where component-specific radius tokens should be used.

Component variants that should be centralized:

- Button primary, secondary, ghost, destructive, chip, and tab/segmented variants.
- TextInput/select sizing and focus states.
- IconButton toolbar sizing.
- PopoverPanel and menu option rows.
- Dense table header, row, text cell, data cell, selected row, hover row.
- Badge and chip variants.
- Tooltip and code block styling.

Places where `DESIGN.md` may need additional component tokens:

- Treemap rectangle fill and folder label treatment.
- Code syntax theme and flow overlay colors.
- Dependency graph node/link palette.
- Split-pane resize handle.
- Code modal/drawer sizing and technical detail panes.

## 7. Screenshot Review Notes

What visually matches the design system:

- The screenshot is dense and technical, which fits the target product category.
- The treemap makes code structure immediately visible and supports scan/compare workflows.
- The explorer includes numeric metric columns aligned to the right, which aligns with table guidance in principle.

What visibly conflicts:

- The screen is dark mode, while `DESIGN.md` specifies a light neutral canvas and white surfaces.
- The right Explorer panel feels like an IDE sidebar, not a light analytics/data console.
- The treemap uses saturated blocks and dark folder areas without visible connection to the chart palette.
- The `Explorer` title is visually large relative to the dense panel role.
- The app relies heavily on dark empty space and high contrast rather than light surfaces, borders, and subtle backgrounds.

Which visible issues appear systemic:

- Dark-mode foundation.
- IDE-like explorer/sidebar styling.
- Non-token chart and metric color language.
- Typography role drift.

Which require code inspection to confirm:

- Keyboard focus visibility.
- Exact row/control heights.
- Whether full truncated values are available through tooltips or copy actions.
- Whether color alone is used for status in graph/treemap states.

## 8. Code Review Notes

Files inspected:

- `DESIGN.md`
- `client/src/index.css`
- `client/src/App.tsx`
- `client/src/components/Explorer.tsx`
- `client/src/components/TreeNode.tsx`
- `client/src/components/HotSpotItem.tsx`
- `client/src/components/ui/Button.tsx`
- `client/src/components/ui/TextInput.tsx`
- `client/src/components/ui/IconButton.tsx`
- `client/src/components/ui/PopoverPanel.tsx`
- `client/src/components/Treemap.tsx`
- `client/src/viz/treemap/components/TreemapHeader.tsx`
- `client/src/viz/treemap/components/TreemapTooltip.tsx`
- `client/src/viz/treemap/utils/colors.ts`
- `client/src/components/CodeModal/*`
- `client/src/components/DataFlowViz.tsx`
- `client/src/components/DependencyGraph.tsx`

Styling architecture observations:

- Styling is mostly inline Tailwind class strings with many arbitrary values.
- Shared primitives exist but are thin class wrappers, not design-token enforcers.
- No Tailwind config or token module was found that maps `DESIGN.md` values into implementation.
- Global CSS contains dark markdown and code modal styling that should be separated into syntax/code-specific theming before the app migrates to light mode.

CSS/theme/Tailwind/component primitive concerns:

- Global `color-scheme: light dark` conflicts with a light-mode primary design target unless dark mode is intentionally implemented.
- Body-level dark styling makes any unstyled content wrong by default.
- Primitive variants mix semantic roles and visual colors, especially red/green/blue/purple usage.
- Popovers and modals use heavy shadows and dark surfaces by default.

Repeated implementation patterns:

- `bg-[#1e1e1e]`, `bg-[#252526]`, `border-[#333]`, and `text-gray-*` recur across primary surfaces.
- `text-[10px]`/`text-[11px]` recur for dense labels and metadata.
- `shadow-xl` and dark overlays recur for floating UI.
- Visualization-specific colors are distributed across files.

Suggested refactors:

- Build token CSS variables from `DESIGN.md`.
- Rewrite shared primitives first.
- Add dense data row/table primitives.
- Move visualization color scales into one token-aware module.
- Treat code syntax highlighting as a scoped exception with its own theme boundary.

## 9. Suggested Fix Plan

#### Phase 1: Highest leverage corrections

- Add implementation tokens from `DESIGN.md` and convert `body`, app shell, topbar, main split panes, Explorer panel, Treemap container, and default text colors to the light foundation.
- Rewrite Button, TextInput, IconButton, and PopoverPanel to use component tokens and explicit density heights.
- Restyle Explorer header, rows, and hotspot selector as a compact data panel/table with tokenized rows, headers, cells, hover, selected, and focus states.

#### Phase 2: Component hardening

- Add Badge, Chip, TableHeader, TableRow, DataCell, Panel, Toolbar, and Tooltip primitives.
- Migrate FilePicker, FileTypeFilter, TreemapHeader, CodeModal header/sidebar, and HotSpotItem to the primitives.
- Centralize chart, treemap, graph, and flow-overlay color scales with documented exceptions for code semantics.

#### Phase 3: Regression prevention

- Add lint checks for banned raw colors, shadows, and arbitrary radii in app UI files.
- Add screenshot baselines for the loaded main screen, empty analysis state, Explorer hot spots mode, CodeModal, and a popover/menu.
- Add a PR checklist item requiring new UI to use tokens or explicitly document a visualization/code-theme exception.

## 10. Re-run Checklist

- Re-check screens/pages: loaded main treemap + Explorer, empty analysis state, Hot Spots mode, FileTypeFilter popover, CodeModal, DataFlowViz modal, DependencyGraph overlay.
- Files/components expected to change: `index.css`, token/theme file, `Button.tsx`, `TextInput.tsx`, `IconButton.tsx`, `PopoverPanel.tsx`, `App.tsx`, `Explorer.tsx`, `TreeNode.tsx`, `HotSpotItem.tsx`, treemap color utilities.
- Specific conflicts expected to disappear: dark root shell, dark explorer, raw VS Code hex colors in shared primitives, `shadow-xl` on normal popovers, red selected hotspot chips, emoji toolbar controls.
- Metrics or visible signs of improvement: main screenshot uses light canvas and white bordered panels; topbar is 48px and white; explorer rows read as compact table rows; numeric columns use mono/tabular styling; chart colors come from a central module.
- Remaining known risks: code syntax highlighting and flow overlays need a scoped color model that works on light surfaces without losing code readability.

## 11. Top Issues Table

| Issue | Classification | What is wrong | Recommended fix | Priority |
| ----- | -------------- | ------------- | --------------- | -------- |
| Dark app shell contradicts light system | systemic | Root, topbar, panels, and screenshot are dark IDE-style surfaces | Add tokens and migrate shell/panels to light `neutral`/`surface` foundation | P0 |
| Token bypass across client | systemic | Raw hex, Tailwind palette utilities, arbitrary sizes, and local D3 colors are widespread | Generate or define implementation tokens from `DESIGN.md`; lint raw values | P0 |
| Primitives encode wrong components | systemic | Buttons, inputs, icon buttons, and popovers use dark classes and non-token sizing | Rewrite primitives around component tokens and density heights | P1 |
| Explorer not table-like enough | systemic | Main metric surface reads as file tree/sidebar, not compact data table | Add table/data-row primitives and migrate Explorer/HotSpot rows | P1 |
| Heavy depth language | systemic | `shadow-xl`, `shadow-2xl`, dark overlays, and blur are common | Tokenize shallow menu/dialog shadows and remove normal panel shadows | P1 |
| Visualization palettes are unmanaged | systemic | Treemap/graph/hotspot colors bypass chart palette and semantic rules | Centralize chart and visualization color scales | P1 |
| Typography roles are ad hoc | systemic | Many arbitrary text sizes/weights instead of role tokens | Add typography utilities and migrate dense panels | P2 |
| Text/emoji toolbar controls | one-off | Main Explorer toolbar uses `[+]`, `[-]`, and emoji gear | Replace with accessible icon buttons | P2 |

## 12. Confidence And Gaps

Overall confidence: High for the primary findings. The mismatch between `DESIGN.md` and the current UI is visible in both source and screenshot evidence.

Missing inputs:

- No live browser session was captured during this audit.
- Only one screenshot was reviewed.
- No prior design-audit reports were compared.
- No user-approved intentional dark-mode exception was found.

Assumptions:

- `docs/00-main.png` represents a recent enough main-screen state to use as screenshot evidence.
- `DESIGN.md` is intended to be normative for the current client UI, not a future aspirational system.
- Code visualization surfaces may need extra tokens, but those tokens should extend the light design system rather than replace it.

What would improve the next audit:

- Fresh desktop and narrow-width screenshots after token migration.
- A complete list of intentionally exempt surfaces, if any.
- A token implementation file or Tailwind theme mapping generated from `DESIGN.md`.
- Visual regression screenshots for primary states and popovers.
