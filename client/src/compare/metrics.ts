import { formatMetricValue, metricLabel } from "../utils/metricsStore";
import type { ChangeStatus, Verdict } from "./types";

/** Compare-only metrics from the dependency graph; the rest come from the catalog. */
const GRAPH_LABELS: Record<string, string> = {
  fan_out: "Fan-out",
  fan_in: "Fan-in",
};

/** Default table columns: the risk metrics most PRs move. */
export const DEFAULT_COMPARE_COLUMNS = ["complexity", "max_nesting_depth", "average_function_length", "fan_out"];

export function compareMetricLabel(name: string): string {
  return GRAPH_LABELS[name] ?? metricLabel(name);
}

export function formatValue(name: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatMetricValue(name, value);
}

export function formatDelta(_name: string, delta: number): string {
  if (delta === 0) return "±0";
  const sign = delta > 0 ? "+" : "−";
  const magnitude = Math.abs(delta);
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

export interface FileHealth {
  /** Risk metrics that got worse / better in this file, worst first. */
  worse: string[];
  better: string[];
  /** Higher = more regressed. Used by the "Most regressed" ordering. */
  score: number;
}

/** Count which risk metrics moved which way for one changed file. */
export function fileHealth(deltas: Record<string, { verdict: string; delta: number }> | undefined): FileHealth {
  const worse: string[] = [];
  const better: string[] = [];
  for (const [name, d] of Object.entries(deltas ?? {})) {
    if (d.verdict === "worse") worse.push(name);
    else if (d.verdict === "better") better.push(name);
  }
  return { worse, better, score: worse.length - better.length };
}
