import {
  useContext,
  createSignal,
  createEffect,
  createMemo,
  Show,
  For,
} from "solid-js";
import { extractFilePath } from "../utils/dataProcessing";
import {
  type Node,
  ExplorerContext,
  SORT_FIELD_ACCESSORS,
  formatSize,
} from "./Explorer";
import { useMetricsStore } from "../utils/metricsStore";

export function TreeNode(props: { node: Node; depth: number }) {
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
    const multiplier = dir === "asc" ? 1 : -1;
    const accessor =
      SORT_FIELD_ACCESSORS[field] ?? SORT_FIELD_ACCESSORS["name"];

    return [...props.node.children].sort((a, b) => {
      // Always keep folders grouped before non-folders for easier navigation
      const aIsFolder = a.type === "folder";
      const bIsFolder = b.type === "folder";
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1;
      }

      const valA = accessor(a);
      const valB = accessor(b);

      if (valA < valB) return -1 * multiplier;
      if (valA > valB) return 1 * multiplier;

      // Stable, deterministic tie-breaker: always fall back to name (asc)
      const nameA = SORT_FIELD_ACCESSORS.name(a) as string;
      const nameB = SORT_FIELD_ACCESSORS.name(b) as string;
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
  });

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) setExpanded(!expanded());
  };

  const { excludedPaths, toggleExcludedPath } = useMetricsStore();

  const handleToggleHidden = (e: MouseEvent) => {
    e.stopPropagation();
    toggleExcludedPath(props.node.path);
  };

  const isHidden = () => excludedPaths().includes(props.node.path);

  const handleClick = (e: MouseEvent) => {
    if (e.altKey) {
      e.stopPropagation();
      toggleExcludedPath(props.node.path);
      return;
    }

    if (props.node.type === "folder") {
      ctx.onZoom(props.node);
      return;
    }

    const filePath = extractFilePath(props.node.path, props.node.type);
    if (!filePath) return;

    const startLine =
      typeof props.node.start_line === "number" && props.node.start_line > 0
        ? props.node.start_line
        : undefined;
    const endLine =
      typeof props.node.end_line === "number" && props.node.end_line > 0
        ? props.node.end_line
        : undefined;

    ctx.onSelect(filePath, startLine, endLine, props.node);
  };

  const getIcon = () => {
    if (props.node.type === "folder") return "📁";
    return "📄";
  };

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
            {props.node.metrics?.complexity?.toFixed(1) || 0}
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("comment_density")}>
          <div class="w-12 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {((props.node.metrics?.comment_density || 0) * 100).toFixed(0)}%
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("todo_count")}>
          <div class="w-10 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {props.node.metrics?.todo_count || ""}
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("max_nesting_depth")}>
          <div class="w-10 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {props.node.metrics?.max_nesting_depth || ""}
          </div>
        </Show>
        <Show when={ctx.visibleColumns().includes("parameter_count")}>
          <div class="w-10 text-right text-gray-500 font-mono text-xs pr-2 shrink-0">
            {props.node.metrics?.parameter_count || ""}
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
}
