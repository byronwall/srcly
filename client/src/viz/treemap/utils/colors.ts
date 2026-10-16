import * as d3 from "d3";
import { getContrastingTextColor } from "../../../utils/color";
import { metricDef } from "../../../utils/metricsStore";

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

/** The catalog's [fine, midpoint, needs attention] stops; complexity's for unknown ids. */
const domainOf = (metricId: MetricId): [number, number, number] => metricDef(metricId)?.color_domain ?? [0, 10, 50];

/**
 * Folder totals for sums like LOC and bytes would outgrow any file scale, so
 * those (`color_per_file` in the catalog) color a folder by its average per
 * file instead: "how big are files here".
 */
function scaleValue(metricId: MetricId, metrics: Metrics): number {
  const value = Number(metrics?.[metricId] ?? 0);
  const fileCount = Number(metrics?.file_count ?? 0);
  return metricDef(metricId)?.color_per_file && fileCount > 1 ? value / fileCount : value;
}

/** Nested scopes brighten a touch per level, enough to read nesting without washing out. */
export const DEPTH_BRIGHTEN_PER_LEVEL = 0.05;

export function applyDepthEffect(color: string, depth: number): string {
  const c = d3.color(color);
  if (!c) return color;
  return c.brighter(depth * DEPTH_BRIGHTEN_PER_LEVEL).formatHex();
}

const rampPosition = (domain: [number, number, number]) =>
  d3.scaleLinear().domain(domain).range([0, 0.5, 1]).clamp(true);

/**
 * Where a value sits on the attention ramp (0 fine … 1 needs attention), by
 * the same rules as `treemapFillColor`, for bars that echo the fill.
 */
export function treemapRampPosition(metricId: MetricId, metrics: Metrics): number {
  const value = scaleValue(metricId, metrics);
  return rampPosition(domainOf(metricId))(Number.isFinite(value) && value > 0 ? value : 0);
}

/** Ramp color for a node's value under the metric's catalog domain. */
function metricColor(metricId: MetricId, metrics: Metrics): string {
  return rampColor(treemapRampPosition(metricId, metrics));
}

/** Fill color used by Treemap rectangles: the catalog domain, hatched gray for N/A. */
export function treemapFillColor(
  metricId: MetricId,
  metrics: Metrics,
  relativeDepth: number
): string {
  if (metricIsNA(metricId, metrics)) return TREEMAP_NA_COLOR;
  return applyDepthEffect(metricColor(metricId, metrics), relativeDepth);
}

/** Background color used when computing label contrast (the same as the fill). */
export function treemapLabelBackground(
  metricId: MetricId,
  metrics: Metrics,
  relativeDepth: number
): string {
  return treemapFillColor(metricId, metrics, relativeDepth);
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
