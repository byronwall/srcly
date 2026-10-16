import { ChevronLeft, ChevronRight, ListTree, X } from "lucide-solid";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { ErrorState, LoadingState } from "../feedback/States";
import { IconButton } from "../ui/IconButton";
import { cx } from "../ui/classes";
import { lineDecorations, type MarkerHit } from "../../utils/metricMarkers";
import { getEffectiveChildren } from "../../utils/structureTree";
import { OutlinePopover } from "./OutlinePopover";
import { StickyBreadcrumb } from "./StickyBreadcrumb";

/** A metric overlaid on the code: its hits in view and where the cursor is. */
export type CodeOverlay = {
  label: string;
  /** "good" for metrics where more is better (comments), so hits don't read as problems. */
  tone: "hot" | "good";
  hits: MarkerHit[];
  /** Hits in the file outside the displayed lines. */
  outside: number;
  cursorLine: number | null;
};

export type CodePaneProps = {
  loading: () => boolean;
  error: () => string | null;
  highlightedHtml: () => string;
  filePath: () => string | null;
  baseName: string;
  fileNode: () => any | null;
  selectedScopeNode: () => any | null;
  onSelectScope: (node: any | null) => void;
  displayStartLine: () => number;
  displayEndLine: () => number;
  totalLines: () => number | null;
  targetStartLine: () => number | null;
  targetEndLine: () => number | null;
  outlineOpen: () => boolean;
  setOutlineOpen: (open: boolean) => void;
  overlay: () => CodeOverlay | null;
  onStep: (direction: 1 | -1) => void;
  onJumpToHit: (line: number) => void;
  onClearOverlay: () => void;
  onShowWholeFile: () => void;
};

export function CodePane(props: CodePaneProps) {
  const [currentTopLine, setCurrentTopLine] = createSignal(1);
  let scrollRef: HTMLDivElement | undefined;
  let breadcrumbRef: HTMLDivElement | undefined;
  let codeRef: HTMLDivElement | undefined;

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

  // Mark the overlaid metric's lines in the rendered Shiki HTML. The HTML is
  // replaced on every re-highlight, so this re-runs after each one.
  createEffect(() => {
    props.highlightedHtml();
    const overlay = props.overlay();
    const start = props.displayStartLine();
    const deco = overlay ? lineDecorations(overlay.hits) : null;
    const cursor = overlay?.cursorLine ?? null;
    queueMicrotask(() => {
      measure();
      const lines = codeRef?.querySelectorAll<HTMLElement>("span.line");
      if (!lines) return;
      lines.forEach((el, i) => {
        const line = start + i;
        const d = deco?.get(line);
        el.classList.toggle("metric-hit", Boolean(d));
        el.classList.toggle("metric-hit-current", d !== undefined && cursor !== null && isInHit(overlay!.hits, cursor, line));
        if (d?.first && d.note) el.dataset.note = d.note;
        else delete el.dataset.note;
      });
    });
  });

  const isInHit = (hits: MarkerHit[], cursorLine: number, line: number) => {
    const hit = hits.find((h) => h.line === cursorLine);
    return Boolean(hit && line >= hit.line && line <= hit.endLine);
  };

  // Ruler geometry, measured from the rendered lines so each tick sits level
  // with its line when the code is shorter than the pane, and scales with the
  // scroll height when it's longer. Lines don't wrap, so one height fits all.
  const [geom, setGeom] = createSignal({ header: 0, first: 0, lineH: 0, span: 1 });
  const measure = () => {
    const scroller = scrollRef;
    const first = codeRef?.querySelector<HTMLElement>("span.line");
    if (!scroller || !codeRef || !first) return;
    const header = breadcrumbRef?.offsetHeight ?? 0;
    const codeRect = codeRef.getBoundingClientRect();
    const lineRect = first.getBoundingClientRect();
    setGeom({
      header,
      first: lineRect.top - codeRect.top,
      lineH: lineRect.height || 1,
      span: Math.max(codeRef.offsetHeight, scroller.clientHeight - header, 1),
    });
  };
  createEffect(() => {
    const scroller = scrollRef;
    if (!scroller) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(scroller);
    onCleanup(() => ro.disconnect());
  });

  const lineOffset = (line: number) => geom().first + (line - props.displayStartLine()) * geom().lineH;
  const rulerTop = (line: number) => `${(lineOffset(line) / geom().span) * 100}%`;
  const rulerHeight = (from: number, to: number) =>
    `max(2px, ${(((to - from + 1) * geom().lineH) / geom().span) * 100}%)`;

  const selectionBand = () => {
    const s = props.targetStartLine();
    const e = props.targetEndLine();
    if (typeof s !== "number" || typeof e !== "number") return null;
    // Only useful when more than the selection is on screen.
    if (s <= props.displayStartLine() && e >= props.displayEndLine()) return null;
    return { s: Math.max(s, props.displayStartLine()), e: Math.min(e, props.displayEndLine()) };
  };

  const hasSymbols = () => getEffectiveChildren(props.fileNode()).length > 0;

  const hitIndex = () => {
    const o = props.overlay();
    if (!o || o.cursorLine === null) return null;
    const i = o.hits.findIndex((h) => h.line === o.cursorLine);
    return i < 0 ? null : i + 1;
  };

  const rangeLabel = () => {
    const total = props.totalLines();
    if (!total) return "";
    const s = props.displayStartLine();
    const e = props.displayEndLine();
    return s <= 1 && e >= total ? `${total.toLocaleString()} lines` : `${s}–${e} of ${total.toLocaleString()}`;
  };

  return (
    <div class="flex h-full min-h-0 gap-1">
      <div class="min-w-0 flex-1 overflow-auto rounded-lg border border-[var(--plc-border)] bg-[var(--plc-code-bg)]" ref={(el) => (scrollRef = el)}>
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
            leading={
              <OutlinePopover
                root={props.fileNode}
                activeNode={props.selectedScopeNode}
                baseName={props.baseName}
                isOpen={props.outlineOpen()}
                onOpenChange={props.setOutlineOpen}
                onSelect={props.onSelectScope}
                trigger={(t) => (
                  <button
                    type="button"
                    ref={t.ref}
                    onClick={t.onClick}
                    disabled={!hasSymbols()}
                    title={hasSymbols() ? "Outline: go to symbol (/)" : "No symbols in this file"}
                    aria-label="Outline"
                    class={cx(
                      "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium transition-colors duration-150 disabled:opacity-40",
                      t.isOpen
                        ? "bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]"
                        : "text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]"
                    )}
                  >
                    <ListTree size={15} aria-hidden="true" />
                  </button>
                )}
              />
            }
            trailing={
              <div class="flex shrink-0 items-center gap-2 pl-2 text-[12px]">
                <Show when={props.overlay()}>
                  {(o) => (
                    <div class="flex items-center gap-0.5">
                      <span class="pr-1 font-medium text-[var(--plc-on-surface)] max-xl:hidden">{o().label}</span>
                      <IconButton label="Previous ([)" size="xs" disabled={!o().hits.length} onClick={() => props.onStep(-1)}>
                        <ChevronLeft size={14} aria-hidden="true" />
                      </IconButton>
                      <span class="min-w-[3.25rem] text-center tabular-nums text-[var(--plc-on-muted)]">
                        {!o().hits.length
                          ? "none here"
                          : hitIndex() === null
                            ? `${o().hits.length} here`
                            : `${hitIndex()} / ${o().hits.length}`}
                      </span>
                      <IconButton label="Next (])" size="xs" disabled={!o().hits.length} onClick={() => props.onStep(1)}>
                        <ChevronRight size={14} aria-hidden="true" />
                      </IconButton>
                      <Show when={o().outside > 0}>
                        <button
                          type="button"
                          class="px-1 text-[var(--plc-accent)] transition-colors duration-150 hover:text-[var(--plc-accent-hover)]"
                          onClick={props.onShowWholeFile}
                          title="Show the whole file"
                        >
                          +{o().outside} in file
                        </button>
                      </Show>
                      <IconButton label="Clear overlay (Esc)" size="xs" onClick={props.onClearOverlay}>
                        <X size={13} aria-hidden="true" />
                      </IconButton>
                    </div>
                  )}
                </Show>
                <span class={cx("tabular-nums text-[var(--plc-on-subtle)]", props.overlay() && "max-xl:hidden")}>{rangeLabel()}</span>
              </div>
            }
          />
        </div>
        <Show
          when={props.loading() || (!props.highlightedHtml() && !props.error())}
        >
          <LoadingState label="Loading file…" />
        </Show>
        <Show when={!props.loading() && props.error()}>
          <ErrorState message={props.error()} class="min-h-32" />
        </Show>
        <Show when={showCode()}>
          <div
            ref={(el) => (codeRef = el)}
            class="code-modal-content pb-2 pt-1"
            data-tone={props.overlay()?.tone ?? undefined}
            innerHTML={props.highlightedHtml()}
          />
        </Show>
      </div>

      {/* Overview ruler: where the overlaid hits and the selection sit in the shown lines. */}
      <div
        class={cx(
          "relative mb-px w-2.5 shrink-0 rounded-sm transition-colors duration-150",
          props.overlay() || selectionBand() ? "bg-[var(--plc-surface-muted)]" : "bg-transparent"
        )}
        style={{ "margin-top": `${geom().header + 1}px` }}
        aria-hidden="true"
      >
        <Show when={selectionBand()}>
          {(b) => (
            <div
              class="absolute inset-x-0 bg-[var(--plc-accent-border)]"
              style={{ top: rulerTop(b().s), height: rulerHeight(b().s, b().e) }}
            />
          )}
        </Show>
        <Show when={props.overlay()}>
          {(o) => (
            <For each={o().hits}>
              {(hit) => (
                <button
                  type="button"
                  tabIndex={-1}
                  title={`Line ${hit.line}${hit.notes.length ? `: ${hit.notes.join(", ")}` : ""}`}
                  onClick={() => props.onJumpToHit(hit.line)}
                  class={cx(
                    "absolute inset-x-0 transition-opacity duration-150",
                    o().tone === "good" ? "bg-[var(--plc-accent)]" : "bg-[var(--plc-warning)]",
                    hit.line === o().cursorLine ? "opacity-100 ring-1 ring-[var(--plc-on-surface)]" : "opacity-60 hover:opacity-100"
                  )}
                  style={{ top: rulerTop(hit.line), height: rulerHeight(hit.line, hit.endLine) }}
                />
              )}
            </For>
          )}
        </Show>
      </div>
    </div>
  );
}
