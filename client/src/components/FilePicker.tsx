import { createSignal, createEffect, For, Show } from "solid-js";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "folder";
}

interface FilePickerProps {
  onSelect: (path: string) => void;
  initialPath?: string;
}

export default function FilePicker(props: FilePickerProps) {
  const [path, setPath] = createSignal(props.initialPath || "");
  const [suggestions, setSuggestions] = createSignal<FileItem[]>([]);
  const [showSuggestions, setShowSuggestions] = createSignal(false);
  const [loading, setLoading] = createSignal(false);

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

  const handleInput = (e: InputEvent) => {
    const val = (e.target as HTMLInputElement).value;
    setPath(val);
    setShowSuggestions(true);
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
    <div class="relative w-full max-w-xl">
      <div class="flex gap-2">
        <input
          type="text"
          value={path()}
          onInput={handleInput}
          onFocus={() => setShowSuggestions(true)}
          // onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click
          placeholder="/path/to/codebase"
          class="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 outline-none"
        />
        <button
          onClick={() => props.onSelect(path())}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Analyze
        </button>
      </div>

      <Show when={showSuggestions() && (suggestions().length > 0 || loading())}>
        <div class="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl max-h-60 overflow-y-auto z-50">
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
      </Show>
    </div>
  );
}
