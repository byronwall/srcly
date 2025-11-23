import { createSignal, onMount } from "solid-js";

function App() {
  const [message, setMessage] = createSignal("Loading...");
  const [data, setData] = createSignal<any>(null);

  onMount(async () => {
    try {
      const res = await fetch("/api/");
      const json = await res.json();
      setMessage(json.message);
    } catch (err) {
      setMessage("Error connecting to server");
      console.error(err);
    }
  });

  const fetchAnalysis = async () => {
    try {
      // Assuming there is an analysis endpoint, or we can just list files
      // If not, this is just a placeholder for now
      const res = await fetch("/api/files/"); // Try files endpoint if exists
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setData({ error: "Failed to fetch files" });
      }
    } catch (err) {
      setData({ error: String(err) });
    }
  };

  return (
    <div class="min-h-screen flex flex-col items-center justify-center p-4 space-y-8">
      <h1 class="text-4xl font-bold text-blue-500">Code Steward</h1>

      <div class="p-6 bg-gray-800 rounded-lg shadow-lg max-w-md w-full">
        <h2 class="text-xl font-semibold mb-4 text-gray-300">Server Status</h2>
        <p class="text-lg">{message()}</p>
      </div>

      <div class="p-6 bg-gray-800 rounded-lg shadow-lg max-w-md w-full">
        <h2 class="text-xl font-semibold mb-4 text-gray-300">Actions</h2>
        <button
          onClick={fetchAnalysis}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors"
        >
          Fetch Files
        </button>

        {data() && (
          <pre class="mt-4 p-4 bg-gray-900 rounded overflow-auto text-xs text-gray-400 max-h-60">
            {JSON.stringify(data(), null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export default App;
