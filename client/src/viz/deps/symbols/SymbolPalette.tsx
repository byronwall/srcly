import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { DialogShell } from "../../../components/dialog/DialogShell";
import { searchSymbols } from "../../../symbols/api";
import { baseName, qualifiedOf, type SymbolSearchHit } from "../../../symbols/contract";
import { KindGlyph } from "../DependencyCanvas";

export type SymbolPickMode = "focus" | "code";

const MAX_ROWS = 40;
const DEBOUNCE_MS = 120;

/** `/` in Symbols mode: find any symbol of the index by name, qualified name or file. */
export function SymbolPalette(props: { open: boolean; rootPath: string; tests: boolean; onClose: () => void; onPick: (hit: SymbolSearchHit, mode: SymbolPickMode) => void }) {
  const [query, setQuery] = createSignal("");
  const [hits, setHits] = createSignal<SymbolSearchHit[]>([]);
  const [total, setTotal] = createSignal<number | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [active, setActive] = createSignal(0);
  let input: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token = 0;

  createEffect(() => {
    if (!props.open) return;
    setQuery("");
    setHits([]);
    setTotal(null);
    setError(null);
    setActive(0);
    queueMicrotask(() => input?.focus());
  });
  createEffect(
    on([query, () => props.open, () => props.tests], ([q, open, tests]) => {
      clearTimeout(timer);
      if (!open) return;
      const mine = ++token;
      if (!q.trim()) {
        setHits([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      timer = setTimeout(() => {
        searchSymbols({ path: props.rootPath, q, limit: MAX_ROWS, tests }).then(
          (res) => {
            if (mine !== token) return;
            setHits(res.hits);
            setTotal(res.index.symbols);
            setError(null);
            setLoading(false);
            setActive(0);
          },
          (e) => {
            if (mine !== token) return;
            setError(String((e as Error)?.message ?? e));
            setLoading(false);
          },
        );
      }, DEBOUNCE_MS);
    }),
  );
  onCleanup(() => clearTimeout(timer));
  createEffect(() => {
    list?.querySelector(`[data-row="${active()}"]`)?.scrollIntoView({ block: "nearest" });
  });

  const pick = (hit: SymbolSearchHit | undefined, mode: SymbolPickMode) => {
    if (!hit) return;
    props.onClose();
    props.onPick(hit, mode);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const n = hits().length;
    if (e.key === "ArrowDown") setActive((i) => (n ? (i + 1) % n : 0));
    else if (e.key === "ArrowUp") setActive((i) => (n ? (i - 1 + n) % n : 0));
    else if (e.key === "Enter") pick(hits()[active()], e.metaKey || e.ctrlKey ? "code" : "focus");
    else if (e.key === "Escape") props.onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const where = (hit: SymbolSearchHit) => {
    const qualified = qualifiedOf(hit.id);
    const container = qualified.includes(".") ? qualified.slice(0, qualified.lastIndexOf(".")) : "";
    return [container, hit.file].filter(Boolean).join(" · ");
  };

  return (
    <DialogShell open={props.open} onClose={props.onClose} size="md" class="!max-h-[70vh] self-start mt-[12vh]" aria-label="Find a symbol">
      <div class="border-b border-[var(--plc-border)] px-3 py-2">
        <input
          ref={input}
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Find a function, class, method, field, variable or type…"
          aria-label="Find a symbol"
          class="w-full bg-transparent text-[14px] text-[var(--plc-on-surface)] !shadow-none !outline-none !ring-0 placeholder:text-[var(--plc-on-disabled)]"
        />
      </div>
      <div ref={list} role="listbox" class="min-h-0 flex-1 overflow-auto py-1">
        <Show
          when={hits().length > 0}
          fallback={
            <div class="px-3 py-3 text-[12px] text-[var(--plc-on-subtle)]">
              {error() ? `Search failed: ${error()}` : loading() ? "Searching…" : query().trim() ? `Nothing matches “${query()}”.` : "Type a name. The index covers every function, class, method, field, variable and type."}
            </div>
          }
        >
          <For each={hits()}>
            {(hit, i) => (
              <div
                data-row={i()}
                data-symbol-hit={hit.id}
                role="option"
                aria-selected={i() === active()}
                class="flex cursor-pointer items-baseline gap-2 px-3 py-1 text-[12.5px]"
                classList={{ "bg-[var(--plc-surface-selected)]": i() === active() }}
                onMouseMove={() => setActive(i())}
                onClick={(e) => pick(hit, e.metaKey || e.ctrlKey ? "code" : "focus")}
              >
                <svg width="13" height="13" viewBox="0 -1 13 13" class="shrink-0 self-center" aria-hidden="true">
                  <KindGlyph node={{ kind: "symbol", symbolKind: hit.kind }} x={0} y={0} />
                </svg>
                <span class="shrink-0 font-medium text-[var(--plc-on-surface)]">{hit.kind === "module" ? baseName(hit.file) : hit.name}</span>
                <span class="min-w-0 truncate text-[11.5px] text-[var(--plc-on-subtle)]" style={{ direction: "rtl", "text-align": "left" }}>
                  <bdi>{where(hit)}</bdi>
                </span>
                <span class="ml-auto shrink-0 tabular-nums text-[11px] text-[var(--plc-on-subtle)]" title={`${hit.inCount} symbols reference it · it references ${hit.outCount}`}>
                  {hit.inCount} in · {hit.outCount} out
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>
      <div class="flex gap-4 whitespace-nowrap border-t border-[var(--plc-border)] px-3 py-1.5 text-[11px] text-[var(--plc-on-subtle)]">
        <span>
          <b class="font-medium text-[var(--plc-on-muted)]">Enter</b> show references
        </span>
        <span>
          <b class="font-medium text-[var(--plc-on-muted)]">⌘Enter</b> open code
        </span>
        <span class="ml-auto tabular-nums">
          {total() !== null && query().trim() ? `${hits().length}${hits().length === MAX_ROWS ? "+" : ""} of ${total()!.toLocaleString("en-US")} symbols` : ""}
        </span>
      </div>
    </DialogShell>
  );
}
