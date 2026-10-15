import { For, Show } from "solid-js";
import { compareMetricLabel, formatDelta, formatValue, VERDICT_TEXT } from "./metrics";
import type { ComparePayload, CompareSideMeta } from "./types";

function Side(props: { side: CompareSideMeta }) {
  return (
    <span class="min-w-0">
      <span class="plc-data-md text-[var(--plc-on-surface)]">{props.side.label}</span>
      <Show when={props.side.subject}>
        <span class="ml-1.5 text-[var(--plc-on-subtle)]">{props.side.subject}</span>
      </Show>
    </span>
  );
}

function Stat(props: { label: string; children: any }) {
  return (
    <div class="flex items-baseline gap-1.5 whitespace-nowrap">
      <span class="plc-label-sm text-[var(--plc-on-subtle)]">{props.label}</span>
      <span class="plc-data-md">{props.children}</span>
    </div>
  );
}

/** One dense band: what is compared, how much changed, and which way metrics moved. */
export function SummaryStrip(props: { payload: ComparePayload }) {
  const s = () => props.payload.summary;
  // Risk metrics that moved, worst first; size-only and unchanged metrics stay out.
  const moved = () =>
    props.payload.metrics
      .map((m) => ({ def: m, total: s().metrics[m.name] }))
      .filter((m) => m.total && (m.total.verdict === "better" || m.total.verdict === "worse"))
      .sort((a, b) => Number(a.total.verdict === "better") - Number(b.total.verdict === "better"));

  return (
    <div class="border-b border-[var(--plc-border)] bg-[var(--plc-surface)] px-4 py-2 text-[13px]">
      <div class="flex min-w-0 items-center gap-2 truncate">
        <Side side={props.payload.base} />
        <span class="text-[var(--plc-on-subtle)]">→</span>
        <Side side={props.payload.head} />
      </div>
      <div class="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <Stat label="Files">
          {s().files.total}
          <span class="ml-2 text-[var(--plc-success)]">+{s().files.added}</span>
          <span class="ml-1.5 text-[var(--plc-error)]">−{s().files.removed}</span>
          <span class="ml-1.5 text-[var(--plc-warning)]">~{s().files.modified}</span>
          <Show when={s().files.renamed}>
            <span class="ml-1.5 text-[var(--plc-accent)]">→{s().files.renamed}</span>
          </Show>
        </Stat>
        <Stat label="Lines">
          <span class="text-[var(--plc-success)]">+{s().lines.additions.toLocaleString("en-US")}</span>
          <span class="ml-1.5 text-[var(--plc-error)]">−{s().lines.deletions.toLocaleString("en-US")}</span>
        </Stat>
        <Stat label="Imports">
          <span class="text-[var(--plc-success)]">+{s().edges.added}</span>
          <span class="ml-1.5 text-[var(--plc-error)]">−{s().edges.removed}</span>
          <Show when={s().edges.crossFolderAdded || s().edges.crossFolderRemoved}>
            <span class="ml-1.5 text-[var(--plc-on-subtle)]">
              ({s().edges.crossFolderAdded} new cross-folder)
            </span>
          </Show>
        </Stat>
        <Stat label="Net">
          <span class={VERDICT_TEXT.better}>{s().net.better} better</span>
          <span class={`ml-1.5 ${VERDICT_TEXT.worse}`}>{s().net.worse} worse</span>
        </Stat>
      </div>
      <Show when={moved().length}>
        <div class="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <For each={moved()}>
            {(m) => (
              <span
                class="whitespace-nowrap"
                title={`${m.total.filesBetter} files better, ${m.total.filesWorse} worse`}
              >
                <span class="text-[var(--plc-on-muted)]">{compareMetricLabel(m.def.name)}</span>{" "}
                <Show
                  when={m.def.aggregation !== "sum"}
                  fallback={
                    // Sums grow with every added file, so they're judged
                    // like for like: files on both sides that moved.
                    <span class={`text-xs font-medium ${VERDICT_TEXT[m.total.verdict]}`}>
                      {m.total.filesBetter} files better · {m.total.filesWorse} worse
                    </span>
                  }
                >
                  <span class="plc-data-sm text-[var(--plc-on-subtle)]">
                    {formatValue(m.def.name, m.total.before)} → {formatValue(m.def.name, m.total.after)}
                  </span>{" "}
                  <span class={`plc-data-sm font-semibold ${VERDICT_TEXT[m.total.verdict]}`}>
                    {formatDelta(m.def.name, m.total.delta)}
                  </span>
                </Show>
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
