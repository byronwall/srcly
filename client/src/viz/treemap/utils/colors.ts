import * as d3 from "d3";
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
 * scale: [fine, midpoint, needs attention].
 */
const METRIC_DOMAINS: Record<string, [number, number, number]> = {
  max_nesting_depth: [0, 3, 8],
  todo_count: [0, 1, 5],
  // Flags: one is worth a look, five is a pattern.
  comment_noise: [0, 1, 5],
  comment_noise_ratio: [0, 1, 5],
  comment_noise_docblock: [0, 1, 5],
  comment_noise_commented_code: [0, 1, 5],
  // A 200-line file or function is worth a look; 800 lines wants splitting.
  loc: [0, 200, 800],
  // Bytes. About 50 bytes per line, so this tracks the LOC stops.
  file_size: [0, 10_000, 40_000],
  // Per component. A component past ~150 lines, 5 hooks or 2 effects is
  // doing more than rendering.
  component_loc: [0, 150, 400],
  component_hook_count: [0, 5, 15],
  component_effect_count: [0, 2, 6],
  component_jsx_depth: [0, 6, 12],
  component_prop_count: [0, 8, 20],
  component_inline_handler_count: [0, 5, 15],
  component_jsx_conditional_count: [0, 5, 15],
};

const METRIC_SCALES: Record<string, (value: number) => string> = Object.fromEntries(
  Object.entries(METRIC_DOMAINS).map(([id, domain]) => [id, ramp(domain)])
);

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
  const domain = METRIC_DOMAINS[metricId];
  if (domain) return rampPosition(domain)(scaleValue(metricId, metrics));
  let raw = Number(metrics?.[metricId] ?? 0);
  if (!Number.isFinite(raw) || raw < 0) raw = 0;
  return rampPosition([0, 10, 50])(Math.min(raw, 50));
}

/**
 * Fill color used by Treemap rectangles.
 *
 * Metrics in METRIC_DOMAINS use their own domain; the rest use the
 * complexity scale, clamped to 50.
 */
export function treemapFillColor(
  metricId: MetricId,
  metrics: Metrics,
  relativeDepth: number
): string {
  if (metricIsNA(metricId, metrics)) return TREEMAP_NA_COLOR;
  let rawVal = Number(metrics?.[metricId] ?? 0);
  if (!Number.isFinite(rawVal) || rawVal < 0) rawVal = 0;
  const scaled = Math.min(rawVal, 50);

  const base = metricColorFromScales(metricId, metrics, scaled);
  return applyDepthEffect(base, relativeDepth);
}

/**
 * Background color used when computing label contrast.
 *
 * Note: This preserves the current Treemap behavior where text color uses the raw metric
 * value (not clamped).
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
