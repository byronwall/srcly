import { Check, ChevronDown, Copy, ExternalLink, IndentDecrease, X } from "lucide-solid";
import { For, Show, createSignal, type JSX } from "solid-js";
import Popover from "../Popover";
import { IconButton } from "../ui/IconButton";
import { OptionRow, PopoverPanel } from "../ui/PopoverPanel";
import { cx } from "../ui/classes";

const CONTEXT_OPTIONS = [0, 4, 10, 25];

/** Two or more mutually exclusive options in one bordered group. */
function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div class="flex h-7 items-center rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5">
      <For each={props.options}>
        {(opt) => (
          <button
            type="button"
            disabled={opt.disabled}
            title={opt.title}
            aria-pressed={props.value === opt.value}
            onClick={() => props.onChange(opt.value)}
            class={cx(
              "h-full rounded-[5px] px-2.5 text-[12px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
              props.value === opt.value
                ? "bg-[var(--plc-surface)] text-[var(--plc-on-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                : "text-[var(--plc-on-subtle)] hover:text-[var(--plc-on-surface)] enabled:active:bg-[var(--plc-surface-hover)]"
            )}
          >
            {opt.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Icon button that swaps to a check for a moment after it acts. */
function ConfirmIconButton(props: { label: string; icon: JSX.Element; onClick: () => void }) {
  const [done, setDone] = createSignal(false);
  let timer: number | undefined;
  return (
    <IconButton
      label={props.label}
      onClick={() => {
        props.onClick();
        setDone(true);
        clearTimeout(timer);
        timer = window.setTimeout(() => setDone(false), 1200);
      }}
    >
      <Show when={done()} fallback={props.icon}>
        <Check size={15} class="text-[var(--plc-success)] plc-pop-in" aria-hidden="true" />
      </Show>
    </IconButton>
  );
}

export function CodeModalHeader(props: {
  filePath: string;
  /** The scanned root; the path shows relative to it. */
  rootPath?: string;
  baseName: string;
  onClose: () => void;
  rawCode: () => string;

  hasLineRange: () => boolean;

  isMarkdown: () => boolean;
  viewMode: () => "code" | "preview";
  setViewMode: (mode: "code" | "preview") => void;

  reduceIndentation: () => boolean;
  setReduceIndentation: (next: boolean) => void;

  lineFilterEnabled: () => boolean;
  setLineFilterEnabled: (next: boolean) => void;
  lineOffset: () => number;
  setLineOffset: (next: number) => void;
}) {
  const [contextOpen, setContextOpen] = createSignal(false);
  const dir = () => {
    const root = props.rootPath?.replace(/\/+$/, "");
    const rel = root && props.filePath.startsWith(`${root}/`) ? props.filePath.slice(root.length + 1) : props.filePath;
    const i = rel.lastIndexOf(props.baseName);
    return i > 0 ? rel.slice(0, i) : "";
  };

  return (
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--plc-border)] bg-[var(--plc-surface)] pl-4 pr-2 text-sm">
      <div class="flex min-w-0 flex-1 items-baseline gap-2">
        <span class="shrink-0 font-semibold text-[var(--plc-on-surface)]">{props.baseName}</span>
        {/* Ellipsis on the left keeps the folders nearest the file readable. */}
        <span
          class="min-w-0 truncate text-[12px] text-[var(--plc-on-subtle)] [direction:rtl] text-left"
          title={props.filePath}
        >
          <span dir="ltr">{dir()}</span>
        </span>
      </div>

      <Show when={props.isMarkdown()}>
        <Segmented
          value={props.viewMode()}
          onChange={props.setViewMode}
          options={[
            { value: "code", label: "Code" },
            { value: "preview", label: "Preview" },
          ]}
        />
      </Show>

      {/* Hidden, not removed, in preview so the Code/Preview toggle never moves. */}
      <div class="flex items-center gap-1" classList={{ invisible: props.viewMode() !== "code" }}>
          <Segmented
            value={props.lineFilterEnabled() && props.hasLineRange() ? "selection" : "file"}
            onChange={(v) => props.setLineFilterEnabled(v === "selection")}
            options={[
              {
                value: "selection",
                label: "Selection",
                disabled: !props.hasLineRange(),
                title: props.hasLineRange() ? "Show only the selected scope" : "Pick a symbol to limit the view",
              },
              { value: "file", label: "Whole file" },
            ]}
          />
          <Popover
            placement="bottom-end"
            isOpen={contextOpen()}
            onOpenChange={setContextOpen}
            trigger={(t) => (
              <button
                type="button"
                ref={t.ref}
                onClick={t.onClick}
                disabled={!props.lineFilterEnabled() || !props.hasLineRange()}
                title="Context lines around the selection"
                class="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[12px] font-medium tabular-nums text-[var(--plc-on-muted)] transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)] disabled:pointer-events-none disabled:opacity-40"
              >
                ±{props.lineOffset()}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            )}
          >
            <PopoverPanel width="sm">
              <div class="px-2 pb-1 pt-0.5 text-[11px] text-[var(--plc-on-subtle)]">Context lines</div>
              <For each={CONTEXT_OPTIONS}>
                {(n) => (
                  <OptionRow
                    selected={props.lineOffset() === n}
                    onClick={() => {
                      props.setLineOffset(n);
                      setContextOpen(false);
                    }}
                  >
                    {n === 0 ? "None" : `±${n} lines`}
                  </OptionRow>
                )}
              </For>
            </PopoverPanel>
          </Popover>
          <IconButton
            label="Reduce indent"
            title="Reduce indent: strip the common leading whitespace"
            aria-pressed={props.reduceIndentation()}
            onClick={() => props.setReduceIndentation(!props.reduceIndentation())}
            class={
              props.reduceIndentation()
                ? "bg-[var(--plc-surface-muted)] text-[var(--plc-on-surface)] hover:bg-[var(--plc-border)]"
                : ""
            }
          >
            <IndentDecrease size={15} aria-hidden="true" />
          </IconButton>
      </div>

      <div class="flex items-center gap-0.5 border-l border-[var(--plc-border)] pl-2">
        <ConfirmIconButton
          label="Copy file contents"
          icon={<Copy size={15} aria-hidden="true" />}
          onClick={() => navigator.clipboard.writeText(props.rawCode())}
        />
        <a
          href={`vscode://file/${props.filePath}`}
          target="_blank"
          aria-label="Open in VS Code"
          title="Open in VS Code"
          class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--plc-on-muted)] transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]"
        >
          <ExternalLink size={15} aria-hidden="true" />
        </a>
        <IconButton label="Close (Esc)" onClick={props.onClose}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  );
}
