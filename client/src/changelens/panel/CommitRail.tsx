import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { cx } from "../../components/ui/classes";
import type { LensCommit } from "../types";
import { LineCounts } from "./bits";
import { formatDay, formatTime, isWorktree, railPositions } from "./model";

/** Width kept for the working-tree mark at the right end. */
const NOW_SLOT = 52;
const MARK = 8;
/** Room a day label needs before the next one may show. */
const LABEL_GAP = 52;

/**
 * The window's commits on a compressed time axis, oldest at the left, sized by
 * lines changed. Uncommitted work sits apart at the right as "Now". Click picks a
 * commit, a second click or "All" clears it; ← → step.
 */
export function CommitRail(props: {
  commits: LensCommit[];
  selected: string | null;
  onSelect: (sha: string | null) => void;
  highlightChunk?: string | null;
  /** IANA zone for dates; defaults to the browser's. */
  timeZone?: string;
}) {
  const [hover, setHover] = createSignal<string | null>(null);
  const [width, setWidth] = createSignal(0);
  const tz = () => props.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dated = createMemo(() => props.commits.filter((c) => !isWorktree(c.sha)));
  const now = createMemo(() => props.commits.find((c) => isWorktree(c.sha)) ?? null);
  const xs = createMemo(() => railPositions(dated().map((c) => c.date!)));
  const maxLines = createMemo(() => Math.max(1, ...props.commits.map((c) => c.added + c.deleted)));
  const height = (c: LensCommit) => Math.round(4 + Math.sqrt((c.added + c.deleted) / maxLines()) * 22);
  const left = (x: number) => `calc(${x} * (100% - ${MARK}px))`;
  const touches = (c: LensCommit) => Boolean(props.highlightChunk && c.chunkIds.includes(props.highlightChunk));

  /** Day labels where the day changes, skipped when they would crowd the one before. */
  const days = createMemo(() => {
    const out: { x: number; label: string }[] = [];
    const span = Math.max(1, width() - (now() ? NOW_SLOT : 0) - MARK);
    let last = -Infinity;
    let prev = "";
    dated().forEach((c, i) => {
      const day = formatDay(c.date!, tz());
      if (day === prev) return;
      prev = day;
      const px = xs()[i] * span;
      if (px - last < LABEL_GAP) return;
      last = px;
      out.push({ x: xs()[i], label: day });
    });
    return out;
  });

  const shown = () => {
    const sha = hover() ?? props.selected;
    return props.commits.find((c) => c.sha === sha) ?? null;
  };

  let rail: HTMLDivElement | undefined;
  onMount(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (rail) ro.observe(rail);
    onCleanup(() => ro.disconnect());
  });

  const step = (delta: number) => {
    const list = props.commits;
    if (!list.length) return;
    const at = list.findIndex((c) => c.sha === props.selected);
    const next = at < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + delta));
    const sha = list[next].sha;
    props.onSelect(sha);
    rail?.querySelector<HTMLElement>(`[data-commit="${sha}"]`)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    }
  };
  const tone = (c: LensCommit) =>
    props.selected === c.sha
      ? "var(--plc-accent)"
      : touches(c)
        ? "var(--plc-chart-6)"
        : props.highlightChunk
          ? "var(--plc-border-strong)"
          : "var(--plc-tertiary)";
  const pick = (sha: string) => props.onSelect(props.selected === sha ? null : sha);

  const Mark = (p: { c: LensCommit; x?: number }) => {
    const selected = () => props.selected === p.c.sha;
    return (
      <button
        type="button"
        data-commit={p.c.sha}
        data-touches-chunk={touches(p.c) ? "" : undefined}
        aria-pressed={selected()}
        aria-label={`${isWorktree(p.c.sha) ? "Working tree" : p.c.short}: ${p.c.subject}`}
        class={cx(
          "group absolute bottom-0 top-0 flex items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--plc-border-focus)]",
          selected() && "bg-[var(--plc-surface-selected)]"
        )}
        style={p.x === undefined ? { right: "0px", width: `${NOW_SLOT - 12}px` } : { left: left(p.x), width: `${MARK}px` }}
        onMouseEnter={() => setHover(p.c.sha)}
        onFocus={() => setHover(p.c.sha)}
        onBlur={() => setHover(null)}
        onClick={() => pick(p.c.sha)}
      >
        <span
          class={cx(
            "mb-px w-[6px] rounded-[1px] border transition-[background-color,border-color,filter] duration-150 group-hover:brightness-75",
            isWorktree(p.c.sha) && "border-dashed"
          )}
          style={{
            height: `${height(p.c)}px`,
            "border-color": tone(p.c),
            background: isWorktree(p.c.sha) && !selected() ? "transparent" : tone(p.c),
          }}
        />
      </button>
    );
  };

  return (
    <div data-commit-rail class="min-w-0 select-none">
      <div class="flex h-6 min-w-0 items-center gap-2 text-[12px]">
        <button
          type="button"
          data-action="all-commits"
          aria-pressed={props.selected === null}
          class={cx(
            "h-6 shrink-0 rounded px-2 text-[12px] transition-colors duration-150",
            props.selected === null
              ? "bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]"
              : "text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]"
          )}
          onClick={() => props.onSelect(null)}
        >
          All
        </button>
        <span class="plc-data-sm shrink-0 text-[var(--plc-on-subtle)]">
          {dated().length} {dated().length === 1 ? "commit" : "commits"}
        </span>
        <div class="flex min-w-0 flex-1 items-baseline gap-2" data-commit-info>
          <Show
            when={shown()}
            fallback={
              <span class="truncate text-[var(--plc-on-subtle)]">
                {props.commits.length ? "Every commit in the window. Click one to see only its edits." : "No commits in this window."}
              </span>
            }
          >
            {(c) => (
              <>
                <span class="plc-data-sm shrink-0 text-[var(--plc-on-muted)]">
                  {isWorktree(c().sha) ? "Working tree" : c().short}
                </span>
                <span class="min-w-0 truncate text-[var(--plc-on-surface)]" title={c().subject}>
                  {c().subject}
                </span>
                <span class="shrink-0 whitespace-nowrap text-[11px] text-[var(--plc-on-subtle)]">
                  {c().date ? formatTime(c().date, tz()) : "Now"} · {c().files} {c().files === 1 ? "file" : "files"}
                </span>
                <span class="shrink-0">
                  <LineCounts added={c().added} deleted={c().deleted} />
                </span>
              </>
            )}
          </Show>
        </div>
      </div>
      <div
        ref={rail}
        class="relative mt-1 h-[30px]"
        role="toolbar"
        aria-label="Commits in the window"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
      >
        <Show when={dated().length}>
          <span class="absolute bottom-0 left-0 h-px bg-[var(--plc-border)]" style={{ right: now() ? `${NOW_SLOT}px` : "0" }} />
        </Show>
        <div class="absolute inset-y-0 left-0" style={{ right: now() ? `${NOW_SLOT}px` : "0" }}>
          <For each={dated()}>{(c, i) => <Mark c={c} x={xs()[i()]} />}</For>
        </div>
        <Show when={now()}>
          {(c) => (
            <>
              <span class="absolute inset-y-1 border-l border-dashed border-[var(--plc-border-strong)]" style={{ right: `${NOW_SLOT - 4}px` }} />
              <Mark c={c()} />
            </>
          )}
        </Show>
      </div>
      <div class="relative h-4 text-[10px] leading-4 text-[var(--plc-on-subtle)]">
        <div class="absolute inset-y-0 left-0" style={{ right: now() ? `${NOW_SLOT}px` : "0" }}>
          <For each={days()}>
            {(d) => (
              <span
                class="plc-data-sm absolute whitespace-nowrap text-[10px]"
                style={{ left: left(d.x), transform: d.x > 0.8 ? `translateX(calc(-100% + ${MARK}px))` : undefined }}
              >
                {d.label}
              </span>
            )}
          </For>
        </div>
        <Show when={now()}>
          <span class="absolute right-0 text-center" style={{ width: `${NOW_SLOT - 12}px` }}>
            Now
          </span>
        </Show>
      </div>
    </div>
  );
}
