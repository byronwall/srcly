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

  const { highlightedHtml, displayStartLine, displayEndLine } =
    useHighlightedCode({
      rawCode,
      filePath: () => props.filePath,
      lineFilterEnabled,
      lineOffset,
      targetStart: () =>
        typeof props.startLine === "number" ? props.startLine : null,
      targetEnd: () =>
        typeof props.endLine === "number" ? props.endLine : null,
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
    <div class="flex h-full flex-col bg-[#1e1e1e] text-xs text-gray-200">
      <div class="border-b border-gray-700 px-3 py-2 text-[11px]">
        <div class="truncate font-semibold text-gray-100">
          {props.filePath || "No file selected"}
        </div>
        <Show when={hasValidSelection() && effectiveDisplayRange()}>
          {(range) => (
            <div class="mt-0.5 text-[10px] text-gray-400">
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
          <div class="mt-1 flex items-center gap-2 text-[10px] text-gray-300">
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
                class="w-12 rounded border border-gray-600 bg-gray-800 px-1 text-[10px] text-gray-200"
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
          <div class="flex h-full items-center justify-center text-gray-400">
            Loading code...
          </div>
        </Show>

        <Show when={!loading() && error()}>
          <div class="rounded border border-red-700 bg-red-900/70 px-3 py-2 text-red-100">
            {error()}
          </div>
        </Show>

        <Show when={!loading() && !error() && highlightedHtml()}>
          <FlowOverlayCode html={() => highlightedHtml() || ""} />
        </Show>

        <Show when={!loading() && !error() && !highlightedHtml()}>
          <div class="flex h-full items-center justify-center text-gray-500">
            Select a variable or usage node to preview its code.
          </div>
        </Show>
      </div>
    </div>
  );
}
