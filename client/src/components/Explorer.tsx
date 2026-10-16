import { createSignal, createMemo, For, Show, createContext, createEffect, onCleanup } from "solid-js";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  Flame,
  ListTree,
  PanelLeftClose,
} from "lucide-solid";
import { MetricPicker } from "./MetricPicker";
import Popover from "./Popover";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
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
  autoExpandPaths,
  flattenExplorerTree,
  getVirtualTreeRange,
} from "../utils/explorerTree";
import {
  explorerSortValue,
  visibleExplorerColumns,
  type ExplorerColumn,
  type ExplorerSortField,
} from "../utils/explorerColumns";
import { ExplorerScopeBar } from "./ExplorerScopeBar";
import { linkedPathFor, nearestLinked, setHoverFrom } from "../utils/hoverLink";
import { ColumnPickerPanel, ExplorerEmpty, ExplorerFilter } from "./ExplorerControls";
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
  /** The row standing in for the treemap's hovered tile (itself or its nearest shown ancestor). */
  linkedRowPath: () => string | null;
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

const HOT_SPOT_LIMIT = 50;

const VIEW_TABS = [
  { id: "tree", label: "Tree", icon: ListTree },
  { id: "hotspots", label: "Hot Spots", icon: Flame },
] as const;

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
  /** The zoomed node before filtering, so the scope bar survives a filter with no matches. */
  scopeRoot?: any;
  /** The whole scan, unfiltered, for the breadcrumb. */
  scanRoot?: any;
  onCollapse?: () => void;
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
  const scopeNode = () => props.data ?? props.scopeRoot ?? null;
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
    // Open the biggest folders until the visible rows roughly fill the panel.
    const budget = Math.max(20, Math.floor((treeScroller?.clientHeight || window.innerHeight - 220) / EXPLORER_ROW_HEIGHT));
    setExpandedPaths(props.data ? autoExpandPaths(props.data, budget) : new Set<string>());
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

  const linkedRowPath = createMemo(
    () => nearestLinked(treeRows(), linkedPathFor("explorer"), (row) => row.node.path)?.node.path ?? null
  );

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
      .slice(0, HOT_SPOT_LIMIT);
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
        linkedRowPath,
        rootData: props.data,
        focusedPath,
        tabbablePath,
        setFocusedPath,
        toggleExpanded,
        onTreeKeyDown,
      }}
    >
      {/* Rows can unmount while hovered (virtual scroll), so the panel clears the hover too. */}
      <div
        class="flex h-full w-full flex-col bg-[var(--plc-surface)]"
        onPointerLeave={() => setHoverFrom("explorer", null)}
      >
        {/* Same 40px toolbar as the treemap header, so the borders line up across the seam. */}
        <div class="plc-toolbar flex shrink-0 items-center gap-1 border-b px-2">
          <div
            role="tablist"
            aria-label="Sidebar view"
            class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
          >
            <For each={VIEW_TABS}>
              {(tab) => (
                <Button
                  variant="tab"
                  size="sm"
                  role="tab"
                  aria-selected={viewMode() === tab.id}
                  active={viewMode() === tab.id}
                  class="h-6 gap-1.5 px-2"
                  onClick={() => setViewMode(tab.id)}
                >
                  <tab.icon size={13} aria-hidden="true" />
                  {tab.label}
                </Button>
              )}
            </For>
          </div>

          <div class="ml-auto flex items-center">
            <Show when={viewMode() === "tree"}>
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
              <Popover
                isOpen={showColumnPicker()}
                onOpenChange={setShowColumnPicker}
                placement="bottom-end"
                offset={{ x: 0, y: 4 }}
                trigger={(triggerProps) => (
                  <IconButton
                    ref={triggerProps.ref}
                    label="Choose columns"
                    aria-expanded={showColumnPicker()}
                    class={showColumnPicker() ? "bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]" : ""}
                    onClick={(e) => triggerProps.onClick(e)}
                  >
                    <Columns3 size={15} aria-hidden="true" />
                  </IconButton>
                )}
              >
                <ColumnPickerPanel
                  colorMetric={colorMetric()}
                  picked={pickedColumns()}
                  onToggle={toggleColumn}
                />
              </Popover>
              <span aria-hidden="true" class="mx-1 h-4 w-px bg-[var(--plc-border)]" />
            </Show>
            <IconButton label="Hide sidebar ( [ )" onClick={() => props.onCollapse?.()}>
              <PanelLeftClose size={15} aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        <div class="flex shrink-0 items-center border-b border-[var(--plc-border)] px-2 py-1.5">
          <ExplorerFilter
            value={props.filter}
            placeholder={viewMode() === "tree" ? "Filter files" : "Filter hot spots"}
            onChange={props.onFilterChange}
          />
        </div>

        <Show when={scopeNode()}>
          {(root) => (
            <ExplorerScopeBar
              root={root()}
              fullRoot={props.scanRoot ?? props.fullData}
              colorMetric={colorMetricDef()}
              showTop={viewMode() === "tree"}
              onZoom={props.onZoom}
              onSelect={props.onFileSelect}
            />
          )}
        </Show>

        <Show when={viewMode() === "tree"}>
          <div class="plc-table-header plc-label-caps flex items-center border-b select-none" style={{ height: "24px" }}>
            {/* Indented to the row icons, so "Name" sits over the names. */}
            <button
              type="button"
              class="flex h-full flex-1 items-center pl-6 transition-colors duration-150 hover:text-[var(--plc-on-surface)]"
              onClick={() => handleHeaderClick("name")}
            >
              Name <SortIcon field="name" />
            </button>
            <For each={columns()}>
              {(column) => (
                <button
                  type="button"
                  class="relative flex h-full shrink-0 items-center justify-end pr-1.5 transition-colors duration-150 hover:text-[var(--plc-on-surface)]"
                  style={{ width: `${column.width}px` }}
                  title={
                    column.id === colorMetric()
                      ? `${column.title} (treemap color) · click to sort`
                      : `${column.title} · click to sort`
                  }
                  onClick={() => handleHeaderClick(column.id)}
                >
                  <SortIcon field={column.id} />
                  <span class="truncate">{column.header}</span>
                  <Show when={column.id === colorMetric()}>
                    <span
                      aria-hidden="true"
                      class="absolute bottom-0 left-1.5 right-1.5 h-[2px] rounded-full"
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
                <ExplorerEmpty
                  filter={props.filter}
                  what="files"
                  onClear={() => props.onFilterChange("")}
                />
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
          <div class="flex shrink-0 items-center gap-2 border-b border-[var(--plc-border)] px-2 py-1.5">
            <MetricPicker
              prefix="Rank by"
              selected={selectedHotSpotMetrics()}
              onChange={(ids: HotSpotMetricId[]) => setSelectedHotSpotMetrics(ids)}
              class="flex-1"
            />
            <span class="plc-data-sm shrink-0 text-[var(--plc-on-subtle)]">
              {hotSpots().length === HOT_SPOT_LIMIT
                ? `Top ${HOT_SPOT_LIMIT}`
                : `${hotSpots().length.toLocaleString("en-US")} results`}
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
              <ExplorerEmpty
                filter={props.filter}
                what="hot spots"
                onClear={() => props.onFilterChange("")}
              />
            </Show>
          </div>
        </Show>
      </div>
    </ExplorerContext.Provider>
  );
}
