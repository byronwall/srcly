import { createSignal } from "solid-js";

// Folders analyzed from this browser, most recent first. Shared by the
// first-run path picker and the header's folder menu.
const KEY = "code-steward-recent-paths";
const LIMIT = 8;

function load(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

const [recentPaths, setRecentPaths] = createSignal<string[]>(typeof window === "undefined" ? [] : load());

export { recentPaths };

export function rememberPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return;
  const next = [trimmed, ...recentPaths().filter((p) => p !== trimmed)].slice(0, LIMIT);
  setRecentPaths(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the list still works for this tab.
  }
}
