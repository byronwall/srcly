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
const EXTENSION = /\.[a-z0-9]+$/i;

/**
 * Wrap a name onto at most `maxLines` lines, breaking only at camelCase humps
 * and after `/ _ -`, never inside a word. Whatever doesn't fit is cut with an
 * ellipsis. A file name that needs a second line drops its extension first
 * (the glyph says it's a file).
 */
export function wrapName(text: string, width: number, font: string, maxLines: number): string[] {
  const fits = (t: string) => measureText(t, font) <= width;
  if (fits(text)) return [text];
  const bare = text.replace(EXTENSION, "");
  if (maxLines <= 1) return [truncateTextToWidth(bare, width, font)];
  if (bare !== text) return wrapName(bare, width, font, maxLines);
  const tokens = text.split(BREAK_AFTER);
  const lines: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < tokens.length && lines.length < maxLines - 1; i++) {
    if (fits(cur + tokens[i])) {
      cur += tokens[i];
    } else if (cur) {
      lines.push(cur);
      cur = tokens[i];
    } else {
      break; // one word wider than the box: it gets the ellipsis below
    }
  }
  const rest = cur + tokens.slice(i).join("");
  if (rest) lines.push(truncateTextToWidth(rest, width, font));
  return lines.slice(0, maxLines);
}

/** The whole name is shown (an extension may be dropped). */
export function showsWhole(text: string, lines: string[]): boolean {
  const shown = lines.join("");
  return shown === text || shown === text.replace(EXTENSION, "");
}

/** Box text is never drawn smaller than this share of `ink` to fit names. */
export const MIN_INK_SHARE = 0.72;
/** Name size at ink 1, its line pitch, and the stats line's size and pitch. */
export const NAME_PX = 12.5;
const NAME_LINE = 1.14;
export const STATS_PX = 11;
const STATS_LINE = 1.3;

export interface CompactBox {
  label: string;
  /** Text room at ink 1 and how much of it the icon/hub columns take per unit ink. */
  width: number;
  fixedInset: number;
  inkInset: number;
  /** Height available to text. */
  height: number;
  /** It has a stats line (badges or LOC) to show when there is room. */
  hasStats: boolean;
}

export interface CompactText {
  lines: string[];
  stats: boolean;
  px: number;
  lineH: number;
  statsPx: number;
  statsH: number;
}

/** Lay out a box's name (and stats line, if the whole name still fits with it) at text scale `k`. */
export function compactText(box: CompactBox, k: number): CompactText {
  const px = NAME_PX * k;
  const lineH = px * NAME_LINE;
  const statsPx = STATS_PX * k;
  const statsH = statsPx * STATS_LINE;
  const width = box.width - box.fixedInset - box.inkInset * k;
  const font = labelFont(px);
  const linesIn = (h: number) => Math.max(1, Math.floor(h / lineH));
  if (box.hasStats && box.height - statsH >= lineH) {
    const lines = wrapName(box.label, width, font, linesIn(box.height - statsH));
    if (showsWhole(box.label, lines)) return { lines, stats: true, px, lineH, statsPx, statsH };
  }
  return { lines: wrapName(box.label, width, font, linesIn(box.height)), stats: false, px, lineH, statsPx, statsH };
}

/**
 * One text scale for every box in the view, so names read as one system:
 * the largest in [ink × MIN_INK_SHARE, ink] (never below 1) at which every
 * name fits whole with its stats line, else the largest at which every name
 * fits whole, else the floor.
 */
export function viewInk(boxes: CompactBox[], ink: number): number {
  const floor = Math.max(1, Math.round(ink * MIN_INK_SHARE * 10) / 10);
  const steps: number[] = [];
  for (let k = ink; k >= floor - 1e-9; k = Math.round((k - 0.1) * 10) / 10) steps.push(k);
  if (steps.length === 0) return ink;
  const allFit = (k: number, withStats: boolean) =>
    boxes.every((b) => {
      const t = compactText(b, k);
      return showsWhole(b.label, t.lines) && (!withStats || !b.hasStats || t.stats);
    });
  return steps.find((k) => allFit(k, true)) ?? steps.find((k) => allFit(k, false)) ?? steps[steps.length - 1];
}
