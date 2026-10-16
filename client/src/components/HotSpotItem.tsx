import { useContext, For } from "solid-js";
import { Focus } from "lucide-solid";
import { extractFilePath } from "../utils/dataProcessing";
import {
  HOTSPOT_METRICS,
  formatMetricValue,
  hotSpotMetricLabel,
  type HotSpotMetricId,
} from "../utils/metricsStore";
import { metricCellColors } from "../utils/explorerColumns";
import { ExplorerContext, findNodeByPath } from "./Explorer";
import type { Node } from "./Explorer";

export function HotSpotItem(props: {
  node: Node;
  rank: number;
  score: number;
  /** The top score in the list; the score bar is drawn relative to it. */
  maxScore: number;
  metrics: HotSpotMetricId[];
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

    if (!ctx.rootData) return;
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
      class="plc-row plc-body-sm group relative flex cursor-pointer items-center gap-2 border-b px-2 py-0.5"
      onClick={handleClick}
    >
      <span
        aria-hidden="true"
        class="absolute bottom-0 left-0 h-[2px] bg-[var(--plc-accent)] opacity-40"
        style={{ width: `${props.maxScore > 0 ? (props.score / props.maxScore) * 100 : 0}%` }}
      />
      <div class="plc-data-sm w-6 shrink-0 text-right text-[var(--plc-on-disabled)]">
        {props.rank}
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[var(--plc-on-surface)]" title={props.node.name}>
          {props.node.name}
        </div>
        <div class="plc-data-sm truncate text-[var(--plc-on-subtle)]" title={displayPath()}>
          {displayPath()}
        </div>
      </div>
      <button
        type="button"
        class="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--plc-on-subtle)] hover:bg-[var(--plc-surface-muted)] hover:text-[var(--plc-accent)] focus-visible:flex group-hover:flex"
        title="Zoom treemap to containing folder"
        aria-label="Zoom treemap to containing folder"
        onClick={handleZoomToParent}
      >
        <Focus size={13} aria-hidden="true" />
      </button>
      <div class="flex shrink-0 items-center gap-1">
        <For each={props.metrics}>
          {(m, i) => {
            const val = (props.node.metrics as any)?.[m];
            if (val === undefined) return null;
            // The first metric is the treemap's color, so it gets the same tint.
            const def = HOTSPOT_METRICS.find((d) => d.id === m);
            const colors = i() === 0 && def ? metricCellColors(def, props.node) : undefined;
            return (
              <span
                class="plc-data-md min-w-[2.75rem] rounded-sm px-1 text-right text-[var(--plc-on-muted)] first:font-semibold first:text-[var(--plc-on-surface)]"
                style={colors ?? {}}
                title={hotSpotMetricLabel(m)}
              >
                {formatMetricValue(m, val)}
              </span>
            );
          }}
        </For>
      </div>
    </div>
  );
}
