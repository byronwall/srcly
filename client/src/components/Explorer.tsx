import { createSignal, createMemo, For, Show, createContext, createEffect, onCleanup } from "solid-js";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
} from "lucide-solid";
import { MetricPicker } from "./MetricPicker";
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
import { extractFilePath } from "../utils/dataProcessing";
import {
  EXPLORER_ROW_HEIGHT,
  flattenExplorerTree,
  getVirtualTreeRange,
} from "../utils/explorerTree";
import {
  EXPLORER_COLUMNS,
  explorerSortValue,
  visibleExplorerColumns,
  type ExplorerColumn,
  type ExplorerSortField,
} from "../utils/explorerColumns";
import { ExplorerScopeBar } from "./ExplorerScopeBar";
import { TREEMAP_GRADIENT } from "../viz/treemap/utils/colors";

export interface Node {
  name: string;
  path: string;
  type: "folder" | "file" | "function" | "class" | "misc";
  children?: Node[];
  start_line?: number;
  end_line?: number;
  metrics?: {
    loc: number;
    // Max CCN of any function or nested scope inside this node.
    complexity: number;
    // Mean CCN per function.
    complexity_avg?: number;
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
    // "ok" | "timeout" | "error" | "crash"; failed files keep fallback LOC.
    analysis_status?: string;
    analysis_error?: string;
    analysis_failed_count?: number;
  };
}

type SortField = ExplorerSortField;
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
  columns: () => ExplorerColumn[];
  colorMetric: () => HotSpotMetricId;
  rootData: Node | null;
  focusedPath: () => string;
  tabbablePath: () => string;
  setFocusedPath: (path: string) => void;
  toggleExpanded: (node: Node) => void;
  onTreeKeyDown: (index: number, event: KeyboardEvent) => void;
}

export const ExplorerContext = createContext<ExplorerContextType>();

export const findNodeByPath = (root: Node, path: string): Node | null => {
  if (root.path === path) return root;

  if (!root.children || root.children.length === 0) return null;

  for (const child of root.children) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }

  return null;
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
  const [pickedColumns, setPickedColumns] = createSignal<string[]>(["loc"]);
  // The treemap colors by the first hot spot metric; the table always shows it.
  const colorMetric = () => selectedHotSpotMetrics()[0] ?? "complexity";
  const colorMetricDef = () =>
    HOTSPOT_METRICS.find((def) => def.id === colorMetric()) ?? HOTSPOT_METRICS[0];
  const columns = createMemo(() => visibleExplorerColumns(pickedColumns(), colorMetric()));
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set());
  const [collapsedPaths, setCollapsedPaths] = createSignal<Set<string>>(new Set());
  const [expandedMode, setExpandedMode] = createSignal<"manual" | "all" | "none">("manual");
  const [focusedPath, setFocusedPath] = createSignal("");
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  let treeScroller: HTMLDivElement | undefined;
  let lastRootPath: string | undefined;

  createEffect(() => {
    const rootPath = props.data?.path;
    if (rootPath === lastRootPath) return;
    lastRootPath = rootPath;
    setExpandedPaths(rootPath ? new Set<string>([rootPath]) : new Set<string>());
    setCollapsedPaths(new Set<string>());
    setExpandedMode("manual");
    setFocusedPath(rootPath ?? "");
  });

  const isExpanded = (node: Node) => {
    if (!node.children?.length) return false;
    if (collapsedPaths().has(node.path)) return false;
    if (expandedMode() === "all") return true;
    if (expandedMode() === "none") return expandedPaths().has(node.path);
    return expandedPaths().has(node.path) || Boolean(props.filter.trim());
  };

  const treeRows = createMemo(() => {
    const field = sortField();
    return flattenExplorerTree<Node>(props.data, {
      isExpanded,
      getValue: (node) => explorerSortValue(node, field),
      direction: sortDirection(),
      // The scope bar above names the root, so the rows start at its children.
      includeRoot: false,
    });
  });

  const treeRange = createMemo(() =>
    getVirtualTreeRange(scrollTop(), viewportHeight(), treeRows().length)
  );
  const visibleTreeRows = createMemo(() => {
    const rows = treeRows();
    const { start, end } = treeRange();
    return rows.slice(start, end);
  });
  const tabbablePath = createMemo(() => {
    const visible = visibleTreeRows();
    return visible.some((row) => row.node.path === focusedPath())
      ? focusedPath()
      : visible[0]?.node.path ?? "";
  });

  createEffect(() => {
    const rows = treeRows();
    if (!rows.some((row) => row.node.path === focusedPath())) {
      setFocusedPath(rows[0]?.node.path ?? "");
    }
  });

  createEffect(() => {
    viewMode();
    const element = treeScroller;
    if (!element) return;
    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(element.clientHeight);
    });
    resizeObserver.observe(element);
    setViewportHeight(element.clientHeight);
    onCleanup(() => resizeObserver.disconnect());
  });

  const toggleExpanded = (node: Node) => {
    const path = node.path;
    if (isExpanded(node)) {
      setExpandedPaths((paths) => {
        const next = new Set(paths);
        next.delete(path);
        return next;
      });
      setCollapsedPaths((paths) => new Set(paths).add(path));
    } else {
      setExpandedPaths((paths) => new Set(paths).add(path));
      setCollapsedPaths((paths) => {
        const next = new Set(paths);
        next.delete(path);
        return next;
      });
    }
  };

  const focusTreeRow = (index: number) => {
    const rows = treeRows();
    const row = rows[index];
    if (!row) return;
    setFocusedPath(row.node.path);
    const rowTop = index * EXPLORER_ROW_HEIGHT;
    const top = treeScroller?.scrollTop ?? scrollTop();
    const height = treeScroller?.clientHeight ?? viewportHeight();
    if (treeScroller && rowTop < top) treeScroller.scrollTop = rowTop;
    else if (treeScroller && rowTop + EXPLORER_ROW_HEIGHT > top + height)
      treeScroller.scrollTop = rowTop + EXPLORER_ROW_HEIGHT - height;
    if (treeScroller) setScrollTop(treeScroller.scrollTop);
    requestAnimationFrame(() => {
      treeScroller?.querySelector<HTMLElement>(`[data-explorer-index="${index}"]`)?.focus();
    });
  };

  const onTreeKeyDown = (index: number, event: KeyboardEvent) => {
    const rows = treeRows();
    const row = rows[index];
    if (!row) return;
    if (event.key === "ArrowDown") focusTreeRow(Math.min(rows.length - 1, index + 1));
    else if (event.key === "ArrowUp") focusTreeRow(Math.max(0, index - 1));
    else if (event.key === "Home") focusTreeRow(0);
    else if (event.key === "End") focusTreeRow(rows.length - 1);
    else if (event.key === "ArrowRight") {
      if (row.hasChildren && !isExpanded(row.node)) toggleExpanded(row.node);
      else if (rows[index + 1]?.depth > row.depth) focusTreeRow(index + 1);
      else return;
    } else if (event.key === "ArrowLeft") {
      if (row.hasChildren && isExpanded(row.node)) toggleExpanded(row.node);
      else {
        for (let i = index - 1; i >= 0; i--) {
          if (rows[i].depth < row.depth) {
            focusTreeRow(i);
            break;
          }
        }
      }
    } else if (event.key === "Enter" || event.key === " ") {
      const node = row.node;
      if (node.type === "folder") props.onZoom(node);
      else {
        const path = extractFilePath(node.path, node.type);
        if (path) props.onFileSelect(path, node.start_line, node.end_line, node);
      }
    } else return;
    event.preventDefault();
  };

  const handleHeaderClick = (field: SortField) => {
    if (sortField() === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const toggleColumn = (col: string) => {
    const current = pickedColumns();
    setPickedColumns(
      current.includes(col) ? current.filter((c) => c !== col) : [...current, col]
    );
  };

  const SortIcon = (p: { field: SortField }) => (
    <Show when={sortField() === p.field}>
      <span class="mr-0.5 inline-flex shrink-0" aria-hidden="true">
        {sortDirection() === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
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

  return (
    <ExplorerContext.Provider
      value={{
        sortField,
        sortDirection,
        onSelect: props.onFileSelect,
        onZoom: props.onZoom,
        filter: props.filter,
        columns,
        colorMetric,
        rootData: props.data,
        focusedPath,
        tabbablePath,
        setFocusedPath,
        toggleExpanded,
        onTreeKeyDown,
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
                label="Expand all"
                onClick={() => { setCollapsedPaths(new Set<string>()); setExpandedMode("all"); }}
              >
                <ChevronsUpDown size={15} aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Collapse all"
                onClick={() => { setExpandedPaths(new Set<string>()); setCollapsedPaths(new Set<string>()); setExpandedMode("none"); }}
              >
                <ChevronsDownUp size={15} aria-hidden="true" />
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
                      label="Choose columns"
                      onClick={(e) => triggerProps.onClick(e)}
                    >
                      <Columns3 size={15} aria-hidden="true" />
                    </IconButton>
                  )}
                >
                  <PopoverPanel width="md">
                    <PopoverSectionTitle>Columns</PopoverSectionTitle>
                    <div class="max-h-80 space-y-1 overflow-y-auto pr-1">
                      <For each={EXPLORER_COLUMNS}>
                        {(column) => (
                          <CheckboxRow
                            checked={
                              column.id === colorMetric() ||
                              pickedColumns().includes(column.id)
                            }
                            disabled={column.id === colorMetric()}
                            onChange={() => toggleColumn(column.id)}
                            label={
                              column.id === colorMetric()
                                ? `${column.title} (color)`
                                : column.title
                            }
                          />
                        )}
                      </For>
                    </div>
                  </PopoverPanel>
                </Popover>
              </div>
            </div>
          </div>

          <TextInput
            type="text"
            placeholder={
              viewMode() === "tree" ? "Filter files…" : "Filter hot spots…"
            }
            value={props.filter}
            onInput={(e) => props.onFilterChange(e.currentTarget.value)}
          />
        </div>

        <Show when={viewMode() === "tree"}>
          <Show when={props.data}>
            {(root) => (
              <ExplorerScopeBar
                root={root()}
                fullRoot={props.fullData}
                colorMetric={colorMetricDef()}
                onZoom={props.onZoom}
                onSelect={props.onFileSelect}
              />
            )}
          </Show>
          <div class="plc-table-header plc-label-caps flex items-center border-b select-none" style={{ height: "24px" }}>
            <button
              type="button"
              class="flex h-full flex-1 items-center pl-2 hover:text-[var(--plc-on-surface)]"
              onClick={() => handleHeaderClick("name")}
            >
              Name <SortIcon field="name" />
            </button>
            <For each={columns()}>
              {(column) => (
                <button
                  type="button"
                  class="relative flex h-full shrink-0 items-center justify-end pr-1.5 hover:text-[var(--plc-on-surface)]"
                  style={{ width: `${column.width}px` }}
                  title={
                    column.id === colorMetric()
                      ? `${column.title} — treemap color`
                      : column.title
                  }
                  onClick={() => handleHeaderClick(column.id)}
                >
                  <SortIcon field={column.id} />
                  <span class="truncate">{column.header}</span>
                  <Show when={column.id === colorMetric()}>
                    <span
                      aria-hidden="true"
                      class="absolute inset-x-1 bottom-0 h-[3px] rounded-full"
                      style={{ background: TREEMAP_GRADIENT }}
                    />
                  </Show>
                </button>
              )}
            </For>
          </div>
          <div
            ref={(element) => (treeScroller = element)}
            class="flex-1 overflow-y-auto overflow-x-hidden"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <Show
              when={visibleTreeRows().length > 0}
              fallback={
                <div class="p-4 text-center text-[var(--plc-on-subtle)] text-sm">
                  {props.filter.trim() ? "No files match this filter." : "No files to show."}
                </div>
              }
            >
              <div role="tree" aria-label="Codebase files">
                <div role="presentation" aria-hidden="true" style={{ height: `${treeRange().top}px` }} />
                <For each={visibleTreeRows()}>
                  {(row, index) => (
                    <TreeNode
                      node={row.node}
                      depth={row.depth}
                      index={treeRange().start + index()}
                      expanded={isExpanded(row.node)}
                      parent={row.parent}
                    />
                  )}
                </For>
                <div role="presentation" aria-hidden="true" style={{ height: `${treeRange().bottom}px` }} />
              </div>
            </Show>
          </div>
        </Show>

        <Show when={viewMode() === "hotspots"}>
          <div class="flex items-center gap-2 border-b border-[var(--plc-border)] px-2 py-1.5">
            <MetricPicker
              prefix="Rank by"
              selected={selectedHotSpotMetrics()}
              onChange={(ids: HotSpotMetricId[]) => setSelectedHotSpotMetrics(ids)}
              class="flex-1"
            />
            <span class="plc-data-sm shrink-0 text-[var(--plc-on-subtle)]">
              {hotSpots().length.toLocaleString("en-US")} results
            </span>
          </div>
          <div class="flex-1 overflow-y-auto overflow-x-hidden">
            <For each={hotSpots()}>
              {(item, i) => (
                <HotSpotItem
                  node={item.node}
                  rank={i() + 1}
                  score={item.score}
                  maxScore={hotSpots()[0]?.score ?? 0}
                  metrics={selectedHotSpotMetrics()}
                />
              )}
            </For>
            <Show when={hotSpots().length === 0}>
              <div class="p-4 text-center text-[var(--plc-on-subtle)] text-sm">
                No hot spots match this filter.
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </ExplorerContext.Provider>
  );
}
