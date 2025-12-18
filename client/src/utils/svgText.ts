type TextMeasurer = {
  measure: (text: string) => number;
  setFont: (font: string) => void;
};

// We need to truncate SVG labels because SVG text doesn't support CSS ellipsis.
// This uses a shared offscreen canvas for measuring text width and then
// truncates with "…" (or "..." fallback) to fit within a max pixel width.
export function makeTextMeasurer(): TextMeasurer {
  // In SSR / no-DOM cases, fall back to a naive estimator.
  if (typeof document === "undefined") {
    return {
      measure: (text: string) => text.length * 6,
      setFont: (_font: string) => {},
    };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  return {
    measure: (text: string) =>
      ctx ? ctx.measureText(text).width : text.length * 6,
    setFont: (font: string) => {
      if (ctx) ctx.font = font;
    },
  };
}

const ELLIPSIS = "…";

export const truncateTextToWidth = (() => {
  const measurer = makeTextMeasurer();
  const cache = new Map<string, string>();

  return (text: string, maxWidthPx: number, font: string) => {
    const maxWidth = Number.isFinite(maxWidthPx) ? maxWidthPx : 0;
    if (!text || maxWidth <= 0) return "";

    const cacheKey = `${font}::${maxWidth}::${text}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    measurer.setFont(font);

    // Fast path: already fits
    if (measurer.measure(text) <= maxWidth) {
      cache.set(cacheKey, text);
      return text;
    }

    // Ensure even the ellipsis fits; otherwise return empty.
    const ellipsis = measurer.measure(ELLIPSIS) <= maxWidth ? ELLIPSIS : "...";
    const ellipsisWidth = measurer.measure(ellipsis);
    if (ellipsisWidth > maxWidth) {
      cache.set(cacheKey, "");
      return "";
    }

    // Binary search for the longest prefix that fits when suffixed with ellipsis.
    let lo = 0;
    let hi = text.length;
    let best = "";
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const candidate = text.slice(0, mid);
      const w = measurer.measure(candidate) + ellipsisWidth;
      if (w <= maxWidth) {
        best = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const result = best.length > 0 ? `${best}${ellipsis}` : ellipsis;
    cache.set(cacheKey, result);
    return result;
  };
})();
