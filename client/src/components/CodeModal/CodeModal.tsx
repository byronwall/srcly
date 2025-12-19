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
  const [lineFilterEnabled, setLineFilterEnabled] = createSignal(false);
  const [lineOffset, setLineOffset] = createSignal(4);
  const [reduceIndentation, setReduceIndentation] = createSignal(true);
  const [viewMode, setViewMode] = createSignal<"code" | "preview">("code");

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
  } = useHighlightedCode({
    rawCode,
    filePath: () => props.filePath,
    lineFilterEnabled,
    lineOffset,
    targetStart: targetStartLine,
    targetEnd: targetEndLine,
    reduceIndentation,
  });

  createEffect(() => {
    setTargetStartLine(props.startLine ?? null);
    setTargetEndLine(props.endLine ?? null);
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

  return (
    // Keyed so switching `filePath` remounts the modal content and avoids a one-frame
    // flash of stale highlighted HTML before the async loaders reset state.
    <Show when={props.isOpen && props.filePath} keyed>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={() => props.onClose()}
      >
        <div
          class="flex h-[80vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#1e1e1e] shadow-2xl"
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
          />

          <main class="relative flex-1 overflow-hidden flex bg-[#1e1e1e]">
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
                  setTargetStartLine(null);
                  setTargetEndLine(null);
                  setLineFilterEnabled(false);
                } else {
                  setTargetStartLine(node.start_line);
                  setTargetEndLine(node.end_line);
                  setLineFilterEnabled(true);
                }
                resetAutoScroll();
              }}
              onSelectNode={(n) => {
                setTargetStartLine(n.start_line);
                setTargetEndLine(n.end_line);
                setLineFilterEnabled(true);
                resetAutoScroll();
              }}
            />

            <div class="flex-1 overflow-auto p-4" ref={contentScrollRef}>
              <Show
                when={viewMode() === "preview"}
                fallback={
                  <CodePane
                    loading={loading}
                    error={error}
                    highlightedHtml={highlightedHtml}
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
