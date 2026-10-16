import { For, Show, createMemo } from "solid-js";
import { ChevronRight, CornerLeftUp } from "lucide-solid";
import { IconButton } from "./ui/IconButton";
import { metricCellColor, metricCellText, witnessOf } from "../utils/explorerColumns";
import { HeatSwatch } from "./ui/HeatSwatch";
import { ancestorChain, scopeDisplayName, summarizeScope } from "../utils/explorerScope";
import type { HotSpotMetricDef } from "../utils/metricsStore";
import { extractFilePath } from "../utils/dataProcessing";
import type { Node, Witness } from "./Explorer";

const count = (n: number) => n.toLocaleString("en-US");

function Stat(props: { value: number; unit: string; title?: string }) {
  return (
    <span class="shrink-0 whitespace-nowrap" title={props.title}>
      <span class="plc-data-sm text-[var(--plc-on-surface)]">{count(props.value)}</span>{" "}
      {props.unit}
    </span>
  );
}

/**
 * Where the explorer is (clickable breadcrumb) and what is in it: lines,
 * files and functions, plus the file that most needs attention under the
 * treemap's color metric.
 */
export function ExplorerScopeBar(props: {
  root: Node;
  fullRoot?: Node;
  colorMetric: HotSpotMetricDef;
  /** The top-file line; Hot Spots lists it as #1 already. */
  showTop?: boolean;
  onZoom: (node: Node) => void;
  onSelect: (path: string, startLine?: number, endLine?: number, node?: Node) => void;
  onOpenWitness: (witness: Witness) => void;
}) {
  const chain = createMemo(() => {
    const full = props.fullRoot;
    const found = full ? ancestorChain(full, props.root.path) : [];
    return found.length ? found : [props.root];
  });
  const scanRootPath = () => chain()[0]?.path;
  const parent = () => chain().at(-2);
  const summary = createMemo(() => summarizeScope(props.root, props.colorMetric));

  // A max (complexity, component metrics) names the scope that sets it, not just its file.
  const witness = () => witnessOf(props.root, props.colorMetric.id);
  const witnessFile = () => witness()?.path.split("::")[0].split("/").pop() ?? "";

  const openTop = () => {
    const w = witness();
    if (w) return props.onOpenWitness(w);
    const top = summary().worst?.node;
    const path = top && extractFilePath(top.path, top.type);
    if (top && path) props.onSelect(path, undefined, undefined, top);
  };

  return (
    <div class="shrink-0 border-b border-[var(--plc-border)] bg-[var(--plc-surface-subtle)] px-1 pb-1 pt-0.5 text-[12px] text-[var(--plc-on-subtle)]">
      <div class="flex h-6 min-w-0 items-center gap-0.5 text-[13px]">
        <IconButton
          size="xs"
          label={parent() ? `Up to ${scopeDisplayName(parent()!, scanRootPath())}` : "At the top level"}
          disabled={!parent()}
          onClick={() => {
            const target = parent();
            if (target) props.onZoom(target);
          }}
        >
          <CornerLeftUp size={13} aria-hidden="true" />
        </IconButton>
        <nav aria-label="Explorer location" class="flex min-w-0 flex-1 items-center overflow-hidden">
          <For each={chain()}>
            {(node, i) => {
              const isLast = () => i() === chain().length - 1;
              return (
                <>
                  <Show when={i() > 0}>
                    <ChevronRight size={11} aria-hidden="true" class="shrink-0 text-[var(--plc-on-disabled)]" />
                  </Show>
                  <button
                    type="button"
                    class={`min-w-0 truncate rounded px-1 leading-5 transition-colors duration-150 ${
                      isLast()
                        ? "shrink-0 max-w-[75%] cursor-default font-semibold text-[var(--plc-on-surface)]"
                        : "max-w-[7rem] text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-accent)]"
                    }`}
                    title={node.path}
                    aria-current={isLast() ? "location" : undefined}
                    onClick={() => !isLast() && props.onZoom(node)}
                  >
                    {scopeDisplayName(node, scanRootPath())}
                  </button>
                </>
              );
            }}
          </For>
        </nav>
      </div>
      <div class="flex h-5 min-w-0 items-center gap-2.5 pl-7">
        <Stat value={summary().loc} unit="LOC" title="Lines of code" />
        <Stat
          value={summary().files}
          unit="files"
          title={`${count(summary().files)} files in ${count(summary().folders)} folders`}
        />
        <Show when={summary().functions > 0}>
          <Stat value={summary().functions} unit="fns" title="Executable functions (classes, types, JSX and bodies not counted)" />
        </Show>
      </div>
      <Show when={props.showTop ?? true}>
        {/* Always reserved, so the tree below never shifts when the metric changes. */}
        <div class="flex h-5 min-w-0 items-center pl-7">
          <Show
            when={summary().worst}
            fallback={<span class="truncate">No {props.colorMetric.label} in this folder</span>}
          >
            {(top) => (
              <button
                type="button"
                class="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left transition-colors duration-150 hover:bg-[var(--plc-surface-hover)]"
                title={witness() ? `Open ${witness()!.name} in ${witnessFile()}` : `Open ${top().node.path}`}
                onClick={openTop}
              >
                <span class="shrink-0">
                  Top {props.colorMetric.shortLabel}
                </span>
                <Show
                  when={witness()}
                  fallback={<span class="min-w-0 truncate text-[var(--plc-accent)]">{top().node.name}</span>}
                >
                  {(w) => (
                    <span class="min-w-0 truncate">
                      <span class="text-[var(--plc-accent)]">{w().name}</span>
                      <span class="text-[var(--plc-on-subtle)]"> in {witnessFile()}</span>
                    </span>
                  )}
                </Show>
                <span class="plc-data-sm ml-auto flex shrink-0 items-center gap-1.5 pr-0.5 text-[var(--plc-on-surface)]">
                  <Show when={metricCellColor(props.colorMetric, top().node)}>
                    {(fill) => <HeatSwatch color={fill()} />}
                  </Show>
                  {metricCellText(props.colorMetric, top().node) || "0"}
                </span>
              </button>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
