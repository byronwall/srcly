// Fetches for the Changes view.
//
// The default reads HEAD and includes uncommitted edits. The Changes UI can
// explicitly request the committed range. Custom windows pick base and head.
// `history: main` makes a time window read the default branch instead of HEAD.

import type { ChangeLensPayload, LensHistory, LensHunkDiff, LensMode, LensPathDiff, LensWindow } from "./types";

export interface LensQuery {
  /** Absolute path of the scan root. */
  path: string;
  window: LensWindow;
  mode: LensMode;
  base?: string;
  head?: string;
  since?: string;
  until?: string;
  history?: LensHistory | null;
  committedOnly?: boolean;
}

/** A failed request. Status 409 means the folder is not a git repo. */
export class LensError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function params(q: LensQuery): URLSearchParams {
  const p = new URLSearchParams({ path: q.path, window: q.window, mode: q.mode });
  if (q.committedOnly) p.set("worktree", "false");
  if (q.history) p.set("history", q.history);
  if (q.window === "custom") {
    if (q.base) p.set("base", q.base);
    if (q.head) p.set("head", q.head);
    if (q.since) p.set("since", q.since);
    if (q.until) p.set("until", q.until);
  }
  return p;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (res.ok) return (await res.json()) as T;
  let reason = `The server answered ${res.status}`;
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") reason = body.detail;
  } catch {
    // No JSON body: keep the status text.
  }
  if (res.status === 404 && reason === "Not Found") reason = "This srcly server has no /api/change-lens endpoint (404). It is older than the Changes view.";
  throw new LensError(res.status, reason);
}

export const fetchChangeLens = (q: LensQuery) => getJson<ChangeLensPayload>(`/api/change-lens?${params(q)}`);

export function fetchHunk(q: LensQuery, chunk: string, commit?: string): Promise<LensHunkDiff> {
  const p = params(q);
  p.set("chunk", chunk);
  if (commit) p.set("commit", commit);
  return getJson<LensHunkDiff>(`/api/change-lens/hunk?${p}`);
}


export function fetchPathDiff(q: LensQuery, id: string, commit?: string, signal?: AbortSignal): Promise<LensPathDiff> {
  const p = params(q);
  p.set("id", id);
  if (commit) p.set("commit", commit);
  return getJson<LensPathDiff>(`/api/change-lens/path-diff?${p}`, signal);
}
