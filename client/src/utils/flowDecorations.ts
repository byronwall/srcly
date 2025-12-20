export type OverlayToken = {
  fileLine: number; // 1-based
  startCol: number; // 0-based
  endCol: number; // exclusive
  category: string;
  symbolId: string;
  tooltip: string;
  definitionSnippet?: string | null;
  definitionLine?: number | null;
  scopeSnippet?: string | null;
  scopeLine?: number | null;
  scopeEndLine?: number | null;
};

// Keep wrapTextRangeInLine exported so it can be used by other functions in this file or elsewhere if needed.
export function wrapTextRangeInLine(
  lineEl: Element,
  startCol: number,
  endCol: number,
  attrs: {
    category: string;
    symbolId: string;
    tooltip: string;
    definitionSnippet?: string | null;
    definitionLine?: number | null;
    scopeSnippet?: string | null;
    scopeLine?: number | null;
    scopeEndLine?: number | null;
  }
) {
  if (endCol <= startCol) return;

  const doc = lineEl.ownerDocument;
  const nodes = getLineTextNodes(lineEl);
  if (!nodes.length) return;

  // Build an index of [absStart, absEnd) for each text node.
  let cursor = 0;
  const segments: Array<{ node: Text; absStart: number; absEnd: number }> = [];
  for (const node of nodes) {
    const len = node.data.length;
    const absStart = cursor;
    const absEnd = cursor + len;
    segments.push({ node, absStart, absEnd });
    cursor = absEnd;
  }

  // Wrap overlaps from right to left so DOM splits don't affect earlier offsets.
  const overlapping = segments
    .filter((s) => s.absEnd > startCol && s.absStart < endCol)
    .sort((a, b) => b.absStart - a.absStart);

  for (const seg of overlapping) {
    const node = seg.node;
    const nodeLen = node.data.length;
    const localStart = Math.max(0, startCol - seg.absStart);
    const localEnd = Math.min(nodeLen, endCol - seg.absStart);
    if (localEnd <= localStart) continue;

    // Because we may have already split this text node while processing a later
    // segment, double-check lengths.
    const currentLen = node.data.length;
    const safeStart = Math.min(localStart, currentLen);
    const safeEnd = Math.min(localEnd, currentLen);
    if (safeEnd <= safeStart) continue;

    const parent = node.parentNode;
    if (!parent) continue;

    let afterRef: ChildNode | null = node.nextSibling;
    if (safeEnd < node.data.length) {
      afterRef = node.splitText(safeEnd);
    }
    let middle = node as Text;
    if (safeStart > 0) {
      middle = node.splitText(safeStart);
    }

    const wrapper = doc.createElement("span");
    wrapper.className = `flow flow-${attrs.category}`;
    wrapper.dataset.sym = attrs.symbolId;
    wrapper.dataset.tip = attrs.tooltip;
    wrapper.dataset.cat = attrs.category;
    if (attrs.definitionSnippet) {
      wrapper.dataset.snippet = attrs.definitionSnippet;
    }
    if (attrs.definitionLine) {
      wrapper.dataset.defLine = String(attrs.definitionLine);
    }
    if (attrs.scopeSnippet) {
      wrapper.dataset.scopeSnippet = attrs.scopeSnippet;
    }
    if (attrs.scopeLine) {
      wrapper.dataset.scopeLine = String(attrs.scopeLine);
    }
    if (attrs.scopeEndLine) {
      wrapper.dataset.scopeEndLine = String(attrs.scopeEndLine);
    }

    parent.insertBefore(wrapper, afterRef);
    wrapper.appendChild(middle);
  }
}

function getLineTextNodes(lineEl: Element): Text[] {
  const doc = lineEl.ownerDocument;
  const walker = doc.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let curr = walker.nextNode();
  while (curr) {
    nodes.push(curr as Text);
    curr = walker.nextNode();
  }
  return nodes;
}

export function applyFlowDecorations(
  html: string,
  tokens: OverlayToken[],
  opts: { sliceStartLine: number; removedIndentByLine?: number[] | null }
): string {
  if (!tokens.length) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const lineEls = Array.from(doc.querySelectorAll("span.line"));
  if (!lineEls.length) return html;

  const byLine = new Map<number, OverlayToken[]>();
  for (const t of tokens) {
    const displayLineIndex = t.fileLine - opts.sliceStartLine + 1; // 1-based
    if (displayLineIndex < 1 || displayLineIndex > lineEls.length) continue;
    const list = byLine.get(displayLineIndex) ?? [];
    list.push(t);
    byLine.set(displayLineIndex, list);
  }

  for (const [displayLineIndex, lineTokens] of byLine.entries()) {
    const lineEl = lineEls[displayLineIndex - 1];
    if (!lineEl || lineEl.classList.contains("non-focus-line")) continue;

    const removed =
      opts.removedIndentByLine?.[displayLineIndex - 1] !== undefined
        ? Math.max(
            0,
            Math.floor(opts.removedIndentByLine![displayLineIndex - 1]!)
          )
        : 0;

    // Right-to-left so earlier offsets remain stable.
    const sorted = [...lineTokens].sort((a, b) => b.startCol - a.startCol);
    for (const t of sorted) {
      const startCol = Math.max(0, t.startCol - removed);
      const endCol = Math.max(startCol, t.endCol - removed);
      wrapTextRangeInLine(lineEl, startCol, endCol, {
        category: t.category,
        symbolId: t.symbolId,
        tooltip: t.tooltip,
        definitionSnippet: t.definitionSnippet,
        definitionLine: t.definitionLine,
        scopeSnippet: t.scopeSnippet,
        scopeLine: t.scopeLine,
        scopeEndLine: t.scopeEndLine,
      });
    }
  }

  return doc.body.innerHTML;
}

export function applyFlowDecorationsToEl(
  container: HTMLElement,
  tokens: OverlayToken[],
  opts: { sliceStartLine: number; removedIndentByLine?: number[] | null }
): void {
  if (!tokens.length) return;

  const lineEls = Array.from(container.querySelectorAll("span.line"));
  if (!lineEls.length) return;

  const byLine = new Map<number, OverlayToken[]>();
  for (const t of tokens) {
    const displayLineIndex = t.fileLine - opts.sliceStartLine + 1; // 1-based
    if (displayLineIndex < 1 || displayLineIndex > lineEls.length) continue;
    const list = byLine.get(displayLineIndex) ?? [];
    list.push(t);
    byLine.set(displayLineIndex, list);
  }

  for (const [displayLineIndex, lineTokens] of byLine.entries()) {
    const lineEl = lineEls[displayLineIndex - 1];
    if (!lineEl || lineEl.classList.contains("non-focus-line")) continue;

    const removed =
      opts.removedIndentByLine?.[displayLineIndex - 1] !== undefined
        ? Math.max(
            0,
            Math.floor(opts.removedIndentByLine![displayLineIndex - 1]!)
          )
        : 0;

    // Right-to-left so earlier offsets remain stable.
    const sorted = [...lineTokens].sort((a, b) => b.startCol - a.startCol);
    for (const t of sorted) {
      const startCol = Math.max(0, t.startCol - removed);
      const endCol = Math.max(startCol, t.endCol - removed);
      wrapTextRangeInLine(lineEl, startCol, endCol, {
        category: t.category,
        symbolId: t.symbolId,
        tooltip: t.tooltip,
        definitionSnippet: t.definitionSnippet,
        definitionLine: t.definitionLine,
        scopeSnippet: t.scopeSnippet,
        scopeLine: t.scopeLine,
        scopeEndLine: t.scopeEndLine,
      });
    }
  }
}
