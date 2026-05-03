import { useContext, For } from "solid-js";
import { extractFilePath } from "../utils/dataProcessing";
import { HOTSPOT_METRICS } from "../utils/metricsStore";
import { ExplorerContext, findNodeByPath } from "./Explorer";
import type { Node } from "./Explorer";

export function HotSpotItem(props: {
  node: Node;
  rank: number;
  score: number;
  metrics: string[];
}) {
  const ctx = useContext(ExplorerContext)!;

  const handleClick = () => {
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

    ctx.onSelect(filePath, startLine, endLine);
  };

  const handleZoomToParent = (e: MouseEvent) => {
    e.stopPropagation();
    const rawPath = props.node.path;
    const fileOrFolderPath = rawPath.split("::")[0] || rawPath;
    const lastSlash = fileOrFolderPath.lastIndexOf("/");
    if (lastSlash === -1) return;
    const parentPath = fileOrFolderPath.substring(0, lastSlash);

    const parentNode = findNodeByPath(ctx.rootData, parentPath);
    if (parentNode) {
      ctx.onZoom(parentNode);
    }
  };

  const displayPath = () => {
    const fullPath = props.node.path;
    const [fileOrFolderPath, ...rest] = fullPath.split("::");
    const rootPath = ctx.rootData?.path;

    let relative = fileOrFolderPath;
    if (rootPath && fileOrFolderPath.startsWith(rootPath)) {
      relative = fileOrFolderPath.slice(rootPath.length);
      if (relative.startsWith("/")) {
        relative = relative.slice(1);
      }
    }

    return rest.length > 0 ? `${relative}::${rest.join("::")}` : relative;
  };

  return (
    <div
      class="plc-row plc-body-sm flex items-center cursor-pointer border-b px-2 group"
      onClick={handleClick}
    >
      <div class="w-6 text-[var(--plc-on-subtle)] plc-data-md">
        #{props.rank}
      </div>
      <div class="flex-1 min-w-0 flex items-center gap-2">
        <div class="flex-1 min-w-0">
          <div class="truncate text-[var(--plc-on-surface)]" title={props.node.name}>
            {props.node.name}
          </div>
          <div class="text-[10px] text-[var(--plc-on-subtle)] truncate">
            {displayPath()}
          </div>
        </div>
        <button
          class="hidden group-hover:block rounded-md border border-[var(--plc-accent-border)] bg-[var(--plc-accent-subtle)] p-1 text-xs text-[var(--plc-accent)] hover:border-[var(--plc-accent)]"
          title="Isolate Folder"
          onClick={handleZoomToParent}
        >
          🔍
        </button>
      </div>
      <div class="flex items-center gap-2 ml-2">
        <div class="text-[10px] font-mono flex items-center gap-3">
          <For each={props.metrics}>
            {(m) => {
              const def = HOTSPOT_METRICS.find((x) => x.id === m);
              let val = (props.node.metrics as any)?.[m];
              if (val === undefined) return null;
              if (m === "comment_density") val = (val * 100).toFixed(0) + "%";
              else if (typeof val === "number" && !Number.isInteger(val))
                val = val.toFixed(1);
              return (
                <span class={def?.color} title={def?.label}>
                  {val}
                </span>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
