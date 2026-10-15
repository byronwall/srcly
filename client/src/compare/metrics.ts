import { formatMetricValue, HOTSPOT_METRICS } from "../utils/metricsStore";
import type { ChangeStatus, Verdict } from "./types";

const EXTRA_LABELS: Record<string, string> = {
  fan_out: "Fan-out",
  fan_in: "Fan-in",
  function_count: "Functions",
  comment_lines: "Comment lines",
  average_function_length: "Avg fn length",
  classes_count: "Classes",
  comment_density: "Comment density",
};

/** Default table columns: the risk metrics most PRs move. */
export const DEFAULT_COMPARE_COLUMNS = ["loc", "complexity", "max_nesting_depth", "fan_out"];

export function compareMetricLabel(name: string): string {
  return EXTRA_LABELS[name] ?? HOTSPOT_METRICS.find((m) => m.id === name)?.label ?? name;
}

export function formatValue(name: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatMetricValue(name, value);
}

export function formatDelta(name: string, delta: number): string {
  if (delta === 0) return "±0";
  const sign = delta > 0 ? "+" : "−";
  const magnitude = Math.abs(delta);
  if (name === "comment_density") return `${sign}${Math.round(magnitude * 100)}pt`;
  const text = Number.isInteger(magnitude) ? magnitude.toLocaleString("en-US") : magnitude.toFixed(1);
  return `${sign}${text}`;
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  better: "text-[var(--plc-success)]",
  worse: "text-[var(--plc-error)]",
  neutral: "text-[var(--plc-on-muted)]",
  same: "text-[var(--plc-on-disabled)]",
};

export const STATUS_LABEL: Record<ChangeStatus, string> = {
  added: "Added",
  removed: "Removed",
  modified: "Modified",
  renamed: "Renamed",
};

export const STATUS_COLOR: Record<ChangeStatus, string> = {
  added: "var(--plc-success)",
  removed: "var(--plc-error)",
  modified: "var(--plc-warning)",
  renamed: "var(--plc-accent)",
};
