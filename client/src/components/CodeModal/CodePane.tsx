import { Show } from "solid-js";

export function CodePane(props: {
  loading: () => boolean;
  error: () => string | null;
  highlightedHtml: () => string;
}) {
  return (
    <>
      <Show when={props.loading() || (!props.highlightedHtml() && !props.error())}>
        <div class="flex h-full items-center justify-center text-sm text-gray-400">
          Loading file…
        </div>
      </Show>

      <Show when={!props.loading() && props.error()}>
        <div class="rounded border border-red-700 bg-red-900/70 px-3 py-2 text-sm text-red-100">
          {props.error()}
        </div>
      </Show>

      <Show when={!props.loading() && !props.error() && props.highlightedHtml()}>
        <div class="code-modal-content" innerHTML={props.highlightedHtml() || ""} />
      </Show>
    </>
  );
}


