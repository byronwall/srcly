import { Show, type JSX } from "solid-js";
import { DiffStat } from "./bits";
import type { ComparePayload, CompareSideMeta } from "./types";

function Side(props: { label: string; side: CompareSideMeta }) {
  return (
    <div class="min-w-0">
      <div class="plc-label-caps text-[var(--plc-on-subtle)]">{props.label}</div>
      <div class="mt-1 flex min-w-0 items-baseline gap-2">
        <span class="plc-data-md shrink-0 font-semibold text-[var(--plc-on-surface)]">{props.side.label}</span>
        <Show when={props.side.subject}>
          <span class="min-w-0 text-[13px] leading-snug text-[var(--plc-on-muted)]">{props.side.subject}</span>
        </Show>
      </div>
    </div>
  );
}

function Kpi(props: { label: string; children: JSX.Element }) {
  return (
    <div class="whitespace-nowrap">
      <div class="plc-label-caps text-[var(--plc-on-subtle)]">{props.label}</div>
      <div class="mt-1 flex items-baseline gap-2 text-[15px] font-semibold tabular-nums">{props.children}</div>
    </div>
  );
}

/** Top band: what is compared, then the headline numbers. */
export function SummaryStrip(props: { payload: ComparePayload }) {
  const s = () => props.payload.summary;
  return (
    <div class="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-x-8 border-b border-[var(--plc-border)] bg-[var(--plc-surface)] px-4 py-2.5">
      <Side label="Before" side={props.payload.base} />
      <Side label="After" side={props.payload.head} />
      <div class="flex items-start gap-7">
        <Kpi label="Files">
          {s().files.total}
          <span class="plc-data-sm font-normal">
            <span class="text-[var(--plc-success)]">+{s().files.added}</span>{" "}
            <span class="text-[var(--plc-error)]">−{s().files.removed}</span>{" "}
            <span class="text-[var(--plc-warning)]">~{s().files.modified}</span>
            <Show when={s().files.renamed}>
              {" "}
              <span class="text-[var(--plc-accent)]">→{s().files.renamed}</span>
            </Show>
          </span>
        </Kpi>
        <Kpi label="Lines">
          <DiffStat additions={s().lines.additions} deletions={s().lines.deletions} />
        </Kpi>
        <Kpi label="Imports">
          <span class="text-[var(--plc-success)]">+{s().edges.added}</span>
          <span class="text-[var(--plc-error)]">−{s().edges.removed}</span>
        </Kpi>
        <Kpi label="Risk metrics">
          <span class="text-[var(--plc-error)]">{s().net.worse} worse</span>
          <span class="text-[var(--plc-success)]">{s().net.better} better</span>
        </Kpi>
      </div>
    </div>
  );
}
