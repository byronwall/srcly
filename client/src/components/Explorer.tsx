import {
  createSignal,
  createMemo,
  For,
  Show,
  createContext,
  useContext,
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
  };
}

type SortField = "name" | "loc" | "complexity";
type SortDirection = "asc" | "desc";

interface ExplorerContextType {
  sortField: () => SortField;
  sortDirection: () => SortDirection;
  onSelect: (path: string) => void;
  filter: string;
}

const ExplorerContext = createContext<ExplorerContextType>();

const TreeNode = (props: { node: Node; depth: number }) => {
  const ctx = useContext(ExplorerContext)!;
  // Expand root by default, or if filtering is active
  const [expanded, setExpanded] = createSignal(props.depth < 1 || !!ctx.filter);

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

  return (
    <>
      <div
        class="flex items-center hover:bg-gray-800 cursor-pointer text-sm py-0.5 border-b border-gray-800/50 select-none"
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
        <div class="flex-1 flex items-center gap-1 truncate text-gray-300 overflow-hidden">
          <span class="opacity-70 text-xs">{getIcon()}</span>
          <span class="truncate" title={props.node.name}>
            {props.node.name}
          </span>
        </div>
        <div class="w-16 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
          {props.node.metrics?.loc || 0}
        </div>
        <div class="w-12 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
          {props.node.metrics?.complexity || 0}
        </div>
      </div>
      <Show when={expanded() && hasChildren}>
        <For each={sortedChildren()}>
          {(child) => <TreeNode node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </>
  );
};

export default function Explorer(props: {
  data: any;
  onFileSelect: (path: string) => void;
  filter: string;
  onFilterChange: (val: string) => void;
}) {
  const [sortField, setSortField] = createSignal<SortField>("loc");
  const [sortDirection, setSortDirection] = createSignal<SortDirection>("desc");

  const handleHeaderClick = (field: SortField) => {
    if (sortField() === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc"); // Default to desc for numbers usually
    }
  };

  const SortIcon = (p: { field: SortField }) => (
    <Show when={sortField() === p.field}>
      <span class="ml-1 text-[10px]">
        {sortDirection() === "asc" ? "▲" : "▼"}
      </span>
    </Show>
  );

  return (
    <ExplorerContext.Provider
      value={{
        sortField,
        sortDirection,
        onSelect: props.onFileSelect,
        filter: props.filter,
      }}
    >
      <div class="flex flex-col h-full bg-[#1e1e1e] text-white border-l border-[#333] w-[400px]">
        <div class="p-2 border-b border-[#333] bg-[#252526]">
          <input
            type="text"
            placeholder="Filter files..."
            class="w-full bg-[#1e1e1e] border border-[#333] px-2 py-1.5 text-sm rounded focus:border-blue-500 outline-none text-gray-200 placeholder-gray-500"
            value={props.filter}
            onInput={(e) => props.onFilterChange(e.currentTarget.value)}
          />
        </div>
        <div class="flex items-center bg-[#252526] text-xs font-bold text-gray-400 py-2 border-b border-[#333] select-none">
          <div
            class="pl-8 flex-1 cursor-pointer hover:text-white flex items-center"
            onClick={() => handleHeaderClick("name")}
          >
            Name <SortIcon field="name" />
          </div>
          <div
            class="w-16 text-right pr-2 cursor-pointer hover:text-white flex items-center justify-end"
            onClick={() => handleHeaderClick("loc")}
          >
            LOC <SortIcon field="loc" />
          </div>
          <div
            class="w-12 text-right pr-2 cursor-pointer hover:text-white flex items-center justify-end"
            onClick={() => handleHeaderClick("complexity")}
          >
            CCN <SortIcon field="complexity" />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto overflow-x-hidden">
          <Show when={props.data}>
            <TreeNode node={props.data} depth={0} />
          </Show>
        </div>
      </div>
    </ExplorerContext.Provider>
  );
}
