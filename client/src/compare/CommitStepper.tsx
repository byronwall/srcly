import { ChevronLeft, ChevronRight } from "lucide-solid";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { cx } from "../components/ui/classes";
import { IconButton } from "../components/ui/IconButton";
import type { CommitList } from "./api";
import { shortAgo } from "./pickerModel";

/**
 * A strip of the range's first-parent commits, oldest → newest. Step i shows
 * commit i against the commit before it; "Whole" goes back to the full range.
 * ◀ ▶ (or [ and ]) move one step. The line above the strip names the commit
 * under the pointer, else the one showing.
 */
export function CommitStepper(props: {
  list: CommitList;
  active: number;
  wholeLabel: string;
  onStep: (i: number) => void;
  onWhole: () => void;
}) {
  const [hover, setHover] = createSignal<number | null>(null);
  const commits = () => props.list.commits;
  const shown = () => {
    const i = hover() ?? props.active;
    return i >= 0 ? { i, c: commits()[i] } : null;
  };
  const go = (delta: number) => {
    const n = commits().length;
    if (!n) return;
    // From the whole range, ▶ starts at the first commit and ◀ at the last.
    const next = props.active < 0 ? (delta > 0 ? 0 : n - 1) : props.active + delta;
    if (next < 0 || next >= n) return;
    setHover(null);
    props.onStep(next);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "[") go(-1);
      else if (e.key === "]") go(1);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  let strip: HTMLDivElement | undefined;
  createEffect(() => {
    const i = props.active;
    strip?.querySelector<HTMLElement>(`[data-step="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  return (
    <div class="shrink-0 border-b border-[var(--plc-border)] bg-[var(--plc-surface)] px-4 py-1.5">
      <div class="flex h-6 min-w-0 items-center gap-2 text-[13px]">
        <button
          type="button"
          aria-pressed={props.active < 0}
          class={cx(
            "h-6 shrink-0 rounded px-2 text-[12px] transition-colors duration-150",
            props.active < 0
              ? "bg-[var(--plc-surface-selected)] font-semibold text-[var(--plc-accent)]"
              : "text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]"
          )}
          onClick={() => props.onWhole()}
        >
          {props.wholeLabel}
        </button>
        <IconButton label="Previous commit ([)" size="xs" disabled={props.active === 0} onClick={() => go(-1)}>
          <ChevronLeft size={14} aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Next commit (])"
          size="xs"
          disabled={props.active === commits().length - 1}
          onClick={() => go(1)}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </IconButton>
        <span class="plc-data-sm w-[10ch] shrink-0 text-[var(--plc-on-subtle)]">
          {props.active >= 0 ? `${props.active + 1} / ${commits().length}` : `${commits().length} commits`}
        </span>
        <div class="flex min-w-0 items-baseline gap-2">
          <Show
            when={shown()}
            fallback={
              <span class="truncate text-[var(--plc-on-muted)]">
                Every commit in the range together. Pick a commit to see only its changes.
              </span>
            }
          >
            {(s) => (
              <>
                <span class="plc-data-sm shrink-0 text-[var(--plc-on-muted)]">{s().c.short}</span>
                <span class="truncate text-[var(--plc-on-surface)]">{s().c.subject}</span>
                <span class="shrink-0 text-[12px] text-[var(--plc-on-subtle)]">
                  {s().c.author} · {shortAgo(s().c.date)}
                </span>
              </>
            )}
          </Show>
        </div>
        <Show when={props.list.truncated}>
          <span class="ml-auto shrink-0 text-[12px] text-[var(--plc-on-subtle)]">
            newest {commits().length} of {props.list.total}
          </span>
        </Show>
      </div>
      <div ref={strip} class="mt-1 flex gap-px overflow-x-auto pb-0.5" onMouseLeave={() => setHover(null)}>
        <For each={commits()}>
          {(c, i) => (
            <button
              type="button"
              data-step={i()}
              aria-current={props.active === i() ? "step" : undefined}
              class={cx(
                "flex h-7 w-[148px] shrink-0 items-center gap-1.5 border-b-2 px-1.5 text-left text-[12px] transition-colors duration-150",
                props.active === i()
                  ? "border-[var(--plc-accent)] bg-[var(--plc-surface-selected)] text-[var(--plc-on-surface)]"
                  : "border-[var(--plc-border)] text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]"
              )}
              onMouseEnter={() => setHover(i())}
              onClick={() => {
                setHover(null);
                props.onStep(i());
              }}
            >
              <span class="plc-data-sm shrink-0 text-[var(--plc-on-subtle)]">{i() + 1}</span>
              <span class="truncate">{c.subject}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
