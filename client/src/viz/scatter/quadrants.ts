/**
 * Named 2x2 presets: the client half of `server/app/services/quadrants.py`.
 *
 * The catalog serves the presets (axes, absolute cut-offs, quadrant names).
 * This module turns a scan tree into points for one preset and cohort,
 * assigns quadrants for the current (possibly dragged) cut-offs, and maps
 * values onto the plot. Pure, so the rules are unit-tested.
 */

export type QuadrantId = "high_both" | "high_x" | "high_y" | "low_both";
export const QUADRANT_IDS: QuadrantId[] = ["high_both", "high_x", "high_y", "low_both"];

export type ScatterCohort = "file" | "function" | "component";

export type QuadrantAxis = {
  /** A catalog metric id, or a derived axis ("fan_in", "comment_ratio"). */
  id: string;
  derived: boolean;
  label: string;
  unit: string;
  unit_one: string;
  description: string;
  cutoff: number;
  scale: "log" | "linear";
};

export type QuadrantPreset = {
  id: string;
  label: string;
  description: string;
  x: QuadrantAxis;
  y: QuadrantAxis;
  cohorts: ScatterCohort[];
  /** Why other cohorts are off ("Commits are counted per file"). */
  cohort_note: string;
  /** In QUADRANT_IDS order: both high, high x only, high y only, both low. */
  quadrants: { id: QuadrantId; name: string; description: string }[];
};

export type ScatterNode = {
  name: string;
  type: string;
  kind?: string | null;
  path: string;
  start_line?: number;
  end_line?: number;
  metrics?: Record<string, unknown>;
  children?: ScatterNode[];
};

export type ScatterPoint<T extends ScatterNode = ScatterNode> = { node: T; x: number; y: number };

/** At or above a cut-off counts as high. */
export function assignQuadrant(x: number, y: number, cutX: number, cutY: number): QuadrantId {
  const highX = x >= cutX;
  const highY = y >= cutY;
  if (highX && highY) return "high_both";
  if (highX) return "high_x";
  if (highY) return "high_y";
  return "low_both";
}

function finite(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Comment lines per code line; null without both, or with no code lines. */
export function commentRatio(node: ScatterNode): number | null {
  const comments = finite(node.metrics?.comment_lines);
  const loc = finite(node.metrics?.loc);
  return comments === null || !loc ? null : comments / loc;
}

/** The node's value on `axis`; null is N/A. `fanIn` maps absolute file paths to importer counts. */
export function axisValue(axis: QuadrantAxis, node: ScatterNode, fanIn: Map<string, number> | null): number | null {
  if (axis.id === "comment_ratio") return commentRatio(node);
  if (axis.id === "fan_in") {
    if (!fanIn || node.type !== "file") return null;
    return fanIn.get(node.path) ?? null;
  }
  return finite(node.metrics?.[axis.id]);
}

export function cohortOf<T extends ScatterNode>(root: T, cohort: ScatterCohort): T[] {
  const out: T[] = [];
  const stack: T[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (cohort === "file" ? node.type === "file"
      : cohort === "function" ? node.type === "function" && node.kind === "function"
      : node.type === "function" && finite(node.metrics?.component_loc) !== null) {
      out.push(node);
    }
    for (const child of (node.children ?? []) as T[]) stack.push(child);
  }
  return out;
}

/** Points with both values, and how many nodes in the cohort lack one (N/A, not plotted). */
export function buildPoints<T extends ScatterNode>(
  root: T,
  preset: QuadrantPreset,
  cohort: ScatterCohort,
  fanIn: Map<string, number> | null
): { points: ScatterPoint<T>[]; na: number } {
  const points: ScatterPoint<T>[] = [];
  let na = 0;
  for (const node of cohortOf(root, cohort)) {
    const x = axisValue(preset.x, node, fanIn);
    const y = axisValue(preset.y, node, fanIn);
    if (x === null || y === null) na++;
    else points.push({ node, x, y });
  }
  return { points, na };
}

/** Points per quadrant, each worst first: furthest past both cut-offs, then by path. */
export function groupByQuadrant<T extends ScatterNode>(
  points: ScatterPoint<T>[],
  cutX: number,
  cutY: number
): Record<QuadrantId, ScatterPoint<T>[]> {
  const out: Record<QuadrantId, ScatterPoint<T>[]> = { high_both: [], high_x: [], high_y: [], low_both: [] };
  for (const p of points) out[assignQuadrant(p.x, p.y, cutX, cutY)].push(p);
  const ratio = (v: number, cut: number) => (cut > 0 ? v / cut : v);
  const reach = (p: ScatterPoint<T>) => ratio(p.x, cutX) + ratio(p.y, cutY);
  for (const id of QUADRANT_IDS) {
    out[id].sort((a, b) => reach(b) - reach(a) || a.node.path.localeCompare(b.node.path) || (a.node.start_line ?? 0) - (b.node.start_line ?? 0));
  }
  return out;
}

/**
 * Why a preset has nothing to plot: the data source is missing, not just a
 * few N/A nodes. Empty string when there are points.
 */
export function unavailableReason(
  preset: QuadrantPreset,
  plotted: number,
  context: {
    activity?: { status: string; reason: string } | null;
    findings?: { status: string; reason: string } | null;
    fanIn: Map<string, number> | null;
    fanInLoading?: boolean;
  }
): string {
  if (plotted) return "";
  const axes = [preset.x.id, preset.y.id];
  if (axes.includes("commit_count") && context.activity?.status === "na") return `No Git history: ${context.activity.reason}`;
  if (axes.includes("finding_count") && context.findings && context.findings.status !== "ok") {
    return context.findings.status === "running" ? "Checks are still running" : `No checks: ${context.findings.reason}`;
  }
  if (axes.includes("fan_in")) {
    if (context.fanInLoading) return "";
    if (!context.fanIn || context.fanIn.size === 0) return "No import graph: needs TS/TSX or Python files";
  }
  if (preset.cohorts.length === 1 && preset.cohorts[0] === "component") return "No TSX components: needs React/Solid function components";
  return "Nothing here has both values";
}

// --- Plot scales ----------------------------------------------------------------

/**
 * Axis transform. "log" is log10(1 + v): skewed counts spread out, and a
 * measured 0 still has a place on the axis.
 */
export function forward(scale: "log" | "linear", v: number): number {
  return scale === "log" ? Math.log10(1 + Math.max(0, v)) : v;
}

export function inverse(scale: "log" | "linear", t: number): number {
  return scale === "log" ? Math.max(0, 10 ** t - 1) : t;
}

/** Top of an axis: past the largest value and the cut-off, so the cut-off line always shows. */
export function axisMax(values: number[], cutoff: number): number {
  let max = cutoff * 2;
  for (const v of values) if (v > max) max = v;
  return max;
}

/** Ticks at 1-2-5 steps in value space, for a log axis up to `max`. */
export function logTicks(max: number): number[] {
  const out = [0];
  for (let decade = 1; decade <= max * 10; decade *= 10) {
    for (const step of [1, 2, 5]) {
      const v = step * decade;
      if (v <= max) out.push(v);
    }
  }
  return out;
}

/**
 * A dragged cut-off, rounded so its label reads cleanly: whole numbers for
 * count axes, two decimals for ratios.
 */
export function snapCutoff(axis: QuadrantAxis, raw: number): number {
  if (axis.scale === "linear" && axis.id === "comment_ratio") return Math.max(0.01, Math.round(raw * 100) / 100);
  return Math.max(1, Math.round(raw));
}

export function formatAxisValue(axis: QuadrantAxis, v: number): string {
  if (axis.id === "comment_ratio") return v.toFixed(2);
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(1);
}
