import { createSignal } from "solid-js";
import * as d3 from "d3";
import { CODE_LANGUAGES, formatMetricValue, HOTSPOT_METRICS, type HotSpotMetricId } from "../../../utils/metricsStore";
import { applicableMetrics, languageForPath } from "../../../utils/metricApplicability";
import { witnessOf } from "../../../utils/explorerColumns";
import { metricIsNA, TREEMAP_NA_BACKGROUND, treemapFillColor } from "../utils/colors";

export type TooltipLine = {
  label: string;
  value: string;
};

/** A child listed in the tooltip: a file's scopes, or a folder's entries. */
export type TooltipChild = {
  name: string;
  loc: number;
  isFolder: boolean;
  /** Share of the parent's LOC, 0–1. */
  share: number;
  /** The child's tile color under the current metric. */
  color: string;
  /** The coloring metric's value, formatted; empty when coloring by LOC. */
  metric: string;
};

/** The metric the treemap is colored by, for the hovered tile. */
export type TooltipPrimary = {
  label: string;
  value: string;
  color: string;
  /** e.g. "#3 of 14 in components"; for N/A, why it is missing. */
  rank: string;
  /** For max complexity on a file or folder: the function that sets it, e.g. "parseArgs · L12". */
  witness: string;
};

export type TooltipContent = {
  title: string;
  /** Kind and extent, e.g. "file · 12 scopes" or "function · L10–40". */
  subtitle: string;
  loc: number;
  /** Where it lives, relative to the treemap's root. */
  path: string;
  /** Last edit, e.g. "edited 3d ago"; empty when unknown. */
  edited: string;
  /** Folder language mix, e.g. "tsx 62% · ts 31% · py 7%". */
  mix: string;
  primary: TooltipPrimary | null;
  lines: TooltipLine[];
  /** Header for the coloring metric's column in the children table. */
  childMetricLabel: string;
  childrenLabel: string;
  children: TooltipChild[];
  /** Children not listed. */
  moreChildren: number;
  /** e.g. "+25 more scopes"; empty when everything is listed. */
  moreLabel: string;
};

export type TreemapTooltipModel =
  | { visible: false }
  | ({ visible: true; x: number; y: number } & TooltipContent);

export const TOOLTIP_CHILD_LIMIT = 8;

// Files whose analyzer timed out or failed, or that are over the size cap, stay
// in the tree with a plain line count; say so, since their other metrics are
// N/A rather than measured.
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

const fmt = (n: number) => n.toLocaleString("en-US");

const nodeLoc = (n: d3.HierarchyNode<any>) => n.value ?? Number(n.data?.metrics?.loc ?? 0);

const metricDef = (id: string) => HOTSPOT_METRICS.find((m) => m.id === id);

/** A node's value for a metric; LOC comes from the layout so it matches the tile. */
const hasValue = (n: d3.HierarchyNode<any>, id: string) => id === "loc" || !metricIsNA(id, n.data?.metrics);

function metricValue(n: d3.HierarchyNode<any>, id: string): number {
  if (id === "loc") return nodeLoc(n);
  const v = Number(n.data?.metrics?.[id] ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const formatValue = (id: string, value: number) => (id === "file_size" ? formatBytes(value) : formatMetricValue(id, value));

/** "3d ago" from an epoch-seconds timestamp; empty when unknown. */
export function formatAge(epochSeconds: number, nowMs = Date.now()): string {
  if (!epochSeconds) return "";
  const s = Math.max(0, nowMs / 1000 - epochSeconds);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)}d ago`;
  if (s < 86400 * 730) return `${Math.round(s / 86400 / 30)}mo ago`;
  return `${Math.round(s / 86400 / 365)}y ago`;
}

const nodePath = (n: d3.HierarchyNode<any>) => String(n.data?.path ?? n.data?.name ?? "");

/** Whether a metric means anything for this node's language and kind. Folders roll everything up. */
function metricApplies(n: d3.HierarchyNode<any>, id: HotSpotMetricId): boolean {
  const type = n.data?.type;
  if (type === "folder") return true;
  return applicableMetrics(nodePath(n), type !== "file").some((m) => m.id === id);
}

/** What a scope is, from the analyzers' naming: "Node (interface)", "<div>", "map(ƒ)". */
export function scopeKind(name: string, language: string): string {
  if (name === "(imports)") return "imports";
  if (language === "markdown") return name.startsWith("data-url") ? "data URL" : "section";
  if (language === "css") return "rule";
  if (/^<.*>\(ƒ\)$/.test(name)) return "JSX callback";
  if (/^<.*>$/.test(name)) return "JSX element";
  if (name.endsWith(" (interface)")) return "interface";
  if (name.endsWith(" (type)")) return "type";
  if (name.endsWith(" (obj)")) return "object";
  if (name.startsWith("(class) ") || name.endsWith(" (class)")) return "class";
  if (name.endsWith("(ƒ)")) return "callback";
  return "function";
}

/** What a file's top-level scopes are called: Markdown sections, CSS rules, code scopes. */
function scopeNoun(language: string): string {
  return language === "markdown" ? "section" : language === "css" ? "rule" : "scope";
}

/** The biggest direct children by LOC: what's actually inside this tile. */
export function topChildren(
  d: d3.HierarchyNode<any>,
  primaryMetricId: HotSpotMetricId = "loc",
  limit = TOOLTIP_CHILD_LIMIT,
  showMetric = primaryMetricId !== "loc"
): { children: TooltipChild[]; more: number } {
  const total = nodeLoc(d) || 1;
  const all = (d.children ?? [])
    .filter((c) => !isSynthetic(c) && nodeLoc(c) > 0)
    .sort((a, b) => nodeLoc(b) - nodeLoc(a));
  const listed = all.slice(0, limit);
  const applies = (c: d3.HierarchyNode<any>) => metricApplies(c, primaryMetricId);
  // A column of zeros (Python imports in a TS folder) says nothing.
  const showColumn = showMetric && listed.some((c) => applies(c) && metricValue(c, primaryMetricId) !== 0);
  const children = listed.map((c) => ({
    name: String(c.data?.name ?? ""),
    loc: nodeLoc(c),
    isFolder: c.data?.type === "folder",
    share: nodeLoc(c) / total,
    color: treemapFillColor(primaryMetricId, c.data?.metrics ?? {}, 0),
    metric: !showColumn
      ? ""
      : applies(c) && hasValue(c, primaryMetricId)
        ? formatValue(primaryMetricId, metricValue(c, primaryMetricId))
        : "–",
  }));
  return { children, more: Math.max(0, all.length - limit) };
}

/** Where the node sits among its siblings by the coloring metric, worst first. */
export function siblingRank(d: d3.HierarchyNode<any>, id: HotSpotMetricId): string {
  const parent = d.parent;
  if (!parent || isSynthetic(d) || !hasValue(d, id)) return "";
  // N/A siblings aren't ranked: they have no value to compare.
  const siblings = (parent.children ?? []).filter((c) => !isSynthetic(c) && hasValue(c, id));
  if (siblings.length < 2) return "";
  const mine = metricValue(d, id);
  // Every sibling tied (all zero, say): a rank would be noise.
  if (siblings.every((s) => metricValue(s, id) === mine)) return "";
  // Ties share the better rank.
  const rank = 1 + siblings.filter((s) => metricValue(s, id) > mine).length;
  return `#${rank} of ${siblings.length} in ${parent.data?.name ?? ""}`;
}

/**
 * Ancestors below the treemap root, joined like a path. The root folder is
 * already in the breadcrumb; a root file (zoomed into one) is kept.
 */
export function pathWithin(d: d3.HierarchyNode<any>): string {
  const ancestors = d.ancestors().slice(1);
  if (ancestors.at(-1)?.data?.type === "folder") ancestors.pop();
  // Folders and the file join with "/"; scopes inside a file with " › ".
  let out = "";
  for (const a of ancestors.reverse()) {
    const name = String(a.data?.name ?? "");
    const inFile = a.data?.type !== "folder" && a.data?.type !== "file";
    out = out ? `${out}${inFile ? " › " : "/"}${name}` : name;
  }
  return out;
}

/** Folder LOC by file extension, biggest first: "tsx 62% · ts 31% · other 7%". */
export function languageMix(d: d3.HierarchyNode<any>, limit = 3): string {
  const byExt = new Map<string, number>();
  let total = 0;
  for (const leaf of d.descendants()) {
    if (leaf.data?.type !== "file") continue;
    const name = String(leaf.data?.name ?? "");
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "other";
    const loc = nodeLoc(leaf);
    byExt.set(ext, (byExt.get(ext) ?? 0) + loc);
    total += loc;
  }
  if (total <= 0 || byExt.size < 2) return "";
  const sorted = [...byExt.entries()].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((sum, [, loc]) => sum + loc, 0);
  if (rest > 0) shown.push(["other", rest]);
  return shown
    .map(([ext, loc]) => `${ext} ${Math.max(1, Math.round((loc / total) * 100))}%`)
    .join(" · ");
}

// Short labels for the dense grid; anything else uses its hot-spot label.
const SHORT_LABELS: Record<string, string> = {
  complexity: "Max CCN",
  complexity_avg: "Avg CCN",
  comment_noise: "Comment noise",
  max_nesting_depth: "Nesting",
  todo_count: "TODOs",
  parameter_count: "Params",
  file_size: "Size",
  function_count: "Functions",
  average_function_length: "Avg fn LOC",
  ts_import_coupling_count: "Imports",
  ts_any_usage_count: "Any usage",
  ts_ignore_count: "TS ignores",
  python_import_count: "Imports",
  ts_type_interface_count: "Types",
  ts_export_count: "Exports",
  md_data_url_count: "Data URLs",
};

// Not hot-spot metrics, but worth a glance for files and folders.
const EXTRA_METRICS = ["function_count", "average_function_length"];

/**
 * Every metric that means something for this node and isn't zero, in
 * hot-spot order. A zero CCN on a JSX element or a 0% comment density on a
 * CSS file is noise, not information.
 */
function metricLines(d: d3.HierarchyNode<any>, primaryMetricId: HotSpotMetricId): TooltipLine[] {
  const type = String(d.data?.type ?? "");
  const metrics = d.data?.metrics ?? {};
  const isFolder = type === "folder";
  const isScope = !isFolder && type !== "file";
  const path = String(d.data?.path ?? d.data?.name ?? "");
  const ids: string[] = isFolder
    ? HOTSPOT_METRICS.map((m) => m.id).filter((id) => id !== "parameter_count")
    : applicableMetrics(path, isScope).map((m) => m.id);
  if (!isScope && (isFolder || CODE_LANGUAGES.includes(languageForPath(path)))) ids.push(...EXTRA_METRICS);

  const lines: TooltipLine[] = [];
  for (const id of ids) {
    if (id === "loc" || id === primaryMetricId) continue;
    const value = Number(metrics[id] ?? 0);
    if (!Number.isFinite(value) || value === 0) continue;
    let label = SHORT_LABELS[id] ?? metricDef(id)?.label ?? id;
    if (id === "complexity" && isScope) label = "CCN";
    lines.push({ label, value: id === "average_function_length" ? value.toFixed(0) : formatValue(id, value) });
  }
  return lines;
}

const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

export function buildTooltipContent(d: d3.HierarchyNode<any>, primaryMetricId: HotSpotMetricId): TooltipContent {
  const title = String(d.data?.name ?? "");
  const type = String(d.data?.type ?? "");
  const metrics = d.data?.metrics ?? {};
  const def = metricDef(primaryMetricId);
  const isScope = type !== "folder" && type !== "file";
  const language = languageForPath(nodePath(d));
  // Coloring a CSS file by complexity paints every tile "fine"; don't repeat that as data.
  const primaryApplies = metricApplies(d, primaryMetricId);
  const childMetricId: HotSpotMetricId = primaryApplies ? primaryMetricId : "loc";
  const { children, more } = topChildren(d, primaryMetricId, TOOLTIP_CHILD_LIMIT, childMetricId !== "loc");
  const showChildMetric = children.some((c) => c.metric !== "");
  const noun = scopeNoun(language);

  let subtitle: string;
  if (type === "folder") {
    const descendants = d.descendants();
    const folders = descendants.filter((n) => n.data?.type === "folder" && n !== d).length;
    const files = descendants.filter((n) => n.data?.type === "file").length;
    subtitle = `folder · ${plural(files, "file")}${folders ? ` in ${plural(folders, "folder")}` : ""}`;
  } else if (type === "file") {
    const scopeCount = (d.children ?? []).filter((c) => !isSynthetic(c)).length;
    subtitle = `file${scopeCount ? ` · ${plural(scopeCount, noun)}` : ""}`;
  } else {
    const start = Number(d.data?.start_line ?? 0);
    const end = Number(d.data?.end_line ?? 0);
    subtitle = `${scopeKind(title, language)}${start > 0 && end >= start ? ` · L${start}–${end}` : ""}`;
  }

  let primaryLabel = def?.label ?? primaryMetricId;
  if (primaryMetricId === "complexity" && isScope) primaryLabel = "Complexity";

  const primaryNA = !hasValue(d, primaryMetricId);
  const witness = isScope ? null : witnessOf(d.data, primaryMetricId);
  const primary: TooltipPrimary | null =
    !primaryApplies || (primaryMetricId === "loc" && !d.parent)
      ? null
      : {
          label: primaryLabel,
          // The header already shows LOC.
          value: primaryMetricId === "loc" ? "" : primaryNA ? "N/A" : formatValue(primaryMetricId, metricValue(d, primaryMetricId)),
          color: primaryNA ? TREEMAP_NA_BACKGROUND : treemapFillColor(primaryMetricId, metrics, 0),
          rank: primaryNA ? String(metrics.na_reason ?? "") : siblingRank(d, primaryMetricId),
          witness: witness ? `${witness.name}${witness.start_line > 0 ? ` · L${witness.start_line}` : ""}` : "",
        };

  return {
    title,
    subtitle,
    loc: nodeLoc(d),
    path: pathWithin(d),
    edited: type === "folder" || type === "file" ? formatAge(Number(metrics.last_modified ?? 0)) : "",
    mix: type === "folder" ? languageMix(d) : "",
    primary,
    lines: [...metricLines(d, primaryMetricId), ...notAnalyzedLines(metrics)],
    childMetricLabel: !showChildMetric
      ? ""
      : childMetricId === "complexity" && type !== "folder"
        ? "CCN"
        : SHORT_LABELS[childMetricId] ?? def?.label ?? childMetricId,
    childrenLabel: type === "folder" ? "Largest" : type === "file" ? `Largest ${noun}s` : "Inside",
    children,
    moreChildren: more,
    moreLabel: more > 0 ? `+${fmt(more)} more${type === "file" ? ` ${noun}${more === 1 ? "" : "s"}` : ""}` : "",
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

  // Hover fires on every pointer move; rebuild only when the tile or metric changes.
  let cached: { node: d3.HierarchyNode<any>; metric: HotSpotMetricId; content: TooltipContent } | null = null;

  function show(e: MouseEvent, d: d3.HierarchyNode<any>) {
    const metric = opts.primaryMetricId();
    if (cached?.node !== d || cached.metric !== metric) {
      cached = { node: d, metric, content: buildTooltipContent(d, metric) };
    }
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, ...cached.content });
  }

  return { tooltip, show, hide };
}
