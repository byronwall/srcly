import { createMemo, createSignal, For, Show } from "solid-js";
import { useMetricsStore } from "../utils/metricsStore";
import Popover from "./Popover";
import { Button } from "./ui/Button";
import { CheckboxRow } from "./ui/CheckboxRow";
import {
  OptionRow,
  PopoverPanel,
  PopoverSectionTitle,
} from "./ui/PopoverPanel";
import { TextInput } from "./ui/TextInput";

interface FileTypeFilterProps {
  data: any;
  activeExtensions: string[];
  onToggleExtension: (ext: string) => void;
  maxLoc: number | undefined;
  onMaxLocChange: (val: number | undefined) => void;
  onClearExtensions: () => void;
}

export default function FileTypeFilter(props: FileTypeFilterProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [locInput, setLocInput] = createSignal(10000);
  const { excludedPaths, toggleExcludedPath, clearExcludedPaths } =
    useMetricsStore();
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

  const handleClearAll = () => {
    props.onMaxLocChange(undefined);
    props.onClearExtensions();
    clearExcludedPaths();
  };

  return (
    <div class="relative">
      <Popover
        isOpen={isOpen()}
        onOpenChange={setIsOpen}
        placement="bottom-end"
        offset={{ x: 0, y: 4 }}
        trigger={(triggerProps) => (
          <Button
            ref={triggerProps.ref}
            class={
              activeCount() > 0 || isLocActive()
                ? "border-blue-700 bg-blue-900 text-blue-100"
                : undefined
            }
            onClick={(e) => triggerProps.onClick(e)}
          >
            <span class="uppercase tracking-wider font-semibold">
              {activeCount() > 0 || isLocActive()
                ? `Filter (${activeCount() + (isLocActive() ? 1 : 0)})`
                : "Filter: All"}
            </span>
            <span class="text-[9px]">▼</span>
          </Button>
        )}
      >
        <PopoverPanel
          width="xl"
          class="max-h-[400px] overflow-hidden p-3 flex flex-col gap-2"
        >
          {/* Header with Clear All inside Popover */}
          <Show when={activeCount() > 0 || isLocActive()}>
            <div class="flex justify-end pb-2 border-b border-[#3e3e42]">
              <Button
                variant="ghost"
                size="xs"
                class="text-red-400 hover:text-red-300"
                onClick={handleClearAll}
              >
                <span>✕</span>
                <span>Clear all filters</span>
              </Button>
            </div>
          </Show>

          <div class="flex gap-4 min-h-0 flex-1">
            {/* Left Column: File Types */}
            <div class="flex-1 flex flex-col min-h-0">
              <PopoverSectionTitle class="px-1">
                File Types
              </PopoverSectionTitle>
              <div class="overflow-y-auto flex-1 space-y-1 pr-1">
                <For each={extensionStats()}>
                  {(item) => (
                    <OptionRow
                      selected={isActive(item.ext)}
                      class="flex items-center justify-between py-1.5"
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
                      <span class="text-gray-500 text-[10px]">
                        {item.count}
                      </span>
                    </OptionRow>
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
              <PopoverSectionTitle class="px-1">
                Limits & Exclusions
              </PopoverSectionTitle>
              <div class="space-y-3 px-1">
                <div class="flex flex-col gap-2">
                  <CheckboxRow
                    checked={isLocActive()}
                    onChange={handleLocToggle}
                    label="Exclude Large Files"
                  />

                  <div
                    class={`pl-5 transition-opacity ${
                      isLocActive() ? "opacity-100" : "opacity-50"
                    }`}
                  >
                    <label class="text-[10px] text-gray-500 block mb-1">
                      Max Lines of Code (LOC)
                    </label>
                    <TextInput
                      type="number"
                      value={locInput()}
                      onInput={(e) =>
                        handleLocInputChange(
                          parseInt(e.currentTarget.value) || 0
                        )
                      }
                      size="sm"
                      class="text-xs text-gray-300"
                      min="0"
                      step="100"
                    />
                    <div class="flex gap-1.5 mt-2 flex-wrap">
                      <For each={[1000, 2000, 5000, 10000, 20000]}>
                        {(val) => (
                          <Button
                            size="xs"
                            class="px-1.5 py-0.5 text-[9px] hover:border-gray-500 hover:text-gray-200"
                            onClick={() => handleLocInputChange(val)}
                          >
                            {val >= 1000 ? `${val / 1000}k` : val}
                          </Button>
                        )}
                      </For>
                    </div>
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
                            <Button
                              variant="ghost"
                              size="xs"
                              class="ml-2 p-0 text-gray-500 hover:text-red-400"
                              onClick={() => toggleExcludedPath(path)}
                              title="Remove exclusion"
                            >
                              ✕
                            </Button>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </PopoverPanel>
      </Popover>

      {/* Clear All Button (Next to Trigger) */}
      <Show when={activeCount() > 0 || isLocActive()}>
        <Button
          size="xs"
          class="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-gray-500 hover:border-red-900/50 hover:text-red-400"
          onClick={handleClearAll}
          title="Clear all filters"
        >
          ✕
        </Button>
      </Show>
    </div>
  );
}
