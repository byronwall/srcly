import { Check, ChevronDown } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import { metricDefs, metricGroups, metricLabel, type MetricId } from "../utils/metricsStore";
import Popover from "./Popover";
import { Button } from "./ui/Button";
import { cx } from "./ui/classes";
import { PopoverPanel, PopoverSectionTitle } from "./ui/PopoverPanel";

/**
 * Grouped single-select over the metric catalog, shared by the Explorer's
 * Hot Spots view and the treemap's Color control: one metric colors the
 * treemap and ranks Hot Spots.
 */
export function MetricPicker(props: {
  selected: MetricId;
  onChange: (id: MetricId) => void;
  /** Prefix shown inside the trigger, e.g. "Rank by". */
  prefix?: string;
  placement?: "bottom-start" | "bottom-end";
  class?: string;
  /** Ranking Hot Spots: leave out neutral Detail metrics, which never rank. */
  ranking?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenSignal] = createSignal(false);
  const setOpen = (next: boolean) => {
    setOpenSignal(next);
    props.onOpenChange?.(next);
  };

  const offered = (group: string) =>
    metricDefs().filter((m) => m.group === group && !(props.ranking && m.direction === "neutral"));

  const pick = (id: MetricId) => {
    props.onChange(id);
    setOpen(false);
  };

  return (
    <Popover
      isOpen={open()}
      onOpenChange={setOpen}
      placement={props.placement ?? "bottom-start"}
      offset={{ x: 0, y: 4 }}
      trigger={(triggerProps) => (
        <Button
          ref={triggerProps.ref}
          size="sm"
          class={cx("min-w-0 justify-between gap-1.5", props.class)}
          aria-haspopup="listbox"
          aria-expanded={open()}
          onClick={(e) => triggerProps.onClick(e)}
        >
          <span class="min-w-0 truncate">
            <Show when={props.prefix}>
              <span class="font-normal text-[var(--plc-on-subtle)]">{props.prefix} </span>
            </Show>
            {metricLabel(props.selected)}
          </span>
          <ChevronDown size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
        </Button>
      )}
    >
      <PopoverPanel width="lg" class="w-72">
        <div class="max-h-96 overflow-y-auto" role="listbox" aria-label={props.prefix ?? "Metric"}>
          <For each={metricGroups().filter((group) => offered(group.id).length > 0)}>
            {(group, index) => (
              <div class={index() > 0 ? "mt-2 border-t border-[var(--plc-divider)] pt-2" : ""}>
                <PopoverSectionTitle class="px-2">
                  <span title={group.description}>{group.id}</span>
                  <Show when={group.id === "Detail"}>
                    <span class="font-normal normal-case tracking-normal text-[var(--plc-on-disabled)]"> · color only, never ranked</span>
                  </Show>
                </PopoverSectionTitle>
                <For each={offered(group.id)}>
                  {(metric) => {
                    const isSelected = () => props.selected === metric.id;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected()}
                        title={metric.description}
                        class={cx(
                          "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-[var(--plc-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]",
                          isSelected() ? "font-semibold text-[var(--plc-accent)]" : "text-[var(--plc-on-surface)]"
                        )}
                        onClick={() => pick(metric.id)}
                      >
                        <span class="flex w-3.5 shrink-0 justify-center">
                          <Show when={isSelected()}>
                            <Check size={14} aria-hidden="true" />
                          </Show>
                        </span>
                        <span class="min-w-0 flex-1 truncate">{metric.label}</span>
                        <span class="plc-data-sm shrink-0 font-normal text-[var(--plc-on-disabled)]">{metric.unit}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
        <p class="mt-2 border-t border-[var(--plc-divider)] px-2 pt-2 text-[11px] leading-snug text-[var(--plc-on-subtle)]">
          One metric colors the treemap and ranks Hot Spots. Hover a metric for what it counts.
        </p>
      </PopoverPanel>
    </Popover>
  );
}
