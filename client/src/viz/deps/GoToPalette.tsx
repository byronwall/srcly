import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { DialogShell } from "../../components/dialog/DialogShell";
import type { GraphIndex } from "./hierarchy";
import { highlight, searchGraph, type GoToHit } from "./goto";
import { KindGlyph } from "./DependencyCanvas";

export type GoToMode = "focus" | "expand" | "code";

/** Rows shown at once; more matches ask for a longer query. */
const MAX_ROWS = 50;

/** The row's second line: the folder a file or folder sits in, or a symbol's file. */
const dirOf = (hit: GoToHit) => (hit.node.kind === "symbol" ? hit.where : hit.where.includes("/") ? hit.where.slice(0, hit.where.lastIndexOf("/")) : "");

function Marked(props: { text: string; query: string }) {
  return (
    <For each={highlight(props.text, props.query)}>
      {(run) => (run.hit ? <mark class="rounded-[2px] bg-[var(--plc-accent-subtle)] text-[var(--plc-accent)]">{run.text}</mark> : run.text)}
    </For>
  );
}

/** `/`: jump to any folder, file or symbol in the graph. */
export function GoToPalette(props: {
  open: boolean;
  index: GraphIndex | null;
  /** The current focus: an empty query lists its children. */
  near: string;
  onClose: () => void;
  onPick: (hit: GoToHit, mode: GoToMode) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  let input: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;

  const all = createMemo(() => (props.index ? searchGraph(props.index, query(), props.near, Infinity) : []));
  const hits = createMemo(() => all().slice(0, MAX_ROWS));
  createEffect(() => {
    if (!props.open) return;
    setQuery("");
    setActive(0);
    queueMicrotask(() => input?.focus());
  });
  createEffect(() => {
    void hits();
    setActive(0);
  });
  createEffect(() => {
    list?.querySelector(`[data-row="${active()}"]`)?.scrollIntoView({ block: "nearest" });
  });

  const pick = (hit: GoToHit | undefined, mode: GoToMode) => {
    if (!hit) return;
    props.onClose();
    props.onPick(hit, mode);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const n = hits().length;
    if (e.key === "ArrowDown") setActive((i) => (n ? (i + 1) % n : 0));
    else if (e.key === "ArrowUp") setActive((i) => (n ? (i - 1 + n) % n : 0));
    else if (e.key === "Enter") pick(hits()[active()], e.metaKey || e.ctrlKey ? "code" : e.shiftKey ? "expand" : "focus");
    else if (e.key === "Escape") props.onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <DialogShell open={props.open} onClose={props.onClose} size="md" class="!max-h-[70vh] self-start mt-[12vh]" aria-label="Go to">
      <div class="border-b border-[var(--plc-border)] px-3 py-2">
        <input
          ref={input}
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Go to a folder, file or symbol…"
          aria-label="Go to"
          class="w-full bg-transparent text-[14px] text-[var(--plc-on-surface)] !shadow-none !outline-none !ring-0 placeholder:text-[var(--plc-on-disabled)]"
        />
      </div>
      <div ref={list} role="listbox" class="min-h-0 flex-1 overflow-auto py-1">
        <Show when={hits().length > 0} fallback={<div class="px-3 py-3 text-[12px] text-[var(--plc-on-subtle)]">Nothing matches “{query()}”.</div>}>
          <For each={hits()}>
            {(hit, i) => (
              <div
                data-row={i()}
                role="option"
                aria-selected={i() === active()}
                class="flex cursor-pointer items-baseline gap-2 px-3 py-1 text-[12.5px]"
                classList={{ "bg-[var(--plc-surface-selected)]": i() === active() }}
                onMouseMove={() => setActive(i())}
                onClick={(e) => pick(hit, e.metaKey || e.ctrlKey ? "code" : e.shiftKey ? "expand" : "focus")}
              >
                <svg width="13" height="13" viewBox="0 -1 13 13" class="shrink-0 self-center" aria-hidden="true">
                  <KindGlyph node={{ kind: hit.node.kind, symbolKind: hit.node.symbolKind }} x={0} y={0} />
                </svg>
                <span class="shrink-0 font-medium text-[var(--plc-on-surface)]">
                  <Marked text={hit.node.name} query={query()} />
                  {hit.node.kind === "folder" ? "/" : ""}
                </span>
                <span class="min-w-0 truncate text-[11.5px] text-[var(--plc-on-subtle)]" style={{ direction: "rtl", "text-align": "left" }}>
                  <bdi>
                    <Marked text={dirOf(hit)} query={query()} />
                  </bdi>
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>
      <div class="flex gap-4 whitespace-nowrap border-t border-[var(--plc-border)] px-3 py-1.5 text-[11px] text-[var(--plc-on-subtle)]">
        <span>
          <b class="font-medium text-[var(--plc-on-muted)]">Enter</b> focus
        </span>
        <span>
          <b class="font-medium text-[var(--plc-on-muted)]">Shift+Enter</b> open in place
        </span>
        <span>
          <b class="font-medium text-[var(--plc-on-muted)]">⌘Enter</b> open code
        </span>
        <span class="ml-auto tabular-nums">
          {!query().trim()
            ? `${all().length} in ${props.near.split("/").pop() || "the root"}`
            : all().length > MAX_ROWS
              ? `${MAX_ROWS} of ${all().length.toLocaleString("en-US")} · type to narrow`
              : `${all().length} ${all().length === 1 ? "match" : "matches"}`}
        </span>
      </div>
    </DialogShell>
  );
}
