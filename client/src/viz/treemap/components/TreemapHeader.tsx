import { For, Show, type Accessor } from "solid-js";
import { ChartScatter, ChevronRight, GitFork, LayoutGrid } from "lucide-solid";
import {
  metricLabel,
  type MetricId,
} from "../../../utils/metricsStore";
import FileTypeFilter from "../../../components/FileTypeFilter";
import { isAnyPopoverOpen } from "../../../components/Popover";
import { MetricPicker } from "../../../components/MetricPicker";
import { TREEMAP_GRADIENT, TREEMAP_NA_BACKGROUND } from "../utils/colors";
import type { Crumb, View } from "../../../navigation/location";
import { Button } from "../../../components/ui/Button";

export type TreemapHeaderProps = {
  data: any;

  crumbs: Accessor<Crumb[]>;
  onCrumbClick: (at: string) => void;

  activeExtensions: Accessor<string[]>;
  onToggleExtension: (ext: string) => void;
  onClearExtensions: () => void;

  maxLoc: Accessor<number | undefined>;
  onMaxLocChange: (v: number | undefined) => void;

  primaryMetricId: Accessor<MetricId>;
  setMetric: (id: MetricId) => void;

  showLegend: Accessor<boolean>;
  setShowLegend: (v: boolean) => void;

  showMetricPopover: Accessor<boolean>;
  setShowMetricPopover: (v: boolean) => void;

  view: Accessor<View>;
  onViewChange: (view: View) => void;
};

const VIEWS: { id: View; label: string; icon: typeof GitFork }[] = [
  { id: "treemap", label: "Treemap", icon: LayoutGrid },
  { id: "graph", label: "Graph", icon: GitFork },
  { id: "scatter", label: "2x2", icon: ChartScatter },
];

export default function TreemapHeader(props: TreemapHeaderProps) {
  return (
    <div class="plc-toolbar flex items-center gap-3 overflow-x-auto px-3 border-b">
      {/* One switch for both projections of the same place. */}
      <div
        role="radiogroup"
        aria-label="View"
        class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
      >
        <For each={VIEWS}>
          {(v) => (
            <Button
              variant="tab"
              size="sm"
              role="radio"
              aria-checked={props.view() === v.id}
              active={props.view() === v.id}
              class="gap-1.5 px-2"
              onClick={() => props.onViewChange(v.id)}
            >
              <v.icon size={13} aria-hidden="true" />
              {v.label}
            </Button>
          )}
        </For>
      </div>

      {/* Breadcrumbs */}
      <nav
        aria-label="Location"
        class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[13px] scrollbar-hide"
      >
        <For each={props.crumbs()}>
          {(crumb, i) => (
            <div class="flex items-center whitespace-nowrap">
              <button
                type="button"
                class={
                  i() === props.crumbs().length - 1
                    ? "rounded px-1 font-semibold text-[var(--plc-on-surface)]"
                    : "rounded px-1 text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-accent)]"
                }
                aria-current={i() === props.crumbs().length - 1 ? "location" : undefined}
                title={crumb.at || undefined}
                onClick={() => props.onCrumbClick(crumb.at)}
              >
                {crumb.label}
              </button>
              <Show when={i() < props.crumbs().length - 1}>
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
          selected={props.primaryMetricId()}
          onChange={props.setMetric}
          onOpenChange={props.setShowMetricPopover}
          class="max-w-[220px]"
        />
      </div>

      {/* Legend: shown while hovering the Color control */}
      <Show when={props.showLegend() && !isAnyPopoverOpen()}>
        <div class="plc-floating pointer-events-none absolute right-3 top-11 z-50 w-56 rounded-lg border p-3 text-xs">
          <div class="mb-2 font-semibold text-[var(--plc-on-surface)]">
            {metricLabel(props.primaryMetricId())}
          </div>
          <div
            class="h-2.5 rounded-full border border-[var(--plc-border)]"
            style={{ background: TREEMAP_GRADIENT }}
          />
          <div class="mt-1 flex justify-between text-[11px] text-[var(--plc-on-subtle)]">
            <span>Fine</span>
            <span>Needs attention</span>
          </div>
          <div class="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--plc-on-subtle)]">
            <span
              aria-hidden="true"
              class="inline-block h-2.5 w-4 rounded-sm border border-[var(--plc-border)]"
              style={{ background: TREEMAP_NA_BACKGROUND }}
            />
            N/A: doesn't apply, skipped, or failed
          </div>
        </div>
      </Show>
    </div>
  );
}
