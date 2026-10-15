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

/** Seconds per phase (`phases`) and per step inside each side (`base`, `head`). */
export type CompareTimings = {
  phases?: Record<string, number>;
  base?: Record<string, number>;
  head?: Record<string, number>;
};

export type CompareSnapshot = {
  id: string;
  base: string;
  head: string;
  phase: ComparePhase;
  error: string | null;
  elapsed_seconds: number;
  sides: { base: SideProgress; head: SideProgress };
  timings?: CompareTimings;
};


// -- Picker sources (GET /api/compare/sources) ---------------------------------

export type PrSource = {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  isDraft: boolean;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  checks: "pass" | "fail" | "pending" | null;
  updatedAt: string | null;
  author: string;
  changedFiles: number | null;
  /** Path of a local worktree that has the PR's head branch checked out. */
  worktree: string | null;
  /** False when the head commit isn't local yet; comparing fetches it (objects only). */
  local: boolean;
  crossRepository: boolean;
};

export type WorktreeSource = {
  path: string;
  branch: string | null;
  sha: string;
  /** Unix seconds of the HEAD commit. */
  date: number;
  subject: string;
  locked: boolean;
  /** This is the repo being analyzed. */
  current: boolean;
};

export type BranchSource = {
  name: string;
  remote: boolean;
  sha: string;
  date: number;
  subject: string;
  upstream: string | null;
  /** A local branch whose remote branch is the same commit (that remote row is folded into this one). */
  pushed: boolean;
  worktree: string | null;
  /** Commits ahead of / behind the default branch (null on git < 2.41). */
  ahead: number | null;
  behind: number | null;
};

type SourceBase = { repo: string; available: boolean; reason: string | null };
export type PrSection = SourceBase & { kind: "prs"; mine: boolean; items: PrSource[] };
export type WorktreeSection = SourceBase & { kind: "worktrees"; items: WorktreeSource[] };
export type BranchSection = SourceBase & { kind: "branches"; defaultBranch: string | null; items: BranchSource[] };
export type SourceKind = "prs" | "worktrees" | "branches";
type SectionOf = { prs: PrSection; worktrees: WorktreeSection; branches: BranchSection };

export function fetchSource<K extends SourceKind>(
  kind: K,
  opts: { all?: boolean; refresh?: boolean } = {}
): Promise<SectionOf[K]> {
  const params = new URLSearchParams({ kind });
  const repo = compareRepo();
  if (repo) params.set("path", repo);
  if (opts.all) params.set("all", "true");
  if (opts.refresh) params.set("refresh", "true");
  return fetch(`/api/compare/sources?${params}`).then((r) => json<SectionOf[K]>(r));
}

// -- Commit stepping (GET /api/compare/commits, POST /api/compare/prewarm) -----

export type StepCommit = {
  sha: string;
  short: string;
  subject: string;
  author: string;
  date: number;
  /** First parent: what this commit's step compares against. */
  parent: string | null;
};
export type CommitList = {
  base: { sha: string; label: string; subject: string };
  head: { sha: string | null; label: string };
  commits: StepCommit[];
  total: number;
  truncated: boolean;
};

export function fetchCommits(base: string, head: string): Promise<CommitList> {
  const params = new URLSearchParams({ base, head });
  const repo = compareRepo();
  if (repo) params.set("path", repo);
  return fetch(`/api/compare/commits?${params}`).then((r) => json<CommitList>(r));
}

/** Scan one commit side in the background so the next step is a cache hit. Best effort. */
export const prewarm = (ref: string) =>
  fetch("/api/compare/prewarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref, path: compareRepo() ?? undefined }),
  }).catch(() => undefined);

export const DEFAULT_BASE = "merge-base";
/** Base that follows the head: its open PR's base, else the merge-base with the default branch. */
export const AUTO_BASE = "auto";
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


export const startCompare = (base: string, head: string, force = false) =>
  fetch("/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base, head, force, path: compareRepo() ?? undefined }),
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
/**
 * The analyzed repo, shared with the main app's location (`navigation/location.ts`).
 * Compare URLs keep it, so the compare runs on the repo the user is looking at
 * rather than the server's root.
 */
export const REPO_PARAM = "repo";

export function compareRepo(search = window.location.search): string | null {
  return new URLSearchParams(search).get(REPO_PARAM) || null;
}

export function readCompareParam(search = window.location.search): { base: string; head: string } | null {
  const raw = new URLSearchParams(search).get(COMPARE_PARAM);
  if (raw === null) return null;
  const at = raw.indexOf("..");
  if (at < 0) return { base: raw || DEFAULT_BASE, head: DEFAULT_HEAD };
  return { base: raw.slice(0, at) || DEFAULT_BASE, head: raw.slice(at + 2) || DEFAULT_HEAD };
}

export function compareHref(base: string | null, head?: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(PICK_PARAM);
  url.searchParams.delete(RANGE_PARAM);
  if (base === null) url.searchParams.delete(COMPARE_PARAM);
  else url.searchParams.set(COMPARE_PARAM, `${base}..${head ?? DEFAULT_HEAD}`);
  return url.pathname + url.search;
}

/** While stepping commits: the whole range being stepped through (`<base>..<head>`, e.g. `pr:48..pr:48`). */
export const RANGE_PARAM = "crange";

export function readRangeParam(search = window.location.search): { base: string; head: string } | null {
  const raw = new URLSearchParams(search).get(RANGE_PARAM);
  const at = raw?.indexOf("..") ?? -1;
  return raw && at > 0 ? { base: raw.slice(0, at), head: raw.slice(at + 2) } : null;
}

/** Navigate to a compare and set (or with `null`, clear) the stepped range. */
export function navigateStep(base: string, head: string, range: { base: string; head: string } | null) {
  const url = new URL(compareHref(base, head), window.location.origin);
  if (range) url.searchParams.set(RANGE_PARAM, `${range.base}..${range.head}`);
  else url.searchParams.delete(RANGE_PARAM);
  window.history.pushState(null, "", url.pathname + url.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Asks CompareApp to open the picker once on arrival (set by the main app's Compare button). */
export const PICK_PARAM = "cpick";

/** Enter compare mode from the main app: default compare running on the current `repo`, picker open. */
export function enterCompare() {
  const url = new URL(compareHref(DEFAULT_BASE, DEFAULT_HEAD), window.location.origin);
  url.searchParams.set(PICK_PARAM, "1");
  window.history.pushState(null, "", url.pathname + url.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Push a new compare URL and notify listeners (App switches modes on it). */
export function navigateCompare(base: string | null, head?: string, replace = false) {
  const href = compareHref(base, head);
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
