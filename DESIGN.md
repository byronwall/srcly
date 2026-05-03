---

version: alpha
name: Precision Light Console
description: A compact, data-heavy light-mode design system for professional dashboards, internal tools, admin consoles, observability surfaces, analytics products, and workflow-heavy enterprise applications.
colors:
primary: "#0F172A"
primary-hover: "#1E293B"
primary-active: "#020617"
accent: "#2563EB"
accent-hover: "#1D4ED8"
accent-subtle: "#EFF6FF"
accent-border: "#BFDBFE"
secondary: "#475569"
tertiary: "#64748B"
neutral: "#F8FAFC"
surface: "#FFFFFF"
surface-subtle: "#F8FAFC"
surface-muted: "#F1F5F9"
surface-hover: "#F8FAFC"
surface-selected: "#EAF2FF"
surface-inset: "#F6F8FB"
surface-overlay: "#FFFFFF"
border: "#E2E8F0"
border-strong: "#CBD5E1"
border-focus: "#2563EB"
divider: "#EEF2F7"
on-surface: "#0F172A"
on-surface-muted: "#475569"
on-surface-subtle: "#64748B"
on-surface-disabled: "#94A3B8"
on-accent: "#FFFFFF"
success: "#15803D"
success-subtle: "#ECFDF3"
success-border: "#BBF7D0"
warning: "#B45309"
warning-subtle: "#FFFBEB"
warning-border: "#FDE68A"
error: "#B91C1C"
error-subtle: "#FEF2F2"
error-border: "#FECACA"
info: "#0369A1"
info-subtle: "#F0F9FF"
info-border: "#BAE6FD"
chart-1: "#2563EB"
chart-2: "#0891B2"
chart-3: "#16A34A"
chart-4: "#CA8A04"
chart-5: "#DC2626"
chart-6: "#7C3AED"
chart-grid: "#E5EAF1"
chart-axis: "#64748B"
code-bg: "#F6F8FA"
code-text: "#0F172A"
typography:
display-sm:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 24px
fontWeight: 650
lineHeight: 1.2
letterSpacing: -0.02em
headline-lg:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 20px
fontWeight: 650
lineHeight: 1.25
letterSpacing: -0.015em
headline-md:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 17px
fontWeight: 650
lineHeight: 1.3
letterSpacing: -0.01em
headline-sm:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 15px
fontWeight: 650
lineHeight: 1.35
letterSpacing: -0.005em
body-lg:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 15px
fontWeight: 400
lineHeight: 1.5
letterSpacing: -0.005em
body-md:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 14px
fontWeight: 400
lineHeight: 1.45
letterSpacing: 0em
body-sm:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 13px
fontWeight: 400
lineHeight: 1.4
letterSpacing: 0em
label-lg:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 13px
fontWeight: 600
lineHeight: 1.25
letterSpacing: 0.005em
label-md:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 12px
fontWeight: 600
lineHeight: 1.2
letterSpacing: 0.01em
label-sm:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 11px
fontWeight: 600
lineHeight: 1.15
letterSpacing: 0.015em
label-caps:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 11px
fontWeight: 650
lineHeight: 1
letterSpacing: 0.08em
data-lg:
fontFamily: IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace
fontSize: 14px
fontWeight: 500
lineHeight: 1.35
letterSpacing: -0.015em
fontFeature: "tnum 1, zero 1"
data-md:
fontFamily: IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace
fontSize: 12px
fontWeight: 500
lineHeight: 1.3
letterSpacing: -0.01em
fontFeature: "tnum 1, zero 1"
data-sm:
fontFamily: IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace
fontSize: 11px
fontWeight: 500
lineHeight: 1.25
letterSpacing: -0.005em
fontFeature: "tnum 1, zero 1"
caption:
fontFamily: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
fontSize: 11px
fontWeight: 400
lineHeight: 1.3
letterSpacing: 0.01em
rounded:
none: 0px
xs: 2px
sm: 4px
md: 6px
lg: 8px
xl: 12px
full: 9999px
spacing:
px: 1px
xxs: 2px
xs: 4px
sm: 6px
md: 8px
lg: 12px
xl: 16px
2xl: 20px
3xl: 24px
4xl: 32px
5xl: 40px
density-row-xs: 28px
density-row-sm: 32px
density-row-md: 36px
density-control-sm: 28px
density-control-md: 32px
density-toolbar: 40px
density-panel-padding: 12px
density-card-padding: 12px
grid-gutter: 12px
page-margin: 16px
page-max-width: 1600px
components:
app-shell:
backgroundColor: "{colors.neutral}"
textColor: "{colors.on-surface}"
typography: "{typography.body-md}"
topbar:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border}"
height: "48px"
padding: "0 12px"
sidebar:
backgroundColor: "{colors.surface-subtle}"
textColor: "{colors.on-surface-muted}"
borderColor: "{colors.border}"
width: "248px"
padding: "8px"
sidebar-compact:
backgroundColor: "{colors.surface-subtle}"
textColor: "{colors.on-surface-muted}"
borderColor: "{colors.border}"
width: "56px"
padding: "6px"
panel:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border}"
rounded: "{rounded.lg}"
padding: "{spacing.density-panel-padding}"
card:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border}"
rounded: "{rounded.lg}"
padding: "{spacing.density-card-padding}"
card-hover:
backgroundColor: "{colors.surface-hover}"
borderColor: "{colors.border-strong}"
button-primary:
backgroundColor: "{colors.accent}"
textColor: "{colors.on-accent}"
typography: "{typography.label-md}"
rounded: "{rounded.md}"
height: "{spacing.density-control-md}"
padding: "0 10px"
button-primary-hover:
backgroundColor: "{colors.accent-hover}"
button-secondary:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border-strong}"
typography: "{typography.label-md}"
rounded: "{rounded.md}"
height: "{spacing.density-control-md}"
padding: "0 10px"
button-secondary-hover:
backgroundColor: "{colors.surface-hover}"
borderColor: "{colors.secondary}"
button-ghost:
backgroundColor: "#FFFFFF00"
textColor: "{colors.on-surface-muted}"
typography: "{typography.label-md}"
rounded: "{rounded.md}"
height: "{spacing.density-control-md}"
padding: "0 8px"
input:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border-strong}"
typography: "{typography.body-sm}"
rounded: "{rounded.md}"
height: "{spacing.density-control-md}"
padding: "0 8px"
input-focus:
borderColor: "{colors.border-focus}"
backgroundColor: "{colors.surface}"
select:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border-strong}"
typography: "{typography.body-sm}"
rounded: "{rounded.md}"
height: "{spacing.density-control-md}"
padding: "0 28px 0 8px"
chip:
backgroundColor: "{colors.surface-muted}"
textColor: "{colors.on-surface-muted}"
borderColor: "{colors.border}"
typography: "{typography.label-sm}"
rounded: "{rounded.full}"
height: "24px"
padding: "0 8px"
chip-selected:
backgroundColor: "{colors.accent-subtle}"
textColor: "{colors.accent}"
borderColor: "{colors.accent-border}"
table:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border}"
typography: "{typography.body-sm}"
rounded: "{rounded.lg}"
table-header:
backgroundColor: "{colors.surface-subtle}"
textColor: "{colors.on-surface-muted}"
borderColor: "{colors.border}"
typography: "{typography.label-caps}"
height: "32px"
table-row:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.divider}"
height: "{spacing.density-row-sm}"
table-row-hover:
backgroundColor: "{colors.surface-hover}"
table-row-selected:
backgroundColor: "{colors.surface-selected}"
table-cell-data:
textColor: "{colors.on-surface}"
typography: "{typography.data-md}"
padding: "0 8px"
table-cell-text:
textColor: "{colors.on-surface}"
typography: "{typography.body-sm}"
padding: "0 8px"
metric-card:
backgroundColor: "{colors.surface}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border}"
rounded: "{rounded.lg}"
padding: "10px 12px"
badge-neutral:
backgroundColor: "{colors.surface-muted}"
textColor: "{colors.on-surface-muted}"
borderColor: "{colors.border}"
typography: "{typography.label-sm}"
rounded: "{rounded.sm}"
height: "20px"
padding: "0 6px"
badge-success:
backgroundColor: "{colors.success-subtle}"
textColor: "{colors.success}"
borderColor: "{colors.success-border}"
typography: "{typography.label-sm}"
rounded: "{rounded.sm}"
height: "20px"
padding: "0 6px"
badge-warning:
backgroundColor: "{colors.warning-subtle}"
textColor: "{colors.warning}"
borderColor: "{colors.warning-border}"
typography: "{typography.label-sm}"
rounded: "{rounded.sm}"
height: "20px"
padding: "0 6px"
badge-error:
backgroundColor: "{colors.error-subtle}"
textColor: "{colors.error}"
borderColor: "{colors.error-border}"
typography: "{typography.label-sm}"
rounded: "{rounded.sm}"
height: "20px"
padding: "0 6px"
tooltip:
backgroundColor: "{colors.primary}"
textColor: "{colors.on-accent}"
typography: "{typography.caption}"
rounded: "{rounded.md}"
padding: "6px 8px"
popover:
backgroundColor: "{colors.surface-overlay}"
textColor: "{colors.on-surface}"
borderColor: "{colors.border-strong}"
rounded: "{rounded.lg}"
padding: "8px"
code-block:
backgroundColor: "{colors.code-bg}"
textColor: "{colors.code-text}"
typography: "{typography.data-md}"
rounded: "{rounded.md}"
padding: "10px 12px"
---

---

# DESIGN.md — Precision Light Console

## Overview

Precision Light Console is a compact, data-heavy design system for professional software where users scan, compare, filter, audit, and act on dense information all day. It is optimized for light mode, crisp edges, calm neutrals, high information density, and unambiguous hierarchy.

The interface should feel engineered, trustworthy, fast, and precise. It should avoid decorative styling that competes with the data. Every visual decision should help the user answer one of four questions quickly: what changed, what matters, what is selected, and what action is available.

The product personality is:

- **Professional:** enterprise-grade, serious, and operationally reliable.
- **Compact:** tight rhythm, short control heights, dense tables, and low-friction scanning.
- **Clear:** strong typographic hierarchy, visible boundaries, aligned numbers, and explicit states.
- **Quiet:** restrained color use, minimal shadows, and limited ornamentation.
- **Actionable:** every screen should make primary actions, filters, status, and exceptions easy to find.

This system is best suited for:

- Admin consoles.
- Analytics dashboards.
- Monitoring and observability tools.
- Finance, operations, logistics, and compliance software.
- Developer tools and technical workflow applications.
- Data tables with heavy sorting, filtering, pinning, grouping, and row-level actions.

Density is a first-class product value. The default UI should show more useful information per viewport than a consumer application, while still preserving comfortable target sizes for primary workflows.

## Colors

The palette uses a light neutral foundation, dark ink text, and one disciplined blue accent. Status colors are reserved for operational meaning. Borders, dividers, and background layers do most of the hierarchy work.

- **Primary Ink (`primary`, #0F172A):** The core text and structural color. Use for top-level labels, high-emphasis text, icons, and compact navigation.
- **Action Blue (`accent`, #2563EB):** The single primary interaction color. Use for primary actions, active navigation, focused fields, links, and selected data states.
- **Slate Utility (`secondary`, #475569):** Used for secondary text, neutral icons, metadata, and supporting labels.
- **Soft Application Canvas (`neutral`, #F8FAFC):** The page background. It keeps light mode clean without the glare of pure white.
- **Pure Surface (`surface`, #FFFFFF):** Used for cards, tables, panels, popovers, and primary content regions.
- **Subtle Surface (`surface-subtle`, #F8FAFC):** Used for table headers, sidebars, nested regions, and quiet group headers.
- **Muted Surface (`surface-muted`, #F1F5F9):** Used for low-emphasis chips, inactive tabs, code backgrounds, and shallow inset sections.
- **Selected Surface (`surface-selected`, #EAF2FF):** Used for selected rows, active filter states, and highlighted data regions.
- **Border System (`border`, #E2E8F0; `border-strong`, #CBD5E1):** Borders are the main separator. Prefer them over shadows.
- **Status Colors:** Success, warning, error, and info colors must communicate real system or workflow meaning. Do not use status colors decoratively.

Color usage rules:

- Use blue sparingly. A screen should usually have one dominant blue action or selection cluster.
- Use borders and neutral surfaces before adding color.
- Use status fills only with matching text and border tokens.
- Avoid large saturated backgrounds in dense layouts.
- Never rely on color alone for status. Pair color with labels, icons, or shape.
- Keep chart colors consistent across the product. Do not remap series colors casually.

Contrast expectations:

- Normal body text must meet WCAG AA contrast guidance.
- Muted text is acceptable for metadata, timestamps, table helpers, and low-emphasis labels.
- Disabled text should be visibly inactive but still legible enough to identify unavailable controls.
- Data cells should prioritize legibility over visual softness.

## Typography

Typography is tuned for scanning and operational clarity. Use Inter for the interface and IBM Plex Mono for structured data, identifiers, timestamps, numeric values, hashes, logs, and code-like content.

The typographic system intentionally avoids oversized marketing styles. Product screens should feel compact and exact.

Primary type roles:

- **Display and headline tokens:** Use only for page titles, panel titles, dialog headers, and major screen landmarks.
- **Body tokens:** Use for regular interface copy, descriptions, table text, menu items, and form values.
- **Label tokens:** Use for buttons, tabs, filters, column headers, field labels, and compact navigation.
- **Data tokens:** Use for numeric values, IDs, timestamps, durations, percentages, currency, units, version strings, paths, and technical identifiers.
- **Caption token:** Use for helper text, metadata, timestamps outside tables, footnotes, and secondary explanations.

Typography rules:

- Use `body-sm` as the default for dense tables and compact panels.
- Use `body-md` as the default for general application text.
- Use `label-caps` for table headers and section kicker labels only.
- Use `data-md` for table numbers and high-value technical fields.
- Use tabular numbers for all numeric comparisons.
- Avoid more than three text sizes in a single dense panel.
- Avoid lightweight text below 13px for meaningful content.
- Do not center-align dense data. Left-align text and right-align comparable numbers.
- Use truncation deliberately and always provide full values through tooltip, popover, or copy action when data may be operationally important.

Recommended type pairings:

- Page title: `headline-lg` or `display-sm`.
- Page subtitle: `body-sm` with muted color.
- Toolbar labels: `label-md`.
- Table headers: `label-caps`.
- Table text cells: `body-sm`.
- Table numeric cells: `data-md`.
- Metric value: `data-lg` or `headline-md`, depending on context.
- Badge text: `label-sm`.
- Helper text: `caption`.

## Layout

The layout system favors compact density over spacious presentation. It uses tight spacing, strong alignment, fixed control heights, and explicit containment.

Core layout principles:

- Use a **12px grid rhythm** for panels, cards, and dashboard modules.
- Use **8px and 4px micro-spacing** inside dense components.
- Use **16px page margins** by default on desktop application shells.
- Use **12px gutters** for dashboard grids and split-pane layouts.
- Keep vertical rhythm compact. Most dense views should fit headers, filters, table controls, and meaningful row data above the fold.
- Prefer direct containment over whitespace. Related information should be grouped by borders, headers, dividers, and subtle backgrounds.

Page structure:

- **Top bar:** 48px high. Contains product switcher, breadcrumbs, global search, primary context controls, and user/system actions.
- **Sidebar:** 248px expanded or 56px compact. Navigation should be visually quiet and highly scannable.
- **Main content:** Uses a max width of 1600px unless the workflow benefits from full-width data tables.
- **Toolbar rows:** 40px high by default. Use for filters, search, segment controls, bulk actions, density toggles, and export actions.
- **Panel padding:** 12px by default. Use 16px only for dialogs, onboarding, or low-density content.
- **Table rows:** 32px default. Use 28px for expert-density mode and 36px for mixed text/action rows.

Density modes:

- **Compact:** 28px rows, 28px controls, 8px panel padding. Best for expert users and log-like datasets.
- **Standard Dense:** 32px rows, 32px controls, 12px panel padding. This is the default.
- **Comfortable:** 36px rows, 36px controls, 16px panel padding. Use only for complex forms or mixed-content rows.

Grid guidance:

- Use dashboards with 12-column grids and 12px gutters.
- Use split panes for master-detail flows.
- Use sticky headers for long tables.
- Use sticky first columns for wide comparison tables when row identity matters.
- Use resizable columns where the dataset is variable or user-controlled.
- Align filter controls to the same baseline as table actions.
- Avoid card grids when a table would communicate comparison more efficiently.

## Elevation & Depth

Depth is conveyed through tonal layers, borders, and precise separation. Heavy shadows are not part of the core visual language.

Preferred hierarchy tools:

- Surface changes.
- 1px borders.
- Dividers.
- Sticky headers with subtle background changes.
- Slight contrast shifts on hover and selected states.
- Sparse, shallow shadow only for floating UI.

Elevation rules:

- Base page background uses `neutral`.
- Main content panels use `surface` with a 1px `border`.
- Nested regions use `surface-subtle` or `surface-muted`.
- Table headers use `surface-subtle` and a bottom border.
- Popovers and menus may use a subtle shadow plus `border-strong`.
- Modals should use a subdued overlay and a bordered white surface.
- Avoid stacked cards with deep shadows. In data-heavy views, shadows add noise.

Recommended shadow values for implementation:

- **Floating menu:** `0 8px 24px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.08)`.
- **Dialog:** `0 24px 64px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.08)`.
- **Sticky header:** no shadow by default; use a bottom border. Add shadow only when scroll depth must be obvious.

## Shapes

The shape language is compact, precise, and mildly softened. Corners should be modern but not playful.

- Use `rounded.md` for buttons, inputs, selects, and compact controls.
- Use `rounded.lg` for cards, panels, popovers, and tables.
- Use `rounded.sm` for badges and compact inline elements.
- Use `rounded.full` only for pills, chips, avatars, and tiny count indicators.
- Use square edges inside tables when cells need strict alignment.
- Avoid large rounded cards in dense admin views.
- Avoid mixing sharp enterprise tables with overly soft consumer-style controls.

Shape rules:

- Inner elements should never have a larger radius than their parent container.
- Dense tables should prioritize alignment over softness.
- Radius should support grouping, not decoration.
- Use 1px borders with compact radii for the cleanest professional result.

## Components

### Application Shell

The app shell is a quiet frame around dense work. It should keep navigation and global controls visible without competing with the data.

- Use a 48px top bar with a white surface and bottom border.
- Use a sidebar with `surface-subtle` background and a right border.
- Keep active navigation states visible through a blue left rail, selected surface, or blue label color.
- Keep breadcrumbs compact and truncate middle segments when needed.
- Global search should be visually prominent but not oversized.

### Panels and Cards

Panels are primary containers for dense content. Cards should be used when the content is modular; panels should be used when the content is structural.

- Use white background, 1px border, and `rounded.lg`.
- Default padding is 12px.
- Panel headers should be 36px to 40px high.
- Keep header actions right-aligned.
- Use dividers between header, body, and footer when the panel contains tables or forms.
- Avoid large empty card padding unless the screen is intentionally low-density.

### Buttons

Buttons are compact, clear, and action-oriented.

- Default height is 32px.
- Compact height is 28px.
- Primary buttons use blue background and white text.
- Secondary buttons use white background, strong border, and dark text.
- Ghost buttons use transparent background and muted text.
- Destructive buttons should use error color only when the action is truly destructive.
- Icon-only buttons must have a visible hover state and accessible label.
- Button groups should use 4px gaps or shared borders.

Button hierarchy:

- One primary button per toolbar or panel region.
- Secondary buttons for common supporting actions.
- Ghost buttons for overflow, view options, column controls, and less frequent actions.
- Links for navigation, not mutation.

### Inputs, Selects, and Filters

Forms should be compact and highly legible. Filtering is a primary workflow in data-heavy applications and should be treated as a first-class interface pattern.

- Default control height is 32px.
- Use 28px controls only in expert-density toolbars.
- Labels should be visible for forms and optional for obvious toolbar filters.
- Placeholder text should never replace a required label in complex forms.
- Focus state uses blue border and a subtle outline or ring.
- Validation errors use error text, border, and concise helper copy.
- Use inline filter chips to summarize active filters.
- Always provide a clear-all action when multiple filters are active.

Recommended filter layout:

- Search input first.
- Primary filter group second.
- View or saved filter selector third.
- Bulk actions appear only after selection.
- Export, column settings, and density controls appear at the far right.

### Tables

Tables are the center of the system. They must be compact, stable, readable, and optimized for scanning.

Table structure:

- Default row height is 32px.
- Header height is 32px.
- Use sticky headers for long datasets.
- Use zebra striping only when row tracking is difficult. Prefer hover and subtle borders by default.
- Use `divider` for row separators and `border` for outer table boundaries.
- Use `label-caps` for column headers.
- Use `body-sm` for text cells.
- Use `data-md` for numeric cells, timestamps, IDs, and technical values.
- Right-align numbers, currency, percentages, counts, and durations.
- Left-align names, labels, titles, and free text.
- Center-align only booleans, icons, and compact status indicators.

Table interaction:

- Hover state uses `surface-hover`.
- Selected state uses `surface-selected`.
- Focus state must be keyboard-visible.
- Sort direction must be visible in the active column header.
- Row actions should appear on hover or in a dedicated trailing actions column.
- Bulk selection should reveal a compact bulk action bar.
- Column resize handles should be subtle but discoverable.
- Empty states should explain what is missing and how to recover.

Table density:

- Prefer 32px rows for standard data products.
- Use 28px rows for logs, events, traces, and expert workflows.
- Use 36px rows for tables with avatars, multi-line text, or inline actions.
- Avoid multi-line rows unless the secondary line is essential.
- Prefer column visibility controls over horizontal overflow when possible.
- Use horizontal scroll for genuinely wide datasets rather than hiding important fields.

### Metrics and KPIs

Metrics should be compact and comparison-friendly.

- Use small labels above large values.
- Use `data-lg` for precise numbers.
- Use muted captions for comparison periods.
- Use status color only for semantic deltas.
- Pair deltas with arrows, signs, or text.
- Keep metric cards shallow and aligned to the same height.
- Avoid oversized hero metrics unless the dashboard has a single dominant value.

### Charts and Data Visualization

Charts should be clear, restrained, and readable in light mode.

- Use thin grid lines with `chart-grid`.
- Use muted axes with `chart-axis`.
- Use the chart palette in order and keep series mapping stable.
- Prefer direct labels when they reduce legend scanning.
- Use tooltips with precise values and units.
- Use tabular numbers in chart tooltips.
- Avoid gradients, heavy fills, and decorative 3D effects.
- Avoid using red and green as the only way to communicate meaning.
- Use annotations for thresholds, incidents, targets, and release markers.

Chart hierarchy:

- One primary insight per chart.
- Keep secondary controls compact and outside the plot area.
- Prefer small multiples over overloaded multi-axis charts.
- Use line charts for trends, bar charts for comparison, and tables for exact lookup.

### Badges, Chips, and Status

Badges and chips provide compact metadata and state.

- Badges are for status, category, role, severity, and compact metadata.
- Chips are for filters, selections, and removable tokens.
- Use `rounded.sm` for badges and `rounded.full` for chips.
- Keep badge height at 20px.
- Keep chip height at 24px.
- Use border plus subtle fill for status clarity.
- Do not use filled saturated badges in dense tables.

Severity guidance:

- Success: completed, healthy, passing, available.
- Warning: degraded, pending risk, partial, delayed.
- Error: failed, blocked, unavailable, destructive.
- Info: neutral system notice, scheduled, running, queued.
- Neutral: draft, inactive, archived, unknown, not applicable.

### Tabs and Segmented Controls

Tabs organize dense views without changing page context.

- Use compact 32px tab height.
- Use bottom border or selected surface for active state.
- Use badge counts sparingly.
- Keep tab labels short.
- Use segmented controls for mutually exclusive view modes.
- Avoid using tabs for actions.

### Navigation

Navigation should remain stable and low-noise.

- Sidebar items should be 32px high.
- Active state should be visible through blue text, selected surface, or a left rail.
- Use icons only when they aid fast recognition.
- Avoid colorful navigation icons.
- Group navigation with compact section labels.
- Collapse long navigation groups by default only when they are secondary.

### Menus, Popovers, and Tooltips

Floating UI should be crisp and unobtrusive.

- Use white background, `border-strong`, and subtle shadow.
- Menu item height should be 32px.
- Destructive menu items use error text, not large red backgrounds.
- Tooltips should be concise and appear only when useful.
- Popovers should have clear close behavior and keyboard support.
- Avoid placing critical information only in a tooltip.

### Dialogs and Drawers

Dialogs are for focused decisions. Drawers are for contextual detail without losing table context.

- Use dialogs for confirmation, creation, and destructive decisions.
- Use drawers for row detail, audit trails, edit forms, and related records.
- Drawer width should usually be 420px, 560px, or 720px depending on complexity.
- Dialog padding may increase to 16px or 24px for readability.
- Keep destructive confirmations explicit and concise.
- Preserve the user’s table position after closing a drawer.

### Empty, Loading, and Error States

System states should be compact but helpful.

- Empty states should include the reason, the scope, and the next available action.
- Loading states should preserve layout dimensions to prevent jumpiness.
- Use skeletons for tables and cards.
- Use inline errors near the failed component.
- Use banners for system-wide issues.
- Use toasts for non-blocking confirmations.
- Avoid celebratory empty states in professional data tools.

### Code, Logs, and Technical Values

Technical content should be easy to scan and copy.

- Use `data-md` or `data-sm` for logs, IDs, and code-like values.
- Use `code-bg` for inline code and code blocks.
- Long identifiers should truncate in the middle when the prefix and suffix matter.
- Provide copy actions for IDs, paths, tokens, and commands.
- Use line wrapping carefully in logs. For scanning, horizontal scroll is often better.
- Highlight search matches with a subtle background, not saturated color.

## Do's and Don'ts

### Do

- Do prioritize dense tables, strong alignment, and compact controls.
- Do use light mode as the default and primary design target.
- Do use neutral surfaces, borders, and dividers before adding color.
- Do reserve blue for focus, selection, links, and the most important action.
- Do right-align comparable numbers and use tabular figures.
- Do use monospaced data typography for IDs, timestamps, durations, and metrics.
- Do make table headers sticky in long datasets.
- Do provide clear hover, selected, focus, disabled, loading, and error states.
- Do keep primary workflows visible above the fold.
- Do provide column controls, density settings, and saved views for power users.
- Do pair color-coded statuses with text or icons.
- Do keep shadows shallow and rare.
- Do use copy actions for operationally important technical values.
- Do preserve user context when opening drawers, menus, and row details.
- Do make keyboard focus visible and predictable.

### Don't

- Don’t use large decorative cards when a compact table is more useful.
- Don’t use color as decoration in dense operational screens.
- Don’t create multiple competing primary actions in the same region.
- Don’t rely on whitespace alone to separate dense information.
- Don’t center-align text-heavy or numeric table columns.
- Don’t use oversized typography for routine dashboard values.
- Don’t hide critical values behind hover-only interactions.
- Don’t use red or green without semantic meaning.
- Don’t use deep shadows for normal panels or table containers.
- Don’t over-round components until the product feels playful.
- Don’t use multi-line rows by default.
- Don’t truncate important values without a way to reveal or copy the full value.
- Don’t mix multiple chart color meanings across screens.
- Don’t make disabled states look like loading states.
- Don’t prioritize visual novelty over scan speed, precision, and trust.

### Compact Data Screen Checklist

Before shipping a dense application screen, verify that:

- The page has one clear primary action.
- Filters, search, saved views, and export controls are easy to find.
- The table header remains visible while scrolling.
- Numeric columns align and use tabular figures.
- Row hover, row selected, and keyboard focus states are distinct.
- Active filters are visible as chips or compact summaries.
- Status badges include readable text.
- Empty, loading, and error states preserve context.
- High-value identifiers can be copied.
- The screen still works at narrower widths through column controls, horizontal scroll, or responsive layout changes.
- Visual emphasis points to decisions, exceptions, and next actions rather than decoration.
