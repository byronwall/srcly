import { For, Match, Switch, type Accessor } from "solid-js";
import type { TooltipLine, TreemapTooltipModel } from "../hooks/useTreemapTooltip";

export default function TreemapTooltip(props: { model: Accessor<TreemapTooltipModel> }) {
  const visibleModel = () => {
    const m = props.model();
    return m.visible ? m : null;
  };

  return (
    <Switch>
      <Match when={visibleModel()}>
        {(m) => (
        <div
          class="fixed pointer-events-none border border-[var(--plc-border-strong)] bg-[var(--plc-surface)] p-2 text-[var(--plc-on-surface)] z-50 shadow-[var(--plc-menu-shadow)] transition-opacity duration-200 text-sm"
          style={{
            left: `${m().x}px`,
            top: `${m().y}px`,
            opacity: "1",
          }}
        >
          <div class="font-semibold">{m().title}</div>
          <div class="mt-1 space-y-0.5">
            <For each={m().lines}>
              {(line: TooltipLine) => (
                <div class="flex gap-2">
                  <span class="text-[var(--plc-on-muted)]">{line.label}:</span>
                  <span class="text-[var(--plc-on-surface)]">{line.value}</span>
                </div>
              )}
            </For>
          </div>
        </div>
        )}
      </Match>
    </Switch>
  );
}

