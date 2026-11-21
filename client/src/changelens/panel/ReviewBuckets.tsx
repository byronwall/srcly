import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { cx } from "../../components/ui/classes";
import type { ChangeLensPayload, ChunkStatus, LensChunk } from "../types";
import { Empty, LineCounts, StatusMark } from "./bits";
import { bucketList, countBy, editsByChurn, HOTSPOT_COMPLEXITY, lineRange, STATUS_LABEL, STATUS_ORDER } from "./model";

function Section(props: { title: string; count: number; rule?: string; children: JSX.Element; tools?: JSX.Element }) {
  return (
    <section class="border-b border-[var(--plc-divider)] pb-1.5 last:border-b-0">
      <h3 class="flex items-baseline justify-between gap-2 px-3 pb-1 pt-2.5">
        <span class="plc-label-caps truncate text-[var(--plc-on-subtle)]">{props.title}</span>
        <span class="plc-data-sm text-[var(--plc-on-subtle)]">{props.count}</span>
      </h3>
      <Show when={props.rule}>
        <p class="px-3 pb-1 text-[11px] leading-snug text-[var(--plc-on-subtle)]">{props.rule}</p>
      </Show>
      {props.tools}
      {props.children}
    </section>
  );
}

/** `12 → 17` for complexity, colored by direction; says so when a chunk is not measured. */
function Complexity(props: { chunk: LensChunk }) {
  const value = () => props.chunk.metrics.complexity;
  const tone = () => {
    const v = value();
    if (!v || v.before === null || v.after === null || v.before === v.after) return "text-[var(--plc-on-muted)]";
    return v.after > v.before ? "text-[var(--plc-error)]" : "text-[var(--plc-success)]";
  };
  return (
    <Show
      when={props.chunk.measured}
      fallback={<span class="text-[11px] italic text-[var(--plc-on-disabled)]">not measured</span>}
    >
      <Show when={value()} fallback={<span class="plc-data-sm text-[var(--plc-on-disabled)]">—</span>}>
        {(v) => (
          <span class="plc-data-sm whitespace-nowrap" title="Cyclomatic complexity, base → head">
            <span class="text-[var(--plc-on-subtle)]">{v().before ?? "—"}</span>
            <span class="text-[var(--plc-on-disabled)]"> → </span>
            <span class={cx("font-semibold", tone())}>{v().after ?? "—"}</span>
          </span>
        )}
      </Show>
    </Show>
  );
}

function Row(props: { chunk: LensChunk; selected: boolean; onSelect: (id: string) => void }) {
  const c = () => props.chunk;
  const where = () => `${c().path}:${lineRange(c().startLine, c().endLine)}`;
  return (
    <button
      type="button"
      data-chunk-row
      data-chunk-id={c().id}
      aria-current={props.selected ? "true" : undefined}
      title={`${c().name}\n${where()}`}
      class={cx(
        "grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-[5px] text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--plc-border-focus)]",
        props.selected ? "bg-[var(--plc-surface-selected)]" : "hover:bg-[var(--plc-surface-hover)]"
      )}
      onClick={() => props.onSelect(c().id)}
    >
      <StatusMark status={c().status} />
      <span class="truncate text-[13px] font-medium leading-[18px] text-[var(--plc-on-surface)]">{c().name}</span>
      <span class="justify-self-end">
        <Complexity chunk={c()} />
      </span>
      <span />
      <span class="plc-data-sm truncate leading-4 text-[var(--plc-on-subtle)]">{where()}</span>
      <span class="justify-self-end">
        <LineCounts added={c().added} deleted={c().deleted} />
      </span>
    </button>
  );
}

const selectClass =
  "h-6 min-w-0 flex-1 cursor-pointer rounded border border-[var(--plc-border)] bg-[var(--plc-surface)] px-1.5 text-[12px] text-[var(--plc-on-muted)] outline-none transition-colors duration-150 hover:border-[var(--plc-border-strong)] focus-visible:border-[var(--plc-border-focus)] focus-visible:ring-2 focus-visible:ring-[var(--plc-accent-border)]";

/**
 * The review order: two rule-based buckets, then every edit by churn.
 * ↑ ↓ move between rows, Enter selects.
 */
export function ReviewBuckets(props: { payload: ChangeLensPayload; selected: string | null; onSelect: (chunkId: string) => void }) {
  const [status, setStatus] = createSignal<ChunkStatus | "">("");
  const [fileClass, setFileClass] = createSignal("");
  const chunks = () => props.payload.chunks;
  const complex = createMemo(() => bucketList(chunks(), "complex-and-changed"));
  const hotspots = createMemo(() => bucketList(chunks(), "new-hotspot"));
  const edits = createMemo(() => editsByChurn(chunks(), status(), fileClass()));
  const statusCounts = createMemo(() => {
    const counts = new Map(countBy(chunks(), (c) => c.status));
    return STATUS_ORDER.filter((s) => counts.has(s)).map((s) => [s, counts.get(s)!] as const);
  });
  const classCounts = createMemo(() => countBy(chunks(), (c) => c.fileClass).sort((a, b) => b[1] - a[1]));

  let root: HTMLDivElement | undefined;
  const onKeyDown = (e: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || !root) return;
    if ((e.target as HTMLElement).closest("select")) return;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-chunk-row]")];
    if (!rows.length) return;
    e.preventDefault();
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : at < 0 ? 0 : at + (e.key === "ArrowDown" ? 1 : -1);
    rows[Math.max(0, Math.min(rows.length - 1, next))].focus();
  };

  const list = (items: LensChunk[], empty: string) => (
    <Show when={items.length} fallback={<Empty>{empty}</Empty>}>
      <For each={items}>{(c) => <Row chunk={c} selected={props.selected === c.id} onSelect={props.onSelect} />}</For>
    </Show>
  );

  return (
    <div ref={root} data-review-buckets class="min-w-0 text-[13px]" onKeyDown={onKeyDown}>
      <Show
        when={chunks().length}
        fallback={<Empty>No code changed in this window. Pick a wider window or include the working tree.</Empty>}
      >
        <Section
          title="Already complex and changed"
          count={complex().length}
          rule={`Complexity ≥ ${HOTSPOT_COMPLEXITY} at base, and the body changed.`}
        >
          {list(complex(), "No complex chunk changed.")}
        </Section>
        <Section
          title="New hotspot"
          count={hotspots().length}
          rule={`Complexity crossed ${HOTSPOT_COMPLEXITY}: below it or absent at base, ${HOTSPOT_COMPLEXITY} or more at head.`}
        >
          {list(hotspots(), "No new hotspot.")}
        </Section>
        <p class="px-3 py-1.5 text-[11px] leading-snug text-[var(--plc-on-disabled)]">
          Tests, docs, generated and vendor files get no bucket.
        </p>
        <Section
          title="All edits"
          count={edits().length}
          rule="Most lines churned first."
          tools={
            <div class="flex gap-1.5 px-3 pb-1.5">
              <select
                aria-label="Filter by status"
                data-filter="status"
                class={selectClass}
                value={status()}
                onChange={(e) => setStatus(e.currentTarget.value as ChunkStatus | "")}
              >
                <option value="">Any status ({chunks().length})</option>
                <For each={statusCounts()}>
                  {([s, n]) => (
                    <option value={s}>
                      {STATUS_LABEL[s]} ({n})
                    </option>
                  )}
                </For>
              </select>
              <select
                aria-label="Filter by file class"
                data-filter="class"
                class={selectClass}
                value={fileClass()}
                onChange={(e) => setFileClass(e.currentTarget.value)}
              >
                <option value="">Any file ({chunks().length})</option>
                <For each={classCounts()}>
                  {([k, n]) => (
                    <option value={k}>
                      {k} ({n})
                    </option>
                  )}
                </For>
              </select>
            </div>
          }
        >
          {list(edits(), "No edits match these filters.")}
        </Section>
      </Show>
    </div>
  );
}
