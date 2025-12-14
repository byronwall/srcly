import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  For,
} from "solid-js";
import { codeToHtml } from "shiki";
import { SolidMarkdown } from "solid-markdown";
import remarkGfm from "remark-gfm";
import { HOTSPOT_METRICS } from "../utils/metricsStore";

interface HighlightSelectionOptions {
  startLine: number;
  endLine: number;
}

function remarkHighlightSelection(options: HighlightSelectionOptions) {
  const { startLine, endLine } = options;

  const blockTypes = new Set([
    "heading",
    "paragraph",
    "list",
    "listItem",
    "code",
    "blockquote",
    "table",
    "thematicBreak",
  ]);

  // We sometimes receive an endLine that actually corresponds to the *next*
  // heading that closes the current scope. Detect that pattern and tighten
  // the effective end so we don't accidentally include the next section's
  // heading in the highlight.
  let selectionEnd = endLine;

  function scanForBoundaryHeading(node: any) {
    if (!node || typeof node !== "object") return;

    const position = (node as any).position;
    if (
      (node as any).type === "heading" &&
      position &&
      typeof position.start?.line === "number" &&
      position.start.line === endLine
    ) {
      selectionEnd = Math.max(startLine, endLine - 1);
    }

    if (Array.isArray((node as any).children)) {
      for (const child of (node as any).children) {
        scanForBoundaryHeading(child);
      }
    }
  }

  function walk(node: any, parentMarked: boolean) {
    if (!node || typeof node !== "object") return;

    let markedHere = false;
    const position = (node as any).position;

    if (
      !parentMarked &&
      position &&
      typeof position.start?.line === "number" &&
      typeof position.end?.line === "number"
    ) {
      const nodeStart = position.start.line;
      const nodeEnd = position.end.line;
      // Require the node to be fully contained in the effective selection range
      // so that the first block *after* the scope (e.g. the next heading) is
      // not accidentally included when positions share boundary lines.
      const fullyWithin = nodeStart >= startLine && nodeEnd <= selectionEnd;

      if (fullyWithin && blockTypes.has((node as any).type)) {
        const data = ((node as any).data ||= {});
        const hProperties = (data.hProperties ||= {});
        // Mark this node as part of the true selection; a rehype plugin
        // will later wrap contiguous marked elements in a single container.
        hProperties["data-in-selection"] = "true";
        (node as any).data = data;
        markedHere = true;
      }
    }

    const nextParentMarked = parentMarked || markedHere;

    if (Array.isArray((node as any).children)) {
      for (const child of (node as any).children) {
        walk(child, nextParentMarked);
      }
    }
  }

  return (tree: any) => {
    scanForBoundaryHeading(tree);
    walk(tree, false);
  };
}

function rehypeWrapSelection() {
  return (tree: any) => {
    if (!tree || !Array.isArray((tree as any).children)) return;

    function wrapChildren(node: any) {
      if (!node || !Array.isArray(node.children)) return;

      const newChildren: any[] = [];
      let buffer: any[] = [];

      const flushBuffer = () => {
        if (!buffer.length) return;
        newChildren.push({
          type: "element",
          tagName: "div",
          properties: { className: ["md-selected-range"] },
          children: buffer,
        });
        buffer = [];
      };

      for (const child of node.children) {
        const inSelection =
          child &&
          child.type === "element" &&
          child.properties &&
          (child.properties["data-in-selection"] === "true" ||
            child.properties["data-in-selection"] === true);

        const isWhitespaceText =
          child &&
          child.type === "text" &&
          typeof child.value === "string" &&
          /^\s*$/.test(child.value);

        if (inSelection || (isWhitespaceText && buffer.length > 0)) {
          buffer.push(child);
        } else {
          flushBuffer();
          newChildren.push(child);
        }
      }

      flushBuffer();
      node.children = newChildren;
    }

    // Only wrap at the top level; this matches how scopes are surfaced
    // in the structural analysis (as true container sections).
    wrapChildren(tree);
  };
}

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
  const [targetStartLine, setTargetStartLine] = createSignal<number | null>(
    props.startLine ?? null
  );
  const [targetEndLine, setTargetEndLine] = createSignal<number | null>(
    props.endLine ?? null
  );
  const [lineFilterEnabled, setLineFilterEnabled] = createSignal(false);
  const [lineOffset, setLineOffset] = createSignal(4);
  const [displayStartLine, setDisplayStartLine] = createSignal<number | null>(
    null
  );
  const [displayEndLine, setDisplayEndLine] = createSignal<number | null>(null);
  const [totalLines, setTotalLines] = createSignal<number | null>(null);
  const [reduceIndentation, setReduceIndentation] = createSignal(true);
  const [wasIndentationReduced, setWasIndentationReduced] = createSignal(false);
  const [viewMode, setViewMode] = createSignal<"code" | "preview">("code");

  let lastRequestId = 0;
  let contentScrollRef: HTMLDivElement | undefined;
  let hasAutoScrolledToSelection = false;

  // Sync state with props when they change
  createEffect(() => {
    setTargetStartLine(props.startLine ?? null);
    setTargetEndLine(props.endLine ?? null);
  });

  // Reset line filter when a new file is opened
  createEffect(() => {
    if (!props.isOpen || !props.filePath) return;
    const sLine = targetStartLine();
    const eLine = targetEndLine();
    const hasRange =
      typeof sLine === "number" &&
      typeof eLine === "number" &&
      sLine > 0 &&
      eLine >= sLine;
    setLineFilterEnabled(hasRange);

    // Default to preview mode for markdown
    if (props.filePath && guessLangFromPath(props.filePath) === "md") {
      setViewMode("preview");
    } else {
      setViewMode("code");
    }
  });

  let lastProcessId = 0;

  // 1. Fetch File Content Effect
  createEffect(() => {
    if (!props.isOpen || !props.filePath) {
      setRawCode("");
      setHighlightedHtml("");
      return;
    }

    const path = props.filePath;
    const currentId = ++lastRequestId;

    setLoading(true);
    setError(null);
    setRawCode("");
    setHighlightedHtml("");
    setWasIndentationReduced(false);

    (async () => {
      try {
        const res = await fetch(
          `/api/files/content?path=${encodeURIComponent(path)}`
        );
        if (currentId !== lastRequestId) return;

        if (!res.ok) {
          throw new Error(
            `Failed to load file: ${res.status} ${res.statusText}`
          );
        }

        const text = await res.text();
        setRawCode(text);
        setTotalLines(text.split(/\r?\n/).length);
        setLoading(false);
      } catch (e) {
        if (currentId !== lastRequestId) return;
        setError((e as Error).message ?? String(e));
        setLoading(false);
      }
    })();
  });

  // 2. Process/Highlight Content Effect
  createEffect(() => {
    const text = rawCode();
    const path = props.filePath;

    // Dependencies
    const useLineFilter = lineFilterEnabled();
    const offset = lineOffset();
    const shouldReduceIndent = reduceIndentation();
    const tStart = targetStartLine();
    const tEnd = targetEndLine();

    if (!text || !path) {
      return;
    }

    const currentProcessId = ++lastProcessId;

    (async () => {
      const lines = text.split(/\r?\n/);

      let displayText = text;
      let start = 1;
      let end = lines.length;
      let linesToDisplay = lines;

      if (
        useLineFilter &&
        typeof tStart === "number" &&
        typeof tEnd === "number"
      ) {
        const safeOffset = Math.max(0, offset);
        const rawStart = tStart! - safeOffset;
        const rawEnd = tEnd! + safeOffset;
        const clampedStart = Math.max(1, rawStart);
        const clampedEnd = Math.min(lines.length, rawEnd);
        if (clampedEnd >= clampedStart) {
          start = clampedStart;
          end = clampedEnd;
          linesToDisplay = lines.slice(start - 1, end);
          displayText = linesToDisplay.join("\n");
        }
      }

      let isReduced = false;
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
            isReduced = true;
          }
        }
      }

      const lang = guessLangFromPath(path);
      let html = await codeToHtml(displayText, {
        lang,
        theme: "github-dark",
      });

      // SHIKI FIX: Shiki adds newlines inside the <pre> block
      html = html.replace(/\n<span class="line">/g, '<span class="line">');

      // Adjust line numbers and gray out non-focused lines
      if (
        useLineFilter &&
        typeof tStart === "number" &&
        typeof tEnd === "number"
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

        // Grey out lines that are outside the primary selection
        const focusStartFile = Math.max(start, tStart!);
        const focusEndFile = Math.min(end, tEnd!);

        if (focusEndFile >= focusStartFile) {
          const focusStartIndex = focusStartFile - start + 1;
          const focusEndIndex = focusEndFile - start + 1;
          let currentLine = 0;

          html = html.replace(/<span class="line">/g, (match) => {
            currentLine += 1;
            if (currentLine < focusStartIndex || currentLine > focusEndIndex) {
              return '<span class="line non-focus-line">';
            }
            return match;
          });
        }
      }

      if (currentProcessId === lastProcessId) {
        setHighlightedHtml(html);
        setDisplayStartLine(start);
        setDisplayEndLine(end);
        setWasIndentationReduced(isReduced);
      }
    })();
  });

  // When opening in markdown preview mode with a highlighted range, scroll the
  // content area so that the selected block is visible.
  createEffect(() => {
    const isOpen = props.isOpen;
    const mode = viewMode();
    const hasSelection =
      lineFilterEnabled() &&
      typeof targetStartLine() === "number" &&
      typeof targetEndLine() === "number";

    const isLoading = loading();

    // Depend on rawCode / highlightedHtml so this effect re-runs after new content loads
    // and the markdown preview or code view has been re-rendered.
    // eslint-disable-next-line solid/reactivity
    rawCode();
    // eslint-disable-next-line solid/reactivity
    highlightedHtml();

    if (!isOpen || mode !== "preview" || !hasSelection || isLoading) {
      hasAutoScrolledToSelection = false;
      return;
    }

    if (hasAutoScrolledToSelection) return;

    queueMicrotask(() => {
      const container = contentScrollRef;
      if (!container) return;

      const target = container.querySelector(
        ".md-selected-range"
      ) as HTMLElement | null;
      if (!target) return;

      hasAutoScrolledToSelection = true;
      target.scrollIntoView({ block: "center" });
    });
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
    typeof targetStartLine() === "number" &&
    typeof targetEndLine() === "number" &&
    targetStartLine()! > 0 &&
    targetEndLine()! >= targetStartLine()!;

  const effectiveDisplayRange = () => {
    if (!totalLines()) return null;
    return {
      start: displayStartLine() ?? 1,
      end: displayEndLine() ?? totalLines()!,
      total: totalLines()!,
    };
  };

  const isSyntheticBodyNode = (n: any) =>
    n?.name === "(body)" ||
    n?.type === "function_body" ||
    n?.type === "file_body";

  function getEffectiveChildren(node: any) {
    if (!node || !Array.isArray(node.children)) return [];

    // The backend/treemap pipeline uses "(body)" as a *synthetic leaf* that represents
    // leftover LOC, not a container for real structure. For the Structure panel we
    // want to hide it, not unwrap into its (usually empty) children.
    const structural = node.children.filter(
      (c: any) => !isSyntheticBodyNode(c)
    );

    // Defensive: if some analyzer ever wraps real structure inside a synthetic body container,
    // only then treat it as a container.
    if (structural.length === 0) {
      const bodyContainer = node.children.find(
        (c: any) =>
          isSyntheticBodyNode(c) &&
          Array.isArray(c.children) &&
          c.children.length > 0
      );
      if (bodyContainer) {
        return bodyContainer.children.filter(
          (c: any) => !isSyntheticBodyNode(c)
        );
      }
    }

    return structural;
  }

  const breadcrumbPath = () => {
    const root = props.fileNode;
    if (!root) return [];

    // If no specific lines selected, just show root
    // But we want the path logic to handle "root is selected" appropriately
    // If targetStartLine is null, we are conceptually at root
    const s = targetStartLine();
    const e = targetEndLine();

    if (s === null || e === null) {
      return [root];
    }

    // Helper to find deepest path
    const path: any[] = [root];
    let current = root;

    // Safety break
    let iterations = 0;
    while (iterations < 100) {
      iterations++;
      const children = getEffectiveChildren(current);
      if (!children || !children.length) break;

      const bestMatch = children.reduce((best: any, c: any) => {
        if (
          !c ||
          typeof c.start_line !== "number" ||
          typeof c.end_line !== "number"
        ) {
          return best;
        }

        const contains = c.start_line <= s && c.end_line >= e;
        if (!contains) return best;
        if (!best) return c;

        const bestSpan = best.end_line - best.start_line;
        const cSpan = c.end_line - c.start_line;
        if (cSpan < bestSpan) return c;
        if (cSpan > bestSpan) return best;

        const bestExact = best.start_line === s && best.end_line === e;
        const cExact = c.start_line === s && c.end_line === e;
        if (cExact !== bestExact) return cExact ? c : best;

        return best;
      }, null);

      if (!bestMatch) break;

      // Avoid drifting into wrapper/equal-span nodes: only descend if the match
      // is strictly narrower than the current node's span.
      const currentSpan =
        typeof current?.start_line === "number" &&
        typeof current?.end_line === "number"
          ? current.end_line - current.start_line
          : Number.POSITIVE_INFINITY;
      const matchSpan = bestMatch.end_line - bestMatch.start_line;
      if (matchSpan >= currentSpan) break;

      path.push(bestMatch);
      current = bestMatch;
    }

    return path;
  };

  const activeStructureNode = () => {
    const path = breadcrumbPath();
    const active =
      path.length > 0
        ? path[path.length - 1]
        : props.scopeNode || props.fileNode;
    return active;
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

  function SidebarTree(props: {
    node: () => any;
    depth: number;
    onSelect: (start: number, end: number) => void;
  }) {
    // Determine early if this node should simply be hidden
    if (props.node()?.name === "(body)") return null;

    const [expanded, setExpanded] = createSignal(props.depth < 1);
    const children = () => getEffectiveChildren(props.node());
    const hasChildren = () => children().length > 0;

    const toggle = (e: MouseEvent) => {
      e.stopPropagation();
      setExpanded(!expanded());
    };

    const handleClick = (e: MouseEvent) => {
      e.stopPropagation();
      console.log("SidebarTree clicked node:", props.node());

      if (
        typeof props.node()?.start_line === "number" &&
        typeof props.node()?.end_line === "number"
      ) {
        props.onSelect(props.node().start_line, props.node().end_line);
      } else if (hasChildren()) {
        setExpanded(!expanded());
      }
    };

    const getIcon = () => {
      if (props.node()?.type === "function") return "ƒ";
      if (props.node()?.type === "class") return "C";
      if (props.node()?.type === "folder") return "📁";
      return "•";
    };

    return (
      <div class="select-none">
        <div
          class="flex items-center gap-1 py-1 px-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer rounded"
          style={{ "padding-left": `${props.depth * 12 + 8}px` }}
          onClick={handleClick}
        >
          <span
            class="w-4 h-4 flex items-center justify-center text-[10px] text-gray-500 hover:text-white"
            onClick={toggle}
          >
            {hasChildren() ? (expanded() ? "▼" : "▶") : ""}
          </span>
          <span class="font-mono text-[10px] opacity-70">{getIcon()}</span>
          <span class="truncate">{props.node()?.name}</span>
        </div>
        <Show when={expanded() && hasChildren()}>
          <For each={children()}>
            {(child) => {
              const childNode = () => child;
              return (
                <SidebarTree
                  node={childNode}
                  depth={props.depth + 1}
                  onSelect={props.onSelect}
                />
              );
            }}
          </For>
        </Show>
      </div>
    );
  }

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
                        } lines), selection ${targetStartLine()}-${targetEndLine()}`}
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

            <Show when={guessLangFromPath(props.filePath || "") === "md"}>
              <div class="ml-4 flex items-center rounded bg-gray-700 p-0.5">
                <button
                  class={`px-3 py-0.5 text-xs font-semibold rounded-sm transition-colors ${
                    viewMode() === "code"
                      ? "bg-gray-600 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  onClick={() => setViewMode("code")}
                >
                  Code
                </button>
                <button
                  class={`px-3 py-0.5 text-xs font-semibold rounded-sm transition-colors ${
                    viewMode() === "preview"
                      ? "bg-gray-600 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  onClick={() => setViewMode("preview")}
                >
                  Preview
                </button>
              </div>
            </Show>

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
            <div class="w-64 shrink-0 border-r border-gray-700 bg-[#1e1e1e] flex flex-col overflow-hidden">
              <div class="flex-1 overflow-y-auto p-4">
                <Show when={props.scopeNode || props.fileNode}>
                  <div class="mb-6">
                    <Show when={breadcrumbPath().length > 1}>
                      <div class="mb-4 flex flex-col items-start gap-1">
                        <For
                          each={breadcrumbPath().filter(
                            (n) => n.name !== "(body)"
                          )}
                        >
                          {(node, i) => {
                            const n = () => node;
                            return (
                              <div class="flex items-center gap-1 w-full">
                                <span class="text-gray-600 text-[10px] w-3 flex justify-center">
                                  {i() > 0 ? "↳" : ""}
                                </span>
                                <button
                                  class={`text-xs truncate hover:underline text-left flex-1 ${
                                    i() ===
                                    breadcrumbPath().filter(
                                      (n) => n.name !== "(body)"
                                    ).length -
                                      1
                                      ? "font-bold text-gray-200 cursor-default hover:no-underline"
                                      : "text-blue-400 hover:text-blue-300"
                                  }`}
                                  onClick={() => {
                                    const displayPath = breadcrumbPath().filter(
                                      (n) => n.name !== "(body)"
                                    );
                                    if (i() === displayPath.length - 1) return;

                                    if (i() === 0) {
                                      setTargetStartLine(null);
                                      setTargetEndLine(null);
                                      setLineFilterEnabled(false);
                                    } else {
                                      setTargetStartLine(n().start_line);
                                      setTargetEndLine(n().end_line);
                                      setLineFilterEnabled(true);
                                    }
                                    hasAutoScrolledToSelection = false;
                                  }}
                                >
                                  {i() === 0 ? baseName() : n().name}
                                </button>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                    <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
                      Structure
                    </h3>
                    <div class="space-y-1">
                      <For each={getEffectiveChildren(activeStructureNode())}>
                        {(child) => {
                          const childNode = () => child;
                          return (
                            <SidebarTree
                              node={childNode}
                              depth={0}
                              onSelect={(start, end) => {
                                setTargetStartLine(start);
                                setTargetEndLine(end);
                                setLineFilterEnabled(true);
                                // Auto-scroll logic will trigger because of target lines changing
                                hasAutoScrolledToSelection = false;
                              }}
                            />
                          );
                        }}
                      </For>
                      <Show
                        when={
                          !getEffectiveChildren(activeStructureNode())?.length
                        }
                      >
                        <div class="text-xs text-gray-500 italic px-2">
                          No sub-items
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>

                <Show when={props.scopeNode}>
                  <MetricsSection
                    title="Scope Metrics"
                    node={props.scopeNode}
                  />
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
            </div>

            {/* Code Content */}
            <div class="flex-1 overflow-auto p-4" ref={contentScrollRef}>
              <Show
                when={
                  loading() ||
                  (!highlightedHtml() && !error() && viewMode() === "code")
                }
              >
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
                <Show
                  when={viewMode() === "preview"}
                  fallback={
                    <div
                      class="code-modal-content"
                      innerHTML={highlightedHtml() || ""}
                    />
                  }
                >
                  <div class="markdown-preview p-4 prose prose-invert max-w-none">
                    <SolidMarkdown
                      children={rawCode()}
                      remarkPlugins={
                        lineFilterEnabled() &&
                        typeof targetStartLine() === "number" &&
                        typeof targetEndLine() === "number"
                          ? [
                              remarkGfm,
                              [
                                remarkHighlightSelection,
                                {
                                  startLine: targetStartLine(),
                                  endLine: targetEndLine(),
                                },
                              ],
                            ]
                          : [remarkGfm]
                      }
                      rehypePlugins={[rehypeWrapSelection]}
                      components={{
                        img: (imgProps) => {
                          if (!imgProps.src) return null;
                          let src = imgProps.src;
                          // If relative path, resolve against current file path
                          if (
                            !src.startsWith("http") &&
                            !src.startsWith("/") &&
                            props.filePath
                          ) {
                            const dir = props.filePath.substring(
                              0,
                              props.filePath.lastIndexOf("/")
                            );
                            // Handle ../ etc? The server is simple, let's just construct absolute path blindly for now
                            // or better, use URL logic if we could. But simple concatenation usually works for
                            // sibling or subdir files.

                            // Actually we need to be careful about matching how browser resolves relative URLs.
                            // But here we are resolving file system paths.
                            // Let's try to construct an absolute path.
                            // We can't use node path module easily in browser without polyfill.
                            // Simple approach:
                            const parts = dir.split("/");
                            const relParts = src.split("/");

                            for (const part of relParts) {
                              if (part === ".") continue;
                              if (part === "..") {
                                parts.pop();
                              } else {
                                parts.push(part);
                              }
                            }
                            const absPath = parts.join("/");
                            src = `/api/files/content?path=${encodeURIComponent(
                              absPath
                            )}`;
                          }
                          return (
                            <img
                              {...imgProps}
                              src={src}
                              class="max-w-full rounded-lg border border-gray-700 my-4"
                            />
                          );
                        },
                      }}
                    />
                  </div>
                </Show>
              </Show>
            </div>
          </main>
        </div>
      </div>
    </Show>
  );
}
