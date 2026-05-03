import {
  createMemo,
  createSignal,
  onMount,
  Show,
  createEffect,
} from "solid-js";
import Toast from "./components/Toast";

import CodeModal from "./components/CodeModal/CodeModal.tsx";
import Explorer from "./components/Explorer";
import { DialogHeader, DialogShell } from "./components/dialog/DialogShell";
import { EmptyState, ErrorState, LoadingState } from "./components/feedback/States";
import FilePicker from "./components/FilePicker";
import Treemap from "./components/Treemap";
import { Button } from "./components/ui/Button";
import { filterTree } from "./utils/dataProcessing";
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
  const [explorerWidth, setExplorerWidth] = createSignal(280);
  const [isDragging, setIsDragging] = createSignal(false);
  const [analysisPath, setAnalysisPath] = createSignal("");

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

  const handleFileSelect = async (path: string) => {
    // Clear existing analysis data immediately so we don't show stale visuals
    setVisualizationData(null);
    setCurrentRoot(null);
    setLoading(true);
    setError(null);
    try {
      const trimmed = path?.trim();
      const url =
        trimmed && trimmed.length > 0
          ? `/api/analysis?path=${encodeURIComponent(trimmed)}`
          : "/api/analysis";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch analysis: ${res.statusText}`);
      }
      const data = await res.json();
      setVisualizationData(data);
      setToastMessage("Analysis completed");
      setToastType("success");
      setShowToast(true);
    } catch (err) {
      console.error(err);
      setError(String(err));
      setToastMessage(String(err));
      setToastType("error");
      setShowToast(true);
    } finally {
      setLoading(false);
    }
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
    // eslint-disable-next-line no-console
    console.log("[App] handleFileFromTreemap", {
      path,
      startLine,
      endLine,
      node,
      explicit: node || null,
    });
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
      // eslint-disable-next-line no-console
      console.log("[App] selectedNodes explicit", {
        fileNode: fileNode?.name,
        scopeNode: explicitScopeNode()?.name,
      });
      return { fileNode, scopeNode: explicitScopeNode() };
    }

    const res = findNodes(
      visualizationData(),
      selectedFilePath(),
      selectedLineRange()
    );
    // eslint-disable-next-line no-console
    console.log("[App] selectedNodes filtered", {
      path: selectedFilePath(),
      range: selectedLineRange(),
      foundFile: res.fileNode?.name,
      foundScope: res.scopeNode?.name,
    });
    return res;
  });

  return (
    <div class="h-screen flex flex-col bg-[#121212] text-white overflow-hidden">
      <header class="px-4 py-2 border-b border-[#333] flex items-center gap-4 bg-[#1e1e1e]">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <h1 class="text-lg font-bold text-blue-500 shrink-0">Srcly</h1>
          <div class="w-full">
            <FilePickerWithExternal
              onSelect={handleFileSelect}
              externalPath={analysisPath()}
            />
          </div>
        </div>
        <div class="text-xs text-gray-400 whitespace-nowrap">
          {loading()
            ? "Loading..."
            : visualizationData()
            ? "Analysis Loaded"
            : "Select a folder to analyze"}
        </div>
      </header>

      <main class="flex-1 relative overflow-hidden flex">
        <DialogShell
          open={Boolean(error())}
          onClose={() => setError(null)}
          size="md"
          class="border-red-700 bg-red-950/95"
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
                      {(ctx) => (
                        <EmptyState
                          title="No visualization data yet"
                          description="Choose what you want to analyze:"
                          actions={
                          <div class="grid gap-4 sm:grid-cols-2 w-full max-w-xl">
                            <div class="bg-black/20 border border-[#333] rounded p-3 text-left space-y-2">
                              <div class="text-[10px] uppercase tracking-wide text-gray-400">
                                Current directory
                              </div>
                              <p class="text-xs font-mono text-gray-200 break-all">
                                {ctx().rootPath || "(unknown)"}
                              </p>
                              <p class="text-[11px] text-gray-400">
                                Roughly {ctx().fileCount} files and{" "}
                                {ctx().folderCount} folders will be included.
                              </p>
                              <Button
                                variant="primary"
                                size="sm"
                                class="mt-2 w-full"
                                onClick={() => {
                                  const target = ctx().rootPath || "";
                                  setAnalysisPath(target);
                                  void handleFileSelect(target);
                                }}
                              >
                                Analyze current directory
                              </Button>
                            </div>

                            <Show when={ctx().repoRootPath}>
                              <div class="bg-black/20 border border-[#333] rounded p-3 text-left space-y-2">
                                <div class="text-[10px] uppercase tracking-wide text-gray-400">
                                  Repo root
                                </div>
                                <p class="text-xs font-mono text-gray-200 break-all">
                                  {ctx().repoRootPath}
                                </p>
                                <p class="text-[11px] text-gray-400">
                                  Roughly {ctx().repoFileCount} files and{" "}
                                  {ctx().repoFolderCount} folders will be
                                  included.
                                </p>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  class="mt-2 w-full"
                                  onClick={() => {
                                    const target = ctx().repoRootPath || "";
                                    if (!target) return;
                                    setAnalysisPath(target);
                                    void handleFileSelect(target);
                                  }}
                                >
                                  Analyze repo root
                                </Button>
                              </div>
                            </Show>
                          </div>
                          }
                        />
                      )}
                    </Show>
                  </>
                }
              >
                <LoadingState
                  label={
                    <div>
                      <div class="text-lg text-gray-400">Loading analysis...</div>
                      <div class="mt-2 text-sm text-gray-500">
                        This may take a moment for larger codebases.
                      </div>
                    </div>
                  }
                />
              </Show>
            </div>
          }
        >
          <div
            class="flex h-full w-full overflow-hidden"
            onMouseMove={(e) => {
              if (isDragging()) {
                const newWidth = e.clientX;
                if (newWidth > 200 && newWidth < window.innerWidth - 200) {
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
              class="w-1 bg-[#333] hover:bg-blue-500 cursor-col-resize transition-colors z-10"
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
