import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useAutoScrollSelection } from "../../hooks/useAutoScrollSelection";
import { useFileContent } from "../../hooks/useFileContent";
import { useHighlightedCode } from "../../hooks/useHighlightedCode";
import { guessLangFromPath } from "../../utils/guessLangFromPath";
import {
  computeBreadcrumbPath,
  getActiveStructureNode,
  getEffectiveChildren,
  isSyntheticBodyNode,
} from "../../utils/structureTree";
import { CodeModalHeader } from "./CodeModalHeader";
import { CodePane } from "./CodePane";
import { MarkdownPane } from "./MarkdownPane";
import { MetricsSidebar } from "./MetricsSidebar";

interface CodeModalProps {
  isOpen: boolean;
  filePath: string | null;
  startLine?: number | null;
  endLine?: number | null;
  onClose: () => void;
  fileNode?: any;
  scopeNode?: any;
}

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
  const [dataFlowEnabled, setDataFlowEnabled] = createSignal(true);
  const [scopeMaximized, setScopeMaximized] = createSignal(false);

  let contentScrollRef: HTMLDivElement | undefined;
  const contentContainerEl = () => contentScrollRef;

  const { rawCode, loading, error, totalLines } = useFileContent({
    isOpen: () => props.isOpen,
    filePath: () => props.filePath,
  });

  const {
    highlightedHtml,
    displayStartLine,
    displayEndLine,
    wasIndentationReduced,
    removedIndentByLine,
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
    // Touch dependencies
    const fp = props.filePath;
    const s = props.startLine ?? null;
    const e = props.endLine ?? null;
    const scope = props.scopeNode ?? null;
    const file = props.fileNode ?? null;

    setTargetStartLine(s);
    setTargetEndLine(e);
    setSelectedScopeNode(scope);

    // eslint-disable-next-line no-console
    console.log("[CodeModal] props sync", {
      filePath: fp,
      startLine: s,
      endLine: e,
      scopeNode: scope ? { name: scope?.name, type: scope?.type } : null,
      fileNode: file ? { name: file?.name, type: file?.type } : null,
    });
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

  const handleJumpToLine = (target: {
    start?: number;
    end?: number;
    scrollTarget?: number;
  }) => {
    if (typeof target.start === "number" && typeof target.end === "number") {
      setTargetStartLine(target.start);
      setTargetEndLine(target.end);
      setLineFilterEnabled(true);
    }

    // Wait for the new code to be rendered, then scroll to the specific line.
    const scrollTarget = target.scrollTarget;
    if (typeof scrollTarget === "number") {
      setTimeout(() => {
        const container = contentScrollRef;
        if (!container) return;

        // Find the line element or a marker for that line.
        // In Shiki, we can look for line content or use line index if we know the display range.
        const displaySlice = effectiveDisplayRange();
        if (!displaySlice) return;

        const lineIndex = scrollTarget - displaySlice.start + 1;
        const lineEls = container.querySelectorAll(".line");
        const targetEl = lineEls[lineIndex - 1] as HTMLElement | null;

        if (targetEl) {
          targetEl.scrollIntoView({ block: "center", behavior: "smooth" });
          // Highlight it briefly
          targetEl.style.transition = "background-color 500ms";
          targetEl.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
          setTimeout(() => {
            targetEl.style.backgroundColor = "";
          }, 2000);
        }
      }, 100);
    }
  };

  const coerceLine = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const applySelectionFromNode = (node: any) => {
    const s = coerceLine(node?.start_line);
    const e = coerceLine(node?.end_line);
    if (s === null || e === null) return;
    setTargetStartLine(s);
    setTargetEndLine(e);
    setLineFilterEnabled(true);
    setSelectedScopeNode(node);

    // eslint-disable-next-line no-console
    console.log("[breadcrumb] applySelectionFromNode", {
      file: props.filePath ?? null,
      node: {
        name: node?.name ?? null,
        type: node?.type ?? null,
        start_line: node?.start_line ?? null,
        end_line: node?.end_line ?? null,
      },
      coerced: { start: s, end: e },
    });
  };

  const clearSelection = () => {
    setTargetStartLine(null);
    setTargetEndLine(null);
    setLineFilterEnabled(false);
    setSelectedScopeNode(null);
    // eslint-disable-next-line no-console
    console.log("[breadcrumb] clearSelection");
  };

  const handleSelectScopeFromBreadcrumb = (node: any | null) => {
    if (!node) {
      clearSelection();
      // Scroll to top after re-render.
      handleJumpToLine({ scrollTarget: 1 });
      return;
    }

    applySelectionFromNode(node);
    const s = coerceLine(node?.start_line) ?? 1;
    // Ensure we both select the scope range and scroll to its start.
    handleJumpToLine({
      start: coerceLine(node?.start_line) ?? undefined,
      end: coerceLine(node?.end_line) ?? undefined,
      scrollTarget: s,
    });
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

  const effectiveDisplayRange = () => {
    if (!totalLines()) return null;
    return {
      start: displayStartLine() ?? 1,
      end: displayEndLine() ?? totalLines()!,
      total: totalLines()!,
    };
  };

  const rangeLabel = () => {
    const range = effectiveDisplayRange();
    if (!range || !hasLineRange()) return null;
    return lineFilterEnabled()
      ? `Showing lines ${range.start}-${range.end} of ${range.total}`
      : `Showing full file (${
          range.total
        } lines), selection ${targetStartLine()}-${targetEndLine()}`;
  };

  const breadcrumbPath = () => {
    const root = props.fileNode;
    if (!root) return [];

    const s = targetStartLine();
    const e = targetEndLine();
    const selection =
      s === null || e === null
        ? null
        : { start: s as number, end: e as number };
    return computeBreadcrumbPath(root, selection);
  };

  const activeStructureNode = () =>
    getActiveStructureNode(breadcrumbPath(), props.scopeNode || props.fileNode);

  createEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[breadcrumb] modal state", {
      isOpen: props.isOpen,
      filePath: props.filePath ?? null,
      fileNode: props.fileNode
        ? { name: props.fileNode?.name, type: props.fileNode?.type }
        : null,
      scopeNode: props.scopeNode
        ? { name: props.scopeNode?.name, type: props.scopeNode?.type }
        : null,
      target: { start: targetStartLine(), end: targetEndLine() },
      lineFilterEnabled: lineFilterEnabled(),
      viewMode: viewMode(),
    });
  });

  return (
    // Keyed so switching `filePath` remounts the modal content and avoids a one-frame
    // flash of stale highlighted HTML before the async loaders reset state.
    <Show when={props.isOpen && props.filePath} keyed>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={() => props.onClose()}
      >
        <div
          class="flex h-[92vh] w-[96vw] max-w-[1600px] flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#1e1e1e] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CodeModalHeader
            filePath={props.filePath!}
            baseName={baseName()}
            onClose={props.onClose}
            rawCode={rawCode}
            hasLineRange={hasLineRange}
            rangeLabel={rangeLabel}
            isMarkdown={() => guessLangFromPath(props.filePath!) === "md"}
            viewMode={viewMode}
            setViewMode={setViewMode}
            wasIndentationReduced={wasIndentationReduced}
            reduceIndentation={reduceIndentation}
            setReduceIndentation={setReduceIndentation}
            lineFilterEnabled={lineFilterEnabled}
            setLineFilterEnabled={setLineFilterEnabled}
            lineOffset={lineOffset}
            setLineOffset={(n) => setLineOffset(Math.max(0, Math.floor(n)))}
            dataFlowEnabled={dataFlowEnabled}
            setDataFlowEnabled={setDataFlowEnabled}
          />

          <main class="relative flex-1 overflow-hidden flex bg-[#1e1e1e]">
            <Show when={!scopeMaximized()}>
              <MetricsSidebar
                fileNode={props.fileNode}
                scopeNode={props.scopeNode}
                baseName={baseName}
                breadcrumbPath={breadcrumbPath}
                activeStructureNode={activeStructureNode}
                getChildren={getEffectiveChildren}
                isHidden={isSyntheticBodyNode}
                onSelectBreadcrumbIndex={(index, node) => {
                  if (index === 0) {
                    clearSelection();
                  } else {
                    applySelectionFromNode(node);
                  }
                  resetAutoScroll();
                }}
                onSelectNode={(n) => {
                  applySelectionFromNode(n);
                  resetAutoScroll();
                }}
              />
            </Show>

            <div
              class="flex-1 min-h-0 p-4"
              classList={{
                "overflow-auto": viewMode() === "preview",
                "overflow-hidden": viewMode() !== "preview",
              }}
              ref={contentScrollRef}
            >
              <Show
                when={viewMode() === "preview"}
                fallback={
                  <CodePane
                    loading={loading}
                    error={error}
                    highlightedHtml={highlightedHtml}
                    filePath={() => props.filePath}
                    fileNode={() => props.fileNode ?? null}
                    selectedScopeNode={selectedScopeNode}
                    onSelectScope={handleSelectScopeFromBreadcrumb}
                    displayStartLine={() => displayStartLine() ?? 1}
                    targetStartLine={targetStartLine}
                    targetEndLine={targetEndLine}
                    removedIndentByLine={removedIndentByLine}
                    lineFilterEnabled={lineFilterEnabled}
                    dataFlowEnabled={dataFlowEnabled}
                    isScopeMaximized={scopeMaximized}
                    onToggleMaximizeScope={() =>
                      setScopeMaximized(!scopeMaximized())
                    }
                    onJumpToLine={handleJumpToLine}
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
        </div>
      </div>
    </Show>
  );
}
