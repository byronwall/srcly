import {
  HOTSPOT_METRICS,
  formatMetricValue,
  type HotSpotMetricDef,
  type HotSpotMetricId,
} from "./metricsStore";
import { metricApplies } from "./metricApplicability";
import { treemapFillColor, treemapLabelColor } from "../viz/treemap/utils/colors";

export type ExplorerColumnNode = {
  path: string;
  type: string;
  metrics?: Record<string, unknown>;
};

export type ExplorerSortField = "name" | "file_count" | "gitignored" | HotSpotMetricId;

export type ExplorerColumn = {
  id: Exclude<ExplorerSortField, "name">;
  header: string;
  title: string;
  /** Fixed width in px, so columns never shift as values change. */
  width: number;
  value: (node: ExplorerColumnNode) => string;
  /** The metric behind the column, when it comes from the metric registry. */
  metric?: HotSpotMetricDef;
};

export const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const numberAt = (node: ExplorerColumnNode, key: string) => {
  const value = node.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const isScope = (node: ExplorerColumnNode) => node.type !== "file" && node.type !== "folder";

/**
 * Text for a metric cell. Blank when the metric doesn't apply to the file's
 * language (a 0 there is noise) and for zero counts, so real values stand out.
 */
export function metricCellText(def: HotSpotMetricDef, node: ExplorerColumnNode): string {
  const value = numberAt(node, def.id);
  if (value === undefined) return "";
  if (node.type !== "folder" && !metricApplies(def, node.path, isScope(node))) return "";
  if (def.id === "file_size") return formatSize(value);
  if (value === 0 && def.id !== "loc" && !def.invert) return "";
  return formatMetricValue(def.id, value);
}

/** Treemap fill and label colors for a cell, or undefined when the cell is blank. */
export function metricCellColors(def: HotSpotMetricDef, node: ExplorerColumnNode) {
  if (!metricCellText(def, node)) return undefined;
  const metrics = node.metrics ?? {};
  return {
    background: treemapFillColor(def.id, metrics, 0),
    color: treemapLabelColor(def.id, metrics, 0),
  };
}

const WIDE_METRICS = new Set<HotSpotMetricId>(["loc", "file_size"]);

const metricColumn = (def: HotSpotMetricDef): ExplorerColumn => ({
  id: def.id,
  header: def.shortLabel,
  title: def.label,
  width: WIDE_METRICS.has(def.id) ? 60 : 46,
  value: (node) => metricCellText(def, node),
  metric: def,
});

/** Every column the picker offers, in display order (left to right). */
export const EXPLORER_COLUMNS: ExplorerColumn[] = [
  {
    id: "gitignored",
    header: "Ign",
    title: "Gitignored files",
    width: 40,
    value: (node) => String(numberAt(node, "gitignored_count") || ""),
  },
  {
    id: "file_count",
    header: "Files",
    title: "File count",
    width: 46,
    value: (node) => (node.type === "folder" ? (numberAt(node, "file_count") ?? 0).toLocaleString("en-US") : ""),
  },
  ...HOTSPOT_METRICS.map(metricColumn),
];

export function explorerColumn(id: ExplorerColumn["id"]): ExplorerColumn | undefined {
  return EXPLORER_COLUMNS.find((column) => column.id === id);
}

/**
 * The visible columns: the picked ones, then the treemap's color metric last
 * (next to the treemap), whether or not it was picked.
 */
export function visibleExplorerColumns(picked: readonly string[], colorMetric: HotSpotMetricId) {
  const columns = EXPLORER_COLUMNS.filter((column) => column.id !== colorMetric && picked.includes(column.id));
  const color = explorerColumn(colorMetric);
  return color ? [...columns, color] : columns;
}

/** Sort value for a row under a column (or the name). */
export function explorerSortValue(node: ExplorerColumnNode & { name: string }, field: ExplorerSortField) {
  if (field === "name") return node.name.toLowerCase();
  if (field === "gitignored") return numberAt(node, "gitignored_count") ?? 0;
  return numberAt(node, field) ?? 0;
}
