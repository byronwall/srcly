// Fetches for the Changes view. `?clmock=1` answers from sample.ts instead of
// the server (`clmock=empty|nogit|error` show the other states).

import type { ChangeLensPayload, LensHunkDiff, LensMode, LensWindow } from "./types";

export interface LensQuery {
  /** Absolute path of the scan root. */
  path: string;
  window: LensWindow;
  mode: LensMode;
  base?: string;
  head?: string;
  since?: string;
  until?: string;
}

/** A failed request. Status 409 means the folder is not a git repo. */
export class LensError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const mockKind = (): string | null =>
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("clmock");

function params(q: LensQuery): URLSearchParams {
  const p = new URLSearchParams({ path: q.path, window: q.window, mode: q.mode });
  if (q.window === "custom") {
    if (q.base) p.set("base", q.base);
    if (q.head) p.set("head", q.head);
    if (q.since) p.set("since", q.since);
    if (q.until) p.set("until", q.until);
  }
  return p;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.ok) return (await res.json()) as T;
  let reason = `The server answered ${res.status}`;
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") reason = body.detail;
  } catch {
    // No JSON body: keep the status text.
  }
  throw new LensError(res.status, reason);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchChangeLens(q: LensQuery): Promise<ChangeLensPayload> {
  const mock = mockKind();
  if (!mock) return getJson<ChangeLensPayload>(`/api/change-lens?${params(q)}`);
  await pause(120);
  if (mock === "nogit") throw new LensError(409, `${q.path} is not inside a git repository.`);
  if (mock === "error") throw new LensError(500, "git log failed: fatal: bad revision 'HEAD'");
  const sample = await import("./sample");
  return mock === "empty" ? sample.emptyPayload(q) : sample.samplePayload(q);
}

export async function fetchHunk(q: LensQuery, chunk: string, commit?: string): Promise<LensHunkDiff> {
  if (mockKind()) {
    await pause(120);
    return (await import("./sample")).sampleHunk(q, chunk, commit);
  }
  const p = params(q);
  p.set("chunk", chunk);
  if (commit) p.set("commit", commit);
  return getJson<LensHunkDiff>(`/api/change-lens/hunk?${p}`);
}
