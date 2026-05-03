import { createSignal, createMemo, For, Show, createContext } from "solid-js";
import Popover from "./Popover";
import { Button } from "./ui/Button";
import { CheckboxRow } from "./ui/CheckboxRow";
import { IconButton } from "./ui/IconButton";
import { PopoverPanel, PopoverSectionTitle } from "./ui/PopoverPanel";
import { TextInput } from "./ui/TextInput";
import {
  HOTSPOT_METRICS,
  type HotSpotMetricId,
  useMetricsStore,
} from "../utils/metricsStore";
import { HotSpotItem } from "./HotSpotItem";
import { TreeNode } from "./TreeNode";

export interface Node {
  name: string;
  path: string;
  type: "folder" | "file" | "function" | "class" | "misc";
  children?: Node[];
  start_line?: number;
  end_line?: number;
  metrics?: {
    loc: number;
    complexity: number;
    gitignored_count?: number;
    file_size?: number;
    file_count?: number;
    comment_lines?: number;
    comment_density?: number;
    max_nesting_depth?: number;
    average_function_length?: number;
    parameter_count?: number;
    todo_count?: number;
    classes_count?: number;
    // TS/TSX-specific metrics
    tsx_nesting_depth?: number;
    tsx_render_branching_count?: number;
    tsx_react_use_effect_count?: number;
    tsx_anonymous_handler_count?: number;
    tsx_prop_count?: number;
    ts_any_usage_count?: number;
    ts_ignore_count?: number;
    ts_import_coupling_count?: number;
    tsx_hardcoded_string_volume?: number;
    tsx_duplicated_string_count?: number;
    ts_type_interface_count?: number;
    ts_export_count?: number;
    python_import_count?: number;
    md_data_url_count?: number;
  };
}

type SortField =
  | "name"
  | "loc"
  | "complexity"
  | "file_size"
  | "file_count"
  | "gitignored"
  | "comment_density"
  | "todo_count"
  | "max_nesting_depth"
  | "parameter_count"
  // TS/TSX-specific sort fields
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
type SortDirection = "asc" | "desc";

interface ExplorerContextType {
  sortField: () => SortField;
  sortDirection: () => SortDirection;
  onSelect: (
    path: string,
    startLine?: number,
    endLine?: number,
    node?: any
  ) => void;
  onZoom: (node: any) => void;
  filter: string;
  visibleColumns: () => string[];
  expandAllSignal: () => boolean | null;
  rootData: Node;
}

export const ExplorerContext = createContext<ExplorerContextType>();

export const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const findNodeByPath = (root: Node, path: string): Node | null => {
  if (root.path === path) return root;

  if (!root.children || root.children.length === 0) return null;

  for (const child of root.children) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }

  return null;
};

export const findParentNode = (root: Node, targetPath: string): Node | null => {
  if (root.path === targetPath) return null; // Root has no parent in this context
  if (!root.children || root.children.length === 0) return null;

  for (const child of root.children) {
    if (child.path === targetPath) {
      return root;
    }
    const found = findParentNode(child, targetPath);
    if (found) return found;
  }

  return null;
};

const getMetricValue = (
  node: Node,
  metric: keyof NonNullable<Node["metrics"]>
): number => {
  return node.metrics?.[metric] ?? 0;
};

export const SORT_FIELD_ACCESSORS: Record<
  SortField,
  (node: Node) => string | number
> = {
  name: (node) => node.name.toLowerCase(),
  loc: (node) => getMetricValue(node, "loc"),
  complexity: (node) => getMetricValue(node, "complexity"),
  file_size: (node) => getMetricValue(node, "file_size"),
  file_count: (node) => getMetricValue(node, "file_count"),
  gitignored: (node) => node.metrics?.gitignored_count ?? 0,
  comment_density: (node) => getMetricValue(node, "comment_density"),
  todo_count: (node) => getMetricValue(node, "todo_count"),
  max_nesting_depth: (node) => getMetricValue(node, "max_nesting_depth"),
  parameter_count: (node) => getMetricValue(node, "parameter_count"),
  tsx_nesting_depth: (node) => getMetricValue(node, "tsx_nesting_depth"),
  tsx_render_branching_count: (node) =>
    getMetricValue(node, "tsx_render_branching_count"),
  tsx_react_use_effect_count: (node) =>
    getMetricValue(node, "tsx_react_use_effect_count"),
  tsx_anonymous_handler_count: (node) =>
    getMetricValue(node, "tsx_anonymous_handler_count"),
  tsx_prop_count: (node) => getMetricValue(node, "tsx_prop_count"),
  ts_any_usage_count: (node) => getMetricValue(node, "ts_any_usage_count"),
  ts_ignore_count: (node) => getMetricValue(node, "ts_ignore_count"),
  ts_import_coupling_count: (node) =>
    getMetricValue(node, "ts_import_coupling_count"),
  tsx_hardcoded_string_volume: (node) =>
    getMetricValue(node, "tsx_hardcoded_string_volume"),
  tsx_duplicated_string_count: (node) =>
    getMetricValue(node, "tsx_duplicated_string_count"),
  ts_type_interface_count: (node) =>
    getMetricValue(node, "ts_type_interface_count"),
  ts_export_count: (node) => getMetricValue(node, "ts_export_count"),
  python_import_count: (node) => getMetricValue(node, "python_import_count"),
  md_data_url_count: (node) => getMetricValue(node, "md_data_url_count"),
};

export default function Explorer(props: {
  data: any;
  fullData?: any;
  onFileSelect: (
    path: string,
    startLine?: number,
    endLine?: number,
    node?: any
  ) => void;
  onZoom: (node: any) => void;
  filter: string;
  onFilterChange: (val: string) => void;
}) {
  const [sortField, setSortField] = createSignal<SortField>("loc");
  const [sortDirection, setSortDirection] = createSignal<SortDirection>("desc");
  const [viewMode, setViewMode] = createSignal<"tree" | "hotspots">("tree");
  const [showColumnPicker, setShowColumnPicker] = createSignal(false);
  const { selectedHotSpotMetrics, setSelectedHotSpotMetrics } =
    useMetricsStore();
  const [visibleColumns, setVisibleColumns] = createSignal<string[]>([
    "loc",
    "complexity",
  ]);

  const handleHeaderClick = (field: SortField) => {
    if (sortField() === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const toggleColumn = (col: string) => {
    const current = visibleColumns();
    if (current.includes(col)) {
      setVisibleColumns(current.filter((c) => c !== col));
    } else {
      setVisibleColumns([...current, col]);
    }
  };

  const SortIcon = (p: { field: SortField }) => (
    <Show when={sortField() === p.field}>
      <span class="ml-1 text-[10px]">
        {sortDirection() === "asc" ? "▲" : "▼"}
      </span>
    </Show>
  );

  const hotSpots = createMemo(() => {
    if (!props.data) return [];

    const selected = selectedHotSpotMetrics();
    if (selected.length === 0) return [];

    // Flatten tree to collect all nodes that have metrics
    const nodes: Node[] = [];
    const traverse = (node: Node) => {
      if (node.metrics && node.type !== "folder") {
        nodes.push(node);
      }
      if (node.children && node.children.length > 0) {
        node.children.forEach(traverse);
      }
    };
    traverse(props.data);

    // Calculate max for each selected metric to normalize
    const maxValues: Record<string, number> = {};
    selected.forEach((m) => {
      maxValues[m] = 0;
      nodes.forEach((node) => {
        let val = (node.metrics as any)?.[m] || 0;
        // Handle inversion for max calculation
        const metricDef = HOTSPOT_METRICS.find((def) => def.id === m);
        if (metricDef?.invert) {
          // For inverted metrics (e.g. comment density 0..1), we want to maximize "badness".
          // Badness = 1 - density.
          // So max badness is max(1 - density).
          val = 1 - val;
        }

        // Protect against bad values
        if (!isFinite(val)) val = 0;

        if (val > maxValues[m]) maxValues[m] = val;
      });
    });

    // Score and sort
    return nodes
      .map((node) => {
        let score = 0;
        selected.forEach((m) => {
          let val = (node.metrics as any)?.[m] || 0;
          const metricDef = HOTSPOT_METRICS.find((def) => def.id === m);

          if (metricDef?.invert) {
            val = 1 - val;
          }

          if (!isFinite(val)) val = 0;
          if (val < 0) val = 0; // Ensure no negative contribution

          const max = maxValues[m];
          if (max > 0) {
            score += val / max;
          }
        });
        return { node, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  });

  const [isHotspotMultiSelectMode, setIsHotspotMultiSelectMode] =
    createSignal(false);

  const handleHotSpotMetricClick = (
    e: MouseEvent,
    metricId: HotSpotMetricId
  ) => {
    const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
    const current = selectedHotSpotMetrics();

    if (isMulti) {
      if (current.includes(metricId)) {
        // Don't allow deselecting the last one
        if (current.length > 1) {
          setSelectedHotSpotMetrics(current.filter((m) => m !== metricId));
        }
      } else {
        setSelectedHotSpotMetrics([...current, metricId]);
      }
    } else {
      // Default behavior: pick a new single metric
      setSelectedHotSpotMetrics([metricId]);
    }
  };

  const [expandAllSignal, setExpandAllSignal] = createSignal<boolean | null>(
    null
  );

  return (
    <ExplorerContext.Provider
      value={{
        sortField,
        sortDirection,
        onSelect: props.onFileSelect,
        onZoom: props.onZoom,
        filter: props.filter,
        visibleColumns,
        expandAllSignal,
        rootData: props.data,
      }}
    >
      <div class="flex flex-col h-full plc-panel border-l border-y-0 border-r-0 rounded-none w-full">
        {/* Toolbar */}
        <div class="plc-toolbar p-2 border-b flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <div class="flex rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5">
              <Button
                variant="tab"
                active={viewMode() === "tree"}
                size="sm"
                class="px-2"
                onClick={() => setViewMode("tree")}
              >
                Tree
              </Button>
              <Button
                variant="tab"
                active={viewMode() === "hotspots"}
                size="sm"
                class="px-2"
                onClick={() => setViewMode("hotspots")}
              >
                Hot Spots
              </Button>
            </div>

            <div class="flex items-center gap-1 ml-auto">
              <IconButton
                label="Expand All"
                onClick={() => setExpandAllSignal(true)}
              >
                [+]
              </IconButton>
              <IconButton
                label="Collapse All"
                onClick={() => setExpandAllSignal(false)}
              >
                [-]
              </IconButton>
              <div class="relative">
                <Popover
                  isOpen={showColumnPicker()}
                  onOpenChange={setShowColumnPicker}
                  placement="bottom-end"
                  offset={{ x: 0, y: 4 }}
                  trigger={(triggerProps) => (
                    <IconButton
                      ref={triggerProps.ref}
                      label="Columns"
                      onClick={(e) => triggerProps.onClick(e)}
                    >
                      ⚙️
                    </IconButton>
                  )}
                >
                  <PopoverPanel width="sm">
                    <PopoverSectionTitle>
                      Visible Columns
                    </PopoverSectionTitle>
                    <div class="space-y-1">
                      <CheckboxRow
                        checked={visibleColumns().includes("loc")}
                        onChange={() => toggleColumn("loc")}
                        label="LOC"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("complexity")}
                        onChange={() => toggleColumn("complexity")}
                        label="Complexity"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("file_size")}
                        onChange={() => toggleColumn("file_size")}
                        label="Size"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("file_count")}
                        onChange={() => toggleColumn("file_count")}
                        label="File Count"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("gitignored")}
                        onChange={() => toggleColumn("gitignored")}
                        label="Gitignored"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("comment_density")}
                        onChange={() => toggleColumn("comment_density")}
                        label="Density"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("todo_count")}
                        onChange={() => toggleColumn("todo_count")}
                        label="TODOs"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("max_nesting_depth")}
                        onChange={() => toggleColumn("max_nesting_depth")}
                        label="Depth"
                      />
                      <CheckboxRow
                        checked={visibleColumns().includes("parameter_count")}
                        onChange={() => toggleColumn("parameter_count")}
                        label="Params"
                      />
                    </div>
                  </PopoverPanel>
                </Popover>
              </div>
            </div>
          </div>

          <TextInput
            type="text"
            placeholder={
              viewMode() === "tree" ? "Filter files..." : "Filter hot spots..."
            }
            value={props.filter}
            onInput={(e) => props.onFilterChange(e.currentTarget.value)}
          />
        </div>

        <Show when={viewMode() === "tree"}>
          <div class="plc-table-header plc-label-caps flex items-center border-b select-none">
            <div class="pl-2 flex-1 flex items-center gap-2">
              <Button
                size="xs"
                class={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  props.data &&
                  props.fullData &&
                  props.data.path !== props.fullData.path
                    ? "hover:bg-[var(--plc-surface-hover)] text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)] cursor-pointer"
                    : "opacity-0 pointer-events-none cursor-default"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    !props.data ||
                    !props.fullData ||
                    props.data.path === props.fullData.path
                  )
                    return;

                  const parent = findParentNode(
                    props.fullData,
                    props.data.path
                  );
                  if (parent) {
                    props.onZoom(parent);
                  }
                }}
                title="Go Up One Level"
              >
                ⬆
              </Button>
              <div
                class="cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center"
                onClick={() => handleHeaderClick("name")}
              >
                Name <SortIcon field="name" />
              </div>
            </div>

            <Show when={visibleColumns().includes("gitignored")}>
              <div
                class="w-10 text-right pr-1 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("gitignored")}
                title="Gitignored Files"
              >
                Ign <SortIcon field="gitignored" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("file_count")}>
              <div
                class="w-12 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("file_count")}
                title="File Count"
              >
                # <SortIcon field="file_count" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("file_size")}>
              <div
                class="w-16 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("file_size")}
              >
                Size <SortIcon field="file_size" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("loc")}>
              <div
                class="w-16 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("loc")}
              >
                LOC <SortIcon field="loc" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("complexity")}>
              <div
                class="w-12 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("complexity")}
              >
                CCN <SortIcon field="complexity" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("comment_density")}>
              <div
                class="w-12 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("comment_density")}
                title="Comment Density"
              >
                Den% <SortIcon field="comment_density" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("todo_count")}>
              <div
                class="w-10 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("todo_count")}
                title="TODO Count"
              >
                TODO <SortIcon field="todo_count" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("max_nesting_depth")}>
              <div
                class="w-10 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("max_nesting_depth")}
                title="Max Nesting Depth"
              >
                Dep <SortIcon field="max_nesting_depth" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("parameter_count")}>
              <div
                class="w-10 text-right pr-2 cursor-pointer hover:text-[var(--plc-on-surface)] flex items-center justify-end"
                onClick={() => handleHeaderClick("parameter_count")}
                title="Parameter Count"
              >
                Prm <SortIcon field="parameter_count" />
              </div>
            </Show>
          </div>
          <div class="flex-1 overflow-y-auto overflow-x-hidden">
            <Show when={props.data}>
              <TreeNode node={props.data} depth={0} />
            </Show>
          </div>
        </Show>

        <Show when={viewMode() === "hotspots"}>
          <div
            class="p-2 border-b border-[var(--plc-border)] flex flex-wrap gap-1 bg-[var(--plc-surface)]"
            onMouseMove={(e) =>
              setIsHotspotMultiSelectMode(e.shiftKey || e.metaKey || e.ctrlKey)
            }
            onMouseLeave={() => setIsHotspotMultiSelectMode(false)}
          >
            <For each={HOTSPOT_METRICS}>
              {(metric) => (
                <Button
                  variant="chip"
                  active={selectedHotSpotMetrics().includes(metric.id)}
                  size="xs"
                  class={isHotspotMultiSelectMode() ? "cursor-copy" : ""}
                  onClick={(e) => handleHotSpotMetricClick(e, metric.id)}
                >
                  {metric.label}
                </Button>
              )}
            </For>
          </div>
          <div class="flex-1 overflow-y-auto overflow-x-hidden">
            <For each={hotSpots()}>
              {(item, i) => (
                <HotSpotItem
                  node={item.node}
                  rank={i() + 1}
                  score={item.score}
                  metrics={selectedHotSpotMetrics()}
                />
              )}
            </For>
            <Show when={hotSpots().length === 0}>
              <div class="p-4 text-center text-[var(--plc-on-subtle)] text-sm">
                No hot spots found
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </ExplorerContext.Provider>
  );
}
