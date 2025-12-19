Hi, the project is to build a data-flow-first code visualization that helps a developer understand where values in a selected chunk of code come from and how they relate within that chunk. The user explicitly selects a “focus” region (a function or any arbitrary selection), and the UI treats that region as the single active boundary for analysis and interaction. The visualization overlays subtle annotations on top of an existing syntax-highlighted code view (Shiki), keeping the code readable while adding just enough semantic color to guide attention.

The primary goal is to categorize identifiers inside the focus region by their provenance and role: function parameters, local declarations, module/top-level declarations, closure-captured variables from outer scopes, and imports (split into external packages vs internal project modules). These categories are communicated via low-intensity background colors behind identifier tokens, with additional affordances such as a border to indicate shadowing (when a local symbol overrides an outer symbol). Member access highlighting is based on the object reference (`obj` in `obj.prop`), and type-related syntax is intentionally deemphasized so the visualization tracks “real” runtime-ish values rather than type clutter.

Interaction is centered around fast, lightweight inspection. Hovering an identifier should reveal a tooltip near the cursor that explains what the identifier resolves to (e.g., “parameter,” “local const,” “captured from outer scope,” “imported from X”), and clicking should “pin” the current inspection state so highlights and tooltip remain visible while the user moves around. Within the focus boundary, hovering/pinning should also highlight all occurrences of the same resolved symbol to make it easy to track usage. Cross-file navigation is handled as a non-disruptive preview: following an import should open the target in a secondary pane without changing the active focus boundary.

On the backend, analysis is powered by tree-sitter parsing and existing code you already have: a scope-aware symbol/usage analyzer and a separate dependency resolver that can extract imports/exports and resolve internal imports via tsconfig paths. The near-term approach is to reuse the reliable parts of these systems to produce a minimal “overlay model” for a given file and selection—essentially a list of identifier ranges with categories and tooltip text—rather than building a full graph layout. Accuracy priorities for the first iteration are strong symbol resolution within the file, correct internal vs external import classification, and clean handling of parameters, locals, module scope, and closure captures.

Phase 1 is intentionally small and shippable: render subtle background highlights on the existing Shiki display, attach tooltips, and support hover-to-highlight plus click-to-pin within the selected focus region. The analysis pipeline for Phase 1 should compute only what’s needed for those visuals (token ranges, category, and a basic provenance string), and can initially use heuristics where necessary (e.g., built-in globals vs unresolved identifiers). More advanced features—shadowing borders, import statement range tooltips, type soft-hiding, and arrows/value-flow edges—are deferred to later phases once the foundational overlay and interaction model are stable and trustworthy.

Hi, here’s a **3-phase, low-risk plan** that starts by **painting backgrounds on your existing Shiki-rendered code**, then incrementally adds a reliable analysis pipeline and the first “it feels like the PRD” UX—without betting the farm on a giant rewrite.

---

## Phase 1 — “Paint first”: background highlights + tooltips from a minimal, reliable analysis

### Goal

- Get **visible wins fast**:

  - subtle background colors on identifiers in your Shiki HTML
  - hover tooltip for provenance
  - no arrows yet
  - no deep flow yet

- Focus boundary is **explicit selection** (your requirement), but you can treat the “focus” as _just a range_ for now.

### Deliverables

- Shiki HTML post-processor that:

  - wraps identifier tokens in `<span data-sym="...">`
  - adds background classes (`bg-import-external`, `bg-param`, etc.)
  - attaches tooltip content (simple `title=""` first; upgrade later)

- A minimal “Overlay Model” API response:

  - list of highlighted ranges (byte offsets)
  - symbol category per range
  - tooltip strings

### What to implement

- Rendering layer (front-end)

  - **Keep Shiki as source of truth for syntax highlighting**
  - Add an overlay pass that can safely “decorate” the HTML:

    - Use Shiki’s tokenization output if you have it
    - Otherwise: treat the rendered code as text and inject spans by mapping offsets to HTML nodes (harder; prefer token output)

  - Decoration strategy (low risk)

    - Only decorate **identifier tokens**, not arbitrary text runs
    - Apply **subtle background** via CSS class
    - Add `data-*` attributes for tooltips:

      - `data-origin="importExternal"`
      - `data-decl="path:line"`
      - `data-import="import {x} from 'y'"`

  - Focus boundary

    - Render a visible boundary for selection:

      - a faint block background for selection lines
      - or a left gutter bracket spanning focus lines

- Analysis pipeline (backend)

  - Add a new endpoint (or extend existing):

    - `POST /focus/overlay`

      - input: `{ path, selectionStartByte, selectionEndByte }`
      - output: `{ tokens: [{startByte,endByte,category,symbolId,tooltip}] }`

  - Implement a **minimal analyzer**:

    - Reuse your DataFlowAnalyzer traversal machinery but **only** compute:

      - params
      - locals
      - module-scope declarations
      - imports (by reusing your dependency analyzer’s import extraction if possible)
      - closure captures (based on def scope ancestry)
      - builtin/unresolved heuristics

    - Skip:

      - write/read/call contexts (optional in Phase 1)
      - value-flow edges
      - type extraction/removal (just ignore types; don’t hide yet)

### “Crib from existing” (low-risk reuse)

- From dependency endpoint

  - Reuse `extract_imports_exports` + tsconfig path resolution:

    - classify import as internal vs external reliably
    - tooltip can show “import statement as written” if you add ranges later (Phase 2)

- From DataFlowAnalyzer

  - Reuse scope stack + destructuring binding logic
  - BUT do **not** output ELK graph; output overlay tokens (byte ranges)

### UX in Phase 1 (minimum viable PRD feel)

- Hover an identifier:

  - show tooltip near cursor (can start with native tooltip, then switch to custom)
  - highlight all occurrences of the same `symbolId` within focus (simple DOM query by `data-sym`)

- Click to pin:

  - lock tooltip + highlight until ESC

### Acceptance criteria

- In a selected function:

  - params are blue-ish, locals green-ish, imports yellow/orange-ish, captures purple-ish, module brown-ish
  - hover shows “Imported from …” or “Declared at file:line”
  - click-to-pin works

- No arrows, no fancy modes—just stable coloring + provenance.

---

## Details to integrate with skiki

Hi, you can integrate Phase 1 overlays into this Shiki pipeline by adding **one extra async step** (fetch/compute an overlay model for the displayed slice) and **one HTML post-process step** (inject lightweight `<span>` wrappers around identifier ranges). The key is to align everything to the **display slice** you already compute.

---

## Integration shape

- Keep your current pipeline exactly as-is up to `html = markNonFocusLines(...)`.
- Add:

  - **(A) overlay fetch/compute** using `{ path, sliceStartLine, sliceEndLine, focusStartLine, focusEndLine }`
  - **(B) HTML decoration pass** that injects `<span data-sym ... class="flow flow-import-external">…</span>` into the Shiki HTML, scoped to the displayed lines.

- Return the decorated HTML via `setHighlightedHtml`.

---

## Data contract for Phase 1 overlays

You’ll have the least risk if your overlay model is **line/column based**, not byte-based, because your UI already slices by line.

### Proposed minimal overlay model (v1)

- `tokens: Array<{`

  - `fileLine: number` (1-based)
  - `startCol: number` (0-based column in that line, source-text)
  - `endCol: number` (exclusive)
  - `category: "importExternal" | "importInternal" | "param" | "local" | "module" | "capture" | "builtin" | "unresolved"`
  - `symbolId: string`
  - `tooltip: string`
  - `bands?: string[]` (optional stacked semantics later)
    `}>`

### Mapping into your displayed slice

- `displayLineIndex = fileLine - slice.start + 1`
- Only apply if `1 <= displayLineIndex <= (slice.end - slice.start + 1)`

> This avoids dealing with byte offsets and survives line slicing. It also plays nicely with your “explicit selection” focus lines.

---

## The one thing you should tweak: indentation reduction metadata

Because you optionally call `reduceCommonIndent(linesToDisplay, { keepIndent: 2 })`, your displayed columns may shift left. For correct token wrapping:

- Update `reduceCommonIndent` to return a `removedIndentByLine: number[]`

  - same length as `linesToDisplay`
  - `removedIndentByLine[i]` = how many leading spaces were removed from that line

- Then:

  - `displayStartCol = max(0, sourceStartCol - removedIndentByLine[lineIndex])`
  - same for `endCol`

This keeps Phase 1 stable without introducing a full source↔display mapping system.

---

## Where to add it in your pipeline

Below is the minimal integration strategy (no big refactor): add an `applyFlowDecorations` step right before `setHighlightedHtml(html)` and call your backend overlay endpoint after you compute `slice`/`displayText`.

### Pseudocode integration (in your existing async block)

```ts
// 1) existing slice computation...
const slice = computeDisplaySlice(...);
let linesToDisplay = slice.linesToDisplay;
let removedIndentByLine: number[] | null = null;

if (shouldReduceIndent) {
  const reduced = reduceCommonIndent(linesToDisplay, { keepIndent: 2 });
  linesToDisplay = reduced.lines;
  removedIndentByLine = reduced.removedIndentByLine; // <-- add this
}

// 2) existing Shiki render...
const displayText = linesToDisplay.join("\n");
let html = await codeToHtml(displayText, { lang, theme: "github-dark" });
html = stripShikiPreNewlines(html);
if (useLineFilter && target) { ... html = markNonFocusLines(...) }

// 3) NEW: fetch overlay tokens for the *file slice* currently displayed
const overlay = await fetch("/focus/overlay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    path,
    sliceStartLine: slice.start,
    sliceEndLine: slice.end,
    focusStartLine: target?.start ?? null,
    focusEndLine: target?.end ?? null,
  }),
}).then(r => r.json());

// 4) NEW: decorate Shiki HTML using overlay tokens + slice mapping
html = applyFlowDecorations(html, overlay.tokens, {
  sliceStartLine: slice.start,
  removedIndentByLine,
});

// 5) existing setHighlightedHtml
setHighlightedHtml(html);
```

---

## Implementing `applyFlowDecorations` safely

You want to preserve Shiki’s layout (your CSS counters depend on it), so **don’t restructure lines**. Only inject nested spans inside existing token spans.

### Recommended approach (browser-side, stable)

- Parse HTML with `DOMParser`
- Find line nodes: Shiki usually emits `span.line` per line (or similar)
- For each overlay token mapped to a display line:

  - walk text nodes inside that line
  - split the text node at `[startCol, endCol)` boundaries
  - wrap the segment in a `<span class="flow flow-${category}" data-sym="..." data-tip="...">`

Key design choices:

- Don’t wrap across multiple Shiki token spans; instead, split within the text node(s) you encounter.
- Apply decorations **from right-to-left per line** to avoid offset shifting while you insert nodes.

### Minimal DOM-walk outline

- Group tokens by `displayLineIndex`
- Sort each line’s tokens by `startCol DESC`
- For each token:

  - locate the correct text node range by accumulating `textContent.length` across descendant text nodes
  - perform splits and wrap

If you want, I can write the full TS implementation of `applyFlowDecorations` in a follow-up—this is the only “tricky” part, but it’s very doable and self-contained.

---

## Initial UX wiring on top of decorated spans

Once spans exist, you can get hover/pin UX without touching Shiki again:

- Event delegation on the container that renders `highlightedHtml`

  - `mouseover`:

    - if `target.closest(".flow")` exists:

      - read `data-sym` and `data-tip`
      - add class `.flow-hovered` to all spans with that `data-sym` in the container
      - show tooltip near cursor

  - `mouseout`:

    - clear unless pinned

  - `click`:

    - set pinned symbol ID (and keep tooltip)

  - `keydown Escape`:

    - clear pinned

CSS can stay simple:

- `.flow.flow-importExternal { background: rgba(...); }` etc (subtle)
- `.flow-hovered { outline: 1px solid rgba(...); }` (or slightly stronger background)

---

## How to use your existing endpoints in Phase 1

- Dependency endpoint (`/dependencies`)

  - Great for resolving **internal vs external** and later preview panes
  - But it’s too heavy to call per selection

- Prefer a new “focused” endpoint for Phase 1

  - `POST /focus/overlay` should analyze **one file**, limited to `{sliceStartLine..sliceEndLine}`
  - Internally it can reuse:

    - import extraction and tsconfig path resolution logic from the dependency code
    - scope/defs/usages logic from your dataflow analyzer (simplified)

---

## Practical “don’t fail” checkpoints

- First checkpoint: decorate **only params + locals** (no imports yet)
- Second checkpoint: add imports classification using the dependency resolver logic
- Third checkpoint: add captures + module scope (still no arrows)

That sequence gives you visible progress even if import resolution or captures take longer.

---

If you want to move fastest, the next step is: paste (or summarize) the shape of Shiki’s HTML you get (does it contain `span.line`?), and I’ll tailor the `applyFlowDecorations` implementation to your exact DOM structure so it doesn’t break your counter rules.
