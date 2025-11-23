import { createSignal, Show } from "solid-js";
import FilePicker from "./components/FilePicker";
import Treemap from "./components/Treemap";

function App() {
  const [visualizationData, setVisualizationData] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleFileSelect = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch analysis: ${res.statusText}`);
      }
      const data = await res.json();
      setVisualizationData(data);
    } catch (err) {
      console.error(err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="h-screen flex flex-col bg-[#121212] text-white overflow-hidden">
      <header class="p-4 border-b border-[#333] flex items-center justify-between bg-[#1e1e1e]">
        <div class="flex items-center gap-4">
          <h1 class="text-xl font-bold text-blue-500">Code Steward</h1>
          <FilePicker onSelect={handleFileSelect} />
        </div>
        <div class="text-sm text-gray-400">
          {loading()
            ? "Loading..."
            : visualizationData()
            ? "Analysis Loaded"
            : "Select a folder to analyze"}
        </div>
      </header>

      <main class="flex-1 relative overflow-hidden p-4">
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
          when={visualizationData()}
          fallback={
            <div class="flex flex-col items-center justify-center h-full text-gray-500">
              <p class="text-lg mb-2">No visualization data</p>
              <p class="text-sm">
                Enter a path above to visualize the codebase
              </p>
            </div>
          }
        >
          <Treemap data={visualizationData()} />
        </Show>
      </main>
    </div>
  );
}

export default App;
