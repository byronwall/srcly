import { Show, For, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { FlowOverlayCode } from "../FlowOverlayCode";
import { type OverlayToken } from "../../utils/flowDecorations";
import { StickyBreadcrumb } from "./StickyBreadcrumb";

const LEGEND_ITEMS = [
  { category: "param", label: "Parameter" },
  { category: "local", label: "Local" },
  { category: "capture", label: "Captured" },
  { category: "module", label: "Module" },
  { category: "importInternal", label: "Internal Import" },
  { category: "importExternal", label: "External Import" },
  { category: "builtin", label: "Built-in" },
  { category: "unresolved", label: "Unresolved" },
];

export function CodePane(props: {
  loading: () => boolean;
  error: () => string | null;
  highlightedHtml: () => string;
  filePath: () => string | null;
  fileNode: () => any | null;
  selectedScopeNode: () => any | null;
  onSelectScope: (node: any | null) => void;
  displayStartLine: () => number;
  targetStartLine: () => number | null;
  targetEndLine: () => number | null;
  removedIndentByLine: () => number[] | null;
  lineFilterEnabled: () => boolean;
  dataFlowEnabled: () => boolean;
  onJumpToLine: (target: {
    start?: number;
    end?: number;
    scrollTarget?: number;
  }) => void;
}) {
  const [tokens, setTokens] = createSignal<OverlayToken[]>([]);
  const [currentTopLine, setCurrentTopLine] = createSignal(1);
  let scrollRef: HTMLDivElement | undefined;
  let breadcrumbRef: HTMLDivElement | undefined;

  const counts = createMemo(() => {
    const map = new Map<string, number>();
    for (const t of tokens()) {
      map.set(t.category, (map.get(t.category) || 0) + 1);
    }
    return map;
  });

  const showCode = () =>
    !props.loading() && !props.error() && props.highlightedHtml();

  const updateCurrentTopLine = () => {
    const scroller = scrollRef;
    if (!scroller) return;

    const lineEls = scroller.querySelectorAll("span.line");
    if (!lineEls.length) return;

    const first = lineEls[0] as HTMLElement;
    const lh = first.getBoundingClientRect().height || 16;
    const headerH = breadcrumbRef?.offsetHeight ?? 0;
    const topBoundary = scroller.getBoundingClientRect().top + headerH + 2;

    let guess = Math.floor(scroller.scrollTop / lh);
    guess = Math.max(0, Math.min(lineEls.length - 1, guess));

    const start = Math.max(0, guess - 30);
    const end = Math.min(lineEls.length - 1, guess + 30);

    let bestIdx = guess;
    for (let i = start; i <= end; i++) {
      const r = (lineEls[i] as HTMLElement).getBoundingClientRect();
      if (r.bottom > topBoundary) {
        bestIdx = i;
        break;
      }
    }

    setCurrentTopLine(props.displayStartLine() + bestIdx);
  };

  createEffect(() => {
    // Recompute when content changes (new file, new slice).
    props.highlightedHtml();
    queueMicrotask(() => updateCurrentTopLine());
  });

  createEffect(() => {
    // Also recompute if slice start changes.
    props.displayStartLine();
    queueMicrotask(() => updateCurrentTopLine());
  });

  createEffect(() => {
    const scroller = scrollRef;
    if (!scroller) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateCurrentTopLine();
      });
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    });
  });

  createEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[breadcrumb] codepane inputs", {
      filePath: props.filePath?.() ?? null,
      displayStartLine: props.displayStartLine(),
      currentTopLine: currentTopLine(),
      target: { start: props.targetStartLine?.() ?? null, end: props.targetEndLine?.() ?? null },
      hasFileNode: !!props.fileNode?.(),
    });
  });

  return (
    <div class="flex h-full min-h-0">
      <div class="flex-1 min-w-0 overflow-auto" ref={(el) => (scrollRef = el)}>
        <div ref={(el) => (breadcrumbRef = el)}>
          <StickyBreadcrumb
            root={props.fileNode}
            selectedNode={props.selectedScopeNode}
            filePath={props.filePath}
            currentLine={currentTopLine}
            selection={() => {
              const s = props.targetStartLine?.();
              const e = props.targetEndLine?.();
              if (typeof s === "number" && typeof e === "number") return { start: s, end: e };
              return null;
            }}
            onSelectScope={props.onSelectScope}
          />
        </div>
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

        <Show when={showCode()}>
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
            dataFlowEnabled={props.dataFlowEnabled}
            onTokensChange={setTokens}
            onJumpToLine={props.onJumpToLine}
          />
        </Show>
      </div>

      <Show when={props.dataFlowEnabled() && showCode()}>
        <div class="w-48 shrink-0 border-l border-gray-800 bg-gray-900/20 p-4 overflow-y-auto">
          <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
            Data Flow
          </h3>
          <div class="space-y-3 code-modal-content">
            <For each={LEGEND_ITEMS}>
              {(item) => {
                const count = () => counts().get(item.category) || 0;
                return (
                  <div
                    class="flex items-center justify-between group cursor-default"
                    title={`${item.label}: ${count()} occurrences`}
                  >
                    <div class="flex items-center gap-2">
                      <div
                        class={`w-3.5 h-3.5 rounded-sm border border-white/5 flow flow-${item.category}`}
                        aria-hidden="true"
                      />
                      <span class="text-[11px] text-gray-400 font-medium group-hover:text-gray-200 transition-colors">
                        {item.label}
                      </span>
                    </div>
                    <Show when={count() > 0}>
                      <span class="text-[10px] font-mono text-gray-600 group-hover:text-gray-400 tabular-nums">
                        {count()}
                      </span>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>

          <div class="mt-8 pt-6 border-t border-gray-800/50">
            <p class="text-[10px] leading-relaxed text-gray-600 italic">
              Tracing {tokens().length} identifiers in the current view.
            </p>
          </div>
        </div>
      </Show>
    </div>
  );
}
