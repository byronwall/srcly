import { For, Show, type Accessor } from "solid-js";
import { ChevronRight, GitFork } from "lucide-solid";
import {
  hotSpotMetricLabel,
  type HotSpotMetricId,
} from "../../../utils/metricsStore";
import FileTypeFilter from "../../../components/FileTypeFilter";
import { MetricPicker } from "../../../components/MetricPicker";
import { TREEMAP_RAMP } from "../utils/colors";
import { Button } from "../../../components/ui/Button";

export type TreemapHeaderProps = {
  data: any;

  breadcrumbs: Accessor<any[]>;
  onBreadcrumbClick: (node: any) => void;

  activeExtensions: Accessor<string[]>;
  onToggleExtension: (ext: string) => void;
  onClearExtensions: () => void;

  maxLoc: Accessor<number | undefined>;
  onMaxLocChange: (v: number | undefined) => void;

  primaryMetricId: Accessor<HotSpotMetricId>;
  selectedHotSpotMetrics: Accessor<HotSpotMetricId[]>;
  setSelectedHotSpotMetrics: (ids: HotSpotMetricId[]) => void;

  showLegend: Accessor<boolean>;
  setShowLegend: (v: boolean) => void;

  showMetricPopover: Accessor<boolean>;
  setShowMetricPopover: (v: boolean) => void;

  showDependencyGraph: Accessor<boolean>;
  setShowDependencyGraph: (v: boolean) => void;
};

export default function TreemapHeader(props: TreemapHeaderProps) {
  return (
    <div class="plc-toolbar flex items-center gap-3 overflow-x-auto px-3 border-b">
      {/* Breadcrumbs */}
      <nav
        aria-label="Treemap location"
        class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[13px] scrollbar-hide"
      >
        <For each={props.breadcrumbs()}>
          {(node, i) => (
            <div class="flex items-center whitespace-nowrap">
              <button
                type="button"
                class={
                  i() === props.breadcrumbs().length - 1
                    ? "rounded px-1 font-semibold text-[var(--plc-on-surface)]"
                    : "rounded px-1 text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-accent)]"
                }
                aria-current={i() === props.breadcrumbs().length - 1 ? "location" : undefined}
                onClick={() => props.onBreadcrumbClick(node)}
              >
                {node.name || "root"}
              </button>
              <Show when={i() < props.breadcrumbs().length - 1}>
                <ChevronRight size={13} class="text-[var(--plc-on-disabled)]" aria-hidden="true" />
              </Show>
            </div>
          )}
        </For>
      </nav>

      {/* Filters */}
      <div class="shrink-0">
        <FileTypeFilter
          data={props.data}
          activeExtensions={props.activeExtensions()}
          onToggleExtension={props.onToggleExtension}
          onClearExtensions={props.onClearExtensions}
          maxLoc={props.maxLoc()}
          onMaxLocChange={props.onMaxLocChange}
        />
      </div>

      {/* Color Metric (linked to Hot Spot metrics) */}
      <div
        class="relative flex shrink-0 items-center gap-1.5"
        onMouseEnter={() => props.setShowLegend(true)}
        onMouseLeave={() => props.setShowLegend(false)}
      >
        <MetricPicker
          prefix="Color"
          placement="bottom-end"
          selected={props.selectedHotSpotMetrics()}
          onChange={props.setSelectedHotSpotMetrics}
          onOpenChange={props.setShowMetricPopover}
          class="max-w-[220px]"
        />
      </div>

      {/* View Dependencies Button */}
      <div class="flex shrink-0 gap-1.5 border-l border-[var(--plc-border)] pl-3">
        <Button
          active={props.showDependencyGraph()}
          class={
            props.showDependencyGraph()
              ? "border-[var(--plc-accent-border)] bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]"
              : undefined
          }
          aria-pressed={props.showDependencyGraph()}
          onClick={() => props.setShowDependencyGraph(!props.showDependencyGraph())}
        >
          <GitFork size={14} aria-hidden="true" />
          Dependencies
        </Button>

      </div>

      {/* Legend: shown while hovering the Color control */}
      <Show when={props.showLegend() && !props.showMetricPopover()}>
        <div class="plc-floating pointer-events-none absolute right-3 top-11 z-50 w-56 rounded-lg border p-3 text-xs">
          <div class="mb-2 font-semibold text-[var(--plc-on-surface)]">
            {hotSpotMetricLabel(props.primaryMetricId())}
          </div>
          <div
            class="h-2.5 rounded-full border border-[var(--plc-border)]"
            style={{ background: `linear-gradient(90deg, ${TREEMAP_RAMP.join(", ")})` }}
          />
          <div class="mt-1 flex justify-between text-[11px] text-[var(--plc-on-subtle)]">
            <span>Fine</span>
            <span>Needs attention</span>
          </div>
        </div>
      </Show>
    </div>
  );
}
