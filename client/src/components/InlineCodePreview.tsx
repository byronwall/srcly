import { Show, createMemo, createSignal } from "solid-js";
import { useFileContent } from "../hooks/useFileContent";
import { useHighlightedCode } from "../hooks/useHighlightedCode";
import { FlowOverlayCode } from "./FlowOverlayCode";

interface InlineCodePreviewProps {
  filePath: string | null;
  startLine?: number | null;
  endLine?: number | null;
}

/**
 * Inline code preview used in the Data Flow panel. It reuses the same Shiki
 * rendering pipeline and CSS hooks as `CodeModal`, but is embedded instead of
 * appearing in its own modal.
 */
export default function InlineCodePreview(props: InlineCodePreviewProps) {
  // Start with filtering enabled by default; the user can turn it off.
  const [lineFilterEnabled, setLineFilterEnabled] = createSignal(true);
  const [lineOffset, setLineOffset] = createSignal(2);
  const hasValidSelection = createMemo(() => {
    const s = typeof props.startLine === "number" ? props.startLine : null;
    const e = typeof props.endLine === "number" ? props.endLine : null;
    return s !== null && e !== null && s > 0 && e >= s;
  });

  const isOpen = () => !!props.filePath && hasValidSelection();

  const { rawCode, loading, error, totalLines } = useFileContent({
    isOpen,
    filePath: () => props.filePath,
  });

  const {
    highlightedHtml,
    displayStartLine,
    displayEndLine,
    removedIndentByLine,
  } = useHighlightedCode({
    rawCode,
    filePath: () => props.filePath,
    lineFilterEnabled,
    lineOffset,
    targetStart: () =>
      typeof props.startLine === "number" ? props.startLine : null,
    targetEnd: () => (typeof props.endLine === "number" ? props.endLine : null),
    reduceIndentation: () => false,
  });

  const effectiveDisplayRange = () => {
    if (!totalLines()) return null;
    return {
      start: displayStartLine() ?? 1,
      end: displayEndLine() ?? totalLines()!,
      total: totalLines()!,
    };
  };

  return (
    <div class="flex h-full flex-col bg-[var(--plc-surface)] text-xs text-[var(--plc-on-surface)]">
      <div class="border-b border-[var(--plc-border)] px-3 py-2 text-[11px]">
        <div class="truncate font-semibold text-[var(--plc-on-surface)]">
          {props.filePath || "No file selected"}
        </div>
        <Show when={hasValidSelection() && effectiveDisplayRange()}>
          {(range) => (
            <div class="mt-0.5 text-[10px] text-[var(--plc-on-subtle)]">
              {lineFilterEnabled()
                ? `Showing lines ${range().start}-${range().end} of ${
                    range().total
                  }`
                : `Showing full file (${range().total} lines), selection ${
                    props.startLine
                  }-${props.endLine}`}
            </div>
          )}
        </Show>
        <Show when={hasValidSelection()}>
          <div class="mt-1 flex items-center gap-2 text-[10px] text-[var(--plc-on-muted)]">
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={lineFilterEnabled()}
                onChange={(e) => setLineFilterEnabled(e.currentTarget.checked)}
              />
              <span>Limit to selection</span>
            </label>
            <div class="flex items-center gap-1">
              <span>±</span>
              <input
                type="number"
                min="0"
                class="w-12 rounded border border-[var(--plc-border-strong)] bg-[var(--plc-surface)] px-1 text-[10px] text-[var(--plc-on-surface)]"
                value={lineOffset()}
                onInput={(e) => {
                  const next = Number(e.currentTarget.value);
                  if (Number.isNaN(next)) {
                    setLineOffset(0);
                  } else {
                    setLineOffset(Math.max(0, Math.floor(next)));
                  }
                }}
              />
              <span>lines</span>
            </div>
          </div>
        </Show>
      </div>

      <div class="relative flex-1 overflow-auto p-3">
        <Show when={loading()}>
          <div class="flex h-full items-center justify-center text-[var(--plc-on-subtle)]">
            Loading code...
          </div>
        </Show>

        <Show when={!loading() && error()}>
          <div class="rounded border border-[var(--plc-error-border)] bg-[var(--plc-error-subtle)] px-3 py-2 text-[var(--plc-error)]">
            {error()}
          </div>
        </Show>

        <Show when={!loading() && !error() && highlightedHtml()}>
          <FlowOverlayCode
            html={() => highlightedHtml() || ""}
            filePath={() => props.filePath}
            sliceStartLine={() => displayStartLine() ?? 1}
            focusRange={() => {
              const s = props.startLine;
              const e = props.endLine;
              if (typeof s === "number" && typeof e === "number") {
                return { start: s, end: e };
              }
              return null;
            }}
            removedIndentByLine={removedIndentByLine}
            lineFilterEnabled={lineFilterEnabled}
          />
        </Show>

        <Show when={!loading() && !error() && !highlightedHtml()}>
          <div class="flex h-full items-center justify-center text-[var(--plc-on-subtle)]">
            Select a variable or usage node to preview its code.
          </div>
        </Show>
      </div>
    </div>
  );
}
