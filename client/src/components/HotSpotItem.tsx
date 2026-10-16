import { useContext, Show } from "solid-js";
import { Focus } from "lucide-solid";
import { extractFilePath } from "../utils/dataProcessing";
import { formatMetricWithUnit, metricDef, type MetricId } from "../utils/metricsStore";
import { metricCellColor, metricCellTitle, witnessOf } from "../utils/explorerColumns";
import type { HotSpotCohort } from "../utils/hotSpotRanking";
import { HeatSwatch } from "./ui/HeatSwatch";
import { isSameOrAncestor, linkedPathFor, setHoverFrom } from "../utils/hoverLink";
import { ExplorerContext, findNodeByPath } from "./Explorer";
import type { Node } from "./Explorer";

/**
 * One Hot Spots row: rank, name, cohort and path, the value with its unit,
 * and the function or component behind a file's max. N/A rows (`rank` null)
 * show the reason instead.
 */
export function HotSpotItem(props: {
  node: Node;
  /** 1-based rank; null for an N/A row. */
  rank: number | null;
  metric: MetricId;
  cohort: HotSpotCohort;
  /** Share of the worst value (0–1), drawn as the row's bar. */
  score: number;
  /** The one row in the list that takes Tab focus. */
  tabbable: boolean;
  onKeyDown: (event: KeyboardEvent) => void;
  onFocus: () => void;
  ref?: (el: HTMLDivElement) => void;
}) {
  const ctx = useContext(ExplorerContext)!;
  const def = () => metricDef(props.metric);
  const witness = () => witnessOf(props.node, props.metric);
  const value = () => {
    const raw = (props.node.metrics as Record<string, unknown> | undefined)?.[props.metric];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  };

  // Lit when the treemap hovers this item or something inside it.
  const isLinked = () => {
    const target = linkedPathFor("explorer");
    return Boolean(target && isSameOrAncestor(props.node.path, target));
  };

  const open = () => {
    const filePath = extractFilePath(props.node.path, props.node.type);
    if (!filePath) return;
    const startLine = props.node.start_line && props.node.start_line > 0 ? props.node.start_line : undefined;
    const endLine = props.node.end_line && props.node.end_line > 0 ? props.node.end_line : undefined;
    ctx.onSelect(filePath, startLine, endLine);
  };

  const openWitness = () => {
    const w = witness();
    if (w) ctx.onOpenWitness(w);
  };

  const handleZoomToParent = (e: MouseEvent) => {
    e.stopPropagation();
    const fileOrFolderPath = props.node.path.split("::")[0] || props.node.path;
    const lastSlash = fileOrFolderPath.lastIndexOf("/");
    if (lastSlash === -1 || !ctx.rootData) return;
    const parentNode = findNodeByPath(ctx.rootData, fileOrFolderPath.substring(0, lastSlash));
    if (parentNode) ctx.onZoom(parentNode);
  };

  const displayPath = () => {
    const [fileOrFolderPath, ...rest] = props.node.path.split("::");
    const rootPath = ctx.rootData?.path;
    let relative = fileOrFolderPath;
    if (rootPath && fileOrFolderPath.startsWith(rootPath)) relative = fileOrFolderPath.slice(rootPath.length).replace(/^\//, "");
    // A function's own name is the row title; show where it lives.
    return props.cohort === "function" ? [relative, ...rest.slice(0, -1)].join(" › ") : [relative, ...rest].join("::");
  };

  const naReason = () => {
    const reason = (props.node.metrics as Record<string, unknown> | undefined)?.na_reason;
    return typeof reason === "string" && reason ? reason : "Not measured here";
  };

  return (
    <div
      ref={props.ref}
      role="option"
      aria-selected={false}
      tabIndex={props.tabbable ? 0 : -1}
      class="plc-row plc-body-sm group relative flex cursor-pointer items-start gap-2 border-b px-2 pb-2 pt-1 outline-none focus-visible:bg-[var(--plc-surface-muted)] focus-visible:shadow-[inset_2px_0_0_var(--plc-accent)]"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) openWitness();
          else open();
          return;
        }
        props.onKeyDown(e);
      }}
      onFocus={() => {
        props.onFocus();
        setHoverFrom("explorer", props.node.path);
      }}
      onBlur={() => setHoverFrom("explorer", null)}
      data-linked={isLinked() ? "" : undefined}
      onPointerEnter={() => setHoverFrom("explorer", props.node.path)}
      onPointerLeave={() => setHoverFrom("explorer", null)}
    >
      {/* Value relative to #1, inset under the text so it reads as part of the row. */}
      <Show when={props.rank !== null}>
        <span aria-hidden="true" class="absolute bottom-[3px] left-10 right-2 h-[2px]">
          <span
            class="block h-full rounded-full bg-[var(--plc-on-subtle)] opacity-30"
            style={{ width: `${Math.max(0, Math.min(1, props.score)) * 100}%` }}
          />
        </span>
      </Show>
      <div class="plc-data-sm w-6 shrink-0 pt-[2px] text-right text-[var(--plc-on-subtle)]">
        {props.rank ?? "–"}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-[var(--plc-on-surface)]" title={props.node.name}>
            {props.node.name}
          </span>
          <span
            class="plc-data-md flex shrink-0 items-center gap-1.5 text-right font-semibold text-[var(--plc-on-surface)]"
            classList={{ "!font-normal !text-[var(--plc-on-disabled)]": value() === null }}
            title={def() ? metricCellTitle(def()!, props.node) : undefined}
          >
            <Show when={def() && metricCellColor(def()!, props.node)}>{(fill) => <HeatSwatch color={fill()} />}</Show>
            {value() === null ? "N/A" : formatMetricWithUnit(props.metric, value()!)}
          </span>
        </div>
        <div class="plc-data-sm flex min-w-0 items-baseline gap-1.5 text-[var(--plc-on-subtle)]">
          <span
            class="shrink-0 uppercase tracking-wide text-[var(--plc-on-disabled)]"
            title={props.cohort === "file" ? "Ranked among files" : "Ranked among functions"}
          >
            {props.cohort === "file" ? "file" : "fn"}
          </span>
          <span class="min-w-0 truncate" title={displayPath()}>
            {displayPath()}
          </span>
        </div>
        <Show
          when={props.rank !== null}
          fallback={
            <div class="plc-data-sm truncate text-[var(--plc-on-disabled)]" title={naReason()}>
              {naReason()}
            </div>
          }
        >
          <Show when={witness()}>
            {(w) => (
              <button
                type="button"
                tabIndex={-1}
                class="plc-data-sm block max-w-full truncate text-left text-[var(--plc-on-subtle)] hover:text-[var(--plc-accent)]"
                title={`Open ${w().name}, which sets this ${def()?.label ?? props.metric} (Shift+Enter)`}
                onClick={(e) => {
                  e.stopPropagation();
                  openWitness();
                }}
              >
                in <span class="text-[var(--plc-on-muted)] underline decoration-dotted underline-offset-2">{w().name}</span>
                {w().start_line > 0 ? ` · L${w().start_line}` : ""}
              </button>
            )}
          </Show>
        </Show>
      </div>
      <button
        type="button"
        tabIndex={-1}
        class="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--plc-on-subtle)] hover:bg-[var(--plc-surface-muted)] hover:text-[var(--plc-accent)] group-hover:flex"
        title="Zoom treemap to containing folder"
        aria-label="Zoom treemap to containing folder"
        onClick={handleZoomToParent}
      >
        <Focus size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
