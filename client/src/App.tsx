import {
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  createEffect,
} from "solid-js";
import Toast from "./components/Toast";

import CodeModal from "./components/CodeModal/CodeModal.tsx";
import Explorer from "./components/Explorer";
import { DialogHeader, DialogShell } from "./components/dialog/DialogShell";
import { ScanProgress } from "./components/feedback/ScanProgress";
import { EmptyState, ErrorState, LoadingState } from "./components/feedback/States";
import FilePicker from "./components/FilePicker";
import Treemap from "./components/Treemap";
import { Button } from "./components/ui/Button";
import {
  cancelScan,
  emptySnapshot,
  fetchScanResult,
  startScan,
  watchScan,
  type ScanSnapshot,
} from "./services/scanJobs";
import { filterTree } from "./utils/dataProcessing";
import { formatCount, formatDuration } from "./utils/scanProgress";
import { MetricsStoreProvider, useMetricsStore } from "./utils/metricsStore";

type AnalysisContext = {
  rootPath: string;
  fileCount: number;
  folderCount: number;
  repoRootPath?: string;
  repoFileCount?: number;
  repoFolderCount?: number;
};

// Helper to find nodes in the tree
function findNodes(
  root: any,
  filePath: string | null,
  lineRange: { start: number; end: number } | null
): { fileNode: any; scopeNode: any } {
  let fileNode: any = null;
  let scopeNode: any = null;

  if (!root || !filePath) return { fileNode, scopeNode };

  const visit = (node: any) => {
    if (fileNode && scopeNode) return; // Found both

    // Check if this is the file
    // The path in `node.path` might be absolute or relative, but `filePath` from selection usually matches it
    // or we might need to be more fuzzy. For now assuming exact or endsWith match if consistent.
    if (!fileNode && node.type === "file" && node.path === filePath) {
      fileNode = node;
    }

    // Check if this is a scope within the file
    if (
      lineRange &&
      fileNode &&
      node.path === filePath &&
      node.start_line === lineRange.start &&
      node.end_line === lineRange.end
    ) {
      scopeNode = node;
    }

    // Also checking children for scope if we already found the file
    // Scopes are children of the file node
    if (node.children) {
      // If we found the file, we only need to look inside it for the scope
      if (fileNode && !scopeNode && node === fileNode) {
        const findScope = (n: any) => {
          if (
            n.start_line === lineRange?.start &&
            n.end_line === lineRange?.end
          ) {
            scopeNode = n;
            return;
          }
          if (n.children) n.children.forEach(findScope);
        };
        node.children.forEach(findScope);
      } else {
        node.children.forEach(visit);
      }
    }
  };

  visit(root);
  return { fileNode, scopeNode };
}

function AnalyzeTarget(props: {
  label: string;
  path: string;
  files: number;
  folders: number;
  primary?: boolean;
  onAnalyze: () => void;
}) {
  return (
    <div class="plc-panel flex items-center gap-4 border p-3">
      <div class="min-w-0 flex-1">
        <div class="plc-label-sm text-[var(--plc-on-subtle)]">{props.label}</div>
        <p class="plc-data-md mt-1 break-all text-[var(--plc-on-surface)]">{props.path}</p>
        <p class="mt-1 text-xs text-[var(--plc-on-subtle)]">
          About {formatCount(props.files)} files in {formatCount(props.folders)} folders
        </p>
      </div>
      <Button
        variant={props.primary ? "primary" : "default"}
        size="md"
        class="shrink-0"
        onClick={() => props.onAnalyze()}
      >
        Analyze
      </Button>
    </div>
  );
}

// Temporary wrapper to allow passing additional props to FilePicker
const FilePickerWithExternal = FilePicker as any;

function App() {
  return (
    <MetricsStoreProvider>
      <AppContent />
    </MetricsStoreProvider>
  );
}

function AppContent() {
  const [visualizationData, setVisualizationData] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [toastMessage, setToastMessage] = createSignal<string>("");
  const [toastType, setToastType] = createSignal<"success" | "error">(
    "success"
  );
  const [showToast, setShowToast] = createSignal(false);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string | null>(
    null
  );
  const [explicitScopeNode, setExplicitScopeNode] = createSignal<any>(null);
  const [selectedLineRange, setSelectedLineRange] = createSignal<{
    start: number;
    end: number;
  } | null>(null);
  const [isCodeModalOpen, setIsCodeModalOpen] = createSignal(false);
  const [analysisContext, setAnalysisContext] =
    createSignal<AnalysisContext | null>(null);
  const [contextLoading, setContextLoading] = createSignal(false);
  const [filterQuery, setFilterQuery] = createSignal("");
  const [currentRoot, setCurrentRoot] = createSignal<any>(null);
  const { excludedPaths } = useMetricsStore();
  // Half the viewport at most, so narrow windows keep room for the treemap.
  const [explorerWidth, setExplorerWidth] = createSignal(
    Math.min(280, Math.round(window.innerWidth * 0.5))
  );
  const [isDragging, setIsDragging] = createSignal(false);
  const [analysisPath, setAnalysisPath] = createSignal("");
  const [scan, setScan] = createSignal<ScanSnapshot | null>(null);
  const [cancelling, setCancelling] = createSignal(false);
  // Identifies the newest analysis request so late responses from a
  // superseded scan are ignored.
  let activeRequest = 0;
  let stopWatching: (() => void) | null = null;
  onCleanup(() => stopWatching?.());

  // Reset current root when data changes
  createEffect(() => {
    if (visualizationData()) {
      setCurrentRoot(visualizationData());
    }
  });

  onMount(async () => {
    setContextLoading(true);
    try {
      const res = await fetch("/api/analysis/context");
      if (res.ok) {
        const data = await res.json();
        setAnalysisContext({
          rootPath: data.root_path ?? data.rootPath ?? "",
          fileCount: data.file_count ?? data.fileCount ?? 0,
          folderCount: data.folder_count ?? data.folderCount ?? 0,
          repoRootPath: data.repo_root_path ?? data.repoRootPath ?? "",
          repoFileCount: data.repo_file_count ?? data.repoFileCount ?? 0,
          repoFolderCount: data.repo_folder_count ?? data.repoFolderCount ?? 0,
        });
      }
    } catch (err) {
      console.error("Failed to load analysis context", err);
    } finally {
      setContextLoading(false);
    }
  });

  const notify = (message: string, type: "success" | "error") => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(false);
    queueMicrotask(() => setShowToast(true));
  };

  const finishScan = async (request: number, snapshot: ScanSnapshot) => {
    if (request !== activeRequest) return;
    try {
      if (snapshot.phase === "complete") {
        const data = await fetchScanResult<any>(snapshot.id);
        if (request !== activeRequest) return;
        setVisualizationData(data);
        const skipped =
          snapshot.files_failed > 0
            ? ` (${formatCount(snapshot.files_failed)} skipped)`
            : "";
        notify(
          `Analyzed ${formatCount(snapshot.files_total)} files in ${formatDuration(snapshot.elapsed_seconds)}${skipped}`,
          "success"
        );
      } else if (snapshot.phase === "failed") {
        setError(snapshot.error || "The scan failed.");
      }
      // "cancelled" needs no message: the user asked for it.
    } catch (err) {
      if (request !== activeRequest) return;
      console.error(err);
      setError(String(err));
    } finally {
      if (request === activeRequest) {
        setLoading(false);
        setScan(null);
        setCancelling(false);
      }
    }
  };

  const handleFileSelect = async (path: string) => {
    const request = ++activeRequest;
    stopWatching?.();
    stopWatching = null;
    const previous = scan();
    if (previous) void cancelScan(previous.id);

    // Clear existing analysis data immediately so we don't show stale visuals
    setVisualizationData(null);
    setCurrentRoot(null);
    setLoading(true);
    setCancelling(false);
    setError(null);

    const trimmed = path?.trim() || null;
    setScan(emptySnapshot("", trimmed ?? analysisContext()?.rootPath ?? ""));
    try {
      const started = await startScan(trimmed);
      if (request !== activeRequest) {
        void cancelScan(started.id);
        return;
      }
      setScan(started);
      stopWatching = watchScan(started.id, {
        onUpdate: (snapshot) => {
          if (request === activeRequest) setScan(snapshot);
        },
        onDone: (snapshot) => void finishScan(request, snapshot),
      });
    } catch (err) {
      if (request !== activeRequest) return;
      console.error(err);
      setError(String(err instanceof Error ? err.message : err));
      setLoading(false);
      setScan(null);
    }
  };

  const handleCancelScan = () => {
    const current = scan();
    if (!current?.id) return;
    setCancelling(true);
    void cancelScan(current.id);
  };

  const handleFileFromTreemap = (
    path: string,
    startLine?: number,
    endLine?: number,
    node?: any
  ) => {
    setSelectedFilePath(path);
    if (
      typeof startLine === "number" &&
      typeof endLine === "number" &&
      startLine > 0 &&
      endLine >= startLine
    ) {
      setSelectedLineRange({ start: startLine, end: endLine });
    } else {
      setSelectedLineRange(null);
    }
    setExplicitScopeNode(node || null);
    setIsCodeModalOpen(true);
  };

  const processedData = createMemo(() => {
    const data = visualizationData();
    if (!data) return null;
    // Clone and filter
    const clone = JSON.parse(JSON.stringify(data));

    // Filter out hidden paths
    const hidden = excludedPaths();
    if (hidden.length > 0) {
      // Recursive filter function to remove hidden nodes
      const removeHidden = (node: any) => {
        if (!node.children) return;
        node.children = node.children.filter(
          (child: any) => !hidden.includes(child.path)
        );
        node.children.forEach(removeHidden);
      };
      removeHidden(clone);
    }

    return filterTree(clone, filterQuery());
  });

  const selectedNodes = createMemo(() => {
    if (explicitScopeNode()) {
      // If we have an explicit node, try to find the file node if possible, or just use what we have.
      // Usually explicitScopeNode IS the scope node.
      // We still need the file node for the modal to work well (breadcrumb root).
      // We can try to find the file node via path.
      const { fileNode } = findNodes(
        visualizationData(),
        selectedFilePath(),
        null // We don't need line range for file lookup if we trust the path
      );
      return { fileNode, scopeNode: explicitScopeNode() };
    }

    const res = findNodes(
      visualizationData(),
      selectedFilePath(),
      selectedLineRange()
    );
    return res;
  });

  return (
    <div class="plc-app-shell h-screen flex flex-col overflow-hidden">
      <header class="plc-topbar px-4 border-b flex items-center gap-4">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <h1 class="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--plc-primary)]">
            <img src="/favicon.svg" alt="" class="h-5 w-5" />
            Srcly
          </h1>
          <div class="w-full">
            <FilePickerWithExternal
              onSelect={handleFileSelect}
              externalPath={analysisPath()}
            />
          </div>
        </div>
        <Show when={!loading() && visualizationData()}>
          {(data) => (
            <div class="plc-data-sm hidden whitespace-nowrap text-[var(--plc-on-subtle)] md:block">
              {formatCount(data().metrics?.file_count ?? 0)} files ·{" "}
              {formatCount(data().metrics?.loc ?? 0)} LOC
            </div>
          )}
        </Show>
      </header>

      <main class="flex-1 relative overflow-hidden flex">
        <DialogShell
          open={Boolean(error())}
          onClose={() => setError(null)}
          size="md"
          class="border-[var(--plc-error-border)] bg-[var(--plc-error-subtle)] text-[var(--plc-error)]"
        >
          <DialogHeader
            title="Error"
            actions={
              <Button variant="danger" onClick={() => setError(null)}>
                Close
              </Button>
            }
          />
          <ErrorState
            message={error()}
            class="min-h-40 px-6 py-5"
            tone="error"
          />
        </DialogShell>

        <Show
          when={processedData()}
          fallback={
            <div class="h-full w-full">
              <Show
                when={loading()}
                fallback={
                  <>
                    <Show
                      when={analysisContext()}
                      fallback={
                        contextLoading() ? (
                          <LoadingState label="Loading current folder information..." />
                        ) : (
                          <EmptyState
                            title="No visualization data yet"
                            description="Enter a path above to visualize the codebase"
                          />
                        )
                      }
                    >
                      {(ctx) => {
                        const analyze = (target: string) => {
                          setAnalysisPath(target);
                          void handleFileSelect(target);
                        };
                        const showRepoRoot = () =>
                          Boolean(ctx().repoRootPath) &&
                          ctx().repoRootPath !== ctx().rootPath;
                        return (
                          <EmptyState
                            title="Map a codebase"
                            description="Srcly sizes every file and function by lines of code and colors it by the metric you choose. Pick a folder, or type any path above."
                            actions={
                              <div class="flex w-full max-w-xl flex-col gap-3 text-left">
                                <AnalyzeTarget
                                  label="Current directory"
                                  path={ctx().rootPath || "(unknown)"}
                                  files={ctx().fileCount}
                                  folders={ctx().folderCount}
                                  primary
                                  onAnalyze={() => analyze(ctx().rootPath || "")}
                                />
                                <Show when={showRepoRoot()}>
                                  <AnalyzeTarget
                                    label="Repository root"
                                    path={ctx().repoRootPath ?? ""}
                                    files={ctx().repoFileCount ?? 0}
                                    folders={ctx().repoFolderCount ?? 0}
                                    onAnalyze={() => analyze(ctx().repoRootPath ?? "")}
                                  />
                                </Show>
                              </div>
                            }
                          />
                        );
                      }}
                    </Show>
                  </>
                }
              >
                <Show
                  when={scan()}
                  fallback={<LoadingState label="Loading analysis…" />}
                >
                  {(snapshot) => (
                    <ScanProgress
                      snapshot={snapshot()}
                      onCancel={snapshot().id ? handleCancelScan : undefined}
                      cancelling={cancelling()}
                    />
                  )}
                </Show>
              </Show>
            </div>
          }
        >
          <div
            class="flex h-full w-full overflow-hidden"
            onMouseMove={(e) => {
              if (isDragging()) {
                const newWidth = e.clientX;
                if (newWidth > 160 && newWidth < window.innerWidth - 160) {
                  setExplorerWidth(newWidth);
                }
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div
              style={{ width: `${explorerWidth()}px` }}
              class="h-full shrink-0"
            >
              <Explorer
                data={currentRoot() || processedData()}
                fullData={processedData()}
                onFileSelect={handleFileFromTreemap}
                onZoom={setCurrentRoot}
                filter={filterQuery()}
                onFilterChange={setFilterQuery}
              />
            </div>

            {/* Drag Handle */}
            <div
              class="w-1 bg-[var(--plc-border)] hover:bg-[var(--plc-accent)] cursor-col-resize transition-colors z-10"
              onMouseDown={() => setIsDragging(true)}
            />

            <div class="flex-1 h-full overflow-hidden relative">
              <Treemap
                data={processedData()}
                currentRoot={currentRoot()}
                onZoom={setCurrentRoot}
                onFileSelect={handleFileFromTreemap}
              />
            </div>
          </div>
        </Show>
      </main>
      <Show when={showToast()}>
        <Toast message={toastMessage()} type={toastType()} duration={4000} />
      </Show>
      <CodeModal
        isOpen={isCodeModalOpen()}
        filePath={selectedFilePath()}
        startLine={selectedLineRange()?.start ?? null}
        endLine={selectedLineRange()?.end ?? null}
        onClose={() => setIsCodeModalOpen(false)}
        fileNode={selectedNodes().fileNode}
        scopeNode={selectedNodes().scopeNode}
      />
    </div>
  );
}

export default App;
