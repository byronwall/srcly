import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { useAutoScrollSelection } from "../../hooks/useAutoScrollSelection";
import { useFileContent } from "../../hooks/useFileContent";
import { useHighlightedCode } from "../../hooks/useHighlightedCode";
import { useMetricMarkers } from "../../hooks/useMetricMarkers";
import { guessLangFromPath } from "../../utils/guessLangFromPath";
import { getEffectiveChildren } from "../../utils/structureTree";
import { groupHits, hasMarkers, hitsInRange, markersFor, stepHit } from "../../utils/metricMarkers";
import { metricDef } from "../../utils/metricsStore";
import { CodeModalHeader } from "./CodeModalHeader";
import { CodePane, type CodeOverlay } from "./CodePane";
import { DialogShell } from "../dialog/DialogShell";
import { MarkdownPane } from "./MarkdownPane";
import { MetricsSidebar } from "./MetricsSidebar";
import { InspectMenu } from "./InspectMenu";
import { ValueFlowLedger } from "./ValueFlowLedger";
import { createValueFlowInspector } from "../../investigation/valueFlowInspector";
import { caretColumn, caretOffsetIn } from "../../investigation/selectionSpan";

interface CodeModalProps {
  isOpen: boolean;
  filePath: string | null;
  startLine?: number | null;
  endLine?: number | null;
  onClose: () => void;
  fileNode?: any;
  scopeNode?: any;
  /** Read the file from this git commit (compare mode) instead of the disk. */
  gitRef?: string | null;
  /** The scanned root, so the header can show a repo-relative path. */
  rootPath?: string;
}

const coerceLine = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function CodeModal(props: CodeModalProps) {
  const [targetStartLine, setTargetStartLine] = createSignal<number | null>(
    props.startLine ?? null
  );
  const [targetEndLine, setTargetEndLine] = createSignal<number | null>(
    props.endLine ?? null
  );
  const [selectedScopeNode, setSelectedScopeNode] = createSignal<any | null>(
    null
  );
  const [lineFilterEnabled, setLineFilterEnabled] = createSignal(false);
  const [lineOffset, setLineOffset] = createSignal(4);
  const [reduceIndentation, setReduceIndentation] = createSignal(true);
  const [viewMode, setViewMode] = createSignal<"code" | "preview">("code");
  const [outlineOpen, setOutlineOpen] = createSignal(false);
  const [activeMetric, setActiveMetric] = createSignal<string | null>(null);
  const [cursorLine, setCursorLine] = createSignal<number | null>(null);

  let contentScrollRef: HTMLDivElement | undefined;
  const contentContainerEl = () => contentScrollRef;

  const { rawCode, loading, error, totalLines } = useFileContent({
    isOpen: () => props.isOpen,
    filePath: () => props.filePath,
    gitRef: () => props.gitRef,
  });

  const markers = useMetricMarkers({
    filePath: () => (props.isOpen ? props.filePath : null),
    gitRef: () => props.gitRef,
  });

  const {
    highlightedHtml,
    displayStartLine,
    displayEndLine,
    highlightError,
  } = useHighlightedCode({
    rawCode,
    filePath: () => props.filePath,
    lineFilterEnabled,
    lineOffset,
    targetStart: targetStartLine,
    targetEnd: targetEndLine,
    reduceIndentation,
  });

  // Sync internal selection state from external props (treemap/graph selection).
  // Important: do this in an effect so we don't reset selection on every render.
  createEffect(() => {
    // Track the file too, so reopening a different file with the same
    // line range still resets the selection.
    void props.filePath;
    void props.fileNode;
    const s = props.startLine ?? null;
    const e = props.endLine ?? null;
    const scope = props.scopeNode ?? null;

    setTargetStartLine(s);
    setTargetEndLine(e);
    setSelectedScopeNode(scope);
  });

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

    if (guessLangFromPath(props.filePath) === "md") {
      setViewMode("preview");
    } else {
      setViewMode("code");
    }
  });

  const hasSelection = () =>
    lineFilterEnabled() &&
    typeof targetStartLine() === "number" &&
    typeof targetEndLine() === "number";

  const { resetAutoScroll } = useAutoScrollSelection({
    isOpen: () => props.isOpen,
    viewMode,
    hasSelection,
    loading,
    contentContainerEl,
    contentKey: () => rawCode(),
  });

  const displayStart = () => displayStartLine() ?? 1;
  const displayEnd = () => displayEndLine() ?? totalLines() ?? 1;

  /** Scroll a file line to the middle of the code view and flash it. */
  const scrollToLine = (line: number, flash = true) => {
    const container = contentScrollRef;
    if (!container) return;
    const lineEls = container.querySelectorAll<HTMLElement>("span.line");
    const el = lineEls[line - displayStart()];
    if (!el) return;
    // Stepping between hits glides; a re-sliced view just lands.
    el.scrollIntoView({ block: "center", behavior: flash ? "smooth" : "auto" });
    if (flash) {
      el.classList.remove("line-flash");
      void el.offsetWidth; // restart the animation
      el.classList.add("line-flash");
    }
  };

  // Lines to bring into view once the next highlight lands (a new slice
  // re-renders asynchronously in the worker).
  let pendingScroll: { line: number; flash: boolean } | null = null;
  const scrollAfterRender = (line: number, flash = false) => {
    const target = { line, flash };
    pendingScroll = target;
    // An unchanged slice never re-renders; scroll anyway.
    setTimeout(() => {
      if (pendingScroll !== target) return;
      pendingScroll = null;
      scrollToLine(line, flash);
    }, 400);
  };
  createEffect(
    on(highlightedHtml, () => {
      const target = pendingScroll;
      if (!target) return;
      pendingScroll = null;
      queueMicrotask(() => scrollToLine(target.line, target.flash));
    })
  );

  /** Selection ↔ whole file, keeping the selected scope (or the cursor hit) in view. */
  const setShowSelection = (next: boolean) => {
    const anchor = cursorLine() ?? targetStartLine();
    if (anchor !== null) scrollAfterRender(anchor);
    setLineFilterEnabled(next);
  };

  // --- Metric overlay ---------------------------------------------------

  // --- Value flow (right-click → Inspect value flow) ----------------------

  const inspector = createValueFlowInspector({
    root: () => (props.gitRef ? undefined : props.rootPath),
    file: () => props.filePath,
  });
  /** The ledger's rows are marked through the metric overlay while this is on. */
  const [ledgerMarked, setLedgerMarked] = createSignal(false);
  const ledgerRows = createMemo(() => {
    const state = inspector.ledger();
    return state?.phase === "done" ? state.ledger.rows.filter((row) => row.absPath === props.filePath) : [];
  });
  createEffect(
    on(inspector.ledger, (state) => {
      if (state?.phase !== "done") return;
      setActiveMetric(null);
      setLedgerMarked(true);
      const first = ledgerRows()[0];
      if (first) jumpToLedgerRow(first.line);
    })
  );

  const onCodeContextMenu = (event: MouseEvent) => {
    if (viewMode() !== "code" || props.gitRef || !props.rootPath || !contentScrollRef) return;
    const lineEl = event.target instanceof Element ? event.target.closest<HTMLElement>("span.line") : null;
    if (!lineEl) return;
    const index = [...contentScrollRef.querySelectorAll<HTMLElement>("span.line")].indexOf(lineEl);
    if (index < 0) return;
    const line = displayStart() + index;
    const raw = (rawCode() ?? "").split("\n")[line - 1] ?? "";
    const offset = caretOffsetIn(lineEl, event.clientX, event.clientY);
    const column = (offset !== null ? caretColumn(raw, lineEl.textContent ?? "", offset) : null) ?? raw.length - raw.trimStart().length + 1;
    event.preventDefault();
    inspector.openMenu({ x: event.clientX, y: event.clientY, line, column });
  };

  const KIND_WORD: Record<string, string> = { input: "Input", transfer: "Transfer", fallback: "Fallback", branch: "Branch", transform: "Transform", terminal: "Terminal", boundary: "Boundary" };
  const ledgerHits = createMemo(() =>
    groupHits(ledgerRows().map((row) => ({ line: row.span.startLine, end_line: row.span.endLine, note: `${KIND_WORD[row.kind]} (${row.status}): ${row.note ?? row.label}` })))
  );
  const showLedger = () => ledgerMarked() && !activeMetric() && ledgerRows().length > 0;

  const allHits = createMemo(() => (showLedger() ? ledgerHits() : groupHits(markersFor(markers(), activeMetric() ?? ""))));
  const visibleHits = createMemo(() => hitsInRange(allHits(), displayStart(), displayEnd()));

  const overlay = createMemo<CodeOverlay | null>(() => {
    if (showLedger()) {
      return { label: "Value flow", tone: "good", hits: visibleHits(), outside: allHits().length - visibleHits().length, cursorLine: cursorLine() };
    }
    const id = activeMetric();
    if (!id) return null;
    const def = metricDef(id);
    return {
      label: def?.viewer_label ?? def?.label ?? id,
      tone: "hot",
      hits: visibleHits(),
      outside: allHits().length - visibleHits().length,
      cursorLine: cursorLine(),
    };
  });

  const goToHit = (line: number) => {
    setCursorLine(line);
    scrollToLine(line);
  };

  const step = (direction: 1 | -1) => {
    const next = stepHit(visibleHits(), cursorLine(), direction);
    if (next) goToHit(next.line);
  };

  /** From the findings list: mark every finding and put the cursor on this one. */
  const jumpToFinding = (line: number) => {
    setViewMode("code");
    if (line < displayStart() || line > displayEnd()) setLineFilterEnabled(false);
    if (activeMetric() !== "finding_count") setActiveMetric("finding_count");
    // After the metric effect lands on the first hit, move to this one.
    queueMicrotask(() => {
      setCursorLine(line);
      scrollAfterRender(line, true);
    });
  };

  /** From the ledger: go to a row's line, keeping the ledger's marks. */
  const jumpToLedgerRow = (line: number) => {
    setViewMode("code");
    if (line < displayStart() || line > displayEnd()) setLineFilterEnabled(false);
    queueMicrotask(() => {
      setCursorLine(line);
      scrollAfterRender(line, true);
    });
  };

  const toggleMetric = (id: string) => {
    setLedgerMarked(false);
    setViewMode("code");
    setCursorLine(null);
    setActiveMetric(activeMetric() === id ? null : id);
  };

  // Picking a metric lands on its first hit once the lines are marked.
  createEffect(
    on(activeMetric, (id) => {
      if (!id) return;
      queueMicrotask(() => {
        const first = visibleHits()[0];
        if (first) goToHit(first.line);
      });
    })
  );

  // A new slice (scope change, whole file) drops a cursor it no longer shows.
  createEffect(
    on(visibleHits, (hits) => {
      const c = cursorLine();
      if (c !== null && !hits.some((h) => h.line === c)) setCursorLine(null);
    })
  );

  // --- Keyboard -----------------------------------------------------------

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!props.isOpen) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      if (activeMetric()) setActiveMetric(null);
      else if (showLedger()) setLedgerMarked(false);
      else props.onClose();
      return;
    }
    if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "/" && getEffectiveChildren(props.fileNode).length && viewMode() === "code") {
      event.preventDefault();
      setOutlineOpen(true);
    } else if ((event.key === "]" || event.key === "[") && (activeMetric() || showLedger())) {
      event.preventDefault();
      step(event.key === "]" ? 1 : -1);
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  // --- Selection ------------------------------------------------------------

  const applySelectionFromNode = (node: any) => {
    const s = coerceLine(node?.start_line);
    const e = coerceLine(node?.end_line);
    if (s === null || e === null) return;
    setTargetStartLine(s);
    setTargetEndLine(e);
    setLineFilterEnabled(true);
    setSelectedScopeNode(node);
  };

  const clearSelection = () => {
    setTargetStartLine(null);
    setTargetEndLine(null);
    setLineFilterEnabled(false);
    setSelectedScopeNode(null);
  };

  const selectScope = (node: any | null) => {
    resetAutoScroll();
    if (!node) {
      clearSelection();
      scrollAfterRender(1);
      return;
    }
    applySelectionFromNode(node);
    const s = coerceLine(node?.start_line);
    if (s !== null) scrollAfterRender(s);
  };

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

  return (
    // Keyed so switching `filePath` remounts the modal content and avoids a one-frame
    // flash of stale highlighted HTML before the async loaders reset state.
    <Show when={props.isOpen && props.filePath} keyed>
      <DialogShell
        open={Boolean(props.isOpen && props.filePath)}
        onClose={props.onClose}
        size="xl"
      >
          <CodeModalHeader
            filePath={props.filePath!}
            rootPath={props.rootPath}
            baseName={baseName()}
            onClose={props.onClose}
            rawCode={rawCode}
            hasLineRange={hasLineRange}
            isMarkdown={() => guessLangFromPath(props.filePath!) === "md"}
            viewMode={viewMode}
            setViewMode={setViewMode}
            reduceIndentation={reduceIndentation}
            setReduceIndentation={setReduceIndentation}
            lineFilterEnabled={lineFilterEnabled}
            setLineFilterEnabled={setShowSelection}
            lineOffset={lineOffset}
            setLineOffset={(n) => setLineOffset(Math.max(0, Math.floor(n)))}
          />

          <main class="relative flex flex-1 overflow-hidden bg-[var(--plc-surface)]">
            <MetricsSidebar
              fileNode={props.fileNode}
              scopeNode={selectedScopeNode()}
              scopeName={() => selectedScopeNode()?.name ?? null}
              canLocate={(id) => hasMarkers(markers(), id)}
              activeMetric={activeMetric}
              onToggleMetric={toggleMetric}
              onSelectNode={selectScope}
              filePath={props.filePath}
              gitRef={props.gitRef}
              onJumpToFinding={jumpToFinding}
              ledger={
                <Show when={inspector.ledger()}>
                  {(state) => (
                    <ValueFlowLedger
                      state={state()}
                      filePath={props.filePath}
                      marked={showLedger()}
                      onToggleMarks={() => {
                        if (showLedger()) setLedgerMarked(false);
                        else {
                          setActiveMetric(null);
                          setLedgerMarked(true);
                        }
                      }}
                      onJump={jumpToLedgerRow}
                      onClose={() => {
                        inspector.clear();
                        setLedgerMarked(false);
                      }}
                    />
                  )}
                </Show>
              }
            />

            <div
              class="min-h-0 flex-1 bg-[var(--plc-surface-inset,var(--plc-surface-subtle))] p-2"
              classList={{
                "overflow-auto": viewMode() === "preview",
                "overflow-hidden": viewMode() !== "preview",
              }}
              ref={contentScrollRef}
              onContextMenu={onCodeContextMenu}
            >
              <Show
                when={viewMode() === "preview"}
                fallback={
                  <CodePane
                    loading={loading}
                    error={() => error() ?? highlightError()}
                    highlightedHtml={highlightedHtml}
                    filePath={() => props.filePath}
                    baseName={baseName()}
                    fileNode={() => props.fileNode ?? null}
                    selectedScopeNode={selectedScopeNode}
                    onSelectScope={selectScope}
                    displayStartLine={displayStart}
                    displayEndLine={displayEnd}
                    totalLines={totalLines}
                    targetStartLine={targetStartLine}
                    targetEndLine={targetEndLine}
                    outlineOpen={outlineOpen}
                    setOutlineOpen={setOutlineOpen}
                    overlay={overlay}
                    onStep={step}
                    onJumpToHit={goToHit}
                    onClearOverlay={() => {
                      setActiveMetric(null);
                      setLedgerMarked(false);
                    }}
                    onShowWholeFile={() => setShowSelection(false)}
                  />
                }
              >
                <MarkdownPane
                  rawCode={rawCode}
                  filePath={() => props.filePath}
                  lineFilterEnabled={lineFilterEnabled}
                  targetStartLine={targetStartLine}
                  targetEndLine={targetEndLine}
                />
              </Show>
            </div>
          </main>
          <InspectMenu inspector={inspector} />
      </DialogShell>
    </Show>
  );
}
