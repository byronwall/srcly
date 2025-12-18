import { For, Show, type Accessor } from "solid-js";
import {
  HOTSPOT_METRICS,
  type HotSpotMetricId,
} from "../../../utils/metricsStore";
import FileTypeFilter from "../../../components/FileTypeFilter";
import Popover from "../../../components/Popover";

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
    <div class="flex items-center justify-between px-3 py-2 bg-[#1e1e1e] border-b border-[#333]">
      {/* Breadcrumbs */}
      <div class="flex items-center gap-1 overflow-x-auto text-sm scrollbar-hide">
        <For each={props.breadcrumbs()}>
          {(node, i) => (
            <div class="flex items-center whitespace-nowrap">
              <button
                class="hover:text-blue-400 hover:underline text-gray-300"
                onClick={() => props.onBreadcrumbClick(node)}
              >
                {node.name || "root"}
              </button>
              <Show when={i() < props.breadcrumbs().length - 1}>
                <span class="mx-1 text-gray-600">/</span>
              </Show>
            </div>
          )}
        </For>
      </div>

      {/* Filters */}
      <div class="ml-4">
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
      <div class="flex items-center gap-1 ml-4 relative">
        <button
          class="text-xs text-gray-500 mr-2 uppercase tracking-wider cursor-help hover:text-gray-300 border-b border-dotted border-gray-600"
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
            <button
              ref={triggerProps.ref}
              type="button"
              class="bg-[#252526] border border-[#3e3e42] text-gray-400 text-xs rounded px-2 py-0.5 outline-none flex items-center gap-1 hover:border-blue-500 hover:text-blue-200"
              onClick={(e) => triggerProps.onClick(e)}
            >
              <span class="truncate max-w-[140px]">
                {HOTSPOT_METRICS.find((m) => m.id === props.primaryMetricId())
                  ?.label ?? "Select metric"}
              </span>
              <span class="text-[9px]">▼</span>
            </button>
          )}
        >
          <div class="bg-[#252526] border border-[#3e3e42] rounded shadow-xl z-50 p-2 w-56">
            <div class="text-xs font-bold text-gray-400 mb-2">
              Hot Spot Metrics
            </div>
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
                    <button
                      type="button"
                      class={`w-full flex items-center justify-between text-left text-[11px] px-2 py-1 rounded ${
                        isSelected()
                          ? "bg-blue-900/60 text-blue-100"
                          : "text-gray-300 hover:bg-[#333]"
                      }`}
                      onClick={toggleMetric}
                    >
                      <span>{metric.label}</span>
                      <span
                        class={`ml-2 text-[10px] ${
                          isSelected() ? metric.color : "text-gray-500"
                        }`}
                      >
                        {isSelected() ? "●" : "○"}
                      </span>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </Popover>
      </div>

      {/* View Dependencies Button */}
      <div class="ml-4 pl-4 border-l border-[#333] flex gap-2">
        <button
          class={`px-3 py-1 text-xs rounded border transition-colors ${
            props.showDependencyGraph()
              ? "bg-purple-900 border-purple-700 text-purple-100"
              : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
          }`}
          onClick={() => {
            props.setShowDependencyGraph(!props.showDependencyGraph());
            props.setShowDataFlow(false);
          }}
        >
          View Dependencies
        </button>

        <button
          class={`px-3 py-1 text-xs rounded border transition-colors ${
            props.showDataFlow()
              ? "bg-teal-900 border-teal-700 text-teal-100"
              : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
          }`}
          onClick={() => {
            props.setShowDataFlow(!props.showDataFlow());
            props.setShowDependencyGraph(false);
          }}
        >
          Data Flow
        </button>
      </div>

      {/* Legend Tooltip */}
      <Show when={props.showLegend()}>
        <div class="absolute top-10 right-4 z-50 bg-[#252526] border border-[#3e3e42] p-3 rounded shadow-xl text-xs w-64">
          <div class="font-bold mb-2 text-gray-300 border-b border-[#3e3e42] pb-1">
            {HOTSPOT_METRICS.find((m) => m.id === props.primaryMetricId())
              ?.label || "Metric"}
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-[#569cd6]"></div>
              <span>Lower score</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-[#dcdcaa]"></div>
              <span>Medium score</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-[#ce9178]"></div>
              <span>Higher score</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
