import { Show } from "solid-js";
import { Button } from "../ui/Button";
import { CheckboxRow } from "../ui/CheckboxRow";
import { TextInput } from "../ui/TextInput";

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

  dataFlowEnabled: () => boolean;
  setDataFlowEnabled: (next: boolean) => void;

  scopeFlowEnabled: () => boolean;
  setScopeFlowEnabled: (next: boolean) => void;
}) {
  return (
    <header class="flex items-center justify-between border-b border-gray-700 bg-[#252526] px-4 py-2 text-sm">
      <div class="flex min-w-0 flex-col">
        <span class="truncate font-semibold text-gray-100">
          {props.baseName}
        </span>
        <span class="truncate text-[11px] text-gray-400">{props.filePath}</span>
        <Show when={props.hasLineRange() && props.rangeLabel()}>
          {(label) => (
            <span class="truncate text-[10px] text-gray-500">{label()}</span>
          )}
        </Show>
      </div>

      <Button
        class="ml-4 bg-gray-700 font-semibold text-gray-200 hover:bg-gray-600"
        onClick={props.onClose}
      >
        Close
      </Button>

      <Button
        variant="primary"
        class="ml-2 bg-blue-700 font-semibold hover:bg-blue-600"
        onClick={() => {
          navigator.clipboard.writeText(props.rawCode());
        }}
      >
        Copy
      </Button>

      <Show when={props.isMarkdown()}>
        <div class="ml-4 flex items-center rounded bg-gray-700 p-0.5">
          <Button
            variant="tab"
            size="xs"
            active={props.viewMode() === "code"}
            class="rounded-sm px-3 font-semibold"
            onClick={() => props.setViewMode("code")}
          >
            Code
          </Button>
          <Button
            variant="tab"
            size="xs"
            active={props.viewMode() === "preview"}
            class="rounded-sm px-3 font-semibold"
            onClick={() => props.setViewMode("preview")}
          >
            Preview
          </Button>
        </div>
      </Show>

      <div class="flex items-center">
        <Show when={props.wasIndentationReduced()}>
          <span class="ml-4 text-[10px] text-yellow-500/80 italic animate-pulse">
            Indentation reduced
          </span>
        </Show>

        <CheckboxRow
          class="ml-3 text-[11px]"
          checked={props.reduceIndentation()}
          onChange={props.setReduceIndentation}
          title="Strip common indentation to save horizontal space"
          label="Reduce indent"
        />

        <CheckboxRow
          class="ml-3 text-[11px]"
          checked={props.dataFlowEnabled()}
          onChange={props.setDataFlowEnabled}
          title="Highlight data flow, usages, and show tooltips"
          label="Data flow"
        />

        <CheckboxRow
          class="ml-3 text-[11px]"
          checked={props.scopeFlowEnabled()}
          onChange={props.setScopeFlowEnabled}
          title="Show/hide the Scope Flow pane"
          label="Scope flow"
        />

        <Show when={props.hasLineRange()}>
          <label class="ml-3 flex items-center gap-1 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={props.lineFilterEnabled()}
              onChange={(e) =>
                props.setLineFilterEnabled(e.currentTarget.checked)
              }
            />
            <span>Limit to selection</span>
            <span class="ml-2 flex items-center gap-1">
              <span>±</span>
            <TextInput
              type="number"
              min="0"
              size="sm"
              class="w-12 border-gray-600 bg-gray-800 px-1 text-[11px]"
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
          class="ml-2 inline-flex items-center justify-center gap-1 rounded border border-green-700 bg-green-700 px-3 py-1 text-xs font-semibold text-white no-underline transition-colors hover:bg-green-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          target="_blank"
        >
          Open
        </a>
      </div>
    </header>
  );
}
