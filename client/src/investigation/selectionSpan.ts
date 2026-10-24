// Code-viewer DOM positions → source spans the engine reads: 1-based line,
// 1-based UTF-16 column, exclusive end (plan section 3.5). The viewer may
// strip a common indent from every line (`reduceCommonIndent`), which only
// ever removes leading whitespace, so a displayed line is always a suffix of
// its raw line and the removed width is the difference in length.

export type SourceSpan = { startLine: number; startColumn: number; endLine: number; endColumn: number };

/** The raw column (1-based) of a caret at `offset` in a displayed line; null when the line does not match the source. */
export function caretColumn(rawLine: string, displayedLine: string, offset: number): number | null {
  const shown = displayedLine.replace(/\n$/, "");
  if (!rawLine.endsWith(shown.trimStart()) || offset < 0 || offset > shown.length) return null;
  const removed = rawLine.length - shown.length;
  if (removed < 0) return null;
  return removed + offset + 1;
}

/** A zero-width span at a caret: the engine offers the expressions that cover it. */
export function caretSpan(line: number, column: number): SourceSpan {
  return { startLine: line, startColumn: column, endLine: line, endColumn: column };
}

/** The caret under a point inside a rendered `span.line`, as its UTF-16 offset in that line's text. */
export function caretOffsetIn(lineEl: HTMLElement, x: number, y: number): number | null {
  const doc = lineEl.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) {
    node = position.offsetNode;
    offset = position.offset;
  } else {
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || !lineEl.contains(node)) return null;
  const before = doc.createRange();
  before.setStart(lineEl, 0);
  before.setEnd(node, offset);
  return before.toString().length;
}
