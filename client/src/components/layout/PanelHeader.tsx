import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cx } from "../ui/classes";

export function PanelHeader(props: {
  title?: JSX.Element;
  subtitle?: JSX.Element;
  actions?: JSX.Element;
  class?: string;
}) {
  return (
    <div
      class={cx(
        "flex items-center justify-between gap-4 border-b border-[#333] bg-[#252526] px-4 py-2",
        props.class
      )}
    >
      <div class="min-w-0">
        <Show when={props.title}>
          <div class="truncate text-sm font-bold text-gray-300">
            {props.title}
          </div>
        </Show>
        <Show when={props.subtitle}>
          <div class="truncate text-[11px] text-gray-500">
            {props.subtitle}
          </div>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex shrink-0 items-center gap-3">{props.actions}</div>
      </Show>
    </div>
  );
}
