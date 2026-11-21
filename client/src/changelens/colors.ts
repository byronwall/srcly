// How a chunk is drawn under a lens. The fill comes from a value; the state
// says why there is no value, or what happened to the chunk. A missing value
// is never drawn as 0.

import * as d3 from "d3";
import { metricDef } from "../utils/metricsStore";
import { TREEMAP_NA_BACKGROUND, TREEMAP_RAMP, treemapFillColor } from "../viz/treemap/utils/colors";
import type { LensChunk } from "./types";
import type { ColorMode } from "./urlState";

export interface Lens {
  metric: string;
  color: ColorMode;
}

export type TileState =
  | "value" // a modified chunk with a value on the lens's scale
  | "added"
  | "deleted"
  | "moved"
  | "reverted"
  | "not-measured";

export interface TileLook {
  state: TileState;
  /** A CSS background. */
  fill: string;
  /** The number behind the fill; null when the state has none. */
  value: number | null;
}

/** Added in a delta lens: there is no "before" to subtract from. */
export const ADDED_FILL = "#d3f0de";
export const DELETED_FILL = "repeating-linear-gradient(135deg, rgba(190, 60, 60, 0.42) 0 1px, #fbecec 1px 5px)";
/** Dots on white: work that came and went. It must not read as an empty part of the map. */
export const REVERTED_FILL = "radial-gradient(rgba(100, 116, 139, 0.45) 0.8px, transparent 1.1px) 0 0 / 6px 6px, #fbfcfd";
export const NOT_MEASURED_FILL = TREEMAP_NA_BACKGROUND;

// The delta scale keeps the treemap's meaning: the ramp's pale middle is "no
// change", its warm stops are a rise, and its calm blue is a fall.
const NO_CHANGE = TREEMAP_RAMP[1];
const fell = d3.piecewise(d3.interpolateLab, [NO_CHANGE, TREEMAP_RAMP[0], "#8ec0fb"]);
const rose = d3.piecewise(d3.interpolateLab, [NO_CHANGE, TREEMAP_RAMP[2], TREEMAP_RAMP[3], TREEMAP_RAMP[4]]);

/** The delta at which the scale is full: the metric's "worth a look" stop. */
export const deltaSpan = (metric: string): number => metricDef(metric)?.color_domain?.[1] || 10;

/** Fill for a signed change. The curve keeps a +1 visible without making a +3 look like a +10. */
export function deltaColor(delta: number, span: number): string {
  const t = Math.min(1, Math.abs(delta) / Math.max(span, 1e-9)) ** 0.7;
  return d3.color((delta < 0 ? fell : rose)(t))?.formatHex() ?? NO_CHANGE;
}

export const deltaGradient = (side: "fell" | "rose") =>
  `linear-gradient(90deg, ${d3
    .range(0, 1.0001, 0.2)
    .map((t) => d3.color((side === "fell" ? fell : rose)(side === "fell" ? 1 - t : t))?.formatHex())
    .join(", ")})`;

export function tileLook(chunk: LensChunk, lens: Lens): TileLook {
  if (chunk.status === "deleted") return { state: "deleted", fill: DELETED_FILL, value: null };
  if (chunk.status === "reverted") return { state: "reverted", fill: REVERTED_FILL, value: null };
  const pair = chunk.measured ? chunk.metrics[lens.metric] : undefined;
  if (!pair || pair.after === null) return { state: "not-measured", fill: NOT_MEASURED_FILL, value: null };
  const state: TileState = chunk.status === "added" ? "added" : chunk.status === "moved" ? "moved" : "value";
  if (lens.color === "now") return { state, fill: treemapFillColor(lens.metric, { [lens.metric]: pair.after }, 0), value: pair.after };
  if (chunk.status === "added") return { state, fill: ADDED_FILL, value: null };
  // A chunk that exists at base without a base value has no delta to draw.
  if (pair.before === null) return { state: "not-measured", fill: NOT_MEASURED_FILL, value: null };
  const delta = pair.after - pair.before;
  return { state, fill: deltaColor(delta, deltaSpan(lens.metric)), value: delta };
}

export const STATE_LABEL: Record<Exclude<TileState, "value">, string> = {
  added: "Added",
  deleted: "Deleted",
  moved: "Moved",
  reverted: "Reverted",
  "not-measured": "Not measured",
};

/** The mark in a tile's corner. */
export const STATE_GLYPH: Record<TileState, string> = {
  value: "",
  added: "+",
  deleted: "−",
  moved: "→",
  reverted: "↺",
  "not-measured": "",
};
