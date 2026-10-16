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
  | "comment_noise"
  | "max_nesting_depth"
  | "parameter_count"
  | "component_loc"
  | "component_hook_count"
  | "component_effect_count"
  | "component_jsx_depth"
  | "component_prop_count"
  | "component_inline_handler_count"
  | "component_jsx_conditional_count"
  | "ts_any_usage_count"
  | "ts_ignore_count"
  | "md_data_url_count"
  | "todo_count"
  | "comment_noise_ratio"
  | "comment_noise_docblock"
  | "comment_noise_commented_code"
  | "ts_import_coupling_count"
  | "ts_type_interface_count"
  | "ts_export_count"
  | "python_import_count";

/** Max-type metrics whose file and folder values name the scope that sets them. */
export const WITNESSED_METRICS: ReadonlySet<HotSpotMetricId> = new Set<HotSpotMetricId>([
  "complexity",
  "component_loc",
  "component_hook_count",
  "component_effect_count",
  "component_jsx_depth",
  "component_prop_count",
  "component_inline_handler_count",
  "component_jsx_conditional_count",
]);

export type HotSpotMetricGroup = "General" | "Components" | "TypeScript" | "Markdown" | "Detail";

/** Languages as the analyzers see them (see `languageForPath`). */
export type MetricLanguage = "ts" | "tsx" | "python" | "notebook" | "markdown" | "css" | "code" | "text";

/** Languages whose analyzers measure functions (complexity, params). Notebooks and CSS only count lines. */
export const CODE_LANGUAGES: MetricLanguage[] = ["ts", "tsx", "python", "code"];

/** Languages whose tree-sitter analyzers also measure nesting, comments and TODOs; lizard doesn't. */
export const TREE_SITTER_CODE_LANGUAGES: MetricLanguage[] = ["ts", "tsx", "python"];

export type HotSpotMetricDef = {
  id: HotSpotMetricId;
  label: string;
  /** Compact table-column header, at most ~5 characters. */
  shortLabel: string;
  group: HotSpotMetricGroup;
  /**
   * "file" when analyzers only record it per file (scope nodes always carry 0).
   * Default "any": measured for scopes too.
   */
  scope?: "file" | "any";
  /** Languages it applies to; defaults to the group's languages. */
  languages?: MetricLanguage[];
  /** Label in the code viewer when the hot-spot label reads as a ranking. */
  viewerLabel?: string;
  /** Detail, not risk: shown and colorable, never used to rank Hot Spots. */
  neutral?: boolean;
};

export const HOTSPOT_METRIC_GROUPS: HotSpotMetricGroup[] = [
  "General",
  "Components",
  "TypeScript",
  "Markdown",
  "Detail",
];

const TS_LANGUAGES: MetricLanguage[] = ["ts", "tsx"];

export const HOTSPOT_METRICS: HotSpotMetricDef[] = [
  // Max CCN of any function inside, for files and folders alike.
  { id: "complexity", label: "Complexity (max)", shortLabel: "CCN", group: "General", languages: CODE_LANGUAGES },
  { id: "complexity_avg", label: "Complexity (avg)", shortLabel: "CCNμ", group: "General", scope: "file", languages: CODE_LANGUAGES },
  { id: "loc", label: "LOC", shortLabel: "LOC", group: "General" },
  { id: "file_size", label: "Size", shortLabel: "Size", group: "General", scope: "file", viewerLabel: "Size (bytes)" },
  // Flags on fixed thresholds: narrated functions, oversized docblocks, commented-out code.
  { id: "comment_noise", label: "Comment Noise", shortLabel: "Noise", group: "General", languages: TREE_SITTER_CODE_LANGUAGES },
  { id: "max_nesting_depth", label: "Nesting", shortLabel: "Nest", group: "General", languages: TREE_SITTER_CODE_LANGUAGES },
  { id: "parameter_count", label: "Params", shortLabel: "Prm", group: "General", languages: CODE_LANGUAGES },
  // React/Solid components: a component scope holds its own value; files and
  // folders hold the max over their components and name it.
  { id: "component_loc", label: "Component LOC", shortLabel: "CLOC", group: "Components" },
  { id: "component_hook_count", label: "Hooks", shortLabel: "Hooks", group: "Components" },
  { id: "component_effect_count", label: "Effects", shortLabel: "Eff", group: "Components" },
  { id: "component_jsx_depth", label: "JSX Depth", shortLabel: "JSXd", group: "Components" },
  { id: "component_prop_count", label: "Props", shortLabel: "Props", group: "Components" },
  { id: "component_inline_handler_count", label: "Inline Handlers", shortLabel: "Hndl", group: "Components" },
  { id: "component_jsx_conditional_count", label: "JSX Conditionals", shortLabel: "JSX?", group: "Components" },
  // The TS analyzer records these per file only.
  { id: "ts_any_usage_count", label: "any Usage", shortLabel: "any", group: "TypeScript", scope: "file" },
  { id: "ts_ignore_count", label: "TS Ignores", shortLabel: "Ign@", group: "TypeScript", scope: "file" },
  { id: "md_data_url_count", label: "Markdown Data URLs", shortLabel: "DURL", group: "Markdown" },
  // Detail: counts that describe code without saying it needs work.
  { id: "todo_count", label: "TODOs", shortLabel: "TODO", group: "Detail", neutral: true, languages: TREE_SITTER_CODE_LANGUAGES },
  { id: "comment_noise_ratio", label: "Narrated Code", shortLabel: "NRat", group: "Detail", neutral: true, languages: TREE_SITTER_CODE_LANGUAGES, viewerLabel: "Noise: comment ratio" },
  { id: "comment_noise_docblock", label: "Oversized Docblocks", shortLabel: "NDoc", group: "Detail", neutral: true, languages: TREE_SITTER_CODE_LANGUAGES, viewerLabel: "Noise: docblocks" },
  { id: "comment_noise_commented_code", label: "Commented-out Code", shortLabel: "NCode", group: "Detail", neutral: true, languages: TREE_SITTER_CODE_LANGUAGES, viewerLabel: "Noise: commented-out code" },
  { id: "ts_import_coupling_count", label: "TS Imports", shortLabel: "Imp", group: "Detail", neutral: true, scope: "file", languages: TS_LANGUAGES },
  { id: "ts_type_interface_count", label: "Types/Interfaces", shortLabel: "Type", group: "Detail", neutral: true, languages: TS_LANGUAGES },
  { id: "ts_export_count", label: "Exports", shortLabel: "Exp", group: "Detail", neutral: true, scope: "file", languages: TS_LANGUAGES },
  { id: "python_import_count", label: "Python Imports", shortLabel: "PyImp", group: "Detail", neutral: true, scope: "file", languages: ["python"] },
];

export function hotSpotMetricLabel(id: HotSpotMetricId): string {
  return HOTSPOT_METRICS.find((m) => m.id === id)?.label ?? id;
}

/** Whether a metric can rank Hot Spots (risk), as opposed to neutral detail. */
export function isRankingMetric(id: HotSpotMetricId): boolean {
  return !HOTSPOT_METRICS.find((m) => m.id === id)?.neutral;
}

/** Display a metric value: one decimal for fractions, "N/A" for null. */
export function formatMetricValue(_id: string, value: unknown): string {
  if (value === null) return "N/A";
  if (typeof value !== "number") return value === undefined ? "" : String(value);
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
