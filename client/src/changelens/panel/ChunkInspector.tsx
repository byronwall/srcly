import { createMemo, For, Show, type JSX } from "solid-js";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/classes";
import { breakablePath, MagnitudeBar } from "../../compare/bits";
import { formatDelta, VERDICT_TEXT } from "../../compare/metrics";
import type { Verdict } from "../../compare/types";
import { formatMetricValue, metricDef, metricLabel } from "../../utils/metricsStore";
import type { BeforeAfter, ChangeLensPayload, LensChunk } from "../types";
import { Empty, LineCounts, MatchBadge, StatusMark } from "./bits";
import { churn, formatTime, isWorktree, lineRange, net, STATUS_LABEL, touchMarks } from "./model";

const KIND_LABEL: Record<LensChunk["kind"], string> = {
  function: "function",
  class: "type",
  heading: "section",
  file: "file-level lines",
  range: "line range",
};

function Section(props: { title: string; detail?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="border-t border-[var(--plc-divider)] px-3 py-2">
      <h3 class="mb-1 flex items-baseline justify-between gap-2">
        <span class="plc-label-caps text-[var(--plc-on-subtle)]">{props.title}</span>
        <Show when={props.detail}>
          <span class="text-[11px] text-[var(--plc-on-subtle)]">{props.detail}</span>
        </Show>
      </h3>
      {props.children}
    </section>
  );
}

/** No change worth a row: equal sides, or a new or gone value of 0. */
const quiet = (v: BeforeAfter) => v.before === v.after || (v.before ?? 0) === (v.after ?? 0);

function verdict(id: string, v: BeforeAfter): Verdict {
  if (v.before === null || v.after === null || v.before === v.after) return "same";
  const dir = metricDef(id)?.direction;
  if (!dir || dir === "neutral") return "neutral";
  const rose = v.after > v.before;
  return rose === (dir === "higher-worse") ? "worse" : "better";
}

/** A side with no value says why, never 0. */
function Side(props: { id: string; value: number | null; missing: string }) {
  return (
    <Show when={props.value !== null} fallback={<span class="italic text-[var(--plc-on-disabled)]">{props.missing}</span>}>
      {formatMetricValue(props.id, props.value)}
    </Show>
  );
}

function MetricRow(props: { id: string; value: BeforeAfter; max: number; chunk: LensChunk }) {
  const v = () => props.value;
  const delta = () => (v().before !== null && v().after !== null ? v().after! - v().before! : null);
  const unit = () => metricDef(props.id)?.unit ?? "";
  return (
    <div data-metric={props.id} class="grid grid-cols-[minmax(0,1fr)_auto_44px_28px] items-center gap-x-2 py-[3px] text-[13px]">
      <span class="truncate text-[var(--plc-on-muted)]" title={`${metricLabel(props.id)} (${unit()})`}>
        {metricLabel(props.id)}
      </span>
      <span class="plc-data-sm whitespace-nowrap text-[var(--plc-on-subtle)]">
        <Side id={props.id} value={v().before} missing={props.chunk.status === "added" ? "new" : "n/a"} />
        <span class="text-[var(--plc-on-disabled)]"> → </span>
        <span class="text-[var(--plc-on-surface)]">
          <Side id={props.id} value={v().after} missing={props.chunk.status === "deleted" ? "gone" : "n/a"} />
        </span>
      </span>
      <span class={cx("plc-data-sm text-right font-semibold", VERDICT_TEXT[verdict(props.id, v())])}>
        {delta() ? formatDelta(props.id, delta()) : ""}
      </span>
      <MagnitudeBar delta={delta() ?? 0} max={props.max} verdict={verdict(props.id, v())} />
    </div>
  );
}

/** One mark per commit that touched the chunk, on the window's commit order. */
function TouchStrip(props: { payload: ChangeLensPayload; chunk: LensChunk; onOpen: (sha: string) => void }) {
  const commits = () => props.payload.commits;
  const marks = createMemo(() => touchMarks(commits(), props.chunk.touches));
  const n = () => commits().length;
  const left = (x: number) => `calc(${x} * (100% - 10px) + 5px)`;
  return (
    <div data-touch-strip class="relative h-7" role="group" aria-label="Commits that touched this chunk">
      <span class="absolute inset-x-0 bottom-[6px] h-px bg-[var(--plc-border)]" />
      <For each={commits()}>
        {(c, i) => (
          <span
            class={cx(
              "absolute bottom-[4px] h-[5px] w-px -translate-x-1/2",
              isWorktree(c.sha) ? "bg-[var(--plc-border-strong)]" : "bg-[var(--plc-border)]"
            )}
            style={{ left: left(n() > 1 ? i() / (n() - 1) : 0.5) }}
          />
        )}
      </For>
      <For each={marks()}>
        {(m) => {
          const c = commits()[m.index];
          const t = props.chunk.touches.find((x) => x.sha === m.sha)!;
          return (
            <button
              type="button"
              data-touch={m.sha}
              class="group absolute bottom-0 flex h-7 w-[10px] -translate-x-1/2 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]"
              style={{ left: left(m.x) }}
              title={`${isWorktree(c.sha) ? "Working tree" : c.short} · ${c.subject}\n+${t.added} −${t.deleted} in this chunk. Click to open this commit's diff.`}
              onClick={() => props.onOpen(m.sha)}
            >
              <span
                class="mb-[6px] w-[6px] rounded-[1px] bg-[var(--plc-accent)] opacity-80 transition-opacity duration-150 group-hover:opacity-100"
                style={{ height: `${Math.round(4 + m.size * 16)}px` }}
              />
            </button>
          );
        }}
      </For>
    </div>
  );
}

/** Everything about one edited chunk: what moved, when it was touched, and how to open it. */
export function ChunkInspector(props: {
  payload: ChangeLensPayload;
  chunk: LensChunk | null;
  onOpenHunk: (chunkId: string, commit?: string) => void;
  onOpenCode: (chunk: LensChunk) => void;
  sourceBusy?: boolean;
}) {
  // Bars scale against the largest |Δ| of each metric across the window.
  const maxAbs = createMemo(() => {
    const out = new Map<string, number>();
    for (const c of props.payload.chunks)
      for (const [id, v] of Object.entries(c.metrics))
        if (v.before !== null && v.after !== null) out.set(id, Math.max(out.get(id) ?? 1, Math.abs(v.after - v.before)));
    return out;
  });
  const metricRows = createMemo(() => {
    const c = props.chunk;
    if (!c) return [];
    const order = props.payload.metricIds;
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
    return Object.entries(c.metrics).sort((a, b) => rank(a[0]) - rank(b[0]));
  });
  const tz = () => props.payload.selection.timezone;

  return (
    <Show when={props.chunk} fallback={<Empty>Select an edited chunk to see what changed in it and when.</Empty>}>
      {(c) => (
        <div data-chunk-inspector={c().id} class="min-w-0 pb-3">
          <div class="px-3 pb-2.5 pt-2.5">
            <div class="flex min-w-0 items-center gap-1.5">
              <StatusMark status={c().status} />
              <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--plc-on-subtle)]">
                {STATUS_LABEL[c().status]}
              </span>
              <span class="truncate text-[11px] text-[var(--plc-on-subtle)]">· {KIND_LABEL[c().kind]}</span>
              <span class="ml-auto">
                <MatchBadge match={c().match} />
              </span>
            </div>
            <h2 class="mt-1 break-words text-[15px] font-semibold leading-snug text-[var(--plc-on-surface)] [overflow-wrap:anywhere]">
              {c().name}
            </h2>
            <p class="plc-data-sm mt-0.5 text-[var(--plc-on-subtle)] [overflow-wrap:anywhere]" data-chunk-where>
              {breakablePath(c().path)}:{lineRange(c().startLine, c().endLine)}
              <Show when={c().status !== "deleted" && c().baseStartLine !== undefined && c().baseStartLine !== c().startLine}>
                <span class="text-[var(--plc-on-disabled)]"> (base {lineRange(c().baseStartLine!, c().baseEndLine!)})</span>
              </Show>
            </p>
            <Show when={c().oldPath}>
              <p class="plc-data-sm mt-0.5 text-[var(--plc-on-subtle)] [overflow-wrap:anywhere]">
                {c().match === "renamed-file" ? "file renamed from " : "moved from "}
                {breakablePath(c().oldPath!)}
              </p>
            </Show>
            <Show when={c().match === "uncertain"}>
              <p class="mt-1 text-[12px] leading-snug text-[var(--plc-warning)]">
                Paired with the base by a best guess. Check the diff before you trust the before values.
              </p>
            </Show>
            <Show when={c().status === "reverted"}>
              <p class="mt-1 text-[12px] leading-snug text-[var(--plc-on-muted)]" data-note="reverted">
                Changed in this window and put back. Base and head are the same.
              </p>
            </Show>
            <Show when={c().status === "deleted"}>
              <p class="mt-1 text-[12px] leading-snug text-[var(--plc-on-muted)]" data-note="deleted">
                Deleted. Its lines and values are from the base.
              </p>
            </Show>
            <div class="mt-2 flex gap-1.5">
              <Button size="sm" data-action="open-diff" onClick={() => props.onOpenHunk(c().id)}>
                Open diff
              </Button>
              <Button size="sm" data-action="open-code" disabled={props.sourceBusy} onClick={() => props.onOpenCode(c())}>
                Open code
              </Button>
            </div>
          </div>

          <Section title="Metrics" detail="base → head">
            <Show
              when={c().measured}
              fallback={
                <p class="text-[12px] leading-snug text-[var(--plc-on-subtle)]" data-not-measured>
                  Not measured. {c().naReason}
                </p>
              }
            >
              <Show
                when={metricRows().length}
                fallback={<p class="text-[12px] text-[var(--plc-on-subtle)]">No metrics for this kind of chunk.</p>}
              >
                <For each={metricRows().filter(([id, v]) => id === "complexity" || !quiet(v))}>
                  {([id, v]) => <MetricRow id={id} value={v} max={maxAbs().get(id) ?? 1} chunk={c()} />}
                </For>
                <Show when={metricRows().filter(([id, v]) => id !== "complexity" && quiet(v))}>
                  {(rest) => (
                    <Show when={rest().length}>
                      <p class="mt-1 text-[12px] leading-snug text-[var(--plc-on-subtle)]" data-quiet-metrics>
                        Same on both sides:{" "}
                        {rest()
                          .map(([id, v]) => `${metricLabel(id)} ${formatMetricValue(id, (v.after ?? v.before)!)}`)
                          .join(" · ")}
                      </p>
                    </Show>
                  )}
                </Show>
              </Show>
              <Show when={c().naReason}>
                <p class="mt-1 text-[11px] text-[var(--plc-on-subtle)]">{c().naReason}</p>
              </Show>
            </Show>
          </Section>

          <Section
            title="Touches"
            detail={
              c().touches.length
                ? `${c().touches.length} of ${props.payload.commits.length} commits`
                : undefined
            }
          >
            <Show
              when={c().touches.length}
              fallback={<p class="text-[12px] text-[var(--plc-on-subtle)]">Net mode compares base and head only.</p>}
            >
              <TouchStrip payload={props.payload} chunk={c()} onOpen={(sha) => props.onOpenHunk(c().id, sha)} />
            </Show>
            <div class="mt-1.5 flex items-baseline justify-between gap-2 text-[12px]" data-churn>
              <span class="text-[var(--plc-on-muted)]">
                <span class="plc-data-md text-[var(--plc-on-surface)]">{churn(c()).toLocaleString("en-US")}</span> lines
                churned / <span class="plc-data-md text-[var(--plc-on-surface)]">{net(c()).toLocaleString("en-US")}</span>{" "}
                net
              </span>
              <LineCounts added={c().netAdded} deleted={c().netDeleted} />
            </div>
            <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-[12px] leading-5">
              <dt class="text-[var(--plc-on-subtle)]">First touched</dt>
              <dd class="plc-data-sm self-center text-right text-[var(--plc-on-muted)]">
                {c().firstTouched ? formatTime(c().firstTouched, tz()) : "Working tree only"}
              </dd>
              <dt class="text-[var(--plc-on-subtle)]">Last touched</dt>
              <dd class="plc-data-sm self-center text-right text-[var(--plc-on-muted)]">
                {c().touches.some((t) => isWorktree(t.sha)) ? "Working tree" : formatTime(c().lastTouched, tz())}
              </dd>
            </dl>
          </Section>
        </div>
      )}
    </Show>
  );
}
