import { Check, ChevronDown } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import { scanStore } from "../state/scanStore";
import {
  activityWindows,
  isActivityMetric,
  metricDefs,
  metricGroups,
  metricLabel,
  ranTools,
  type ActivityInfo,
  type FindingsInfo,
  type MetricId,
} from "../utils/metricsStore";
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

  const activity = (): ActivityInfo | null => scanStore.data()?.activity ?? null;
  const findings = (): FindingsInfo | null => scanStore.data()?.findings ?? null;
  const windowShort = () => scanStore.activityWindow();

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
            <Show when={isActivityMetric(props.selected)}>
              <span class="font-normal text-[var(--plc-on-subtle)]"> · {windowShort()}</span>
            </Show>
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
                <Show when={group.id === "Activity"}>
                  <ActivityWindowControl activity={activity()} />
                </Show>
                <Show when={group.id === "Findings" && findings()}>
                  {(info) => <FindingsStatus info={info()} />}
                </Show>
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

/** Which checkers produced the Findings metrics, or why they're N/A. */
export function FindingsStatus(props: { info: FindingsInfo; class?: string }) {
  const lines = () => {
    const info = props.info;
    if (info.status === "running") return [{ text: "Checks are still running…", ok: true, title: "" }];
    if (info.status !== "ok") return [{ text: `N/A: ${info.reason}`, ok: false, title: info.reason }];
    const tools = ranTools(info);
    if (!tools.length) return [{ text: "No files any checker covers", ok: false, title: "" }];
    return tools.map((t) =>
      t.status === "ok"
        ? {
            text: `${t.label} · ${t.finding_count.toLocaleString("en-US")}`,
            ok: true,
            title: `${t.label}: ${t.finding_count} findings, ${t.error_count} errors${t.files_checked != null ? ` in ${t.files_checked} files` : ""} (${t.seconds}s)`,
          }
        : { text: `${t.label} · N/A`, ok: false, title: t.reason }
    );
  };
  return (
    <ul class={cx("mb-1 px-2", props.class)} aria-label="Checkers that ran">
      <For each={lines()}>
        {(line) => (
          <li
            class={cx("truncate text-[11px]", line.ok ? "text-[var(--plc-on-subtle)]" : "text-[var(--plc-on-muted)]")}
            title={line.title || line.text}
          >
            {line.text}
          </li>
        )}
      </For>
    </ul>
  );
}

/** Window chips for the Activity metrics, plus whether Git history could be read. */
function ActivityWindowControl(props: { activity: ActivityInfo | null }) {
  const status = () => {
    const a = props.activity;
    if (!a) return "";
    if (a.status !== "ok") return `N/A: ${a.reason}`;
    return a.note ? `at ${a.head} · ${a.note}` : `at ${a.head} · ${a.files_touched.toLocaleString("en-US")} files touched`;
  };
  return (
    <div class="mb-1 px-2">
      <div class="flex items-center gap-1" role="radiogroup" aria-label="Git history window">
        <For each={activityWindows()}>
          {(w) => {
            const active = () => scanStore.activityWindow() === w.id;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={active()}
                title={w.label}
                disabled={scanStore.activityLoading()}
                class={cx(
                  "plc-data-sm h-6 rounded-md border px-2 text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]",
                  active()
                    ? "border-[var(--plc-accent)] font-semibold text-[var(--plc-accent)]"
                    : "border-[var(--plc-divider)] text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)]"
                )}
                onClick={() => void scanStore.setActivityWindow(w.id)}
              >
                {w.id}
              </button>
            );
          }}
        </For>
      </div>
      <Show when={status()}>
        <p
          class={cx(
            "mt-1 truncate text-[11px]",
            props.activity?.status === "ok" ? "text-[var(--plc-on-subtle)]" : "text-[var(--plc-on-muted)]"
          )}
          title={status()}
        >
          {status()}
        </p>
      </Show>
    </div>
  );
}
