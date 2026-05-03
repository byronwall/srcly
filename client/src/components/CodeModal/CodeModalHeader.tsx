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
    <header class="flex min-h-12 items-center justify-between border-b border-[var(--plc-border)] bg-[var(--plc-surface)] px-4 py-2 text-sm">
      <div class="flex min-w-0 flex-col">
        <span class="truncate font-semibold text-[var(--plc-on-surface)]">
          {props.baseName}
        </span>
        <span class="truncate text-[11px] text-[var(--plc-on-subtle)]">{props.filePath}</span>
        <Show when={props.hasLineRange() && props.rangeLabel()}>
          {(label) => (
            <span class="truncate text-[10px] text-[var(--plc-on-disabled)]">{label()}</span>
          )}
        </Show>
      </div>

      <Button
        class="ml-4"
        onClick={props.onClose}
      >
        Close
      </Button>

      <Button
        variant="primary"
        class="ml-2"
        onClick={() => {
          navigator.clipboard.writeText(props.rawCode());
        }}
      >
        Copy
      </Button>

      <Show when={props.isMarkdown()}>
        <div class="ml-4 flex items-center rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5">
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
          <span class="ml-4 text-[10px] text-[var(--plc-warning)] italic animate-pulse">
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
          <label class="ml-3 flex items-center gap-1 text-[11px] text-[var(--plc-on-muted)]">
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
              class="w-12 px-1 text-[11px]"
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
          class="ml-2 inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[var(--plc-success-border)] bg-[var(--plc-success-subtle)] px-2 text-xs font-semibold text-[var(--plc-success)] no-underline transition-colors hover:border-[var(--plc-success)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]"
          target="_blank"
        >
          Open
        </a>
      </div>
    </header>
  );
}
