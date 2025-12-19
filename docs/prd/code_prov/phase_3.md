Hi, the project is to build a data-flow-first code visualization that helps a developer understand where values in a selected chunk of code come from and how they relate within that chunk. The user explicitly selects a “focus” region (a function or any arbitrary selection), and the UI treats that region as the single active boundary for analysis and interaction. The visualization overlays subtle annotations on top of an existing syntax-highlighted code view (Shiki), keeping the code readable while adding just enough semantic color to guide attention.

The primary goal is to categorize identifiers inside the focus region by their provenance and role: function parameters, local declarations, module/top-level declarations, closure-captured variables from outer scopes, and imports (split into external packages vs internal project modules). These categories are communicated via low-intensity background colors behind identifier tokens, with additional affordances such as a border to indicate shadowing (when a local symbol overrides an outer symbol). Member access highlighting is based on the object reference (`obj` in `obj.prop`), and type-related syntax is intentionally deemphasized so the visualization tracks “real” runtime-ish values rather than type clutter.

Interaction is centered around fast, lightweight inspection. Hovering an identifier should reveal a tooltip near the cursor that explains what the identifier resolves to (e.g., “parameter,” “local const,” “captured from outer scope,” “imported from X”), and clicking should “pin” the current inspection state so highlights and tooltip remain visible while the user moves around. Within the focus boundary, hovering/pinning should also highlight all occurrences of the same resolved symbol to make it easy to track usage. Cross-file navigation is handled as a non-disruptive preview: following an import should open the target in a secondary pane without changing the active focus boundary.

On the backend, analysis is powered by tree-sitter parsing and existing code you already have: a scope-aware symbol/usage analyzer and a separate dependency resolver that can extract imports/exports and resolve internal imports via tsconfig paths. The near-term approach is to reuse the reliable parts of these systems to produce a minimal “overlay model” for a given file and selection—essentially a list of identifier ranges with categories and tooltip text—rather than building a full graph layout. Accuracy priorities for the first iteration are strong symbol resolution within the file, correct internal vs external import classification, and clean handling of parameters, locals, module scope, and closure captures.

Phase 1 is intentionally small and shippable: render subtle background highlights on the existing Shiki display, attach tooltips, and support hover-to-highlight plus click-to-pin within the selected focus region. The analysis pipeline for Phase 1 should compute only what’s needed for those visuals (token ranges, category, and a basic provenance string), and can initially use heuristics where necessary (e.g., built-in globals vs unresolved identifiers). More advanced features—shadowing borders, import statement range tooltips, type soft-hiding, and arrows/value-flow edges—are deferred to later phases once the foundational overlay and interaction model are stable and trustworthy.

Hi, here’s a **3-phase, low-risk plan** that starts by **painting backgrounds on your existing Shiki-rendered code**, then incrementally adds a reliable analysis pipeline and the first “it feels like the PRD” UX—without betting the farm on a giant rewrite.

---

## Phase 3 — “It feels like the PRD”: arrows-to-decl + basic local value-flow on demand

### Goal

- Add the “tracking” feel without overwhelming:

  - ref → decl arrows on hover/pin
  - gutter/edge indicators for offscreen decls
  - optional value-flow arrows (RHS refs → LHS symbol) behind a modifier key

### Deliverables

- Editor overlay layer (SVG) over the Shiki code container
- Arrow routing to:

  - declaration within viewport, or
  - gutter edge indicator with line number / click-to-scroll / click-to-preview

- Minimal value-flow edges inside focus:

  - initialization and assignment edges only

- Arrow limiting policy to avoid chaos

### What to implement

- Backend: usage context + minimal flow edges

  - Add `accessKind` detection for identifiers:

    - read / write / call / readwrite

  - Build flow edges inside focus:

    - `const x = expr` → edges from symbols in `expr` to `x`
    - `x = expr`, `x += expr`, destructuring assigns (best effort)

  - Return:

    - `edges[]` with `fromSymbolId`, `toSymbolId`, and range info (where it occurred)

- Frontend: arrow overlay

  - When hovering/pinning:

    - draw a line from hovered ref range → decl range
    - optionally draw flow edges (Alt key)

  - Coordinate mapping

    - simplest approach: for a token span, use `getBoundingClientRect()` to get anchor points
    - draw SVG lines positioned relative to code container

  - Offscreen decl handling

    - if decl span not in DOM / not visible:

      - draw arrow to top/bottom gutter marker
      - show small indicator with line number

- UX controls (small, low clutter)

  - Default behavior:

    - show only ref→decl arrow

  - Modifier behavior:

    - hold `Alt` → show local value-flow arrows too

  - Arrow cap:

    - if >N edges, only show ref→decl + “+X more” in tooltip

### Acceptance criteria

- Hover any identifier:

  - decl arrow appears instantly
  - decl offscreen produces gutter indicator

- Alt+hover:

  - value-flow arrows appear (limited, readable)

- No major lag on hover (viewport-only arrows)

---

## Why this plan avoids “big thing fails”

- Phase 1 ships value with minimal new machinery

  - no arrows
  - minimal correctness burden
  - mostly “decorate and tooltip”

- Phase 2 fixes correctness _where it matters_ (imports + shadowing + ranges)

  - focuses on trust and provenance, not advanced flow

- Phase 3 adds the “wow” interactions only after the base is stable

  - arrows are purely client-side visuals driven by the now-reliable ranges/symbol IDs
  - value-flow edges are opt-in (modifier) so clutter doesn’t sink the UX

---

## Suggested implementation order within each phase

- Phase 1

  - Backend overlay endpoint (params/locals/module/import/capture categories)
  - Shiki decoration pass (apply backgrounds + `data-sym`)
  - Hover highlight + basic tooltip + click-to-pin

- Phase 2

  - Import extraction ranges + binding map
  - Shadowing-aware symbol table
  - Custom tooltip + preview pane for imports
  - Soft-hide types (typeRegions)

- Phase 3

  - SVG overlay arrows (ref→decl) + gutter indicators
  - Access kind classification + minimal init/assign flow edges behind Alt
  - Arrow cap + “+X more” messaging

---

If you tell me **how you currently render Shiki** (raw HTML string, token array, or rehype pipeline), I can recommend the safest way to inject spans and keep byte-offset mapping sane without fighting the DOM.
