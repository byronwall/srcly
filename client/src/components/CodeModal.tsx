import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  For,
} from "solid-js";
import { codeToHtml } from "shiki";
import { HOTSPOT_METRICS } from "../utils/metricsStore";

interface CodeModalProps {
  isOpen: boolean;
  filePath: string | null;
  startLine?: number | null;
  endLine?: number | null;
  onClose: () => void;
  fileNode?: any;
  scopeNode?: any;
}

function guessLangFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts")) return "ts";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".js")) return "js";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".py") || lower.endsWith(".ipynb")) return "python";
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
  const [reduceIndentation, setReduceIndentation] = createSignal(true);
  const [wasIndentationReduced, setWasIndentationReduced] = createSignal(false);

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
    const shouldReduceIndent = reduceIndentation();

    setLoading(true);
    setError(null);
    setHighlightedHtml("");
    setWasIndentationReduced(false);

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
        let linesToDisplay = lines;

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
            linesToDisplay = lines.slice(start - 1, end);
            displayText = linesToDisplay.join("\n");
          }
        }

        if (shouldReduceIndent) {
          let minIndent = Infinity;
          let hasNonEmptyLine = false;

          for (const line of linesToDisplay) {
            if (!line.trim()) continue;

            hasNonEmptyLine = true;
            const match = line.match(/^(\s*)/);
            if (match) {
              minIndent = Math.min(minIndent, match[1].length);
            } else {
              minIndent = 0;
            }
          }

          if (hasNonEmptyLine && minIndent > 0 && minIndent !== Infinity) {
            // Keep a small visual indent (e.g. 2 spaces) if original indent was deep
            if (minIndent > 2) {
              const strings = linesToDisplay.map((line) => {
                if (!line.trim()) return "";
                if (line.length >= minIndent) {
                  return "  " + line.slice(minIndent);
                }
                return line;
              });

              displayText = strings.join("\n");
              setWasIndentationReduced(true);
            }
          }
        }

        setDisplayStartLine(start);
        setDisplayEndLine(end);

        const lang = guessLangFromPath(path);
        let html = await codeToHtml(displayText, {
          lang,
          theme: "github-dark",
        });

        // SHIKI FIX: Shiki adds newlines inside the <pre> block which, combined
        // with display: block on .line, causes double spacing when copying text.
        // We strip these newlines here.
        html = html.replace(/\n<span class="line">/g, '<span class="line">');

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

  const MetricItem = (props: {
    label: string;
    value: any;
    colorClass: string;
  }) => (
    <div class="flex items-center justify-between text-xs py-1 border-b border-gray-800 last:border-0">
      <span class="text-gray-400">{props.label}</span>
      <span class={`${props.colorClass} font-mono`}>
        {typeof props.value === "number" && !Number.isInteger(props.value)
          ? props.value.toFixed(2)
          : props.value}
      </span>
    </div>
  );

  const MetricsSection = (props: { title: string; node: any }) => {
    return (
      <div class="mb-6">
        <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
          {props.title}
        </h3>
        <div class="space-y-1">
          <For each={HOTSPOT_METRICS}>
            {(metric) => {
              const val = props.node.metrics?.[metric.id];
              if (val === undefined || val === null) return null;
              return (
                <MetricItem
                  label={metric.label}
                  value={val}
                  colorClass={metric.color}
                />
              );
            }}
          </For>
        </div>
      </div>
    );
  };

  return (
    <Show when={props.isOpen && props.filePath}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={() => props.onClose()}
      >
        <div
          class="flex h-[80vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#1e1e1e] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
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
            <div class="flex items-center">
              <Show when={wasIndentationReduced()}>
                <span class="ml-4 text-[10px] text-yellow-500/80 italic animate-pulse">
                  Indentation reduced
                </span>
              </Show>
              <label class="ml-3 flex items-center gap-1 text-[11px] text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reduceIndentation()}
                  onChange={(e) =>
                    setReduceIndentation(e.currentTarget.checked)
                  }
                />
                <span title="Strip common indentation to save horizontal space">
                  Reduce indent
                </span>
              </label>

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
            </div>
          </header>
          <main class="relative flex-1 overflow-hidden flex bg-[#1e1e1e]">
            {/* Metrics Sidebar */}
            <div class="w-64 shrink-0 border-r border-gray-700 bg-[#1e1e1e] p-4 overflow-y-auto">
              <Show when={props.scopeNode}>
                <MetricsSection title="Scope Metrics" node={props.scopeNode} />
              </Show>
              <Show when={props.fileNode}>
                <MetricsSection title="File Metrics" node={props.fileNode} />
              </Show>
              <Show when={!props.fileNode && !props.scopeNode}>
                <div class="text-xs text-gray-500 italic">
                  No metrics available for this file.
                </div>
              </Show>
            </div>

            {/* Code Content */}
            <div class="flex-1 overflow-auto p-4">
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
            </div>
          </main>
        </div>
      </div>
    </Show>
  );
}
