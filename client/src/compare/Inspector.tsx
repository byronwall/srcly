import { createMemo, For, Show, type JSX } from "solid-js";
import { Button } from "../components/ui/Button";
import { cx } from "../components/ui/classes";
import { breakablePath, DiffStat, MagnitudeBar, StatusIcon } from "./bits";
import { compareMetricLabel, formatDelta, formatValue, STATUS_LABEL, VERDICT_TEXT } from "./metrics";
import type { CompareEdge, ComparePayload, MetricDelta } from "./types";

function Section(props: { title: string; count?: number; tone?: string; children: JSX.Element }) {
  return (
    <section class="border-t border-[var(--plc-divider)] px-4 py-2.5">
      <h3 class="plc-label-caps mb-1.5 flex items-center gap-1.5 text-[var(--plc-on-subtle)]">
        {props.title}
        <Show when={props.count !== undefined}>
          <span class={cx("plc-data-sm normal-case tracking-normal", props.tone)}>{props.count}</span>
        </Show>
      </h3>
      {props.children}
    </section>
  );
}

function DeltaRow(props: { name: string; delta: MetricDelta; max: number }) {
  const moved = () => props.delta.before !== null && props.delta.after !== null && props.delta.verdict !== "same";
  return (
    <div class="grid grid-cols-[1fr_auto_44px_28px] items-center gap-x-2 py-[3px] text-[13px]">
      <span class="truncate text-[var(--plc-on-muted)]">{compareMetricLabel(props.name)}</span>
      <span class="plc-data-sm whitespace-nowrap text-[var(--plc-on-subtle)]">
        {formatValue(props.name, props.delta.before)} → {formatValue(props.name, props.delta.after)}
      </span>
      <span class={cx("plc-data-sm text-right font-semibold", VERDICT_TEXT[props.delta.verdict])}>
        {moved() ? formatDelta(props.name, props.delta.delta) : ""}
      </span>
      <MagnitudeBar delta={moved() ? props.delta.delta : 0} max={props.max} verdict={props.delta.verdict} />
    </div>
  );
}

function EdgeList(props: { edges: CompareEdge[]; field: "source" | "target"; sign: "+" | "−" }) {
  return (
    <For each={props.edges}>
      {(edge) => (
        <div class="plc-data-sm flex gap-1.5 py-[2px] leading-snug text-[var(--plc-on-muted)]">
          <span class={props.sign === "+" ? "text-[var(--plc-success)]" : "text-[var(--plc-error)]"}>{props.sign}</span>
          <span class={cx(edge.external && "text-[var(--plc-on-subtle)]")}>
            {edge.external ? edge[props.field].replace(/^ext:/, "") + " (package)" : breakablePath(edge[props.field])}
          </span>
        </div>
      )}
    </For>
  );
}

/** Right rail: everything that changed about one file, plus how to open it. */
export function Inspector(props: {
  payload: ComparePayload;
  path: string | null;
  onOpen: (side: "base" | "head") => void;
}) {
  const file = createMemo(() => props.payload.files.find((f) => f.path === props.path) ?? null);

  const grouped = createMemo(() => {
    const f = file();
    const out = { worse: [] as [string, MetricDelta][], better: [] as [string, MetricDelta][], other: [] as [string, MetricDelta][] };
    if (!f) return out;
    for (const entry of Object.entries(f.deltas)) {
      const [, d] = entry;
      if (d.verdict === "worse") out.worse.push(entry);
      else if (d.verdict === "better") out.better.push(entry);
      else if (d.verdict === "neutral" && (d.delta !== 0 || d.before === null || d.after === null)) out.other.push(entry);
    }
    // Biggest relative moves first.
    const rel = ([, d]: [string, MetricDelta]) => Math.abs(d.delta) / Math.max(1, Math.abs(d.before ?? 0));
    out.worse.sort((a, b) => rel(b) - rel(a));
    out.better.sort((a, b) => rel(b) - rel(a));
    return out;
  });
  // Bars scale against the largest |Δ| of each metric across the whole compare.
  const maxAbs = createMemo(() => {
    const out = new Map<string, number>();
    for (const f of props.payload.files)
      for (const [name, d] of Object.entries(f.deltas)) out.set(name, Math.max(out.get(name) ?? 1, Math.abs(d.delta)));
    return out;
  });
  const edges = createMemo(() => {
    const path = props.path;
    const { added, removed } = props.payload.edges;
    return {
      importsAdded: added.filter((e) => e.source === path),
      importsRemoved: removed.filter((e) => e.source === path),
      usersAdded: added.filter((e) => e.target === path),
      usersRemoved: removed.filter((e) => e.target === path),
    };
  });
  const edgeCount = () =>
    edges().importsAdded.length + edges().importsRemoved.length + edges().usersAdded.length + edges().usersRemoved.length;

  return (
    <Show
      when={file()}
      fallback={
        <div class="px-4 py-6 text-sm text-[var(--plc-on-subtle)]">
          Select a file to see which metrics moved and which imports it gained or lost.
        </div>
      }
    >
      {(f) => (
        <div class="pb-4">
          <div class="px-4 pb-3 pt-3">
            <div class="flex items-center gap-2">
              <StatusIcon status={f().status} />
              <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--plc-on-subtle)]">
                {STATUS_LABEL[f().status]}
              </span>
              <span class="ml-auto">
                <DiffStat additions={f().additions} deletions={f().deletions} />
              </span>
            </div>
            <h2 class="mt-1.5 break-all text-[15px] font-semibold leading-snug text-[var(--plc-on-surface)]">
              {f().path.split("/").pop()}
            </h2>
            <p class="plc-data-sm mt-0.5 text-[var(--plc-on-subtle)]">{breakablePath(f().path)}</p>
            <Show when={f().oldPath}>
              <p class="plc-data-sm mt-0.5 text-[var(--plc-on-subtle)]">from {breakablePath(f().oldPath!)}</p>
            </Show>
            <div class="mt-2.5 flex gap-2">
              <Button size="sm" variant="default" disabled={f().status === "added"} onClick={() => props.onOpen("base")}>
                Open before
              </Button>
              <Button size="sm" variant="default" disabled={f().status === "removed"} onClick={() => props.onOpen("head")}>
                Open after
              </Button>
            </div>
          </div>

          <Show when={!f().analyzed}>
            <Section title="Metrics">
              <p class="text-xs text-[var(--plc-on-subtle)]">Not an analyzed source file.</p>
            </Section>
          </Show>
          <Show when={grouped().worse.length}>
            <Section title="Worse" count={grouped().worse.length} tone="text-[var(--plc-error)]">
              <For each={grouped().worse}>{([name, d]) => <DeltaRow name={name} delta={d} max={maxAbs().get(name) ?? 1} />}</For>
            </Section>
          </Show>
          <Show when={grouped().better.length}>
            <Section title="Better" count={grouped().better.length} tone="text-[var(--plc-success)]">
              <For each={grouped().better}>{([name, d]) => <DeltaRow name={name} delta={d} max={maxAbs().get(name) ?? 1} />}</For>
            </Section>
          </Show>
          <Show when={grouped().other.length}>
            <Section title={f().status === "added" ? "New file" : f().status === "removed" ? "Removed file" : "Size"}>
              <For each={grouped().other}>{([name, d]) => <DeltaRow name={name} delta={d} max={maxAbs().get(name) ?? 1} />}</For>
            </Section>
          </Show>

          <Show when={edgeCount()}>
            <Section title="Imports" count={edgeCount()}>
              <Show when={edges().importsAdded.length || edges().importsRemoved.length}>
                <p class="mb-0.5 text-xs text-[var(--plc-on-muted)]">This file imports</p>
                <EdgeList edges={edges().importsAdded} field="target" sign="+" />
                <EdgeList edges={edges().importsRemoved} field="target" sign="−" />
              </Show>
              <Show when={edges().usersAdded.length || edges().usersRemoved.length}>
                <p class="mb-0.5 mt-2 text-xs text-[var(--plc-on-muted)]">Imported by</p>
                <EdgeList edges={edges().usersAdded} field="source" sign="+" />
                <EdgeList edges={edges().usersRemoved} field="source" sign="−" />
              </Show>
            </Section>
          </Show>
        </div>
      )}
    </Show>
  );
}
