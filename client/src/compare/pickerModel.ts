// Pure helpers for ComparePicker: what a pick compares, search, and short labels.

import { AUTO_BASE, DEFAULT_BASE, DEFAULT_HEAD, type BranchSource, type PrSource, type WorktreeSource } from "./api";

export type Pick = { base: string; head: string };

export const prRef = (n: number) => `pr:${n}`;

/** A PR compares its merge-base with its own base branch against its head. */
export const pickPr = (pr: PrSource): Pick => ({ base: prRef(pr.number), head: prRef(pr.number) });

/** A branch compares against its open PR's base, else the merge-base with the default branch. */
export const pickBranch = (b: BranchSource): Pick => ({ base: AUTO_BASE, head: b.name });

/** A worktree compares its checked-out commit (its branch, or the detached SHA). */
export const pickWorktree = (w: WorktreeSource): Pick =>
  w.current ? { base: AUTO_BASE, head: DEFAULT_HEAD } : { base: AUTO_BASE, head: w.branch ?? w.sha };

/** Every whitespace-separated token appears in one of the fields (case-insensitive). */
export function matches(query: string, fields: (string | null | undefined)[]): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = fields.filter(Boolean).join("\n").toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export const prFields = (pr: PrSource) => [`#${pr.number}`, String(pr.number), pr.title, pr.headRefName, pr.baseRefName, pr.author];
export const worktreeFields = (w: WorktreeSource) => [w.branch, w.path, w.sha.slice(0, 7), w.subject];
export const branchFields = (b: BranchSource) => [b.name, b.subject, b.sha.slice(0, 7)];

/** Compact age: `now`, `5m`, `3h`, `2d`, `4w`, `3mo`, `2y`. Takes unix seconds or an ISO string. */
export function shortAgo(when: number | string | null | undefined, now = Date.now()): string {
  if (when === null || when === undefined || when === "" || when === 0) return "";
  const ms = typeof when === "number" ? when * 1000 : Date.parse(when);
  if (Number.isNaN(ms)) return "";
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  if (s < 30 * 86400) return `${Math.floor(s / (7 * 86400))}w`;
  if (s < 365 * 86400) return `${Math.floor(s / (30 * 86400))}mo`;
  return `${Math.floor(s / (365 * 86400))}y`;
}

/** `/Users/me/x` → `~/x` (also `/home/me`). */
export const tildePath = (path: string) => path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");

/** Human text for a ref in the trigger: `pr:42` → `#42`, `WORKTREE` → `working tree`. */
export function refText(ref: string): string {
  if (ref === DEFAULT_HEAD) return "working tree";
  if (ref === DEFAULT_BASE) return "merge-base";
  if (ref === AUTO_BASE) return "base";
  const pr = /^pr:(\d+)$/.exec(ref);
  if (pr) return `#${pr[1]}`;
  if (/^[0-9a-f]{40}$/.test(ref)) return ref.slice(0, 7);
  return ref;
}

/** The PR number when both sides are the same `pr:<n>`. */
export function prNumberOf(pick: Pick): number | null {
  const m = /^pr:(\d+)$/.exec(pick.head);
  return m && pick.base === pick.head ? Number(m[1]) : null;
}
