import { makeTextMeasurer, truncateTextToWidth } from "../../utils/svgText";

// Box text for the dependency canvas when zoomed out.

const measurer = makeTextMeasurer();
function measureText(text: string, font: string): number {
  measurer.setFont(font);
  return measurer.measure(text);
}

/**
 * Semantic zoom. At or above this zoom boxes show all four rows; below it,
 * text is drawn larger by `ink` (≈ 1 / zoom) so it stays about the same size
 * on screen, and rows drop out — name first, then a stats line — as room
 * runs out. Detail the box can't fit stays in its hover card.
 */
export const FULL_DETAIL_ZOOM = 0.95;
/** Text stops growing past this (zoomed out below ~0.45 it shrinks again). */
export const MAX_INK = 2.2;
/** `ink` for a zoom, in steps of 0.1 so text re-renders only at a few zoom levels. */
export function inkForZoom(k: number): number {
  if (k >= FULL_DETAIL_ZOOM) return 1;
  return Math.round(Math.min(MAX_INK, 1 / k) * 10) / 10;
}
export const labelFont = (px: number) => `600 ${px}px Inter, ui-sans-serif, system-ui, sans-serif`;
const BREAK_AFTER = /(?<=[a-z0-9])(?=[A-Z])|(?<=[/_\-])/;

/**
 * Wrap a name onto at most `maxLines` lines, breaking at camelCase humps and
 * after `/ _ -`; the last line is cut with an ellipsis. A file name that
 * needs a second line drops its extension first (the glyph says it's a file).
 */
export function wrapName(text: string, width: number, font: string, maxLines: number): string[] {
  const fits = (t: string) => measureText(t, font) <= width;
  if (fits(text)) return [text];
  const bare = text.replace(/\.[a-z0-9]+$/i, "");
  if (maxLines <= 1) return [truncateTextToWidth(bare, width, font)];
  if (bare !== text) return wrapName(bare, width, font, maxLines);
  const tokens = text.split(BREAK_AFTER);
  const lines: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < tokens.length && lines.length < maxLines - 1; i++) {
    const next = cur + tokens[i];
    if (fits(next)) {
      cur = next;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = "";
      i--;
      continue;
    }
    // One token wider than the box: break it where it overflows.
    let cut = tokens[i].length - 1;
    while (cut > 1 && !fits(tokens[i].slice(0, cut))) cut--;
    lines.push(tokens[i].slice(0, cut));
    tokens[i] = tokens[i].slice(cut);
    i--;
  }
  const rest = cur + tokens.slice(i).join("");
  if (rest) lines.push(truncateTextToWidth(rest, width, font));
  return lines;
}

/** Box text is never drawn smaller than this share of `ink` to fit a whole name. */
export const MIN_INK_SHARE = 0.72;

/**
 * The largest text scale in [ink × MIN_INK_SHARE, ink] (never below 1) at
 * which the whole name fits in the box, wrapped. When none does, the
 * smallest, which shows the most of it.
 */
export function fitName(
  text: string,
  ink: number,
  room: (k: number) => { width: number; height: number },
  pxAt1: number,
  lineHeight = 1.18,
): { k: number; lines: string[] } {
  const bare = text.replace(/\.[a-z0-9]+$/i, "");
  let best = { k: ink, lines: [text] };
  for (let k = ink; k >= Math.max(1, ink * MIN_INK_SHARE) - 1e-9; k = Math.round((k - 0.1) * 10) / 10) {
    const px = pxAt1 * k;
    const r = room(k);
    const lines = wrapName(text, r.width, labelFont(px), Math.max(1, Math.floor(r.height / (px * lineHeight))));
    best = { k, lines };
    const shown = lines.join("");
    if (shown === text || shown === bare) return best;
  }
  return best;
}
