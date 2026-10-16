import { For, Show } from "solid-js";
import { Search, X } from "lucide-solid";
import { CheckboxRow } from "./ui/CheckboxRow";
import { PopoverPanel, PopoverSectionTitle } from "./ui/PopoverPanel";
import { explorerColumns, type ExplorerColumn } from "../utils/explorerColumns";
import { metricGroups, type MetricId } from "../utils/metricsStore";

/** Filter box: search icon, clear button, and Esc to clear. */
export function ExplorerFilter(props: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  let input: HTMLInputElement | undefined;
  return (
    <div class="relative w-full">
      <Search
        size={13}
        aria-hidden="true"
        class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--plc-on-disabled)]"
      />
      <input
        ref={input}
        type="search"
        aria-label={props.placeholder}
        placeholder={`${props.placeholder}…`}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && props.value) {
            e.preventDefault();
            props.onChange("");
          }
        }}
        class="h-7 w-full rounded-md border border-[var(--plc-border-strong)] bg-[var(--plc-surface)] pl-7 pr-7 text-[12px] text-[var(--plc-on-surface)] outline-none transition-colors duration-150 placeholder:text-[var(--plc-on-disabled)] focus:border-[var(--plc-border-focus)] focus:ring-2 focus:ring-[var(--plc-border-focus)]/15 [&::-webkit-search-cancel-button]:hidden"
      />
      <Show when={props.value}>
        <button
          type="button"
          aria-label="Clear filter"
          title="Clear filter (Esc)"
          class="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[var(--plc-on-subtle)] transition-colors duration-150 hover:bg-[var(--plc-surface-muted)] hover:text-[var(--plc-on-surface)]"
          onClick={() => {
            props.onChange("");
            input?.focus();
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </Show>
    </div>
  );
}

/** Empty list: says why, and offers the one action that fixes it. */
export function ExplorerEmpty(props: { filter: string; what: string; onClear: () => void }) {
  return (
    <div class="flex flex-col items-center gap-1 px-4 py-6 text-center text-[13px] text-[var(--plc-on-subtle)]">
      <Show when={props.filter.trim()} fallback={<span>No {props.what} to show.</span>}>
        <span>
          No {props.what} match <span class="font-medium text-[var(--plc-on-surface)]">“{props.filter.trim()}”</span>
        </span>
        <button
          type="button"
          class="rounded px-1 text-[var(--plc-accent)] transition-colors duration-150 hover:text-[var(--plc-accent-hover)]"
          onClick={() => props.onClear()}
        >
          Clear filter
        </button>
      </Show>
    </div>
  );
}

type ColumnGroup = { title: string; columns: ExplorerColumn[] };

const columnGroups = (): ColumnGroup[] =>
  [
    { title: "Folders", columns: explorerColumns().filter((c) => !c.metric) },
    ...metricGroups().map((group) => ({
      title: group.id,
      columns: explorerColumns().filter((c) => c.metric?.group === group.id),
    })),
  ].filter((group) => group.columns.length > 0);

/** Grouped column checklist; the treemap's color metric is always on. */
export function ColumnPickerPanel(props: {
  colorMetric: MetricId;
  picked: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <PopoverPanel width="md" class="max-h-[min(28rem,70vh)] overflow-y-auto">
      <For each={columnGroups()}>
        {(group, i) => (
          <div classList={{ "mt-3": i() > 0 }}>
            <PopoverSectionTitle class="mb-1.5">{group.title}</PopoverSectionTitle>
            <div class="space-y-1">
              <For each={group.columns}>
                {(column) => {
                  const isColor = () => column.id === props.colorMetric;
                  return (
                    <CheckboxRow
                      checked={isColor() || props.picked.includes(column.id)}
                      disabled={isColor()}
                      title={isColor() ? "Always shown: it's the treemap's color metric" : undefined}
                      onChange={() => props.onToggle(column.id)}
                      label={
                        <span class="flex items-baseline gap-1.5">
                          {column.title}
                          <Show when={isColor()}>
                            <span class="text-[10px] text-[var(--plc-on-subtle)]">treemap color</span>
                          </Show>
                        </span>
                      }
                    />
                  );
                }}
              </For>
            </div>
          </div>
        )}
      </For>
    </PopoverPanel>
  );
}
