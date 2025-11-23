import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { codeToHtml } from "shiki";

interface CodeModalProps {
  isOpen: boolean;
  filePath: string | null;
  onClose: () => void;
}

function guessLangFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts")) return "ts";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".js")) return "js";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".py")) return "py";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".toml")) return "toml";
  if (
    lower.endsWith(".sh") ||
    lower.endsWith(".bash") ||
    lower.endsWith(".zsh")
  )
    return "bash";
  return "txt";
}

export default function CodeModal(props: CodeModalProps) {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = createSignal<string>("");

  let lastRequestId = 0;

  createEffect(() => {
    if (!props.isOpen || !props.filePath) {
      return;
    }

    const currentId = ++lastRequestId;
    const path = props.filePath;

    setLoading(true);
    setError(null);
    setHighlightedHtml("");

    (async () => {
      try {
        const res = await fetch(
          `/api/files/content?path=${encodeURIComponent(path)}`
        );
        if (!res.ok) {
          throw new Error(
            `Failed to load file: ${res.status} ${res.statusText}`
          );
        }
        const text = await res.text();
        const lang = guessLangFromPath(path);
        const html = await codeToHtml(text, {
          lang,
          theme: "github-dark",
        });

        if (currentId === lastRequestId) {
          setHighlightedHtml(html);
        }
      } catch (e) {
        if (currentId === lastRequestId) {
          setError((e as Error).message ?? String(e));
        }
      } finally {
        if (currentId === lastRequestId) {
          setLoading(false);
        }
      }
    })();
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && props.isOpen) {
      event.stopPropagation();
      props.onClose();
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const baseName = () => {
    if (!props.filePath) return "";
    const parts = props.filePath.split(/[\\/]/);
    return parts[parts.length - 1] || props.filePath;
  };

  return (
    <Show when={props.isOpen && props.filePath}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div class="flex h-[80vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#1e1e1e] shadow-2xl">
          <header class="flex items-center justify-between border-b border-gray-700 bg-[#252526] px-4 py-2 text-sm">
            <div class="flex min-w-0 flex-col">
              <span class="truncate font-semibold text-gray-100">
                {baseName()}
              </span>
              <span class="truncate text-[11px] text-gray-400">
                {props.filePath}
              </span>
            </div>
            <button
              class="ml-4 rounded bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-600"
              type="button"
              onClick={props.onClose}
            >
              Close
            </button>
          </header>
          <main class="relative flex-1 overflow-auto bg-[#1e1e1e] p-4">
            <Show when={loading()}>
              <div class="flex h-full items-center justify-center text-sm text-gray-400">
                Loading file…
              </div>
            </Show>
            <Show when={!loading() && error()}>
              <div class="rounded border border-red-700 bg-red-900/70 px-3 py-2 text-sm text-red-100">
                {error()}
              </div>
            </Show>
            <Show when={!loading() && !error() && highlightedHtml()}>
              <div
                class="code-modal-content"
                innerHTML={highlightedHtml() || ""}
              />
            </Show>
          </main>
        </div>
      </div>
    </Show>
  );
}
