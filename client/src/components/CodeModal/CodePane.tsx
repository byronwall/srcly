import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { ErrorState, LoadingState } from "../feedback/States";
import { StickyBreadcrumb } from "./StickyBreadcrumb";

export type CodePaneProps = {
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
};

export function CodePane(props: CodePaneProps) {
  const [currentTopLine, setCurrentTopLine] = createSignal(1);
  let scrollRef: HTMLDivElement | undefined;
  let breadcrumbRef: HTMLDivElement | undefined;

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

  return (
    <div class="flex h-full min-h-0">
      <div class="flex-1 min-w-0 overflow-auto" ref={(el) => (scrollRef = el)}>
        <div class="sticky top-0 z-20" ref={(el) => (breadcrumbRef = el)}>
          <StickyBreadcrumb
            root={props.fileNode}
            selectedNode={props.selectedScopeNode}
            filePath={props.filePath}
            currentLine={currentTopLine}
            selection={() => {
              const s = props.targetStartLine?.();
              const e = props.targetEndLine?.();
              if (typeof s === "number" && typeof e === "number")
                return { start: s, end: e };
              return null;
            }}
            onSelectScope={props.onSelectScope}
          />
        </div>
        <Show
          when={props.loading() || (!props.highlightedHtml() && !props.error())}
        >
          <LoadingState label="Loading file..." />
        </Show>
        <Show when={!props.loading() && props.error()}>
          <ErrorState message={props.error()} class="min-h-32" />
        </Show>
        <Show when={showCode()}>
          <div
            class="code-modal-content"
            innerHTML={props.highlightedHtml()}
          />
        </Show>
      </div>
    </div>
  );
}
