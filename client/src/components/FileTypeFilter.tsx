import { createMemo, createSignal, For, Show } from "solid-js";
import { useMetricsStore } from "../utils/metricsStore";
import Popover from "./Popover";

interface FileTypeFilterProps {
  data: any;
  activeExtensions: string[];
  onToggleExtension: (ext: string) => void;
  maxLoc: number | undefined;
  onMaxLocChange: (val: number | undefined) => void;
}

export default function FileTypeFilter(props: FileTypeFilterProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [locInput, setLocInput] = createSignal(10000);
  const { excludedPaths, toggleExcludedPath } = useMetricsStore();
  // Analyze data to find extensions and counts
  const extensionStats = createMemo(() => {
    const stats = new Map<string, number>();
    const root = props.data;

    if (!root) return [];

    const visit = (node: any) => {
      if (node.type === "file") {
        // Extract extension
        const name = node.name || "";
        const parts = name.split(".");
        if (parts.length > 1) {
          const ext = parts.pop()!.toLowerCase();
          stats.set(ext, (stats.get(ext) || 0) + 1);
        }
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };

    visit(root);

    // Convert to array and sort by count desc
    return Array.from(stats.entries())
      .map(([ext, count]) => ({ ext, count }))
      .sort((a, b) => b.count - a.count);
  });

  const activeCount = () =>
    props.activeExtensions.length + excludedPaths().length;
  const isLocActive = () => props.maxLoc !== undefined;

  // Helper to check if an extension is active
  const isActive = (ext: string) => props.activeExtensions.includes(ext);

  const handleLocToggle = (checked: boolean) => {
    if (checked) {
      props.onMaxLocChange(locInput());
    } else {
      props.onMaxLocChange(undefined);
    }
  };

  const handleLocInputChange = (val: number) => {
    setLocInput(val);
    if (isLocActive()) {
      props.onMaxLocChange(val);
    }
  };

  return (
    <div class="relative">
      <Popover
        isOpen={isOpen()}
        onOpenChange={setIsOpen}
        placement="bottom-end"
        offset={{ x: 0, y: 4 }}
        trigger={(triggerProps) => (
          <button
            ref={triggerProps.ref}
            class={`flex items-center gap-2 px-2 py-1 text-xs rounded border transition-colors ${
              activeCount() > 0 || isLocActive()
                ? "bg-blue-900 border-blue-700 text-blue-100"
                : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
            }`}
            onClick={(e) => triggerProps.onClick(e)}
          >
            <span class="uppercase tracking-wider font-semibold">
              {activeCount() > 0 || isLocActive()
                ? `Filter (${activeCount() + (isLocActive() ? 1 : 0)})`
                : "Filter: All"}
            </span>
            <span class="text-[9px]">▼</span>
          </button>
        )}
      >
        <div class="bg-[#252526] border border-[#3e3e42] rounded shadow-xl z-50 p-3 w-[450px] max-h-[400px] overflow-hidden flex gap-4">
          {/* Left Column: File Types */}
          <div class="flex-1 flex flex-col min-h-0">
            <div class="text-xs font-bold text-gray-400 mb-2 px-1">
              File Types
            </div>
            <div class="overflow-y-auto flex-1 space-y-1 pr-1">
              <For each={extensionStats()}>
                {(item) => (
                  <button
                    class={`w-full flex items-center justify-between text-left text-[11px] px-2 py-1.5 rounded transition-colors ${
                      isActive(item.ext)
                        ? "bg-blue-900/40 text-blue-100"
                        : "text-gray-300 hover:bg-[#333]"
                    }`}
                    onClick={() => props.onToggleExtension(item.ext)}
                  >
                    <div class="flex items-center gap-2">
                      <div
                        class={`w-3 h-3 rounded border flex items-center justify-center ${
                          isActive(item.ext)
                            ? "bg-blue-600 border-blue-500"
                            : "border-gray-600"
                        }`}
                      >
                        <Show when={isActive(item.ext)}>
                          <svg
                            viewBox="0 0 24 24"
                            class="w-2.5 h-2.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="4"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </Show>
                      </div>
                      <span class="font-mono">.{item.ext}</span>
                    </div>
                    <span class="text-gray-500 text-[10px]">{item.count}</span>
                  </button>
                )}
              </For>
              <Show when={extensionStats().length === 0}>
                <div class="text-gray-500 text-xs p-2 text-center">
                  No file types found
                </div>
              </Show>
            </div>
          </div>

          {/* Divider */}
          <div class="w-px bg-[#3e3e42]"></div>

          {/* Right Column: Other Filters */}
          <div class="flex-1 flex flex-col">
            <div class="text-xs font-bold text-gray-400 mb-2 px-1">
              Limits & Exclusions
            </div>
            <div class="space-y-3 px-1">
              <div class="flex flex-col gap-2">
                <label class="flex items-center gap-2 cursor-pointer group">
                  <div
                    class={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                      isLocActive()
                        ? "bg-blue-600 border-blue-500"
                        : "border-gray-600 group-hover:border-gray-500"
                    }`}
                  >
                    <Show when={isLocActive()}>
                      <svg
                        viewBox="0 0 24 24"
                        class="w-2.5 h-2.5 text-white"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="4"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </Show>
                  </div>
                  <input
                    type="checkbox"
                    class="hidden"
                    checked={isLocActive()}
                    onChange={(e) => handleLocToggle(e.currentTarget.checked)}
                  />
                  <span class="text-xs text-gray-300">Exclude Large Files</span>
                </label>

                <div
                  class={`pl-5 transition-opacity ${
                    isLocActive() ? "opacity-100" : "opacity-50"
                  }`}
                >
                  <label class="text-[10px] text-gray-500 block mb-1">
                    Max Lines of Code (LOC)
                  </label>
                  <input
                    type="number"
                    value={locInput()}
                    onInput={(e) =>
                      handleLocInputChange(parseInt(e.currentTarget.value) || 0)
                    }
                    class="w-full bg-[#1e1e1e] border border-[#3e3e42] text-gray-300 text-xs rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                    min="0"
                    step="100"
                  />
                </div>
              </div>

              {/* Excluded Paths Section */}
              <Show when={excludedPaths().length > 0}>
                <div class="pt-2 border-t border-[#3e3e42]">
                  <div class="text-[10px] font-bold text-gray-400 mb-2">
                    Excluded Paths
                  </div>
                  <div class="space-y-1 max-h-[150px] overflow-y-auto">
                    <For each={excludedPaths()}>
                      {(path) => (
                        <div class="flex items-center justify-between text-[10px] bg-[#1e1e1e] border border-[#3e3e42] rounded px-2 py-1 group hover:border-red-900/50">
                          <span
                            class="truncate text-gray-400 max-w-[140px]"
                            title={path}
                          >
                            {path.split("/").pop()}
                          </span>
                          <button
                            class="text-gray-500 hover:text-red-400 ml-2"
                            onClick={() => toggleExcludedPath(path)}
                            title="Remove exclusion"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}
