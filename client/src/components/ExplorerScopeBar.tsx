import { For, Show, createMemo } from "solid-js";
import { ChevronRight, CornerLeftUp } from "lucide-solid";
import { IconButton } from "./ui/IconButton";
import { metricCellColors, metricCellText } from "../utils/explorerColumns";
import { ancestorChain, summarizeScope } from "../utils/explorerScope";
import type { HotSpotMetricDef } from "../utils/metricsStore";
import { extractFilePath } from "../utils/dataProcessing";
import type { Node } from "./Explorer";

const count = (n: number) => n.toLocaleString("en-US");

/**
 * Where the explorer is (clickable breadcrumb) and what is in it: file,
 * folder, function and line counts, plus the file that most needs attention
 * under the treemap's color metric.
 */
export function ExplorerScopeBar(props: {
  root: Node;
  fullRoot?: Node;
  colorMetric: HotSpotMetricDef;
  onZoom: (node: Node) => void;
  onSelect: (path: string, startLine?: number, endLine?: number, node?: Node) => void;
}) {
  const chain = createMemo(() => {
    const full = props.fullRoot;
    const found = full ? ancestorChain(full, props.root.path) : [];
    return found.length ? found : [props.root];
  });
  const parent = () => chain().at(-2);
  const summary = createMemo(() => summarizeScope(props.root, props.colorMetric));

  const openWorst = () => {
    const worst = summary().worst?.node;
    const path = worst && extractFilePath(worst.path, worst.type);
    if (worst && path) props.onSelect(path, undefined, undefined, worst);
  };

  return (
    <div class="border-b border-[var(--plc-border)] bg-[var(--plc-surface-subtle)] px-1 py-1">
      <div class="flex h-6 min-w-0 items-center gap-0.5 plc-body-sm">
        <IconButton
          size="xs"
          label="Go up one level"
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
                    class={`min-w-0 truncate rounded px-1 transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] ${
                      isLast()
                        ? "shrink-0 max-w-[70%] font-semibold text-[var(--plc-on-surface)]"
                        : "max-w-[7rem] text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)]"
                    }`}
                    title={node.path}
                    aria-current={isLast() ? "location" : undefined}
                    onClick={() => props.onZoom(node)}
                  >
                    {node.name}
                  </button>
                </>
              );
            }}
          </For>
        </nav>
      </div>
      <div class="plc-data-sm flex h-5 min-w-0 items-center gap-2 px-1 text-[var(--plc-on-subtle)]">
        <span class="shrink-0" title="Lines of code">
          <span class="text-[var(--plc-on-surface)]">{count(summary().loc)}</span> LOC
        </span>
        <span class="shrink-0" title={`${count(summary().folders)} folders`}>
          <span class="text-[var(--plc-on-surface)]">{count(summary().files)}</span> files
        </span>
        <Show when={summary().scopes > 0}>
          <span class="shrink-0" title="Functions, classes and other scopes">
            <span class="text-[var(--plc-on-surface)]">{count(summary().scopes)}</span> fns
          </span>
        </Show>
      </div>
      {/* Always reserved, so the tree below never shifts when the metric changes. */}
      <div class="plc-data-sm flex h-5 min-w-0 items-center px-1 text-[var(--plc-on-subtle)]">
        <Show
          when={summary().worst}
          fallback={<span>No {props.colorMetric.label} in this folder</span>}
        >
          {(worst) => (
            <button
              type="button"
              class="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]"
              title={`Open ${worst().node.path}`}
              onClick={openWorst}
            >
              <span class="shrink-0">{props.colorMetric.invert ? "Lowest" : "Top"} {props.colorMetric.shortLabel}</span>
              <span class="min-w-0 truncate text-left text-[var(--plc-on-surface)]">{worst().node.name}</span>
              <span
                class="ml-auto shrink-0 rounded-sm px-1"
                style={metricCellColors(props.colorMetric, worst().node) ?? {}}
              >
                {metricCellText(props.colorMetric, worst().node) || "0"}
              </span>
            </button>
          )}
        </Show>
      </div>
    </div>
  );
}
