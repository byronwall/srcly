import {
  createContext,
  useContext,
  createSignal,
  type Accessor,
} from "solid-js";

export type HotSpotMetricId =
  | "complexity"
  | "loc"
  | "file_size"
  | "comment_density"
  | "todo_count"
  | "max_nesting_depth"
  | "parameter_count"
  | "tsx_nesting_depth"
  | "tsx_render_branching_count"
  | "tsx_react_use_effect_count"
  | "tsx_anonymous_handler_count"
  | "tsx_prop_count"
  | "ts_any_usage_count"
  | "ts_ignore_count"
  | "ts_import_coupling_count"
  | "tsx_hardcoded_string_volume"
  | "tsx_duplicated_string_count"
  | "ts_type_interface_count"
  | "ts_export_count"
  | "python_import_count"
  | "md_data_url_count";

export type HotSpotMetricGroup = "General" | "TypeScript / TSX" | "Python" | "Markdown";

export type HotSpotMetricDef = {
  id: HotSpotMetricId;
  label: string;
  group: HotSpotMetricGroup;
  /** True when lower values are worse (e.g. comment density). */
  invert?: boolean;
};

export const HOTSPOT_METRIC_GROUPS: HotSpotMetricGroup[] = [
  "General",
  "TypeScript / TSX",
  "Python",
  "Markdown",
];

export const HOTSPOT_METRICS: HotSpotMetricDef[] = [
  { id: "complexity", label: "Complexity", group: "General" },
  { id: "loc", label: "LOC", group: "General" },
  { id: "file_size", label: "Size", group: "General" },
  { id: "comment_density", label: "Low Comments", group: "General", invert: true },
  { id: "todo_count", label: "TODOs", group: "General" },
  { id: "max_nesting_depth", label: "Nesting", group: "General" },
  { id: "parameter_count", label: "Params", group: "General" },
  { id: "tsx_nesting_depth", label: "TSX Nesting", group: "TypeScript / TSX" },
  { id: "tsx_render_branching_count", label: "Render Branches", group: "TypeScript / TSX" },
  { id: "tsx_react_use_effect_count", label: "useEffect", group: "TypeScript / TSX" },
  { id: "tsx_anonymous_handler_count", label: "Inline Handlers", group: "TypeScript / TSX" },
  { id: "tsx_prop_count", label: "Props", group: "TypeScript / TSX" },
  { id: "ts_any_usage_count", label: "any Usage", group: "TypeScript / TSX" },
  { id: "ts_ignore_count", label: "TS Ignores", group: "TypeScript / TSX" },
  { id: "ts_import_coupling_count", label: "TS Imports", group: "TypeScript / TSX" },
  { id: "tsx_hardcoded_string_volume", label: "Hardcoded Text", group: "TypeScript / TSX" },
  { id: "tsx_duplicated_string_count", label: "Duplicated Text", group: "TypeScript / TSX" },
  { id: "ts_type_interface_count", label: "Types/Interfaces", group: "TypeScript / TSX" },
  { id: "ts_export_count", label: "Exports", group: "TypeScript / TSX" },
  { id: "python_import_count", label: "Python Imports", group: "Python" },
  { id: "md_data_url_count", label: "Markdown Data URLs", group: "Markdown" },
];

export function hotSpotMetricLabel(id: HotSpotMetricId): string {
  return HOTSPOT_METRICS.find((m) => m.id === id)?.label ?? id;
}

/** Display a metric value: percentages for density, one decimal for fractions. */
export function formatMetricValue(id: string, value: unknown): string {
  if (typeof value !== "number") return value == null ? "" : String(value);
  if (id === "comment_density") return `${Math.round(value * 100)}%`;
  if (!Number.isInteger(value)) return value.toFixed(1);
  return value.toLocaleString("en-US");
}

type MetricsStoreContextType = {
  selectedHotSpotMetrics: Accessor<HotSpotMetricId[]>;
  setSelectedHotSpotMetrics: (ids: HotSpotMetricId[]) => void;
  excludedPaths: Accessor<string[]>;
  toggleExcludedPath: (path: string) => void;
  clearExcludedPaths: () => void;
};

const MetricsStoreContext = createContext<MetricsStoreContextType>();

export const MetricsStoreProvider = (props: { children: any }) => {
  const [selectedHotSpotMetrics, setSelectedHotSpotMetrics] = createSignal<
    HotSpotMetricId[]
  >(["complexity"]);
  const [excludedPaths, setExcludedPaths] = createSignal<string[]>([]);

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
        selectedHotSpotMetrics,
        setSelectedHotSpotMetrics,
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
