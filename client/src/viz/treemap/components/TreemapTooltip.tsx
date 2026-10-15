import { createEffect, For, Show, type Accessor } from "solid-js";
import { placeFloating, type TreemapTooltipModel } from "../hooks/useTreemapTooltip";

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
          class="plc-floating pointer-events-none fixed z-50 w-64 rounded-md border px-2.5 py-2 text-[12px]"
          style={{ left: "0px", top: "0px", visibility: "hidden" }}
          role="tooltip"
        >
          <div class="plc-data-sm break-all font-semibold text-[var(--plc-on-surface)]">{m().title}</div>
          <div class="text-[11px] text-[var(--plc-on-subtle)]">{m().subtitle}</div>
          <div class="mt-1.5 grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5">
            <For each={m().lines}>
              {(line) => (
                <>
                  <span class="text-[var(--plc-on-muted)]">{line.label}</span>
                  <span class="plc-data-sm text-right text-[var(--plc-on-surface)]">{line.value}</span>
                </>
              )}
            </For>
          </div>
          <Show when={m().children.length > 0}>
            <div class="mt-2 border-t border-[var(--plc-border)] pt-1.5">
              <div class="plc-label-sm mb-0.5 text-[var(--plc-on-subtle)]">{m().childrenLabel}</div>
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
                <For each={m().children}>
                  {(child) => (
                    <>
                      <span class="plc-data-sm truncate text-[var(--plc-on-surface)]">{child.name}</span>
                      <span class="plc-data-sm text-right text-[var(--plc-on-subtle)]">
                        {child.loc.toLocaleString("en-US")}
                      </span>
                    </>
                  )}
                </For>
              </div>
              <Show when={m().moreChildren > 0}>
                <div class="mt-0.5 text-[11px] text-[var(--plc-on-subtle)]">+{m().moreChildren} more</div>
              </Show>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
