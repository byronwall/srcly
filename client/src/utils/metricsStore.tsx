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
  | "md_data_url_count";

export type HotSpotMetricDef = {
  id: HotSpotMetricId;
  label: string;
  invert?: boolean;
  color: string;
};

export const HOTSPOT_METRICS: HotSpotMetricDef[] = [
  { id: "complexity", label: "Complexity", color: "text-red-400" },
  { id: "loc", label: "LOC", color: "text-blue-400" },
  { id: "file_size", label: "Size", color: "text-purple-400" },
  {
    id: "comment_density",
    label: "Low Comments",
    invert: true,
    color: "text-orange-400",
  },
  { id: "todo_count", label: "TODOs", color: "text-yellow-400" },
  { id: "max_nesting_depth", label: "Nesting", color: "text-pink-400" },
  { id: "parameter_count", label: "Params", color: "text-green-400" },
  { id: "tsx_nesting_depth", label: "TSX Nesting", color: "text-teal-400" },
  {
    id: "tsx_render_branching_count",
    label: "Render Branches",
    color: "text-indigo-400",
  },
  {
    id: "tsx_react_use_effect_count",
    label: "useEffect",
    color: "text-lime-400",
  },
  {
    id: "tsx_anonymous_handler_count",
    label: "Inline Handlers",
    color: "text-amber-400",
  },
  { id: "tsx_prop_count", label: "Props", color: "text-sky-400" },
  { id: "ts_any_usage_count", label: "any Usage", color: "text-red-500" },
  { id: "ts_ignore_count", label: "TS Ignores", color: "text-red-300" },
  {
    id: "ts_import_coupling_count",
    label: "TS Imports",
    color: "text-purple-300",
  },
  {
    id: "tsx_hardcoded_string_volume",
    label: "Hardcoded Text",
    color: "text-orange-300",
  },
  {
    id: "tsx_duplicated_string_count",
    label: "Dup Text",
    color: "text-pink-300",
  },
  {
    id: "ts_type_interface_count",
    label: "Types/Interfaces",
    color: "text-emerald-300",
  },
  {
    id: "ts_export_count",
    label: "Exports",
    color: "text-cyan-300",
  },
  {
    id: "md_data_url_count",
    label: "Markdown Data URLs",
    color: "text-fuchsia-300",
  },
];

type MetricsStoreContextType = {
  selectedHotSpotMetrics: Accessor<HotSpotMetricId[]>;
  setSelectedHotSpotMetrics: (ids: HotSpotMetricId[]) => void;
  excludedPaths: Accessor<string[]>;
  toggleExcludedPath: (path: string) => void;
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
