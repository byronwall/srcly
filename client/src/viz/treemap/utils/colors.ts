import * as d3 from "d3";
import { HOTSPOT_METRICS } from "../../../utils/metricsStore";
import { getContrastingTextColor } from "../../../utils/color";

export type MetricId = string;
export type Metrics = Record<string, any>;

/**
 * One sequential "attention" ramp for every metric: calm blue (fine) through
 * amber to rose (look here). Metrics differ only in where the stops sit, so a
 * color means the same thing whichever metric drives the treemap. Exported
 * so the legend renders the exact same stops.
 */
export const TREEMAP_RAMP = ["#dbeafe", "#fde68a", "#fecaca"] as const;

const ramp = (domain: [number, number, number]) =>
  d3.scaleLinear<string>().domain(domain).range(TREEMAP_RAMP).clamp(true);

const complexityColor = ramp([0, 10, 50]);
// Inverted: little or no commenting is what deserves attention.
const commentDensityColor = ramp([0.5, 0.2, 0]);
const nestingDepthColor = ramp([0, 3, 8]);
const todoCountColor = ramp([0, 1, 5]);

export function applyDepthEffect(color: string, depth: number): string {
  // We want deeper nodes to be lighter/brighter to simulate being "higher".
  // Using a small factor per depth level.
  const c = d3.color(color);
  if (!c) return color;
  return c.brighter(depth * 0.15).formatHex();
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
