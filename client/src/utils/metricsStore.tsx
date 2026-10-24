import {
  createContext,
  useContext,
  createSignal,
  type Accessor,
  onCleanup,
} from "solid-js";
import { registerViewState } from "../navigation/viewState";
import type { QuadrantPreset } from "../viz/scatter/quadrants";

/**
 * The metric catalog, served by the API (`GET /api/metrics/catalog`, from
 * `server/app/services/metric_catalog.py`). The client keeps no metric table
 * of its own: `index.tsx` loads the catalog before the app renders, and every
 * picker, column, color scale, tooltip and viewer row reads it from here.
 */

/** A metric id: a `Metrics` field name from the API. */
export type MetricId = string;

/** Languages as the analyzers see them (see `languageForPath`). */
export type MetricLanguage = "ts" | "tsx" | "python" | "notebook" | "markdown" | "css" | "code" | "text";

/** "higher-worse" and "lower-worse" metrics can rank Hot Spots; "neutral" detail never does. */
export type MetricDirection = "higher-worse" | "lower-worse" | "neutral";

export type MetricDef = {
  id: MetricId;
  label: string;
  /** Explorer column header, at most 5 characters. */
  short_label: string;
  /** Plural unit after a value ("lines"); `unit_one` is the singular. */
  unit: string;
  unit_one: string;
  group: string;
  direction: MetricDirection;
  aggregation: "sum" | "max" | "mean";
  /** "file" when only files carry it; "any" when function/component scopes do too. */
  scope: "file" | "any";
  /** Languages whose analyzers measure it; null when every file has it. */
  languages: MetricLanguage[] | null;
  description: string;
  /** File and folder values name the function or component behind the max. */
  witness: boolean;
  /** Treemap ramp stops: [fine, midpoint, needs attention]. */
  color_domain: [number, number, number];
  /** Folders color by their per-file average (their totals are sums). */
  color_per_file: boolean;
  /** Label in the code viewer when `label` reads as a ranking. */
  viewer_label: string | null;
  /** False for bookkeeping the explorer shows elsewhere (file count). */
  picker: boolean;
};

export type MetricGroup = { id: string; description: string };
export type ActivityWindow = { id: string; label: string };
export type MetricCatalog = {
  groups: MetricGroup[];
  metrics: MetricDef[];
  /** Git history windows for the Activity metrics (30d, 90d, 1y, all). */
  activity_windows?: ActivityWindow[];
  default_activity_window?: string;
  /** Named 2x2 presets for the scatter view (`server/app/services/quadrants.py`). */
  quadrant_presets?: QuadrantPreset[];
};

/** Root-only `activity` on the analysis tree: whether Git history could be read. */
export type ActivityInfo = {
  window: string;
  window_label: string;
  status: "ok" | "na";
  reason: string;
  /** Results are valid; e.g. "2 files have uncommitted changes, not counted". */
  note: string;
  head: string;
  files_touched: number;
};

/** One lint/type checker run (`services/findings`). */
export type FindingsTool = {
  id: string;
  tool: "tsc" | "eslint" | "ruff" | "srcly-ts" | string;
  /** "tsc (client/tsconfig.app.json)", "ruff (srcly defaults)". */
  label: string;
  source: "project" | "srcly defaults";
  status: "ok" | "na";
  reason: string;
  seconds: number;
  finding_count: number;
  error_count: number;
  files_checked: number | null;
};

/** Root-only `findings` on the analysis tree: whether the checks finished, and which tools ran. */
export type FindingsInfo = {
  status: "running" | "ok" | "na";
  reason: string;
  tools: FindingsTool[];
  finding_count: number;
};

/** Tools worth naming: the ones that failed or actually had files to check. */
export const ranTools = (info: FindingsInfo | null | undefined): FindingsTool[] =>
  (info?.tools ?? []).filter((t) => t.status !== "ok" || t.files_checked !== 0);

const [catalog, setCatalog] = createSignal<MetricCatalog>({ groups: [], metrics: [] });
let byId = new Map<MetricId, MetricDef>();

/** Install a catalog (the API's, or a test's). */
export function setMetricCatalog(next: MetricCatalog): void {
  byId = new Map(next.metrics.map((m) => [m.id, m]));
  setCatalog(next);
}

export async function loadMetricCatalog(): Promise<void> {
  const res = await fetch("/api/metrics/catalog");
  if (!res.ok) throw new Error(`Couldn't load the metric catalog (${res.status})`);
  setMetricCatalog((await res.json()) as MetricCatalog);
}

/** Every metric the pickers and columns offer, in catalog order. */
export const metricDefs = (): MetricDef[] => catalog().metrics.filter((m) => m.picker);

export const metricGroups = (): MetricGroup[] => catalog().groups;

export const activityWindows = (): ActivityWindow[] => catalog().activity_windows ?? [];

export const quadrantPresets = (): QuadrantPreset[] => catalog().quadrant_presets ?? [];

export const defaultActivityWindow = (): string => catalog().default_activity_window ?? "90d";

/** Metrics computed from Git history rather than source (the "Activity" group). */
export const isActivityMetric = (id: MetricId): boolean => metricDef(id)?.group === "Activity";

/**
 * Why `metricId` is N/A on a node: its own reason when the server gave one
 * (activity: "Not a Git repository", "Shallow clone", ...), else the node's.
 */
export function naReasonFor(
  metrics: { na_reason?: string; na_reasons?: Record<string, string> | null } | undefined,
  metricId: MetricId
): string {
  return metrics?.na_reasons?.[metricId] ?? metrics?.na_reason ?? "";
}

export const metricDef = (id: MetricId): MetricDef | undefined => byId.get(id);

export function metricLabel(id: MetricId): string {
  return metricDef(id)?.label ?? id;
}

/** Whether a metric can rank Hot Spots (risk), as opposed to neutral detail. */
export function isRankingMetric(id: MetricId): boolean {
  const def = metricDef(id);
  return Boolean(def && def.direction !== "neutral");
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Display a metric value: bytes as B/KB/MB, one decimal for fractions, "N/A" for null. */
export function formatMetricValue(id: MetricId, value: unknown): string {
  if (value === null) return "N/A";
  if (typeof value !== "number") return value === undefined ? "" : String(value);
  if (metricDef(id)?.unit === "bytes") return formatBytes(value);
  if (!Number.isInteger(value)) return value.toFixed(1);
  return value.toLocaleString("en-US");
}

/** "34 CCN", "1 line", "12 KB": the value with the catalog's unit. */
export function formatMetricWithUnit(id: MetricId, value: number): string {
  const def = metricDef(id);
  if (!def || def.unit === "bytes") return formatMetricValue(id, value);
  return `${formatMetricValue(id, value)} ${value === 1 ? def.unit_one : def.unit}`;
}

type MetricsStoreContextType = {
  /** The one metric that colors the treemap and ranks Hot Spots. */
  metric: Accessor<MetricId>;
  setMetric: (id: MetricId) => void;
  excludedPaths: Accessor<string[]>;
  toggleExcludedPath: (path: string) => void;
  clearExcludedPaths: () => void;
};

const MetricsStoreContext = createContext<MetricsStoreContextType>();

export const MetricsStoreProvider = (props: { children: any }) => {
  const [metric, setMetric] = createSignal<MetricId>("complexity");
  const [excludedPaths, setExcludedPaths] = createSignal<string[]>([]);
  // Return restores the metric and exclusions a place was left with (T17).
  onCleanup(
    registerViewState<{ metric: MetricId; excludedPaths: string[] }>("metrics", {
      capture: () => ({ metric: metric(), excludedPaths: excludedPaths() }),
      restore: (part) => {
        if (typeof part?.metric === "string") setMetric(part.metric);
        if (Array.isArray(part?.excludedPaths)) setExcludedPaths(part.excludedPaths.filter((p): p is string => typeof p === "string"));
      },
    }),
  );

  const toggleExcludedPath = (path: string) => {
    const current = excludedPaths();
    if (current.includes(path)) {
      setExcludedPaths(current.filter((p) => p !== path));
    } else {
      setExcludedPaths([...current, path]);
    }
  };

  return (
    <MetricsStoreContext.Provider
      value={{
        metric,
        setMetric,
        excludedPaths,
        toggleExcludedPath,
        clearExcludedPaths: () => setExcludedPaths([]),
      }}
    >
      {props.children}
    </MetricsStoreContext.Provider>
  );
};

export const useMetricsStore = () => {
  const ctx = useContext(MetricsStoreContext);
  if (!ctx) {
    throw new Error("useMetricsStore must be used within MetricsStoreProvider");
  }
  return ctx;
};
