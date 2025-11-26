import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { codeToHtml } from "shiki";

interface CodeModalProps {
  isOpen: boolean;
  filePath: string | null;
  startLine?: number | null;
  endLine?: number | null;
  onClose: () => void;
}

function guessLangFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts")) return "ts";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".js")) return "js";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".py")) return "py";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".toml")) return "toml";
  if (
    lower.endsWith(".sh") ||
    lower.endsWith(".bash") ||
    lower.endsWith(".zsh")
  )
    return "bash";
  return "txt";
}

export default function CodeModal(props: CodeModalProps) {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = createSignal<string>("");
  const [rawCode, setRawCode] = createSignal("");
  const [lineFilterEnabled, setLineFilterEnabled] = createSignal(false);
  const [lineOffset, setLineOffset] = createSignal(4);
  const [displayStartLine, setDisplayStartLine] = createSignal<number | null>(
    null
  );
  const [displayEndLine, setDisplayEndLine] = createSignal<number | null>(null);
  const [totalLines, setTotalLines] = createSignal<number | null>(null);

  let lastRequestId = 0;

  // Reset line filter when a new file is opened
  createEffect(() => {
    if (!props.isOpen || !props.filePath) return;
    const hasRange =
      typeof props.startLine === "number" &&
      typeof props.endLine === "number" &&
      props.startLine > 0 &&
      props.endLine >= props.startLine;
    setLineFilterEnabled(hasRange);
  });

  createEffect(() => {
    if (!props.isOpen || !props.filePath) {
      return;
    }

    const currentId = ++lastRequestId;
    const path = props.filePath;

    const useLineFilter = lineFilterEnabled();
    const offset = lineOffset();

    setLoading(true);
    setError(null);
    setHighlightedHtml("");

    (async () => {
      try {
        const res = await fetch(
          `/api/files/content?path=${encodeURIComponent(path)}`
        );
        if (!res.ok) {
          throw new Error(
            `Failed to load file: ${res.status} ${res.statusText}`
          );
        }
        const text = await res.text();
        setRawCode(text);

        const lines = text.split(/\r?\n/);
        setTotalLines(lines.length);

        let displayText = text;
        let start = 1;
        let end = lines.length;

        if (
          useLineFilter &&
          typeof props.startLine === "number" &&
          typeof props.endLine === "number"
        ) {
          const safeOffset = Math.max(0, offset);
          const rawStart = props.startLine - safeOffset;
          const rawEnd = props.endLine + safeOffset;
          const clampedStart = Math.max(1, rawStart);
          const clampedEnd = Math.min(lines.length, rawEnd);
          if (clampedEnd >= clampedStart) {
            start = clampedStart;
            end = clampedEnd;
            displayText = lines.slice(start - 1, end).join("\n");
          }
        }

        setDisplayStartLine(start);
        setDisplayEndLine(end);

        const lang = guessLangFromPath(path);
        let html = await codeToHtml(displayText, {
          lang,
          theme: "github-dark",
        });

        // When limiting to a selection, adjust line numbers so they reflect the
        // actual file line numbers by setting the CSS counter-reset on <code>.
        // Also visually de-emphasize context lines outside the focused range
        // by forcing them to a single gray color.
        if (
          useLineFilter &&
          typeof props.startLine === "number" &&
          typeof props.endLine === "number"
        ) {
          const counterStart = start > 0 ? start - 1 : 0;
          html = html.replace(
            /<code([^>]*)>/,
            (_match: string, attrs: string) => {
              if (/style=/.test(attrs)) {
                return `<code${attrs.replace(
                  /style="([^"]*)"/,
                  (_m: string, styleVal: string) =>
                    `style="${styleVal}; counter-reset: line ${counterStart};"`
                )}>`;
              }
              return `<code${attrs} style="counter-reset: line ${counterStart};">`;
            }
          );

          // Grey out lines that are outside the primary selection, while
          // keeping the selected lines fully highlighted.
          const focusStartFile = Math.max(start, props.startLine);
          const focusEndFile = Math.min(end, props.endLine);

          if (focusEndFile >= focusStartFile) {
            const focusStartIndex = focusStartFile - start + 1;
            const focusEndIndex = focusEndFile - start + 1;
            let currentLine = 0;

            html = html.replace(/<span class="line">/g, (match) => {
              currentLine += 1;
              if (
                currentLine < focusStartIndex ||
                currentLine > focusEndIndex
              ) {
                return '<span class="line non-focus-line">';
              }
              return match;
            });
          }
        }

        if (currentId === lastRequestId) {
          setHighlightedHtml(html);
        }
      } catch (e) {
        if (currentId === lastRequestId) {
          setError((e as Error).message ?? String(e));
        }
      } finally {
        if (currentId === lastRequestId) {
          setLoading(false);
        }
      }
    })();
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && props.isOpen) {
      event.stopPropagation();
      props.onClose();
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const baseName = () => {
    if (!props.filePath) return "";
    const parts = props.filePath.split(/[\\/]/);
    return parts[parts.length - 1] || props.filePath;
  };

  const hasLineRange = () =>
    typeof props.startLine === "number" &&
    typeof props.endLine === "number" &&
    props.startLine > 0 &&
    props.endLine >= props.startLine;

  const effectiveDisplayRange = () => {
    if (!totalLines()) return null;
    return {
      start: displayStartLine() ?? 1,
      end: displayEndLine() ?? totalLines()!,
      total: totalLines()!,
    };
  };

  return (
    <Show when={props.isOpen && props.filePath}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div class="flex h-[80vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#1e1e1e] shadow-2xl">
          <header class="flex items-center justify-between border-b border-gray-700 bg-[#252526] px-4 py-2 text-sm">
            <div class="flex min-w-0 flex-col">
              <span class="truncate font-semibold text-gray-100">
                {baseName()}
              </span>
              <span class="truncate text-[11px] text-gray-400">
                {props.filePath}
              </span>
              <Show when={hasLineRange() && effectiveDisplayRange()}>
                {(range) => (
                  <span class="truncate text-[10px] text-gray-500">
                    {lineFilterEnabled()
                      ? `Showing lines ${range().start}-${range().end} of ${
                          range().total
                        }`
                      : `Showing full file (${
                          range().total
                        } lines), selection ${props.startLine}-${
                          props.endLine
                        }`}
                  </span>
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
                navigator.clipboard.writeText(rawCode());
                // Maybe show a toast?
              }}
            >
              Copy
            </button>
            {/* Open in Editor (VS Code URL scheme) */}
            <Show when={hasLineRange()}>
              <label class="ml-3 flex items-center gap-1 text-[11px] text-gray-300">
                <input
                  type="checkbox"
                  checked={lineFilterEnabled()}
                  onChange={(e) =>
                    setLineFilterEnabled(e.currentTarget.checked)
                  }
                />
                <span>Limit to selection</span>
                <span class="ml-2 flex items-center gap-1">
                  <span>±</span>
                  <input
                    type="number"
                    min="0"
                    class="w-12 bg-gray-800 border border-gray-600 rounded px-1 text-[11px] text-gray-200"
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
          </header>
          <main class="relative flex-1 overflow-auto bg-[#1e1e1e] p-4">
            <Show when={loading()}>
              <div class="flex h-full items-center justify-center text-sm text-gray-400">
                Loading file…
              </div>
            </Show>
            <Show when={!loading() && error()}>
              <div class="rounded border border-red-700 bg-red-900/70 px-3 py-2 text-sm text-red-100">
                {error()}
              </div>
            </Show>
            <Show when={!loading() && !error() && highlightedHtml()}>
              <div
                class="code-modal-content"
                innerHTML={highlightedHtml() || ""}
              />
            </Show>
          </main>
        </div>
      </div>
    </Show>
  );
}
