import {
  createSignal,
  createMemo,
  Show,
  For,
  onCleanup,
  onMount,
} from "solid-js";

interface FileTypeFilterProps {
  data: any;
  activeExtensions: string[];
  onToggleExtension: (ext: string) => void;
}

export default function FileTypeFilter(props: FileTypeFilterProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  // Close on click outside
  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() =>
      document.removeEventListener("mousedown", handleClickOutside)
    );
  });

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
        } else {
          // Handle files without extension if needed, or ignore
          // For now, let's group them as "no-ext" or similar if we want,
          // but usually we just care about code files which have extensions.
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

  const activeCount = () => props.activeExtensions.length;

  // Helper to check if an extension is active
  const isActive = (ext: string) => props.activeExtensions.includes(ext);

  return (
    <div class="relative" ref={containerRef}>
      <button
        class={`flex items-center gap-2 px-2 py-1 text-xs rounded border transition-colors ${
          activeCount() > 0
            ? "bg-blue-900 border-blue-700 text-blue-100"
            : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
        }`}
        onClick={() => setIsOpen(!isOpen())}
      >
        <span class="uppercase tracking-wider font-semibold">
          {activeCount() > 0 ? `Filter (${activeCount()})` : "Filter: All"}
        </span>
        <span class="text-[9px]">▼</span>
      </button>

      <Show when={isOpen()}>
        <div class="absolute right-0 top-full mt-1 bg-[#252526] border border-[#3e3e42] rounded shadow-xl z-50 p-2 w-64 max-h-80 overflow-y-auto">
          <div class="text-xs font-bold text-gray-400 mb-2 px-1">
            File Types
          </div>

          <div class="space-y-1">
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
      </Show>
    </div>
  );
}
