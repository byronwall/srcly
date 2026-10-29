import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { DialogShell } from "../../../components/dialog/DialogShell";
import type { RoutesResult } from "../../../dataflow/contract.generated";

type Route = RoutesResult["routes"][number];

/** `/` in Data flow mode: pick the route whose render backbone to draw. */
export function RoutePicker(props: { open: boolean; routes: Route[]; current: string | undefined; onClose: () => void; onPick: (route: Route) => void; aside?: JSX.Element }) {
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  let input: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;

  const hits = createMemo(() => {
    const q = query().trim().toLowerCase();
    return q ? props.routes.filter((r) => r.pathPattern.toLowerCase().includes(q) || r.file.toLowerCase().includes(q)) : props.routes;
  });
  createEffect(() => {
    if (!props.open) return;
    setQuery("");
    setActive(Math.max(0, props.routes.findIndex((r) => r.key === props.current)));
    queueMicrotask(() => input?.focus());
  });
  createEffect(() => {
    list?.querySelector(`[data-row="${active()}"]`)?.scrollIntoView({ block: "nearest" });
  });
  const pick = (route: Route | undefined) => {
    if (!route) return;
    props.onClose();
    props.onPick(route);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const n = hits().length;
    if (e.key === "ArrowDown") setActive((i) => (n ? (i + 1) % n : 0));
    else if (e.key === "ArrowUp") setActive((i) => (n ? (i - 1 + n) % n : 0));
    else if (e.key === "Enter") pick(hits()[active()]);
    else if (e.key === "Escape") props.onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <DialogShell open={props.open} onClose={props.onClose} size="md" class="!max-h-[70vh] self-start mt-[12vh]" aria-label="Pick a route">
      <div class="border-b border-[var(--plc-border)] px-3 py-2">
        <input
          ref={input}
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Pick a route…"
          aria-label="Pick a route"
          class="w-full bg-transparent text-[14px] text-[var(--plc-on-surface)] !shadow-none !outline-none !ring-0 placeholder:text-[var(--plc-on-disabled)]"
        />
      </div>
      <div ref={list} role="listbox" class="min-h-0 flex-1 overflow-auto py-1">
        <Show when={hits().length > 0} fallback={<div class="px-3 py-3 text-[12px] text-[var(--plc-on-subtle)]">No route matches “{query()}”.</div>}>
          <For each={hits()}>
            {(route, i) => (
              <div
                data-row={i()}
                role="option"
                aria-selected={i() === active()}
                class="flex cursor-pointer items-baseline gap-3 px-3 py-1 text-[12.5px]"
                classList={{ "bg-[var(--plc-surface-selected)]": i() === active() }}
                onMouseMove={() => setActive(i())}
                onClick={() => pick(route)}
              >
                <span class="shrink-0 font-medium text-[var(--plc-on-surface)]">{route.pathPattern}</span>
                <span class="min-w-0 truncate text-[11.5px] text-[var(--plc-on-subtle)]">{route.file}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={props.aside}>
        <div class="border-t border-[var(--plc-border)] px-3 py-1.5">{props.aside}</div>
      </Show>
      <div class="flex gap-4 whitespace-nowrap border-t border-[var(--plc-border)] px-3 py-1.5 text-[11px] text-[var(--plc-on-subtle)]">
        <span>
          <b class="font-medium text-[var(--plc-on-muted)]">Enter</b> draw its data flow
        </span>
        <span class="ml-auto tabular-nums">{`${hits().length} of ${props.routes.length} routes`}</span>
      </div>
    </DialogShell>
  );
}
