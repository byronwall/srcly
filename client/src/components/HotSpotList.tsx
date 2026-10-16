import { ChevronRight } from "lucide-solid";
import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { cohortNodes, rankHotSpots, type HotSpotCohort } from "../utils/hotSpotRanking";
import { isRankingMetric, metricDef, metricLabel, type MetricId } from "../utils/metricsStore";
import { ExplorerEmpty } from "./ExplorerControls";
import { HotSpotItem } from "./HotSpotItem";
import type { Node } from "./Explorer";

/** Ranked rows shown before "Show more"; N/A rows wait in their own collapsed group. */
const PAGE = 50;

/**
 * The Hot Spots list: one cohort ranked by one metric, worst first. Each row
 * shows the value with its unit and the function or component behind a
 * file's max. Nodes with no value (N/A) sit apart in a collapsed group at
 * the bottom. Arrow keys move between rows, Enter opens one, Shift+Enter
 * opens its witness, Home/End jump.
 */
export function HotSpotList(props: {
  data: Node | null;
  metric: MetricId;
  cohort: HotSpotCohort;
  filter: string;
  onClearFilter: () => void;
}) {
  const ranking = createMemo(() =>
    props.data ? rankHotSpots(cohortNodes(props.data, props.cohort), props.metric) : { ranked: [], na: [] }
  );
  const [limit, setLimit] = createSignal(PAGE);
  const [naOpen, setNaOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let scroller: HTMLDivElement | undefined;
  createEffect(on([() => props.metric, () => props.cohort, () => props.data], () => {
    setLimit(PAGE);
    setNaOpen(false);
    setActive(0);
    if (scroller) scroller.scrollTop = 0;
  }));

  const shown = () => ranking().ranked.slice(0, limit());
  const naRows = () => (naOpen() ? ranking().na : []);
  const rowCount = () => shown().length + naRows().length;
  const noun = () => (props.cohort === "file" ? "files" : "functions");

  const rows: HTMLDivElement[] = [];
  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(rowCount() - 1, index));
    setActive(next);
    rows[next]?.focus();
    rows[next]?.scrollIntoView({ block: "nearest" });
  };
  const onKeyDown = (index: number, e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
    if (e.key in step) focusRow(index + step[e.key]);
    else if (e.key === "Home") focusRow(0);
    else if (e.key === "End") focusRow(rowCount() - 1);
    else return;
    e.preventDefault();
  };

  const row = (node: Node, index: number, rank: number | null, score: number) => (
    <HotSpotItem
      ref={(el) => (rows[index] = el)}
      node={node}
      rank={rank}
      metric={props.metric}
      cohort={props.cohort}
      score={score}
      tabbable={index === Math.min(active(), rowCount() - 1)}
      onFocus={() => setActive(index)}
      onKeyDown={(e) => onKeyDown(index, e)}
    />
  );

  return (
    <>
      <div class="plc-data-sm flex shrink-0 items-center gap-1 border-b border-[var(--plc-border)] px-2 py-1 text-[var(--plc-on-subtle)]">
        <Show
          when={isRankingMetric(props.metric)}
          fallback={<span>{metricLabel(props.metric)} is detail and never ranks; pick a metric to rank by</span>}
        >
          <span class="min-w-0 truncate" title={metricDef(props.metric)?.description}>
            {ranking().ranked.length.toLocaleString("en-US")} {noun()} by {metricLabel(props.metric)}, worst first
          </span>
        </Show>
      </div>
      <div ref={scroller} class="flex-1 overflow-y-auto overflow-x-hidden" role="listbox" aria-label={`Hot spots by ${metricLabel(props.metric)}`}>
        <For each={shown()}>{(item, i) => row(item.node, i(), i() + 1, item.score)}</For>
        <Show when={ranking().ranked.length > limit()}>
          <button
            type="button"
            class="plc-body-sm w-full border-b border-[var(--plc-border)] px-2 py-1.5 text-left text-[var(--plc-accent)] hover:bg-[var(--plc-surface-muted)]"
            onClick={() => setLimit((n) => n + PAGE)}
          >
            Show {Math.min(PAGE, ranking().ranked.length - limit())} more ({(ranking().ranked.length - limit()).toLocaleString("en-US")} left)
          </button>
        </Show>
        <Show when={ranking().na.length > 0}>
          <button
            type="button"
            aria-expanded={naOpen()}
            class="plc-label-caps flex w-full items-center gap-1 border-b border-[var(--plc-border)] bg-[var(--plc-surface-muted)] px-2 py-1.5 text-left text-[var(--plc-on-subtle)] hover:text-[var(--plc-on-surface)]"
            title={`No ${metricLabel(props.metric)} value: it doesn't apply to their language or kind, or the file was skipped or failed`}
            onClick={() => setNaOpen((open) => !open)}
          >
            <ChevronRight size={12} aria-hidden="true" class="transition-transform duration-150" classList={{ "rotate-90": naOpen() }} />
            N/A · {ranking().na.length.toLocaleString("en-US")} {noun()} not ranked
          </button>
          <For each={naRows()}>{(node, i) => row(node, shown().length + i(), null, 0)}</For>
        </Show>
        <Show when={isRankingMetric(props.metric) && ranking().ranked.length === 0}>
          <ExplorerEmpty filter={props.filter} what="hot spots" onClear={props.onClearFilter} />
        </Show>
      </div>
    </>
  );
}
