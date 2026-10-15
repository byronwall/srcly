import { createSignal } from "solid-js";
import * as d3 from "d3";
import { formatMetricValue, HOTSPOT_METRICS, type HotSpotMetricId } from "../../../utils/metricsStore";

export type TooltipLine = {
  label: string;
  value: string;
};

/** A child listed in the tooltip: a file's scopes, or a folder's entries. */
export type TooltipChild = {
  name: string;
  loc: number;
};

export type TooltipContent = {
  title: string;
  /** Kind and extent, e.g. "file · 12 scopes" or "function · L10–40". */
  subtitle: string;
  lines: TooltipLine[];
  childrenLabel: string;
  children: TooltipChild[];
  /** Children not listed. */
  moreChildren: number;
};

export type TreemapTooltipModel =
  | { visible: false }
  | ({ visible: true; x: number; y: number } & TooltipContent);

export const TOOLTIP_CHILD_LIMIT = 5;

// Files whose analyzer timed out or failed, or that are over the size cap, stay
// in the tree with a plain line count; say so, since their other metrics are
// zero rather than measured.
export function notAnalyzedLines(metrics: any): TooltipLine[] {
  const status = metrics?.analysis_status;
  if (status === "too_large") {
    const mb = Number(metrics?.file_size ?? 0) / 1e6;
    return [{ label: "Not analyzed", value: `too large (${mb.toFixed(1)} MB); LOC is a line count` }];
  }
  if (status && status !== "ok") {
    return [{ label: "Not analyzed", value: `${status}; LOC is a line count` }];
  }
  const failed = Number(metrics?.analysis_failed_count ?? 0);
  if (failed <= 0) return [];
  return [{ label: "Not analyzed", value: `${failed} file${failed === 1 ? "" : "s"}` }];
}

const isSynthetic = (n: d3.HierarchyNode<any>) =>
  n.data?.type === "function_body" || n.data?.name === "(body)" || n.data?.name === "(imports)";

/** The biggest direct children by LOC: what's actually inside this tile. */
export function topChildren(
  d: d3.HierarchyNode<any>,
  limit = TOOLTIP_CHILD_LIMIT
): { children: TooltipChild[]; more: number } {
  const all = (d.children ?? [])
    .filter((c) => !isSynthetic(c))
    .map((c) => ({ name: String(c.data?.name ?? ""), loc: c.value ?? Number(c.data?.metrics?.loc ?? 0) }))
    .filter((c) => c.loc > 0)
    .sort((a, b) => b.loc - a.loc);
  return { children: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

const STANDARD_METRICS = new Set([
  "loc",
  "complexity",
  "complexity_avg",
  "comment_density",
  "max_nesting_depth",
  "todo_count",
]);

const fmt = (n: number) => n.toLocaleString("en-US");

export function buildTooltipContent(d: d3.HierarchyNode<any>, primaryMetricId: HotSpotMetricId): TooltipContent {
  const title = String(d.data?.name ?? "");
  const type = String(d.data?.type ?? "");
  const metrics = d.data?.metrics ?? {};
  const { children, more } = topChildren(d);

  if (type === "folder") {
    const descendants = d.descendants();
    const folders = descendants.filter((n) => n.data?.type === "folder" && n !== d).length;
    const files = descendants.filter((n) => n.data?.type === "file").length;
    return {
      title,
      subtitle: `folder · ${fmt(files)} file${files === 1 ? "" : "s"}${folders ? ` in ${fmt(folders)} folder${folders === 1 ? "" : "s"}` : ""}`,
      lines: [{ label: "LOC", value: fmt(d.value ?? 0) }, ...notAnalyzedLines(metrics)],
      childrenLabel: "Largest",
      children,
      moreChildren: more,
    };
  }

  const start = Number(d.data?.start_line ?? 0);
  const end = Number(d.data?.end_line ?? 0);
  const scopeCount = (d.children ?? []).filter((c) => !isSynthetic(c)).length;
  const subtitle =
    type === "file"
      ? `file${scopeCount ? ` · ${fmt(scopeCount)} scope${scopeCount === 1 ? "" : "s"}` : ""}`
      : `${type || "scope"}${start > 0 && end >= start ? ` · L${start}–${end}` : ""}`;

  const lines: TooltipLine[] = [
    { label: "LOC", value: fmt(d.value ?? 0) },
    { label: "Max CCN", value: formatMetricValue("complexity", Number(metrics.complexity ?? 0)) },
  ];
  if (metrics.complexity_avg) lines.push({ label: "Avg CCN", value: Number(metrics.complexity_avg).toFixed(1) });
  lines.push(
    { label: "Comments", value: formatMetricValue("comment_density", Number(metrics.comment_density ?? 0)) },
    { label: "Nesting", value: String(metrics.max_nesting_depth ?? 0) }
  );
  if (Number(metrics.todo_count ?? 0) > 0) lines.push({ label: "TODOs", value: String(metrics.todo_count) });
  // A connectivity hint: how much this file pulls in.
  const imports = Number(metrics.ts_import_coupling_count || metrics.python_import_count || 0);
  if (type === "file" && imports > 0) lines.push({ label: "Imports", value: fmt(imports) });
  if (!STANDARD_METRICS.has(primaryMetricId)) {
    const val = metrics[primaryMetricId];
    if (val !== undefined) {
      const label = HOTSPOT_METRICS.find((m) => m.id === primaryMetricId)?.label || primaryMetricId;
      if (!lines.some((l) => l.label === label)) lines.push({ label, value: formatMetricValue(primaryMetricId, val) });
    }
  }
  lines.push(...notAnalyzedLines(metrics));

  return {
    title,
    subtitle,
    lines,
    childrenLabel: type === "file" ? "Largest scopes" : "Inside",
    children,
    moreChildren: more,
  };
}

/**
 * Where a floating card goes: below-right of the pointer, flipped to the
 * other side of the pointer near the right or bottom edge, and kept inside
 * the viewport.
 */
export function placeFloating(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  offset = 12,
  margin = 4
): { left: number; top: number } {
  let left = pointer.x + offset;
  let top = pointer.y + offset;
  if (left + size.width > viewport.width - margin) left = pointer.x - offset - size.width;
  if (top + size.height > viewport.height - margin) top = pointer.y - offset - size.height;
  left = Math.max(margin, Math.min(left, viewport.width - margin - size.width));
  top = Math.max(margin, Math.min(top, viewport.height - margin - size.height));
  return { left, top };
}

export function useTreemapTooltip(opts: { primaryMetricId: () => HotSpotMetricId }) {
  const [tooltip, setTooltip] = createSignal<TreemapTooltipModel>({ visible: false });

  function hide() {
    setTooltip({ visible: false });
  }

  function show(e: MouseEvent, d: d3.HierarchyNode<any>) {
    setTooltip({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      ...buildTooltipContent(d, opts.primaryMetricId()),
    });
  }

  return { tooltip, show, hide };
}
