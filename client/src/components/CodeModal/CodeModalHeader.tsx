import { Show } from "solid-js";

export function CodeModalHeader(props: {
  filePath: string;
  baseName: string;
  onClose: () => void;
  rawCode: () => string;

  hasLineRange: () => boolean;
  rangeLabel: () => string | null;

  isMarkdown: () => boolean;
  viewMode: () => "code" | "preview";
  setViewMode: (mode: "code" | "preview") => void;

  wasIndentationReduced: () => boolean;
  reduceIndentation: () => boolean;
  setReduceIndentation: (next: boolean) => void;

  lineFilterEnabled: () => boolean;
  setLineFilterEnabled: (next: boolean) => void;
  lineOffset: () => number;
  setLineOffset: (next: number) => void;
}) {
  return (
    <header class="flex items-center justify-between border-b border-gray-700 bg-[#252526] px-4 py-2 text-sm">
      <div class="flex min-w-0 flex-col">
        <span class="truncate font-semibold text-gray-100">{props.baseName}</span>
        <span class="truncate text-[11px] text-gray-400">{props.filePath}</span>
        <Show when={props.hasLineRange() && props.rangeLabel()}>
          {(label) => (
            <span class="truncate text-[10px] text-gray-500">{label()}</span>
          )}
        </Show>
      </div>

      <button
        class="ml-4 rounded bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-600"
        type="button"
        onClick={props.onClose}
      >
        Close
      </button>

      <button
        class="ml-2 rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-600"
        onClick={() => {
          navigator.clipboard.writeText(props.rawCode());
        }}
      >
        Copy
      </button>

      <Show when={props.isMarkdown()}>
        <div class="ml-4 flex items-center rounded bg-gray-700 p-0.5">
          <button
            class={`px-3 py-0.5 text-xs font-semibold rounded-sm transition-colors ${
              props.viewMode() === "code"
                ? "bg-gray-600 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
            onClick={() => props.setViewMode("code")}
          >
            Code
          </button>
          <button
            class={`px-3 py-0.5 text-xs font-semibold rounded-sm transition-colors ${
              props.viewMode() === "preview"
                ? "bg-gray-600 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
            onClick={() => props.setViewMode("preview")}
          >
            Preview
          </button>
        </div>
      </Show>

      <div class="flex items-center">
        <Show when={props.wasIndentationReduced()}>
          <span class="ml-4 text-[10px] text-yellow-500/80 italic animate-pulse">
            Indentation reduced
          </span>
        </Show>

        <label class="ml-3 flex items-center gap-1 text-[11px] text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={props.reduceIndentation()}
            onChange={(e) => props.setReduceIndentation(e.currentTarget.checked)}
          />
          <span title="Strip common indentation to save horizontal space">
            Reduce indent
          </span>
        </label>

        <Show when={props.hasLineRange()}>
          <label class="ml-3 flex items-center gap-1 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={props.lineFilterEnabled()}
              onChange={(e) => props.setLineFilterEnabled(e.currentTarget.checked)}
            />
            <span>Limit to selection</span>
            <span class="ml-2 flex items-center gap-1">
              <span>±</span>
              <input
                type="number"
                min="0"
                class="w-12 bg-gray-800 border border-gray-600 rounded px-1 text-[11px] text-gray-200"
                value={props.lineOffset()}
                onInput={(e) => {
                  const next = Number(e.currentTarget.value);
                  props.setLineOffset(Number.isNaN(next) ? 0 : next);
                }}
              />
              <span>lines</span>
            </span>
          </label>
        </Show>

        <a
          href={`vscode://file/${props.filePath}`}
          class="ml-2 rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-600 no-underline"
          target="_blank"
        >
          Open
        </a>
      </div>
    </header>
  );
}


