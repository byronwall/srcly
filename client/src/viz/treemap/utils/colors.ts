import * as d3 from "d3";
import { HOTSPOT_METRICS } from "../../../utils/metricsStore";
import { getContrastingTextColor } from "../../../utils/color";

export type MetricId = string;
export type Metrics = Record<string, any>;

/**
 * One sequential "attention" ramp for every metric: calm blue (fine) through
 * amber to red (look here). Metrics differ only in where the stops sit, so a
 * color means the same thing whichever metric drives the treemap.
 *
 * Interpolated in Lab so steps look even. The pale middle stop keeps the
 * blue → amber leg from passing through gray (Lab) or green (HCL).
 */
export const TREEMAP_RAMP = ["#bfdbfe", "#e9eef3", "#fcd34d", "#fb923c", "#f87171"] as const;

/**
 * Fill for a tile whose color metric is N/A (doesn't apply, skipped or
 * failed). Neutral and off the ramp, and drawn hatched on the canvas, so it
 * never reads as "fine" the way a measured 0 does.
 */
export const TREEMAP_NA_COLOR = "#f4f4f5";
export const TREEMAP_NA_HATCH = "rgba(113, 113, 122, 0.35)";
/** CSS hatch matching the canvas one, for legends and swatches. */
export const TREEMAP_NA_BACKGROUND = `repeating-linear-gradient(135deg, ${TREEMAP_NA_HATCH} 0 1px, ${TREEMAP_NA_COLOR} 1px 4px)`;

/** True when the node has no value for the metric (N/A), as opposed to a measured 0. */
export function metricIsNA(metricId: MetricId, metrics: Metrics | undefined): boolean {
  const value = metrics?.[metricId];
  return value === null || value === undefined;
}

const interpolateRamp = d3.piecewise(d3.interpolateLab, [...TREEMAP_RAMP]);

/** Ramp color at `t` in [0, 1]; 0.5 is the amber midpoint. */
export function rampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return d3.color(interpolateRamp(clamped))?.formatHex() ?? TREEMAP_RAMP[0];
}

/** CSS gradient sampled from the same interpolation, for legends. */
export const TREEMAP_GRADIENT = `linear-gradient(90deg, ${d3
  .range(0, 1.0001, 0.125)
  .map(rampColor)
  .join(", ")})`;

/** A metric's scale: `domain` is [fine, midpoint, needs attention]. */
export const ramp = (domain: [number, number, number]) => {
  const t = d3.scaleLinear().domain(domain).range([0, 0.5, 1]).clamp(true);
  return (value: number) => rampColor(t(value));
};

const complexityColor = ramp([0, 10, 50]);

/**
 * Metrics whose useful range is nowhere near the default 0–50 complexity
 * scale. These ignore `invert`; the domain already says which end is bad.
 */
const METRIC_SCALES: Record<string, (value: number) => string> = {
  // Inverted: little or no commenting is what deserves attention.
  comment_density: ramp([0.5, 0.2, 0]),
  max_nesting_depth: ramp([0, 3, 8]),
  todo_count: ramp([0, 1, 5]),
  // A 200-line file or function is worth a look; 800 lines wants splitting.
  loc: ramp([0, 200, 800]),
  // Bytes. About 50 bytes per line, so this tracks the LOC stops.
  file_size: ramp([0, 10_000, 40_000]),
  // Characters of JSX text per file.
  tsx_hardcoded_string_volume: ramp([0, 500, 2000]),
  // JSX attributes per file.
  tsx_prop_count: ramp([0, 50, 200]),
};

/**
 * Folder totals for these are sums, so a folder would outgrow any file scale.
 * Color a folder by its average per file instead: "how big are files here".
 */
const PER_FILE_METRICS = new Set(["loc", "file_size"]);

function scaleValue(metricId: MetricId, metrics: Metrics): number {
  const value = Number(metrics?.[metricId] ?? 0);
  const fileCount = Number(metrics?.file_count ?? 0);
  return PER_FILE_METRICS.has(metricId) && fileCount > 1 ? value / fileCount : value;
}

/** Nested scopes brighten a touch per level, enough to read nesting without washing out. */
export const DEPTH_BRIGHTEN_PER_LEVEL = 0.05;

export function applyDepthEffect(color: string, depth: number): string {
  const c = d3.color(color);
  if (!c) return color;
  return c.brighter(depth * DEPTH_BRIGHTEN_PER_LEVEL).formatHex();
}

function metricColorFromScales(
  metricId: MetricId,
  metrics: Metrics,
  fallbackValue: number
): string {
  const scale = METRIC_SCALES[metricId];
  if (scale) return scale(scaleValue(metricId, metrics));
  return complexityColor(fallbackValue);
}

const rampPosition = (domain: [number, number, number]) =>
  d3.scaleLinear().domain(domain).range([0, 0.5, 1]).clamp(true);

/**
 * Where a value sits on the attention ramp (0 fine … 1 needs attention), by
 * the same rules as `treemapFillColor`, for bars that echo the fill.
 */
export function treemapRampPosition(metricId: MetricId, metrics: Metrics): number {
  const v = (id: string) => Number(metrics?.[id] ?? 0);
  if (metricId === "comment_density") return rampPosition([0.5, 0.2, 0])(v(metricId));
  if (metricId === "max_nesting_depth") return rampPosition([0, 3, 8])(v(metricId));
  if (metricId === "todo_count") return rampPosition([0, 1, 5])(v(metricId));
  let raw = v(metricId);
  if (HOTSPOT_METRICS.find((m) => m.id === metricId)?.invert) raw = 1 - (raw || 0);
  if (!Number.isFinite(raw) || raw < 0) raw = 0;
  return rampPosition([0, 10, 50])(Math.min(raw, 50));
}

/**
 * Fill color used by Treemap rectangles.
 *
 * Note: This preserves the current Treemap behavior:
 * - Inversion only affects the *default* (complexity-like) metric path.
 * - Metrics in METRIC_SCALES use their own domain and ignore invert.
 * - Default path clamps to 50.
 */
export function treemapFillColor(
  metricId: MetricId,
  metrics: Metrics,
  relativeDepth: number
): string {
  if (metricIsNA(metricId, metrics)) return TREEMAP_NA_COLOR;
  let rawVal = Number(metrics?.[metricId] ?? 0);

  const def = HOTSPOT_METRICS.find((m) => m.id === metricId);
  if (def?.invert) rawVal = 1 - (rawVal || 0);

  if (!Number.isFinite(rawVal) || rawVal < 0) rawVal = 0;
  const scaled = Math.min(rawVal, 50);

  const base = metricColorFromScales(metricId, metrics, scaled);
  return applyDepthEffect(base, relativeDepth);
}

/**
 * Background color used when computing label contrast.
 *
 * Note: This preserves the current Treemap behavior where text color uses the raw metric
 * value (not clamped, and no invert for the default path).
 */
export function treemapLabelBackground(
  metricId: MetricId,
  metrics: Metrics,
  relativeDepth: number
): string {
  if (metricIsNA(metricId, metrics)) return TREEMAP_NA_COLOR;
  const raw = Number(metrics?.[metricId] ?? 0) || 0;
  const base = metricColorFromScales(metricId, metrics, raw);
  return applyDepthEffect(base, relativeDepth);
}

export function treemapLabelColor(
  metricId: MetricId,
  metrics: Metrics,
  relativeDepth: number,
  alpha = 1
): string {
  const bg = treemapLabelBackground(metricId, metrics, relativeDepth);
  return getContrastingTextColor(bg, alpha);
}
