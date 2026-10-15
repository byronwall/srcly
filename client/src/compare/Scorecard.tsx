import { createMemo, For, Show } from "solid-js";
import { cx } from "../components/ui/classes";
import { breakablePath, SplitBar } from "./bits";
import { compareMetricLabel, formatDelta, formatValue, VERDICT_TEXT } from "./metrics";
import type { CompareMetricDef, ComparePayload, MetricTotal } from "./types";

const VERDICT_ORDER = { worse: 0, better: 1, neutral: 2, same: 3 } as const;

function SectionTitle(props: { title: string; detail?: string }) {
  return (
    <div class="flex items-baseline justify-between px-3 pb-1 pt-3">
      <span class="plc-label-caps text-[var(--plc-on-subtle)]">{props.title}</span>
      <Show when={props.detail}>
        <span class="text-[11px] text-[var(--plc-on-subtle)]">{props.detail}</span>
      </Show>
    </div>
  );
}

/**
 * Left rail: which way each metric moved over the changed files. Risk metrics
 * first (worst first), then size-only metrics, then imports. Clicking a metric
 * ranks the table by it.
 */
export function Scorecard(props: {
  payload: ComparePayload;
  activeMetric: string | null;
  onPickMetric: (metric: string) => void;
}) {
  const entries = createMemo(() =>
    props.payload.metrics
      .map((def) => ({ def, total: props.payload.summary.metrics[def.name] }))
      .filter((e): e is { def: CompareMetricDef; total: MetricTotal } => Boolean(e.total))
  );
  const risk = createMemo(() =>
    entries()
      .filter((e) => e.def.direction !== "neutral" && e.total.verdict !== "same")
      .sort(
        (a, b) =>
          VERDICT_ORDER[a.total.verdict] - VERDICT_ORDER[b.total.verdict] ||
          b.total.filesWorse - a.total.filesWorse ||
          b.total.filesBetter - a.total.filesBetter
      )
  );
  const unchanged = createMemo(
    () => entries().filter((e) => e.def.direction !== "neutral" && e.total.verdict === "same").length
  );
  const size = createMemo(() => entries().filter((e) => e.def.direction === "neutral" && e.total.delta !== 0));
  const maxFiles = createMemo(() =>
    Math.max(1, ...risk().map((e) => Math.max(e.total.filesBetter, e.total.filesWorse)))
  );
  const crossFolder = createMemo(() => props.payload.edges.added.filter((e) => e.crossFolder));

  return (
    <div class="pb-4 text-[13px]">
      <SectionTitle title="Risk metrics" detail="over changed files" />
      <Show
        when={risk().length}
        fallback={<p class="px-3 py-1 text-xs text-[var(--plc-on-subtle)]">No risk metric moved.</p>}
      >
        <For each={risk()}>
          {(e) => (
            <button
              type="button"
              class={cx(
                "grid w-full grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-[var(--plc-surface-hover)]",
                props.activeMetric === e.def.name && "bg-[var(--plc-surface-selected)] hover:bg-[var(--plc-surface-selected)]"
              )}
              onClick={() => props.onPickMetric(e.def.name)}
            >
              <span class="truncate font-medium text-[var(--plc-on-surface)]">{compareMetricLabel(e.def.name)}</span>
              <span class={cx("plc-data-md font-semibold", VERDICT_TEXT[e.total.verdict])}>
                {e.def.aggregation === "sum"
                  ? e.total.verdict === "worse"
                    ? "worse"
                    : "better"
                  : formatDelta(e.def.name, e.total.delta)}
              </span>
              <span class="plc-data-sm mt-0.5 text-[var(--plc-on-subtle)]">
                {e.def.aggregation === "sum"
                  ? `${e.total.filesWorse} worse · ${e.total.filesBetter} better`
                  : `${e.def.aggregation} ${formatValue(e.def.name, e.total.before)} → ${formatValue(e.def.name, e.total.after)}`}
              </span>
              <span class="mt-0.5 flex justify-end" title={`${e.total.filesBetter} files better, ${e.total.filesWorse} worse`}>
                <SplitBar better={e.total.filesBetter} worse={e.total.filesWorse} max={maxFiles()} />
              </span>
            </button>
          )}
        </For>
      </Show>
      <Show when={unchanged()}>
        <p class="px-3 pt-1 text-[11px] text-[var(--plc-on-subtle)]">{unchanged()} other risk metrics unchanged</p>
      </Show>

      <Show when={size().length}>
        <SectionTitle title="Size" detail="growth is expected" />
        <For each={size()}>
          {(e) => (
            <div class="flex items-baseline justify-between gap-3 px-3 py-0.5">
              <span class="truncate text-[var(--plc-on-muted)]">{compareMetricLabel(e.def.name)}</span>
              <span class="plc-data-sm whitespace-nowrap text-[var(--plc-on-subtle)]">
                {formatValue(e.def.name, e.total.before)} → {formatValue(e.def.name, e.total.after)}
                <span class="ml-2 inline-block w-12 text-right text-[var(--plc-on-muted)]">
                  {formatDelta(e.def.name, e.total.delta)}
                </span>
              </span>
            </div>
          )}
        </For>
      </Show>

      <SectionTitle title="Imports" />
      <div class="flex items-baseline gap-3 px-3 py-0.5">
        <span class="plc-data-md text-[var(--plc-success)]">+{props.payload.summary.edges.added}</span>
        <span class="plc-data-md text-[var(--plc-error)]">−{props.payload.summary.edges.removed}</span>
        <span class="text-xs text-[var(--plc-on-subtle)]">file-level import edges</span>
      </div>
      <Show when={crossFolder().length}>
        <p class="px-3 pb-1 pt-2 text-xs text-[var(--plc-on-muted)]">
          {crossFolder().length} new across folders
        </p>
        <For each={crossFolder().slice(0, 8)}>
          {(edge) => (
            <div class="plc-data-sm px-3 py-1 leading-snug text-[var(--plc-on-muted)]">
              <div>{breakablePath(edge.source)}</div>
              <div class="pl-3">
                <span class="mr-1 text-[var(--plc-success)]">→</span>
                {breakablePath(edge.target)}
              </div>
            </div>
          )}
        </For>
        <Show when={crossFolder().length > 8}>
          <p class="px-3 pt-0.5 text-[11px] text-[var(--plc-on-subtle)]">and {crossFolder().length - 8} more</p>
        </Show>
      </Show>
    </div>
  );
}
