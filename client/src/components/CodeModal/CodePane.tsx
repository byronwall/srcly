import { Show } from "solid-js";
import { FlowOverlayCode } from "../FlowOverlayCode";

export function CodePane(props: {
  loading: () => boolean;
  error: () => string | null;
  highlightedHtml: () => string;
  filePath: () => string | null;
  displayStartLine: () => number;
  targetStartLine: () => number | null;
  targetEndLine: () => number | null;
  removedIndentByLine: () => number[] | null;
  lineFilterEnabled: () => boolean;
}) {
  return (
    <>
      <Show
        when={props.loading() || (!props.highlightedHtml() && !props.error())}
      >
        <div class="flex h-full items-center justify-center text-sm text-gray-400">
          Loading file…
        </div>
      </Show>

      <Show when={!props.loading() && props.error()}>
        <div class="rounded border border-red-700 bg-red-900/70 px-3 py-2 text-sm text-red-100">
          {props.error()}
        </div>
      </Show>

      <Show
        when={!props.loading() && !props.error() && props.highlightedHtml()}
      >
        <FlowOverlayCode
          html={() => props.highlightedHtml() || ""}
          filePath={props.filePath}
          sliceStartLine={props.displayStartLine}
          focusRange={() => {
            const s = props.targetStartLine?.();
            const e = props.targetEndLine?.();
            if (typeof s === "number" && typeof e === "number") {
              return { start: s, end: e };
            }
            return null;
          }}
          removedIndentByLine={props.removedIndentByLine}
          lineFilterEnabled={props.lineFilterEnabled}
        />
      </Show>
    </>
  );
}
