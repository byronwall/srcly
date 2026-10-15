import { useContext, Show } from "solid-js";
import { Braces, ChevronRight, Eye, EyeOff, File, Folder, FolderOpen } from "lucide-solid";
import { extractFilePath } from "../utils/dataProcessing";
import { type Node, ExplorerContext, formatSize } from "./Explorer";
import { useMetricsStore } from "../utils/metricsStore";

export function TreeNode(props: {
  node: Node;
  depth: number;
  index: number;
  expanded: boolean;
}) {
  const ctx = useContext(ExplorerContext)!;
  const hasChildren = Boolean(props.node.children?.length);
  const { excludedPaths, toggleExcludedPath } = useMetricsStore();
  const isHidden = () => excludedPaths().includes(props.node.path);

  const handleToggleHidden = (e: MouseEvent) => {
    e.stopPropagation();
    toggleExcludedPath(props.node.path);
  };

  const handleClick = (e: MouseEvent) => {
    ctx.setFocusedPath(props.node.path);
    if (e.altKey) {
      toggleExcludedPath(props.node.path);
      return;
    }

    if (props.node.type === "folder") {
      ctx.onZoom(props.node);
      return;
    }

    const filePath = extractFilePath(props.node.path, props.node.type);
    if (!filePath) return;

    const startLine = props.node.start_line && props.node.start_line > 0
      ? props.node.start_line
      : undefined;
    const endLine = props.node.end_line && props.node.end_line > 0
      ? props.node.end_line
      : undefined;
    ctx.onSelect(filePath, startLine, endLine, props.node);
  };

  const NodeIcon = () => {
    if (props.node.type === "folder") {
      return props.expanded ? (
        <FolderOpen size={14} aria-hidden="true" />
      ) : (
        <Folder size={14} aria-hidden="true" />
      );
    }
    if (props.node.type === "file") return <File size={14} aria-hidden="true" />;
    return <Braces size={13} aria-hidden="true" />;
  };

  return (
    <div
      class={`plc-row plc-body-sm flex h-8 shrink-0 items-center cursor-pointer border-b select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--plc-border-focus)] ${
        isHidden() ? "opacity-50" : ""
      }`}
      style={{ "padding-left": `${props.depth * 12}px` }}
      role="treeitem"
      aria-level={props.depth + 1}
      aria-expanded={hasChildren ? props.expanded : undefined}
      aria-selected={ctx.focusedPath() === props.node.path}
      tabindex={ctx.tabbablePath() === props.node.path ? 0 : -1}
      data-explorer-index={props.index}
      onFocus={() => ctx.setFocusedPath(props.node.path)}
      onClick={handleClick}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        ctx.onTreeKeyDown(props.index, e);
      }}
    >
      <button
        type="button"
        class="flex h-full w-6 shrink-0 items-center justify-center text-[var(--plc-on-subtle)] hover:text-[var(--plc-on-surface)] disabled:cursor-default"
        aria-label={`${props.expanded ? "Collapse" : "Expand"} ${props.node.name}`}
        aria-expanded={hasChildren ? props.expanded : undefined}
        disabled={!hasChildren}
        tabindex={-1}
        onClick={(e) => {
          e.stopPropagation();
          ctx.toggleExpanded(props.node);
        }}
      >
        <Show when={hasChildren}>
          <ChevronRight
            size={14}
            aria-hidden="true"
            class={`transition-transform duration-150 ${props.expanded ? "rotate-90" : ""}`}
          />
        </Show>
      </button>
      <div class="group flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[var(--plc-on-surface)]">
        <span class="flex shrink-0 text-[var(--plc-on-subtle)]"><NodeIcon /></span>
        <span class="truncate" title={props.node.name}>{props.node.name}</span>
        <button
          type="button"
          class="ml-auto mr-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--plc-on-subtle)] hover:bg-[var(--plc-surface-muted)] hover:text-[var(--plc-on-surface)] focus-visible:flex group-hover:flex"
          title={isHidden() ? "Show in treemap" : "Hide from treemap"}
          aria-label={isHidden() ? `Show ${props.node.name} in treemap` : `Hide ${props.node.name} from treemap`}
          onClick={handleToggleHidden}
        >
          {isHidden() ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
        </button>
      </div>

      <Show when={ctx.visibleColumns().includes("gitignored")}>
        <div class="w-10 text-right text-[var(--plc-on-subtle)] plc-data-md pr-1 shrink-0">{props.node.metrics?.gitignored_count || ""}</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("file_count")}>
        <div class="w-12 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{props.node.metrics?.file_count || ""}</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("file_size")}>
        <div class="w-16 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{formatSize(props.node.metrics?.file_size)}</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("loc")}>
        <div class="w-16 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{props.node.metrics?.loc || 0}</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("complexity")}>
        <div class="w-12 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{props.node.metrics?.complexity?.toFixed(1) || 0}</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("comment_density")}>
        <div class="w-12 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{((props.node.metrics?.comment_density || 0) * 100).toFixed(0)}%</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("todo_count")}>
        <div class="w-10 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{props.node.metrics?.todo_count || ""}</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("max_nesting_depth")}>
        <div class="w-10 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{props.node.metrics?.max_nesting_depth || ""}</div>
      </Show>
      <Show when={ctx.visibleColumns().includes("parameter_count")}>
        <div class="w-10 text-right text-[var(--plc-on-subtle)] plc-data-md pr-2 shrink-0">{props.node.metrics?.parameter_count || ""}</div>
      </Show>
    </div>
  );
}
