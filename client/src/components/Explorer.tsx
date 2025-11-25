import {
  createSignal,
  createMemo,
  For,
  Show,
  createContext,
  useContext,
  createEffect,
} from "solid-js";
import { extractFilePath } from "../utils/dataProcessing";

interface Node {
  name: string;
  path: string;
  type: "folder" | "file" | "function" | "class" | "misc";
  children?: Node[];
  metrics?: {
    loc: number;
    complexity: number;
    gitignored_count?: number;
    file_size?: number;
    file_count?: number;
  };
}

type SortField =
  | "name"
  | "loc"
  | "complexity"
  | "file_size"
  | "file_count"
  | "gitignored";
type SortDirection = "asc" | "desc";

interface ExplorerContextType {
  sortField: () => SortField;
  sortDirection: () => SortDirection;
  onSelect: (path: string) => void;
  onZoom: (node: any) => void;
  onToggleHidden: (path: string) => void;
  hiddenPaths: string[];
  filter: string;
  visibleColumns: () => string[];
  expandAllSignal: () => boolean | null;
}

const ExplorerContext = createContext<ExplorerContextType>();

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const TreeNode = (props: { node: Node; depth: number }) => {
  const ctx = useContext(ExplorerContext)!;
  // Expand root by default, or if filtering is active
  const [expanded, setExpanded] = createSignal(props.depth < 1 || !!ctx.filter);

  createEffect(() => {
    const signal = ctx.expandAllSignal();
    if (signal !== null) {
      setExpanded(signal);
    }
  });

  const hasChildren = props.node.children && props.node.children.length > 0;

  const sortedChildren = createMemo(() => {
    if (!props.node.children) return [];
    const field = ctx.sortField();
    const dir = ctx.sortDirection();

    return [...props.node.children].sort((a, b) => {
      let valA: any = a.name;
      let valB: any = b.name;

      if (field === "loc") {
        valA = a.metrics?.loc || 0;
        valB = b.metrics?.loc || 0;
      } else if (field === "complexity") {
        valA = a.metrics?.complexity || 0;
        valB = b.metrics?.complexity || 0;
      } else if (field === "file_size") {
        valA = a.metrics?.file_size || 0;
        valB = b.metrics?.file_size || 0;
      } else if (field === "file_count") {
        valA = a.metrics?.file_count || 0;
        valB = b.metrics?.file_count || 0;
      } else if (field === "gitignored") {
        valA = a.metrics?.gitignored_count || 0;
        valB = b.metrics?.gitignored_count || 0;
      }

      if (valA < valB) return dir === "asc" ? -1 : 1;
      if (valA > valB) return dir === "asc" ? 1 : -1;
      return 0;
    });
  });

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) setExpanded(!expanded());
  };

  const handleClick = () => {
    const path = extractFilePath(props.node.path, props.node.type);
    if (path) ctx.onSelect(path);
  };

  const getIcon = () => {
    if (props.node.type === "folder") return "📁";
    if (props.node.name === "(misc/imports)") return "⚙️";
    return "📄";
  };

  const handleDrillDown = (e: MouseEvent) => {
    e.stopPropagation();
    ctx.onZoom(props.node);
  };

  const handleToggleHidden = (e: MouseEvent) => {
    e.stopPropagation();
    ctx.onToggleHidden(props.node.path);
  };

  const isHidden = () => ctx.hiddenPaths.includes(props.node.path);

  return (
    <>
      <div
        class={`flex items-center hover:bg-gray-800 cursor-pointer text-sm py-0.5 border-b border-gray-800/50 select-none ${
          isHidden() ? "opacity-50" : ""
        }`}
        style={{ "padding-left": `${props.depth * 12}px` }}
        onClick={handleClick}
      >
        <div
          class="w-6 text-center text-gray-500 hover:text-white cursor-pointer"
          onClick={toggle}
        >
          {hasChildren ? (
            expanded() ? (
              "▼"
            ) : (
              "▶"
            )
          ) : (
            <span class="opacity-0">.</span>
          )}
        </div>
        <div class="flex-1 flex items-center gap-1 truncate text-gray-300 overflow-hidden group">
          <span class="opacity-70 text-xs">{getIcon()}</span>
          <span class="truncate" title={props.node.name}>
            {props.node.name}
          </span>
          {/* Actions */}
          <div class="hidden group-hover:flex items-center gap-1 ml-2">
            <Show when={props.node.type === "folder"}>
              <button
                class="text-[10px] px-1 bg-blue-900/50 hover:bg-blue-800 text-blue-200 rounded"
                title="Drill Down"
                onClick={handleDrillDown}
              >
                🔍
              </button>
            </Show>
            <button
              class="text-[10px] px-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              title={isHidden() ? "Show" : "Hide"}
              onClick={handleToggleHidden}
            >
              {isHidden() ? "👁️" : "🚫"}
            </button>
          </div>
        </div>

        <Show when={ctx.visibleColumns().includes("gitignored")}>
          <div class="w-10 text-right text-gray-600 font-mono text-[10px] pr-1 shrink-0">
            {props.node.metrics?.gitignored_count || ""}
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("file_count")}>
          <div class="w-12 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {props.node.metrics?.file_count || ""}
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("file_size")}>
          <div class="w-16 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {formatSize(props.node.metrics?.file_size)}
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("loc")}>
          <div class="w-16 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {props.node.metrics?.loc || 0}
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("complexity")}>
          <div class="w-12 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {props.node.metrics?.complexity || 0}
          </div>
        </Show>
      </div>
      <Show when={expanded() && hasChildren}>
        <For each={sortedChildren()}>
          {(child) => <TreeNode node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </>
  );
};

const HotSpotItem = (props: { node: Node; rank: number }) => {
  const ctx = useContext(ExplorerContext)!;

  const handleClick = () => {
    const path = extractFilePath(props.node.path, props.node.type);
    if (path) ctx.onSelect(path);
  };

  return (
    <div
      class="flex items-center hover:bg-gray-800 cursor-pointer text-sm py-1 border-b border-gray-800/50 px-2"
      onClick={handleClick}
    >
      <div class="w-6 text-gray-500 text-xs font-mono">#{props.rank}</div>
      <div class="flex-1 truncate text-gray-300">
        <div class="truncate" title={props.node.path}>
          {props.node.name}
        </div>
        <div class="text-[10px] text-gray-500 truncate">{props.node.path}</div>
      </div>
      <div class="flex flex-col items-end gap-0.5">
        <div class="text-xs text-red-400 font-mono" title="Complexity">
          CCN: {props.node.metrics?.complexity}
        </div>
        <div class="text-[10px] text-gray-500 font-mono" title="LOC">
          LOC: {props.node.metrics?.loc}
        </div>
      </div>
    </div>
  );
};

export default function Explorer(props: {
  data: any;
  onFileSelect: (path: string) => void;
  onZoom: (node: any) => void;
  filter: string;
  onFilterChange: (val: string) => void;
  hiddenPaths: string[];
  onToggleHidden: (path: string) => void;
}) {
  const [sortField, setSortField] = createSignal<SortField>("loc");
  const [sortDirection, setSortDirection] = createSignal<SortDirection>("desc");
  const [viewMode, setViewMode] = createSignal<"tree" | "hotspots">("tree");
  const [showColumnPicker, setShowColumnPicker] = createSignal(false);
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
    // Flatten tree to find files with high complexity
    const files: Node[] = [];
    const traverse = (node: Node) => {
      if (node.type === "file") {
        files.push(node);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(props.data);

    // Sort by complexity desc
    return files
      .sort(
        (a, b) => (b.metrics?.complexity || 0) - (a.metrics?.complexity || 0)
      )
      .slice(0, 50); // Top 50
  });

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
        hiddenPaths: props.hiddenPaths,
        onToggleHidden: props.onToggleHidden,
        visibleColumns,
        expandAllSignal,
      }}
    >
      <div class="flex flex-col h-full bg-[#1e1e1e] text-white border-l border-[#333] w-[450px]">
        {/* Toolbar */}
        <div class="p-2 border-b border-[#333] bg-[#252526] flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <div class="flex bg-[#1e1e1e] rounded p-0.5 border border-[#333]">
              <button
                class={`px-2 py-1 text-xs rounded ${
                  viewMode() === "tree"
                    ? "bg-blue-900 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
                onClick={() => setViewMode("tree")}
              >
                Tree
              </button>
              <button
                class={`px-2 py-1 text-xs rounded ${
                  viewMode() === "hotspots"
                    ? "bg-blue-900 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
                onClick={() => setViewMode("hotspots")}
              >
                Hot Spots
              </button>
            </div>

            <div class="flex items-center gap-1 ml-auto">
              <button
                class="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white text-xs"
                title="Expand All"
                onClick={() => setExpandAllSignal(true)}
              >
                [+]
              </button>
              <button
                class="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white text-xs"
                title="Collapse All"
                onClick={() => setExpandAllSignal(false)}
              >
                [-]
              </button>
              <div class="relative">
                <button
                  class="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white"
                  title="Columns"
                  onClick={() => setShowColumnPicker(!showColumnPicker())}
                >
                  ⚙️
                </button>
                <Show when={showColumnPicker()}>
                  <div class="absolute right-0 top-full mt-1 bg-[#252526] border border-[#333] rounded shadow-xl z-50 p-2 w-40">
                    <div class="text-xs font-bold text-gray-400 mb-2">
                      Visible Columns
                    </div>
                    <div class="space-y-1">
                      <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={visibleColumns().includes("loc")}
                          onChange={() => toggleColumn("loc")}
                        />{" "}
                        LOC
                      </label>
                      <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={visibleColumns().includes("complexity")}
                          onChange={() => toggleColumn("complexity")}
                        />{" "}
                        Complexity
                      </label>
                      <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={visibleColumns().includes("file_size")}
                          onChange={() => toggleColumn("file_size")}
                        />{" "}
                        Size
                      </label>
                      <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={visibleColumns().includes("file_count")}
                          onChange={() => toggleColumn("file_count")}
                        />{" "}
                        File Count
                      </label>
                      <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={visibleColumns().includes("gitignored")}
                          onChange={() => toggleColumn("gitignored")}
                        />{" "}
                        Gitignored
                      </label>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>

          <input
            type="text"
            placeholder={
              viewMode() === "tree" ? "Filter files..." : "Filter hot spots..."
            }
            class="w-full bg-[#1e1e1e] border border-[#333] px-2 py-1.5 text-sm rounded focus:border-blue-500 outline-none text-gray-200 placeholder-gray-500"
            value={props.filter}
            onInput={(e) => props.onFilterChange(e.currentTarget.value)}
          />
        </div>

        <Show when={viewMode() === "tree"}>
          <div class="flex items-center bg-[#252526] text-xs font-bold text-gray-400 py-2 border-b border-[#333] select-none">
            <div
              class="pl-8 flex-1 cursor-pointer hover:text-white flex items-center"
              onClick={() => handleHeaderClick("name")}
            >
              Name <SortIcon field="name" />
            </div>

            <Show when={visibleColumns().includes("gitignored")}>
              <div
                class="w-10 text-right pr-1 cursor-pointer hover:text-white flex items-center justify-end"
                onClick={() => handleHeaderClick("gitignored")}
                title="Gitignored Files"
              >
                Ign <SortIcon field="gitignored" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("file_count")}>
              <div
                class="w-12 text-right pr-2 cursor-pointer hover:text-white flex items-center justify-end"
                onClick={() => handleHeaderClick("file_count")}
                title="File Count"
              >
                # <SortIcon field="file_count" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("file_size")}>
              <div
                class="w-16 text-right pr-2 cursor-pointer hover:text-white flex items-center justify-end"
                onClick={() => handleHeaderClick("file_size")}
              >
                Size <SortIcon field="file_size" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("loc")}>
              <div
                class="w-16 text-right pr-2 cursor-pointer hover:text-white flex items-center justify-end"
                onClick={() => handleHeaderClick("loc")}
              >
                LOC <SortIcon field="loc" />
              </div>
            </Show>
            <Show when={visibleColumns().includes("complexity")}>
              <div
                class="w-12 text-right pr-2 cursor-pointer hover:text-white flex items-center justify-end"
                onClick={() => handleHeaderClick("complexity")}
              >
                CCN <SortIcon field="complexity" />
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
          <div class="flex-1 overflow-y-auto overflow-x-hidden">
            <For each={hotSpots()}>
              {(node, i) => <HotSpotItem node={node} rank={i() + 1} />}
            </For>
            <Show when={hotSpots().length === 0}>
              <div class="p-4 text-center text-gray-500 text-sm">
                No hot spots found
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </ExplorerContext.Provider>
  );
}
