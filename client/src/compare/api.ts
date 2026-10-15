/** Client for the compare API (`server/app/routers/compare.py`). */

import type { ComparePayload } from "./types";

export type ComparePhase =
  | "queued"
  | "resolving"
  | "base"
  | "head"
  | "diffing"
  | "complete"
  | "failed"
  | "cancelled";

export type SideProgress = { files_total: number; files_done: number; current_path: string | null };

export type CompareSnapshot = {
  id: string;
  base: string;
  head: string;
  phase: ComparePhase;
  error: string | null;
  elapsed_seconds: number;
  sides: { base: SideProgress; head: SideProgress };
};

export type RefList = {
  repo: string;
  current: string;
  defaultBranch: string | null;
  branches: { name: string; sha: string; date: string }[];
  commits: { sha: string; subject: string; date: string }[];
};

export const DEFAULT_BASE = "merge-base";
export const DEFAULT_HEAD = "WORKTREE";
const TERMINAL: ComparePhase[] = ["complete", "failed", "cancelled"];
const POLL_MS = 250;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const fetchRefs = () => fetch("/api/compare/refs").then((r) => json<RefList>(r));

export const startCompare = (base: string, head: string, force = false) =>
  fetch("/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base, head, force }),
  }).then((r) => json<CompareSnapshot>(r));

export const cancelCompare = (id: string) =>
  fetch(`/api/compare/${id}`, { method: "DELETE" }).then((r) => json<CompareSnapshot>(r));

export const fetchCompareResult = (id: string) =>
  fetch(`/api/compare/${id}/result`).then((r) => json<ComparePayload>(r));

/** Poll a compare until it finishes. Returns a stop function. */
export function watchCompare(
  id: string,
  handlers: { onUpdate: (s: CompareSnapshot) => void; onDone: (s: CompareSnapshot) => void }
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const snap = await fetch(`/api/compare/${id}`).then((r) => json<CompareSnapshot>(r));
      if (stopped) return;
      if (TERMINAL.includes(snap.phase)) {
        handlers.onDone(snap);
        return;
      }
      handlers.onUpdate(snap);
    } catch (err) {
      if (stopped) return;
      handlers.onDone({
        id,
        base: "",
        head: "",
        phase: "failed",
        error: String(err instanceof Error ? err.message : err),
        elapsed_seconds: 0,
        sides: { base: emptySide(), head: emptySide() },
      });
      return;
    }
    setTimeout(tick, POLL_MS);
  };
  void tick();
  return () => {
    stopped = true;
  };
}

const emptySide = (): SideProgress => ({ files_total: 0, files_done: 0, current_path: null });

// -- URL state: ?compare=<base>..<head> ---------------------------------------

export const COMPARE_PARAM = "compare";

export function readCompareParam(search = window.location.search): { base: string; head: string } | null {
  const raw = new URLSearchParams(search).get(COMPARE_PARAM);
  if (raw === null) return null;
  const at = raw.indexOf("..");
  if (at < 0) return { base: raw || DEFAULT_BASE, head: DEFAULT_HEAD };
  return { base: raw.slice(0, at) || DEFAULT_BASE, head: raw.slice(at + 2) || DEFAULT_HEAD };
}

export function compareHref(base: string | null, head?: string): string {
  const url = new URL(window.location.href);
  if (base === null) url.searchParams.delete(COMPARE_PARAM);
  else url.searchParams.set(COMPARE_PARAM, `${base}..${head ?? DEFAULT_HEAD}`);
  return url.pathname + url.search;
}

/** Push a new compare URL and notify listeners (App switches modes on it). */
export function navigateCompare(base: string | null, head?: string, replace = false) {
  const href = compareHref(base, head);
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
