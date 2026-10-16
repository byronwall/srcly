import {
  createContext,
  useContext,
  createSignal,
  type Accessor,
} from "solid-js";

export type HotSpotMetricId =
  | "complexity"
  | "complexity_avg"
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

/** Languages as the analyzers see them (see `languageForPath`). */
export type MetricLanguage = "ts" | "tsx" | "python" | "notebook" | "markdown" | "css" | "code" | "text";

/** Languages whose analyzers measure functions: complexity, nesting, params, comments. */
export const CODE_LANGUAGES: MetricLanguage[] = ["ts", "tsx", "python", "notebook", "code"];

export type HotSpotMetricDef = {
  id: HotSpotMetricId;
  label: string;
  /** Compact table-column header, at most ~5 characters. */
  shortLabel: string;
  group: HotSpotMetricGroup;
  /** True when lower values are worse (e.g. comment density). */
  invert?: boolean;
  /**
   * "file" when analyzers only record it per file (scope nodes always carry 0).
   * Default "any": measured for scopes too.
   */
  scope?: "file" | "any";
  /** Languages it applies to; defaults to the group's languages. */
  languages?: MetricLanguage[];
  /** Label in the code viewer when the hot-spot label reads as a ranking. */
  viewerLabel?: string;
};

export const HOTSPOT_METRIC_GROUPS: HotSpotMetricGroup[] = [
  "General",
  "TypeScript / TSX",
  "Python",
  "Markdown",
];

export const HOTSPOT_METRICS: HotSpotMetricDef[] = [
  // Max CCN of any function inside, for files and folders alike.
  { id: "complexity", label: "Complexity (max)", shortLabel: "CCN", group: "General", languages: CODE_LANGUAGES },
  { id: "complexity_avg", label: "Complexity (avg)", shortLabel: "CCNμ", group: "General", scope: "file", languages: CODE_LANGUAGES },
  { id: "loc", label: "LOC", shortLabel: "LOC", group: "General" },
  { id: "file_size", label: "Size", shortLabel: "Size", group: "General", scope: "file", viewerLabel: "Size (bytes)" },
  { id: "comment_density", label: "Low Comments", shortLabel: "Cmt%", group: "General", invert: true, languages: CODE_LANGUAGES, viewerLabel: "Comment density" },
  { id: "todo_count", label: "TODOs", shortLabel: "TODO", group: "General", languages: CODE_LANGUAGES },
  { id: "max_nesting_depth", label: "Nesting", shortLabel: "Nest", group: "General", languages: CODE_LANGUAGES },
  { id: "parameter_count", label: "Params", shortLabel: "Prm", group: "General", languages: CODE_LANGUAGES },
  // The TS analyzer records these per file only; TSX ones only exist in .tsx.
  { id: "tsx_nesting_depth", label: "TSX Nesting", shortLabel: "JSXn", group: "TypeScript / TSX", scope: "file", languages: ["tsx"] },
  { id: "tsx_render_branching_count", label: "Render Branches", shortLabel: "Brch", group: "TypeScript / TSX", scope: "file", languages: ["tsx"] },
  { id: "tsx_react_use_effect_count", label: "useEffect", shortLabel: "Eff", group: "TypeScript / TSX", scope: "file", languages: ["tsx"] },
  { id: "tsx_anonymous_handler_count", label: "Inline Handlers", shortLabel: "Hndl", group: "TypeScript / TSX", scope: "file", languages: ["tsx"] },
  { id: "tsx_prop_count", label: "Props", shortLabel: "Prop", group: "TypeScript / TSX", scope: "file", languages: ["tsx"] },
  { id: "ts_any_usage_count", label: "any Usage", shortLabel: "any", group: "TypeScript / TSX", scope: "file" },
  { id: "ts_ignore_count", label: "TS Ignores", shortLabel: "Ign@", group: "TypeScript / TSX", scope: "file" },
  { id: "ts_import_coupling_count", label: "TS Imports", shortLabel: "Imp", group: "TypeScript / TSX", scope: "file" },
  { id: "tsx_hardcoded_string_volume", label: "Hardcoded Text", shortLabel: "Text", group: "TypeScript / TSX", scope: "file", languages: ["tsx"] },
  { id: "tsx_duplicated_string_count", label: "Duplicated Text", shortLabel: "Dup", group: "TypeScript / TSX", scope: "file", languages: ["tsx"] },
  { id: "ts_type_interface_count", label: "Types/Interfaces", shortLabel: "Type", group: "TypeScript / TSX" },
  { id: "ts_export_count", label: "Exports", shortLabel: "Exp", group: "TypeScript / TSX", scope: "file" },
  { id: "python_import_count", label: "Python Imports", shortLabel: "PyImp", group: "Python", scope: "file" },
  { id: "md_data_url_count", label: "Markdown Data URLs", shortLabel: "DURL", group: "Markdown" },
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
