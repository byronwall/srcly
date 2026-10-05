import { Check, ChevronDown } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import {
  HOTSPOT_METRIC_GROUPS,
  HOTSPOT_METRICS,
  hotSpotMetricLabel,
  type HotSpotMetricId,
} from "../utils/metricsStore";
import Popover from "./Popover";
import { Button } from "./ui/Button";
import { cx } from "./ui/classes";
import { PopoverPanel, PopoverSectionTitle } from "./ui/PopoverPanel";

/**
 * Grouped multi-select for hot spot metrics, shared by the Explorer's Hot
 * Spots view and the treemap's Color control so both read the same list.
 * At least one metric always stays selected.
 */
export function MetricPicker(props: {
  selected: HotSpotMetricId[];
  onChange: (ids: HotSpotMetricId[]) => void;
  /** Prefix shown inside the trigger, e.g. "Rank by". */
  prefix?: string;
  placement?: "bottom-start" | "bottom-end";
  class?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenSignal] = createSignal(false);
  const setOpen = (next: boolean) => {
    setOpenSignal(next);
    props.onOpenChange?.(next);
  };

  const summary = () => {
    const [first, ...rest] = props.selected;
    if (!first) return "Select metric";
    return rest.length === 0
      ? hotSpotMetricLabel(first)
      : `${hotSpotMetricLabel(first)} +${rest.length}`;
  };

  const toggle = (id: HotSpotMetricId) => {
    const current = props.selected;
    if (current.includes(id)) {
      if (current.length > 1) props.onChange(current.filter((m) => m !== id));
    } else {
      props.onChange([...current, id]);
    }
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
            {summary()}
          </span>
          <ChevronDown size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
        </Button>
      )}
    >
      <PopoverPanel width="lg" class="w-64">
        <div class="max-h-80 overflow-y-auto" role="listbox" aria-multiselectable="true">
          <For each={HOTSPOT_METRIC_GROUPS}>
            {(group, index) => (
              <div class={index() > 0 ? "mt-2 border-t border-[var(--plc-divider)] pt-2" : ""}>
                <PopoverSectionTitle class="px-2">{group}</PopoverSectionTitle>
                <For each={HOTSPOT_METRICS.filter((m) => m.group === group)}>
                  {(metric) => {
                    const isSelected = () => props.selected.includes(metric.id);
                    return (
                      <div class="group flex items-center rounded-md hover:bg-[var(--plc-surface-hover)]">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected()}
                          class={cx(
                            "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]",
                            isSelected()
                              ? "font-semibold text-[var(--plc-accent)]"
                              : "text-[var(--plc-on-surface)]"
                          )}
                          onClick={() => toggle(metric.id)}
                        >
                          <span class="flex w-3.5 shrink-0 justify-center">
                            <Show when={isSelected()}>
                              <Check size={14} aria-hidden="true" />
                            </Show>
                          </span>
                          <span class="truncate">{metric.label}</span>
                        </button>
                        <button
                          type="button"
                          class="mr-1 hidden h-6 rounded px-1.5 text-[11px] text-[var(--plc-on-subtle)] hover:bg-[var(--plc-surface-muted)] hover:text-[var(--plc-on-surface)] focus:block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)] group-hover:block"
                          title={`Use only ${metric.label}`}
                          onClick={() => props.onChange([metric.id])}
                        >
                          Only
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
        <p class="mt-2 border-t border-[var(--plc-divider)] px-2 pt-2 text-[11px] leading-snug text-[var(--plc-on-subtle)]">
          Hot spots rank by the combined score of every selected metric. The first one colors the treemap.
        </p>
      </PopoverPanel>
    </Popover>
  );
}
