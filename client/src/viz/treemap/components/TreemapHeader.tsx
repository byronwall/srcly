import { For, Show, type Accessor } from "solid-js";
import {
  HOTSPOT_METRICS,
  type HotSpotMetricId,
} from "../../../utils/metricsStore";
import FileTypeFilter from "../../../components/FileTypeFilter";
import Popover from "../../../components/Popover";
import { Button } from "../../../components/ui/Button";
import {
  OptionRow,
  PopoverPanel,
  PopoverSectionTitle,
} from "../../../components/ui/PopoverPanel";

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
  showDataFlow: Accessor<boolean>;
  setShowDataFlow: (v: boolean) => void;
};

export default function TreemapHeader(props: TreemapHeaderProps) {
  return (
    <div class="plc-toolbar flex items-center gap-3 overflow-x-auto px-3 border-b">
      {/* Breadcrumbs */}
      <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm scrollbar-hide">
        <For each={props.breadcrumbs()}>
          {(node, i) => (
            <div class="flex items-center whitespace-nowrap">
              <button
                class="text-[var(--plc-on-muted)] hover:text-[var(--plc-accent)] hover:underline"
                onClick={() => props.onBreadcrumbClick(node)}
              >
                {node.name || "root"}
              </button>
              <Show when={i() < props.breadcrumbs().length - 1}>
                <span class="mx-1 text-[var(--plc-on-disabled)]">/</span>
              </Show>
            </div>
          )}
        </For>
      </div>

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
      <div class="flex shrink-0 items-center gap-1 relative">
        <button
          class="plc-label-caps mr-2 cursor-help text-[var(--plc-on-subtle)] hover:text-[var(--plc-on-surface)] border-b border-dotted border-[var(--plc-border-strong)]"
          onMouseEnter={() => props.setShowLegend(true)}
          onMouseLeave={() => props.setShowLegend(false)}
        >
          Color:
        </button>
        <Popover
          isOpen={props.showMetricPopover()}
          onOpenChange={props.setShowMetricPopover}
          placement="bottom-end"
          offset={{ x: 0, y: 4 }}
          trigger={(triggerProps) => (
            <Button
              ref={triggerProps.ref}
              size="xs"
              class="hover:border-[var(--plc-accent)] hover:text-[var(--plc-accent)]"
              onClick={(e) => triggerProps.onClick(e)}
            >
              <span class="truncate max-w-[140px]">
                {HOTSPOT_METRICS.find((m) => m.id === props.primaryMetricId())
                  ?.label ?? "Select metric"}
              </span>
              <span class="text-[9px]">▼</span>
            </Button>
          )}
        >
          <PopoverPanel width="md">
            <PopoverSectionTitle>
              Hot Spot Metrics
            </PopoverSectionTitle>
            <div class="max-h-64 overflow-y-auto space-y-1">
              <For each={HOTSPOT_METRICS}>
                {(metric) => {
                  const isSelected = () =>
                    props.selectedHotSpotMetrics().includes(metric.id);
                  const toggleMetric = () => {
                    const current = props.selectedHotSpotMetrics();
                    if (isSelected()) {
                      if (current.length > 1) {
                        props.setSelectedHotSpotMetrics(
                          current.filter((m) => m !== metric.id)
                        );
                      }
                    } else {
                      props.setSelectedHotSpotMetrics([...current, metric.id]);
                    }
                  };
                  return (
                    <OptionRow
                      selected={isSelected()}
                      class="flex items-center justify-between"
                      onClick={toggleMetric}
                    >
                      <span>{metric.label}</span>
                      <span
                        class={`ml-2 text-[10px] ${
                          isSelected()
                            ? "text-[var(--plc-accent)]"
                            : "text-[var(--plc-on-subtle)]"
                        }`}
                      >
                        {isSelected() ? "●" : "○"}
                      </span>
                    </OptionRow>
                  );
                }}
              </For>
            </div>
          </PopoverPanel>
        </Popover>
      </div>

      {/* View Dependencies Button */}
      <div class="shrink-0 pl-4 border-l border-[var(--plc-border)] flex gap-2">
        <Button
          active={props.showDependencyGraph()}
          class={
            props.showDependencyGraph()
              ? "border-[var(--plc-accent-border)] bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]"
              : undefined
          }
          onClick={() => {
            props.setShowDependencyGraph(!props.showDependencyGraph());
            props.setShowDataFlow(false);
          }}
        >
          View Dependencies
        </Button>

        <Button
          active={props.showDataFlow()}
          class={
            props.showDataFlow()
              ? "border-[var(--plc-accent-border)] bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]"
              : undefined
          }
          onClick={() => {
            props.setShowDataFlow(!props.showDataFlow());
            props.setShowDependencyGraph(false);
          }}
        >
          Data Flow
        </Button>
      </div>

      {/* Legend Tooltip */}
      <Show when={props.showLegend()}>
        <div class="plc-floating absolute top-10 right-4 z-50 border p-3 rounded-lg text-xs w-64">
          <div class="font-semibold mb-2 text-[var(--plc-on-surface)] border-b border-[var(--plc-border)] pb-1">
            {HOTSPOT_METRICS.find((m) => m.id === props.primaryMetricId())
              ?.label || "Metric"}
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-[var(--plc-chart-1)]"></div>
              <span>Lower score</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-[var(--plc-chart-4)]"></div>
              <span>Medium score</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-[var(--plc-chart-5)]"></div>
              <span>Higher score</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
