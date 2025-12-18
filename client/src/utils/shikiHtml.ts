export function stripShikiPreNewlines(html: string): string {
  // Shiki sometimes emits "\n<span class="line">" inside <pre>. Our CSS expects
  // line spans to be contiguous for correct counter + styling.
  return html.replace(/\n<span class="line">/g, '<span class="line">');
}

export function applyLineNumberCounterReset(
  html: string,
  counterStart: number
): string {
  const safeStart = Math.max(0, Math.floor(counterStart));
  return html.replace(/<code([^>]*)>/, (_match: string, attrs: string) => {
    if (/style=/.test(attrs)) {
      return `<code${attrs.replace(
        /style="([^"]*)"/,
        (_m: string, styleVal: string) =>
          `style="${styleVal}; counter-reset: line ${safeStart};"`
      )}>`;
    }
    return `<code${attrs} style="counter-reset: line ${safeStart};">`;
  });
}

export function markNonFocusLines(
  html: string,
  focusStartIndex: number,
  focusEndIndex: number
): string {
  const start = Math.max(1, Math.floor(focusStartIndex));
  const end = Math.max(start, Math.floor(focusEndIndex));

  let currentLine = 0;
  return html.replace(/<span class="line">/g, (match) => {
    currentLine += 1;
    if (currentLine < start || currentLine > end) {
      return '<span class="line non-focus-line">';
    }
    return match;
  });
}

export function decorateShikiHtmlForRange(
  html: string,
  args: {
    sliceStartLine: number;
    focusStartIndex: number;
    focusEndIndex: number;
  }
): string {
  let next = stripShikiPreNewlines(html);

  const counterStart = Math.max(0, Math.floor(args.sliceStartLine) - 1);
  next = applyLineNumberCounterReset(next, counterStart);
  next = markNonFocusLines(next, args.focusStartIndex, args.focusEndIndex);
  return next;
}


