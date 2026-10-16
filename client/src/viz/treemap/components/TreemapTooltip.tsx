import { createEffect, For, Show, type Accessor } from "solid-js";
import { placeFloating, type TreemapTooltipModel } from "../hooks/useTreemapTooltip";

const MAX_PATH_CHARS = 46;

/** Keep the tail of a long path; the nearest folders and scopes say the most. */
export function tailPath(path: string, max = MAX_PATH_CHARS): string {
  if (path.length <= max) return path;
  // Segments with the separator that precedes each ("/" between folders, " › " inside a file).
  const segments = path.split(/(?=\/| › )/);
  let out = segments.pop() ?? "";
  while (segments.length && out.length + segments[segments.length - 1].length <= max - 1) {
    out = segments.pop() + out;
  }
  return `…${out}`;
}

/** A grid value, with a byte unit ("39 KB") set muted like the header's "LOC". */
function Value(props: { text: string }) {
  const parts = () => /^([\d.,]+) (B|KB|MB)$/.exec(props.text);
  return (
    <span class="shrink-0 whitespace-nowrap text-right">
      <span class="plc-data-sm text-[var(--plc-on-surface)]">{parts()?.[1] ?? props.text}</span>
      <Show when={parts()}>
        {(p) => <span class="ml-0.5 text-[11px] text-[var(--plc-on-subtle)]">{p()[2]}</span>}
      </Show>
    </span>
  );
}

const formatShare = (share: number) => (share < 0.01 ? "<1" : String(Math.round(share * 100)));

export default function TreemapTooltip(props: { model: Accessor<TreemapTooltipModel> }) {
  let card: HTMLDivElement | undefined;
  const visibleModel = () => {
    const m = props.model();
    return m.visible ? m : null;
  };

  // Measure the rendered card, then flip it away from the right/bottom edges.
  createEffect(() => {
    const m = visibleModel();
    if (!m || !card) return;
    const { width, height } = card.getBoundingClientRect();
    const { left, top } = placeFloating(
      { x: m.x, y: m.y },
      { width, height },
      { width: window.innerWidth, height: window.innerHeight }
    );
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.visibility = "visible";
  });

  return (
    <Show when={visibleModel()}>
      {(m) => (
        <div
          ref={card}
          class="plc-floating pointer-events-none fixed z-50 w-max min-w-[300px] max-w-[min(420px,calc(100vw-8px))] rounded-md border px-2.5 py-2 text-[12px] leading-[1.35]"
          style={{ left: "0px", top: "0px", visibility: "hidden" }}
          role="tooltip"
        >
          <div class="flex items-baseline gap-3">
            <div class="plc-data-sm min-w-0 flex-1 break-all font-semibold text-[var(--plc-on-surface)]">{m().title}</div>
            <div class="shrink-0 whitespace-nowrap">
              <span class="plc-data-sm font-semibold text-[var(--plc-on-surface)]">{m().loc.toLocaleString("en-US")}</span>
              <span class="ml-1 text-[11px] text-[var(--plc-on-subtle)]">LOC</span>
            </div>
          </div>
          <div class="text-[11px] text-[var(--plc-on-subtle)]">
            {m().subtitle}
            <Show when={m().edited}> · edited {m().edited}</Show>
          </div>
          <Show when={m().path}>
            <div class="plc-data-sm truncate !font-normal text-[var(--plc-on-subtle)]">{tailPath(m().path)}</div>
          </Show>
          <Show when={m().mix}>
            <div class="plc-data-sm !font-normal text-[var(--plc-on-subtle)]">{m().mix}</div>
          </Show>

          <Show when={m().primary}>
            {(p) => (
              <div class="mt-1.5 flex items-center gap-1.5">
                <span
                  class="size-2.5 shrink-0 rounded-[2px] border border-black/15"
                  style={{ background: p().color }}
                />
                <span class="text-[var(--plc-on-muted)]">{p().label}</span>
                <Show when={p().value}>
                  <span class="plc-data-sm font-semibold text-[var(--plc-on-surface)]">{p().value}</span>
                </Show>
                <span class="ml-auto truncate pl-2 text-[11px] text-[var(--plc-on-subtle)]">{p().rank}</span>
              </div>
            )}
          </Show>
          <Show when={m().primary?.witness}>
            {(w) => (
              <div class="plc-data-sm truncate pl-4 !font-normal text-[var(--plc-on-subtle)]">
                in <span class="text-[var(--plc-on-muted)]">{w()}</span>
              </div>
            )}
          </Show>

          <Show when={m().lines.length > 0}>
            <div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-px">
              <For each={m().lines}>
                {(line) => (
                  <div
                    class="flex min-w-0 items-baseline justify-between gap-2"
                    classList={{ "col-span-2": line.label === "Not analyzed" }}
                  >
                    <span class="truncate text-[var(--plc-on-muted)]">{line.label}</span>
                    <Value text={line.value} />
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={m().children.length > 0}>
            <div class="mt-1.5 border-t border-[var(--plc-divider)] pt-1">
              <div
                class="grid items-baseline gap-x-2 gap-y-px"
                style={{
                  "grid-template-columns": m().childMetricLabel
                    ? "minmax(0,1fr) auto auto 30px"
                    : "minmax(0,1fr) auto 30px",
                }}
              >
                <span class="plc-label-sm text-[var(--plc-on-subtle)]">{m().childrenLabel}</span>
                <Show when={m().childMetricLabel}>
                  <span class="text-right text-[10px] text-[var(--plc-on-subtle)]">{m().childMetricLabel}</span>
                </Show>
                <span class="text-right text-[10px] text-[var(--plc-on-subtle)]">LOC</span>
                <span class="text-right text-[10px] text-[var(--plc-on-subtle)]">%</span>
                <For each={m().children}>
                  {(child) => (
                    <>
                      <span class="flex min-w-0 items-center gap-1.5">
                        <span
                          class="size-2 shrink-0 rounded-[2px] border border-black/15"
                          style={{ background: child.color }}
                        />
                        <span class="plc-data-sm truncate text-[var(--plc-on-surface)]">
                          {child.name}
                          <Show when={child.isFolder}>
                            <span class="text-[var(--plc-on-subtle)]">/</span>
                          </Show>
                        </span>
                      </span>
                      <Show when={m().childMetricLabel}>
                        <span class="plc-data-sm text-right text-[var(--plc-on-surface)]">{child.metric}</span>
                      </Show>
                      <span class="plc-data-sm text-right text-[var(--plc-on-muted)]">
                        {child.loc.toLocaleString("en-US")}
                      </span>
                      <span class="plc-data-sm text-right text-[var(--plc-on-subtle)]">
                        {formatShare(child.share)}
                      </span>
                    </>
                  )}
                </For>
              </div>
              <Show when={m().moreLabel}>
                <div class="text-[11px] text-[var(--plc-on-subtle)]">{m().moreLabel}</div>
              </Show>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
