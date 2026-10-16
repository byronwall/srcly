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
// Inverted: little or no commenting is what deserves attention.
const commentDensityColor = ramp([0.5, 0.2, 0]);
const nestingDepthColor = ramp([0, 3, 8]);
const todoCountColor = ramp([0, 1, 5]);

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
  if (metricId === "comment_density") {
    return commentDensityColor(Number(metrics?.comment_density ?? 0));
  }
  if (metricId === "max_nesting_depth") {
    return nestingDepthColor(Number(metrics?.max_nesting_depth ?? 0));
  }
  if (metricId === "todo_count") {
    return todoCountColor(Number(metrics?.todo_count ?? 0));
  }
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
 * - Special scales (comment_density/max_nesting_depth/todo_count) ignore invert.
 * - Default path clamps to 50.
 */
export function treemapFillColor(
  metricId: MetricId,
  metrics: Metrics,
  relativeDepth: number
): string {
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
