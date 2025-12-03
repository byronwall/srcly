import { createSignal, createEffect, For, Show, onMount } from "solid-js";
import Popover from "./Popover";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "folder";
}

export interface FilePickerProps {
  onSelect: (path: string) => void;
  initialPath?: string;
  externalPath?: string;
}

export default function FilePicker(props: FilePickerProps) {
  const [path, setPath] = createSignal(
    props.externalPath ?? props.initialPath ?? ""
  );
  const [suggestions, setSuggestions] = createSignal<FileItem[]>([]);
  const [showSuggestions, setShowSuggestions] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [recentPaths, setRecentPaths] = createSignal<string[]>([]);
  const [showRecent, setShowRecent] = createSignal(false);

  const RECENT_PATHS_KEY = "code-steward-recent-paths";

  // Keep local path in sync with an external value when provided.
  // Only depend on `props.externalPath` so user typing doesn't get
  // immediately overridden by this effect.
  createEffect(() => {
    if (typeof props.externalPath === "string") {
      setPath(props.externalPath);
    }
  });

  const saveRecentPaths = (paths: string[]) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(paths));
    } catch (err) {
      console.error("Failed to save recent paths", err);
    }
  };

  const addRecentPath = (newPath: string) => {
    const trimmed = newPath.trim();
    if (!trimmed) return;

    setRecentPaths((prev) => {
      const filtered = prev.filter((p) => p !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 8);
      saveRecentPaths(updated);
      return updated;
    });
  };

  const loadRecentPaths = () => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(RECENT_PATHS_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const onlyStrings = parsed.filter(
          (item: unknown): item is string => typeof item === "string"
        );
        setRecentPaths(onlyStrings);
      }
    } catch (err) {
      console.error("Failed to load recent paths", err);
    }
  };

  // Debounce logic could be added, but for local server it might be fast enough.
  // Let's fetch on every meaningful change or when path ends with /

  const fetchSuggestions = async (currentPath: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/files/suggest?path=${encodeURIComponent(currentPath)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.items);
      } else {
        setSuggestions([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch when path changes, but maybe debounce or check for specific triggers
  // For a "folder at a time" feel, we can fetch when the user focuses or types
  createEffect(() => {
    const p = path();
    // Fetch if empty or looks like a path
    fetchSuggestions(p);
  });

  onMount(() => {
    loadRecentPaths();
  });

  const handleInput = (e: InputEvent) => {
    const val = (e.target as HTMLInputElement).value;
    setPath(val);
    setShowSuggestions(true);
  };

  const handleAnalyze = () => {
    const currentPath = path().trim();
    // If the path is empty, treat it as "current working directory"
    // so that running via `uvx` with no path uses the CWD by default.
    if (!currentPath) {
      props.onSelect("");
      setShowSuggestions(false);
      setShowRecent(false);
      return;
    }
    props.onSelect(currentPath);
    addRecentPath(currentPath);
    setShowSuggestions(false);
    setShowRecent(false);
  };

  const selectItem = (item: FileItem) => {
    setPath(item.path);
    if (item.type === "folder") {
      // If folder, keep suggesting
      setShowSuggestions(true);
    } else {
      // If file, we are done? Or maybe user wants to select it
      setShowSuggestions(false);
      props.onSelect(item.path);
    }
  };

  return (
    <div class="relative w-full">
      <div class="flex gap-2">
        <Popover
          isOpen={showSuggestions() && (suggestions().length > 0 || loading())}
          onOpenChange={setShowSuggestions}
          placement="bottom-start"
          offset={{ x: 0, y: 4 }}
          trigger={(triggerProps) => (
            <input
              ref={triggerProps.ref}
              type="text"
              value={path()}
              onInput={handleInput}
              onFocus={() => setShowSuggestions(true)}
              placeholder="/path/to/codebase"
              class="w-full px-3 py-1.5 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 outline-none text-base"
            />
          )}
        >
          <div class="bg-gray-800 border border-gray-700 rounded shadow-xl max-h-96 overflow-y-auto min-w-[300px]">
            <Show when={loading()}>
              <div class="p-2 text-gray-400 italic">Loading...</div>
            </Show>
            <For each={suggestions()}>
              {(item) => (
                <div
                  class="p-2 hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-200"
                  onClick={() => selectItem(item)}
                >
                  <span>{item.type === "folder" ? "📁" : "📄"}</span>
                  <span>{item.name}</span>
                </div>
              )}
            </For>
          </div>
        </Popover>

        <Popover
          isOpen={showRecent()}
          onOpenChange={setShowRecent}
          placement="bottom-end"
          offset={{ x: 0, y: 4 }}
          trigger={(triggerProps) => (
            <button
              ref={triggerProps.ref}
              type="button"
              onClick={(e) => {
                triggerProps.onClick(e);
              }}
              class="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 rounded border border-gray-600 whitespace-nowrap flex items-center gap-1"
            >
              <span>Recent</span>
              <svg
                class="w-3 h-3 text-gray-400"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          )}
        >
          <div class="bg-gray-900 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto min-w-[16rem]">
            <div class="px-3 py-2 text-xs uppercase tracking-wide text-gray-400 border-b border-gray-700">
              Recent folders
            </div>
            <For each={recentPaths()}>
              {(recentPath) => (
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 truncate"
                  onClick={() => {
                    setPath(recentPath);
                    props.onSelect(recentPath);
                    addRecentPath(recentPath);
                    setShowRecent(false);
                    setShowSuggestions(false);
                  }}
                >
                  {recentPath}
                </button>
              )}
            </For>
          </div>
        </Popover>

        <button
          type="button"
          onClick={handleAnalyze}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Analyze
        </button>
      </div>
    </div>
  );
}
