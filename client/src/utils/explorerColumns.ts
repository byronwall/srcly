import {
  HOTSPOT_METRICS,
  formatMetricValue,
  type HotSpotMetricDef,
  type HotSpotMetricId,
} from "./metricsStore";
import { treemapFillColor } from "../viz/treemap/utils/colors";

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

/** Shown for N/A: the metric doesn't apply here, or the file was skipped or failed. */
export const NA_TEXT = "–";

/**
 * Text for a metric cell: the value, "0" for a measured zero, and `NA_TEXT`
 * when the server reports the metric as N/A (null). The row renders 0 and
 * N/A faint, so real values stand out without hiding which is which.
 */
export function metricCellText(def: HotSpotMetricDef, node: ExplorerColumnNode): string {
  const value = numberAt(node, def.id);
  if (value === undefined) return NA_TEXT;
  if (def.id === "file_size") return formatSize(value);
  return formatMetricValue(def.id, value);
}

/** True when a cell shows nothing worth reading: N/A or a measured zero. */
export function metricCellIsFaint(def: HotSpotMetricDef, node: ExplorerColumnNode): boolean {
  const value = numberAt(node, def.id);
  return value === undefined || (value === 0 && !def.invert);
}

/** Hover text for a cell: the N/A reason, or where a max complexity comes from. */
export function metricCellTitle(def: HotSpotMetricDef, node: ExplorerColumnNode): string {
  const value = numberAt(node, def.id);
  if (value === undefined) {
    const reason = node.metrics?.na_reason;
    return `${def.label}: N/A${typeof reason === "string" && reason ? ` (${reason})` : ""}`;
  }
  const witness = def.id === "complexity" ? witnessOf(node) : null;
  const text = `${def.label}: ${metricCellText(def, node)}`;
  return witness ? `${text} in ${witness.name}${witness.start_line > 0 ? ` (line ${witness.start_line})` : ""}; click to open it` : text;
}

export type CellWitness = { path: string; name: string; start_line: number; end_line: number };

/** The function behind a file's or folder's max complexity; null for scopes and N/A. */
export function witnessOf(node: ExplorerColumnNode): CellWitness | null {
  if (node.type !== "file" && node.type !== "folder") return null;
  const w = node.metrics?.complexity_witness as CellWitness | null | undefined;
  return w && typeof w.path === "string" ? w : null;
}

/** The treemap's fill color for a cell's value, or undefined when it is N/A or zero. */
export function metricCellColor(def: HotSpotMetricDef, node: ExplorerColumnNode): string | undefined {
  if (metricCellIsFaint(def, node)) return undefined;
  return treemapFillColor(def.id, node.metrics ?? {}, 0);
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

/** Sort value for a row under a column (or the name); null (N/A) sorts last either way. */
export function explorerSortValue(
  node: ExplorerColumnNode & { name: string },
  field: ExplorerSortField
): string | number | null {
  if (field === "name") return node.name.toLowerCase();
  if (field === "gitignored") return numberAt(node, "gitignored_count") ?? 0;
  if (field === "file_count") return numberAt(node, "file_count") ?? 0;
  return numberAt(node, field) ?? null;
}
