import {
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  createEffect,
  lazy,
  untrack,
} from "solid-js";
import { GitCompare, RefreshCw } from "lucide-solid";
import Toast from "./components/Toast";

import Explorer from "./components/Explorer";
import { DialogHeader, DialogShell } from "./components/dialog/DialogShell";
import { ScanProgress } from "./components/feedback/ScanProgress";
import { EmptyState, ErrorState, LoadingState } from "./components/feedback/States";
import FilePicker from "./components/FilePicker";
import Treemap from "./components/Treemap";
import { Button } from "./components/ui/Button";
import { extractFilePath, filterTree, findScopeForSymbol, findTreeNodeByPath } from "./utils/dataProcessing";
import { describeResult, formatCount } from "./utils/scanProgress";
import { MetricsStoreProvider, useMetricsStore } from "./utils/metricsStore";
import { atFromTreePath, isExternal, normalizeScopeName, splitAt, treePathFromAt } from "./navigation/location";
import { resolveTreeAt } from "./navigation/resolveTree";
import { go, location, replace } from "./navigation/store";
import { scanStore } from "./state/scanStore";
import HistoryMenu from "./navigation/HistoryMenu";
import { enterCompare, readCompareParam } from "./compare/api";

const CodeModal = lazy(() => import("./components/CodeModal/CodeModal.tsx"));
const CompareApp = lazy(() => import("./compare/CompareApp.tsx"));

// Stop waiting for the first treemap paint after this long (a hidden tab
// gets no animation frames), so the loading state can never get stuck.
const FIRST_PAINT_TIMEOUT_MS = 15_000;

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
  // ?compare=<base>..<head> switches to PR compare mode. The normal view stays
  // mounted (hidden) underneath, so its scan and place survive the round trip.
  const [comparing, setComparing] = createSignal(readCompareParam() !== null);
  const sync = () => setComparing(readCompareParam() !== null);
  onMount(() => window.addEventListener("popstate", sync));
  onCleanup(() => window.removeEventListener("popstate", sync));
  return (
    <MetricsStoreProvider>
      <div class={comparing() ? "hidden" : "contents"}>
        <AppContent active={!comparing()} />
      </div>
      <Show when={comparing()}>
        <CompareApp />
      </Show>
    </MetricsStoreProvider>
  );
}

function AppContent(props: { active: boolean }) {
  const {
    data: visualizationData,
    loading,
    error,
    setError,
    scan,
    cancelling,
    clientStage,
    scannedPath,
  } = scanStore;
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
  const { excludedPaths } = useMetricsStore();
  // Half the viewport at most, so narrow windows keep room for the treemap.
  const [explorerWidth, setExplorerWidth] = createSignal(
    Math.min(280, Math.round(window.innerWidth * 0.5))
  );
  const [isDragging, setIsDragging] = createSignal(false);
  const [analysisPath, setAnalysisPath] = createSignal(location().repo);
  let resolveTreemapPaint: (() => void) | null = null;
  let pendingNotice: string | null = null;

  // The scan root's absolute path; locations are relative to it.
  const rootPath = () => visualizationData()?.path ?? "";
  // Where the treemap is zoomed, read from the location.
  const resolved = createMemo(() => {
    const data = visualizationData();
    return data ? resolveTreeAt(data, rootPath(), location().at) : null;
  });
  const currentRoot = () => resolved()?.node ?? null;

  // A location whose path is gone (deleted file, different repo): show the
  // nearest ancestor that exists. Graph-only places (packages, files the scan
  // skips) are left alone while the graph shows them.
  createEffect(() => {
    const r = resolved();
    if (!r || r.match !== "missing" || location().view !== "treemap") return;
    const message = `${location().at} isn't in this scan; showing ${r.at || "the root"}`;
    replace({ at: r.at });
    // While a scan is loading, its "Analyzed …" toast would hide this one.
    if (loading()) pendingNotice = message;
    else notify(message, "error");
  });

  const zoomTo = (node: any) => {
    const at = node?.path ? atFromTreePath(node.path, rootPath()) : null;
    if (at !== null) go({ at });
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

  const waitForTreemapPaint = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, FIRST_PAINT_TIMEOUT_MS);
      function done() {
        clearTimeout(timer);
        if (resolveTreemapPaint === done) resolveTreemapPaint = null;
        resolve();
      }
      resolveTreemapPaint = done;
    });

  const analyze = (path: string, options: { force?: boolean } = {}) => {
    pendingNotice = null;
    setAnalysisPath(path);
    void scanStore.start(path, {
      ...options,
      displayPath: analysisContext()?.rootPath,
      waitForPaint: waitForTreemapPaint,
      onComplete: (snapshot) => {
        const skipped =
          snapshot.files_failed > 0
            ? ` (${formatCount(snapshot.files_failed)} skipped)`
            : "";
        if (pendingNotice) notify(pendingNotice, "error");
        else
          notify(
            `${snapshot.cached ? "Loaded saved analysis: " : "Analyzed "}${describeResult(snapshot)}${skipped}`,
            "success"
          );
        pendingNotice = null;
      },
    });
  };

  // The repo in the URL drives what is analyzed: refresh, a pasted link, or
  // Back across repos all land here. The server's analysis cache makes a
  // revisit fast. A URL with no repo keeps whatever is loaded.
  createEffect(() => {
    const repo = location().repo;
    if (!props.active || !repo || repo === untrack(scannedPath)) return;
    untrack(() => analyze(repo));
  });

  /** A codebase chosen in the picker or on the landing page. */
  const handleFileSelect = (path: string) => {
    const target = path.trim() || analysisContext()?.rootPath || "";
    if (!target) return analyze("");
    if (target === location().repo) return analyze(target);
    // A different codebase starts at its root. A URL that had a place but no
    // repo yet (an old link) keeps that place.
    go(location().repo ? { repo: target, at: "" } : { repo: target });
  };

  const handleCancelScan = () => scanStore.cancel();

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

  /**
   * Open a location in the code viewer: a scope opens on its lines with its
   * metrics, a graph symbol on the matching scope, a file whole. Folders and
   * packages have no code. A file the scan skipped still opens, without metrics.
   */
  const openAt = (at: string, line?: number) => {
    if (!at || isExternal(at)) return;
    const data = visualizationData();
    const r = data ? resolveTreeAt(data, rootPath(), at) : null;
    let node = r && r.match !== "missing" ? r.node : null;
    if (node?.type === "folder") return;
    // A graph symbol also carries its line: use it to pick among duplicate
    // names, and to land on the symbol when its name matches no scope.
    const { file: symbolFile, scopes } = splitAt(at);
    if (node && scopes.length === 1 && typeof line === "number") {
      const fileNode = node.type === "file" ? node : findTreeNodeByPath(data, treePathFromAt(symbolFile, rootPath()));
      const byLine = findScopeForSymbol(fileNode, scopes[0], line);
      if (byLine && (node.type === "file" || normalizeScopeName(String(byLine.name ?? "")) === scopes[0])) {
        node = byLine;
      } else if (node.type === "file") {
        const path = extractFilePath(node.path, node.type);
        if (path) handleFileFromTreemap(path, line, line);
        return;
      }
    }
    if (!node) {
      handleFileFromTreemap(treePathFromAt(splitAt(at).file, rootPath()));
      return;
    }
    const file = extractFilePath(node.path, node.type);
    if (!file) return;
    if (node.type === "file") handleFileFromTreemap(file, undefined, undefined, node);
    else handleFileFromTreemap(file, node.start_line, node.end_line, node);
  };

  const processedData = createMemo(() => {
    const data = visualizationData();
    return data ? filterTree(data, filterQuery(), excludedPaths()) : null;
  });

  const explorerRoot = createMemo(() => {
    const root = processedData();
    if (!root) return null;
    const selectedPath = currentRoot()?.path;
    return selectedPath ? findTreeNodeByPath(root, selectedPath) ?? root : root;
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
          <HistoryMenu />
        </div>
        <Button
          variant="ghost"
          class="shrink-0 gap-1.5"
          title="Compare two git refs: what a branch or PR changed, and whether metrics got better or worse"
          onClick={() => enterCompare()}
        >
          <GitCompare size={13} aria-hidden="true" />
          Compare
        </Button>
        <Show when={!loading() && visualizationData()}>
          {(data) => (
            <>
              <div class="plc-data-sm hidden whitespace-nowrap text-[var(--plc-on-subtle)] md:block">
                {formatCount(data().metrics?.file_count ?? 0)} files ·{" "}
                {formatCount(data().metrics?.loc ?? 0)} LOC
              </div>
              <Button
                variant="ghost"
                class="shrink-0 gap-1.5"
                title="Scan again, ignoring the saved analysis"
                onClick={() => analyze(scannedPath() ?? "", { force: true })}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Rescan
              </Button>
            </>
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
          when={visualizationData()}
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
                                  onAnalyze={() => handleFileSelect(ctx().rootPath || "")}
                                />
                                <Show when={showRepoRoot()}>
                                  <AnalyzeTarget
                                    label="Repository root"
                                    path={ctx().repoRootPath ?? ""}
                                    files={ctx().repoFileCount ?? 0}
                                    folders={ctx().repoFolderCount ?? 0}
                                    onAnalyze={() => handleFileSelect(ctx().repoRootPath ?? "")}
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
                      stage={clientStage()}
                      onCancel={
                        snapshot().id && !clientStage() ? handleCancelScan : undefined
                      }
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
                data={explorerRoot()}
                fullData={processedData()}
                onFileSelect={handleFileFromTreemap}
                onZoom={zoomTo}
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
                rootPath={rootPath()}
                onOpenAt={openAt}
                onZoom={zoomTo}
                onFileSelect={handleFileFromTreemap}
                onPaint={() => resolveTreemapPaint?.()}
              />
            </div>
          </div>
        </Show>
        {/* Covers the explorer and treemap while they lay out the new tree. */}
        <Show when={visualizationData() && clientStage() === "rendering" && scan()}>
          {(snapshot) => (
            <div class="plc-app-shell absolute inset-0 z-20">
              <ScanProgress snapshot={snapshot()} stage="rendering" />
            </div>
          )}
        </Show>
      </main>
      <Show when={showToast()}>
        <Toast message={toastMessage()} type={toastType()} duration={4000} />
      </Show>
      <Show when={isCodeModalOpen()}>
        <CodeModal
          isOpen={true}
          filePath={selectedFilePath()}
          startLine={selectedLineRange()?.start ?? null}
          endLine={selectedLineRange()?.end ?? null}
          onClose={() => setIsCodeModalOpen(false)}
          fileNode={selectedNodes().fileNode}
          scopeNode={selectedNodes().scopeNode}
        />
      </Show>
    </div>
  );
}

export default App;
