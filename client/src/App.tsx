import {
  createMemo,
  createSignal,
  onMount,
  Show,
  createEffect,
} from "solid-js";
import Toast from "./components/Toast";

import CodeModal from "./components/CodeModal";
import Explorer from "./components/Explorer";
import FilePicker from "./components/FilePicker";
import Treemap from "./components/Treemap";
import { filterTree } from "./utils/dataProcessing";

function App() {
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
  const [isCodeModalOpen, setIsCodeModalOpen] = createSignal(false);
  const [analysisContext, setAnalysisContext] = createSignal<{
    rootPath: string;
    fileCount: number;
    folderCount: number;
  } | null>(null);
  const [contextLoading, setContextLoading] = createSignal(false);
  const [filterQuery, setFilterQuery] = createSignal("");
  const [currentRoot, setCurrentRoot] = createSignal<any>(null);
  const [hiddenPaths, setHiddenPaths] = createSignal<string[]>([]);

  // Reset current root when data changes
  createEffect(() => {
    if (visualizationData()) {
      setCurrentRoot(visualizationData());
    }
  });

  const toggleHiddenPath = (path: string) => {
    const current = hiddenPaths();
    if (current.includes(path)) {
      setHiddenPaths(current.filter((p) => p !== path));
    } else {
      setHiddenPaths([...current, path]);
    }
  };

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
        });
      }
    } catch (err) {
      console.error("Failed to load analysis context", err);
    } finally {
      setContextLoading(false);
    }
  });

  const handleFileSelect = async (path: string) => {
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

  const handleFileFromTreemap = (path: string) => {
    setSelectedFilePath(path);
    setIsCodeModalOpen(true);
  };

  const processedData = createMemo(() => {
    const data = visualizationData();
    if (!data) return null;
    // Clone and filter
    const clone = JSON.parse(JSON.stringify(data));

    // Filter out hidden paths
    const hidden = hiddenPaths();
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

  return (
    <div class="h-screen flex flex-col bg-[#121212] text-white overflow-hidden">
      <header class="px-4 py-2 border-b border-[#333] flex items-center justify-between bg-[#1e1e1e]">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-bold text-blue-500">Srcly</h1>
          <div class="max-w-2xl w-full">
            <FilePicker onSelect={handleFileSelect} />
          </div>
        </div>
        <div class="text-xs text-gray-400">
          {loading()
            ? "Loading..."
            : visualizationData()
            ? "Analysis Loaded"
            : "Select a folder to analyze"}
        </div>
      </header>

      <main class="flex-1 relative overflow-hidden flex">
        <Show when={error()}>
          <div class="absolute inset-0 flex items-center justify-center z-50 bg-black/50">
            <div class="bg-red-900/80 p-6 rounded text-white border border-red-700">
              <h3 class="font-bold text-lg mb-2">Error</h3>
              <p>{error()}</p>
              <button
                class="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 rounded"
                onClick={() => setError(null)}
              >
                Close
              </button>
            </div>
          </div>
        </Show>

        <Show
          when={processedData()}
          fallback={
            <div class="flex flex-col items-center justify-center h-full w-full text-gray-500">
              <p class="text-lg mb-2">No visualization data yet</p>
              <Show
                when={analysisContext()}
                fallback={
                  <p class="text-sm">
                    {contextLoading()
                      ? "Loading current folder information..."
                      : "Enter a path above to visualize the codebase"}
                  </p>
                }
              >
                {(ctx) => (
                  <div class="text-center space-y-3">
                    <p class="text-sm">Analyze the current server folder:</p>
                    <p class="text-sm font-mono text-gray-300">
                      {ctx().rootPath || "(unknown)"}
                    </p>
                    <p class="text-xs text-gray-400">
                      Roughly {ctx().fileCount} files and {ctx().folderCount}{" "}
                      folders will be included.
                    </p>
                    <button
                      type="button"
                      class="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-sm text-white rounded"
                      onClick={() => handleFileSelect("")}
                    >
                      Analyze this folder
                    </button>
                  </div>
                )}
              </Show>
            </div>
          }
        >
          <div class="flex-1 h-full overflow-hidden relative">
            <Treemap
              data={processedData()}
              currentRoot={currentRoot()}
              onZoom={setCurrentRoot}
              onFileSelect={handleFileFromTreemap}
            />
          </div>
          <Explorer
            data={currentRoot() || processedData()}
            onFileSelect={handleFileFromTreemap}
            onZoom={setCurrentRoot}
            filter={filterQuery()}
            onFilterChange={setFilterQuery}
            hiddenPaths={hiddenPaths()}
            onToggleHidden={toggleHiddenPath}
          />
        </Show>
      </main>
      <Show when={showToast()}>
        <Toast message={toastMessage()} type={toastType()} duration={4000} />
      </Show>
      <CodeModal
        isOpen={isCodeModalOpen()}
        filePath={selectedFilePath()}
        onClose={() => setIsCodeModalOpen(false)}
      />
    </div>
  );
}

export default App;
