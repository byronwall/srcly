import { useContext, For, Show } from "solid-js";
import { Braces, ChevronRight, Eye, EyeOff, File, Folder, FolderOpen } from "lucide-solid";
import { extractFilePath } from "../utils/dataProcessing";
import { type Node, ExplorerContext } from "./Explorer";
import { useMetricsStore } from "../utils/metricsStore";
import { metricCellColor } from "../utils/explorerColumns";
import { HeatSwatch } from "./ui/HeatSwatch";

export function TreeNode(props: {
  node: Node;
  depth: number;
  index: number;
  expanded: boolean;
  parent?: Node;
}) {
  const ctx = useContext(ExplorerContext)!;
  const hasChildren = Boolean(props.node.children?.length);
  const { excludedPaths, toggleExcludedPath } = useMetricsStore();
  const isHidden = () => excludedPaths().includes(props.node.path);
  // Share of the parent's lines, drawn as a hairline under the LOC value.
  const locShare = () => {
    const total = props.parent?.metrics?.loc ?? 0;
    return total > 0 ? Math.min(1, (props.node.metrics?.loc ?? 0) / total) : 0;
  };

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
      class={`plc-row plc-body-sm flex h-6 shrink-0 items-center cursor-pointer border-b select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--plc-border-focus)] ${
        isHidden() ? "opacity-50" : ""
      }`}
      style={{ "min-height": "0", "padding-left": `${props.depth * 12}px` }}
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
            class={`transition-transform duration-150 motion-reduce:transition-none ${props.expanded ? "rotate-90" : ""}`}
          />
        </Show>
      </button>
      <div class="group flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[var(--plc-on-surface)]">
        <span class="flex shrink-0 text-[var(--plc-on-subtle)]"><NodeIcon /></span>
        <span class="truncate" title={props.node.name}>{props.node.name}</span>
        <Show when={props.node.type === "folder" && props.node.metrics?.file_count}>
          {(files) => (
            <span class="plc-data-sm shrink-0 text-[var(--plc-on-subtle)]" title={`${files()} files`}>
              {files()}
            </span>
          )}
        </Show>
        <button
          type="button"
          class="ml-auto mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--plc-on-subtle)] hover:bg-[var(--plc-surface-muted)] hover:text-[var(--plc-on-surface)] focus-visible:flex group-hover:flex"
          title={isHidden() ? "Show in treemap" : "Hide from treemap"}
          aria-label={isHidden() ? `Show ${props.node.name} in treemap` : `Hide ${props.node.name} from treemap`}
          onClick={handleToggleHidden}
        >
          {isHidden() ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
        </button>
      </div>

      <For each={ctx.columns()}>
        {(column) => {
          const isColor = () => column.id === ctx.colorMetric() && Boolean(column.metric);
          const color = () => (isColor() ? metricCellColor(column.metric!, props.node) : undefined);
          return (
            <div
              class="plc-data-md relative flex h-full shrink-0 items-center justify-end pr-1.5"
              classList={{
                "text-[var(--plc-on-surface)]": isColor(),
                "text-[var(--plc-on-subtle)]": !isColor(),
              }}
              style={{ width: `${column.width}px` }}
              title={color() ? `${column.title}: ${column.value(props.node)}` : undefined}
            >
              {/* Pinned left, so swatches line up down the column whatever the digit count. */}
              <Show when={color()}>
                {(fill) => <HeatSwatch color={fill()} class="absolute left-1.5 top-1/2 -translate-y-1/2" />}
              </Show>
              {/* Data bar: the row's share of its parent's lines, filling in from the right. */}
              <Show when={column.id === "loc" && locShare() >= 0.01}>
                <span
                  aria-hidden="true"
                  class="absolute inset-y-[3px] right-0.5 rounded-sm bg-[var(--plc-on-subtle)] opacity-[0.12]"
                  style={{ width: `${locShare() * (column.width - 4)}px` }}
                />
              </Show>
              <span class="relative">{column.value(props.node)}</span>
            </div>
          );
        }}
      </For>
    </div>
  );
}
