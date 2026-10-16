import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { HotSpotItem } from "../../components/HotSpotItem";
import type { Node } from "../../components/Explorer";
import type { MetricId } from "../../utils/metricsStore";
import type { QuadrantId, QuadrantPreset, ScatterCohort, ScatterPoint } from "./quadrants";
import { QUADRANT_COLORS, QUADRANT_GRID, withUnit } from "./scatterStyle";

type Point = ScatterPoint<Node>;

const PAGE = 100;

/**
 * The 2x2's side panel: the four quadrants laid out as on the plot (name +
 * count, click to select), then the selected quadrant's members as Hot Spots
 * rows, furthest past the cut-offs first.
 */
export default function QuadrantPanel(props: {
  preset: QuadrantPreset;
  groups: Record<QuadrantId, Point[]>;
  selected: QuadrantId;
  onSelect: (id: QuadrantId) => void;
  cut: { x: number; y: number };
  cohort: ScatterCohort;
  /** Metric whose witness a file row names (the function behind its max). */
  witnessMetric: MetricId;
  emptyText: string;
  class?: string;
  classList?: Record<string, boolean>;
}) {
  const info = (id: QuadrantId) => props.preset.quadrants.find((q) => q.id === id);
  const members = () => props.groups[props.selected];
  const noun = () => (props.cohort === "file" ? "files" : props.cohort === "component" ? "components" : "functions");

  const [limit, setLimit] = createSignal(PAGE);
  const [active, setActive] = createSignal(0);
  let listRef: HTMLDivElement | undefined;
  createEffect(on([() => props.selected, () => props.preset.id, () => props.cohort], () => {
    setLimit(PAGE);
    setActive(0);
    if (listRef) listRef.scrollTop = 0;
  }));

  // The row bar: how far past both cut-offs, relative to the quadrant's furthest.
  const reach = createMemo(() => {
    const { x: cx, y: cy } = props.cut;
    const of = (p: Point) => (cx > 0 ? p.x / cx : p.x) + (cy > 0 ? p.y / cy : p.y);
    return { of, max: Math.max(0, ...members().map(of)) };
  });

  const rows: HTMLDivElement[] = [];
  const shownCount = () => Math.min(limit(), members().length);
  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(shownCount() - 1, index));
    setActive(next);
    rows[next]?.focus();
    rows[next]?.scrollIntoView({ block: "nearest" });
  };
  const onRowKey = (index: number, e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
    if (e.key in step) focusRow(index + step[e.key]);
    else if (e.key === "Home") focusRow(0);
    else if (e.key === "End") focusRow(shownCount() - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div class={`flex min-h-0 shrink-0 flex-col border-[var(--plc-border)] ${props.class ?? ""}`} classList={props.classList}>
      <div role="radiogroup" aria-label="Quadrant" class="grid shrink-0 grid-cols-2 border-b border-[var(--plc-border)]">
        <For each={QUADRANT_GRID}>
          {(id, i) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.selected === id}
              class="flex min-w-0 items-center gap-1.5 border-[var(--plc-border)] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-[var(--plc-surface-hover)]"
              classList={{
                "border-r": i() % 2 === 0,
                "border-b": i() < 2,
                "bg-[var(--plc-surface-selected)]": props.selected === id,
              }}
              title={info(id)?.description}
              onClick={() => props.onSelect(id)}
            >
              <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: QUADRANT_COLORS[id] }} />
              <span class="plc-body-sm min-w-0 flex-1 truncate font-semibold text-[var(--plc-on-surface)]">{info(id)?.name}</span>
              <span class="plc-data-sm shrink-0 tabular-nums text-[var(--plc-on-muted)]">{props.groups[id].length.toLocaleString("en-US")}</span>
            </button>
          )}
        </For>
      </div>
      <div class="plc-data-sm shrink-0 border-b border-[var(--plc-border)] px-2 py-1 text-[var(--plc-on-subtle)]">
        <span class="font-semibold" style={{ color: QUADRANT_COLORS[props.selected] }}>{info(props.selected)?.name}</span>
        {` · ${members().length.toLocaleString("en-US")} ${noun()}, furthest past the cut-offs first. `}
        {info(props.selected)?.description}
      </div>
      <div ref={listRef} class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" role="listbox" aria-label={`${info(props.selected)?.name ?? ""} members`}>
        <For each={members().slice(0, limit())}>
          {(p, i) => (
            <HotSpotItem
              ref={(el) => (rows[i()] = el)}
              node={p.node}
              rank={i() + 1}
              metric={props.witnessMetric}
              cohort={props.cohort === "file" ? "file" : "function"}
              score={reach().max > 0 ? reach().of(p) / reach().max : 0}
              valueText={`${withUnit(props.preset.x, p.x)} · ${withUnit(props.preset.y, p.y)}`}
              tabbable={i() === Math.min(active(), members().length - 1)}
              onFocus={() => setActive(i())}
              onKeyDown={(e) => onRowKey(i(), e)}
            />
          )}
        </For>
        <Show when={members().length > limit()}>
          <button
            type="button"
            class="plc-body-sm w-full border-b border-[var(--plc-border)] px-2 py-1.5 text-left text-[var(--plc-accent)] hover:bg-[var(--plc-surface-muted)]"
            onClick={() => setLimit((n) => n + PAGE)}
          >
            Show {Math.min(PAGE, members().length - limit())} more ({(members().length - limit()).toLocaleString("en-US")} left)
          </button>
        </Show>
        <Show when={members().length === 0}>
          <div class="plc-body-sm px-2 py-3 text-[var(--plc-on-subtle)]">
            {props.emptyText || `Nothing in ${info(props.selected)?.name ?? "this quadrant"} at these cut-offs.`}
          </div>
        </Show>
      </div>
    </div>
  );
}
