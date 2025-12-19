Hi, the project is to build a data-flow-first code visualization that helps a developer understand where values in a selected chunk of code come from and how they relate within that chunk. The user explicitly selects a “focus” region (a function or any arbitrary selection), and the UI treats that region as the single active boundary for analysis and interaction. The visualization overlays subtle annotations on top of an existing syntax-highlighted code view (Shiki), keeping the code readable while adding just enough semantic color to guide attention.

The primary goal is to categorize identifiers inside the focus region by their provenance and role: function parameters, local declarations, module/top-level declarations, closure-captured variables from outer scopes, and imports (split into external packages vs internal project modules). These categories are communicated via low-intensity background colors behind identifier tokens, with additional affordances such as a border to indicate shadowing (when a local symbol overrides an outer symbol). Member access highlighting is based on the object reference (`obj` in `obj.prop`), and type-related syntax is intentionally deemphasized so the visualization tracks “real” runtime-ish values rather than type clutter.

Interaction is centered around fast, lightweight inspection. Hovering an identifier should reveal a tooltip near the cursor that explains what the identifier resolves to (e.g., “parameter,” “local const,” “captured from outer scope,” “imported from X”), and clicking should “pin” the current inspection state so highlights and tooltip remain visible while the user moves around. Within the focus boundary, hovering/pinning should also highlight all occurrences of the same resolved symbol to make it easy to track usage. Cross-file navigation is handled as a non-disruptive preview: following an import should open the target in a secondary pane without changing the active focus boundary.

On the backend, analysis is powered by tree-sitter parsing and existing code you already have: a scope-aware symbol/usage analyzer and a separate dependency resolver that can extract imports/exports and resolve internal imports via tsconfig paths. The near-term approach is to reuse the reliable parts of these systems to produce a minimal “overlay model” for a given file and selection—essentially a list of identifier ranges with categories and tooltip text—rather than building a full graph layout. Accuracy priorities for the first iteration are strong symbol resolution within the file, correct internal vs external import classification, and clean handling of parameters, locals, module scope, and closure captures.

Phase 1 is intentionally small and shippable: render subtle background highlights on the existing Shiki display, attach tooltips, and support hover-to-highlight plus click-to-pin within the selected focus region. The analysis pipeline for Phase 1 should compute only what’s needed for those visuals (token ranges, category, and a basic provenance string), and can initially use heuristics where necessary (e.g., built-in globals vs unresolved identifiers). More advanced features—shadowing borders, import statement range tooltips, type soft-hiding, and arrows/value-flow edges—are deferred to later phases once the foundational overlay and interaction model are stable and trustworthy.

Hi, here’s a **3-phase, low-risk plan** that starts by **painting backgrounds on your existing Shiki-rendered code**, then incrementally adds a reliable analysis pipeline and the first “it feels like the PRD” UX—without betting the farm on a giant rewrite.

## Phase 2 — “Make it correct”: import provenance, shadowing, and robust range mapping

### Goal

- Improve correctness and trust:

  - accurate import tooltips “as written near top of file”
  - shadowing border (your specific UX)
  - better symbol identity + range fidelity (byte/point ranges)

- Introduce **soft-hide types** (optional, low-risk) to reduce clutter.

### Deliverables

- Overlay model becomes symbol-aware:

  - `symbols[]` with origin + decl location
  - `tokens[]` reference symbol IDs

- Import tooltip shows:

  - actual import clause (slice by range)
  - resolved target info (internal file path vs external package)

- Shadowing:

  - border on “ruling” local
  - tooltip indicates “shadows X”

- Type deemphasis:

  - return `typeRegions[]` to render with low opacity (no offset remapping required)

### What to implement

- Backend: upgrade symbol table + ranges

  - Update DataFlowAnalyzer-like code to store:

    - `startByte/endByte` and `(row,col)` points for defs and refs

  - Replace `scope.variables: Dict[name, def]` with:

    - `Dict[name, List[def]]` (or a stack)

  - Compute shadowing

    - on def add: resolve outer symbol; set `shadowsDefId`

  - Compute closure capture classification (already conceptually in Phase 1, but make it reliable using ancestry checks)

- Backend: upgrade import extraction to include statement ranges

  - Extend `extract_imports_exports` to return:

    - import statement range (`startByte/endByte`)
    - per-binding mapping: `localName`, `importedName`, `source`

  - Use dependency resolver to mark internal/external + resolved target

- Frontend: richer tooltip and stacked semantics

  - Tooltip becomes a lightweight custom component positioned at mouse
  - Show stacked semantics when applicable (your “show them all with padding”):

    - implement as layered background bands or multiple CSS classes

- Soft-hide types (recommended here)

  - Backend returns `typeRegions` byte ranges
  - Frontend applies an opacity class to spans intersecting those ranges
  - Keep identifiers in type-only positions uncolored

### UX in Phase 2

- Hover identifier:

  - highlight all occurrences in focus
  - tooltip shows:

    - category label
    - decl location
    - if import: statement snippet + resolved target
    - if shadowing: “shadows …”

- Pinned hover remains core interaction
- Preview pane integration (imports only)

  - if token is an import symbol:

    - click “Open preview” in tooltip (or click token with modifier)
    - open target file in side pane without changing focus

### Acceptance criteria

- For imports:

  - tooltip shows the exact import line text
  - internal/external classification matches tsconfig paths
  - preview opens correct file

- Shadowing:

  - border appears on the active local definition and all its refs

- Type clutter reduced by soft-hide.

---
