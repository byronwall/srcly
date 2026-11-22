// Pure helpers behind the Change Lens panel: review order, rail scale, touch placement, labels.

import type { ChunkMatch, ChunkStatus, LensChunk, LensCommit, LensTouch } from "../types";
import { WORKTREE } from "../types";

/** Display copy of the server's bucket threshold (server/app/services/changelens). */
export const HOTSPOT_COMPLEXITY = 10;

export const STATUS_LABEL: Record<ChunkStatus, string> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  moved: "Moved",
  reverted: "Reverted",
};

export const STATUS_COLOR: Record<ChunkStatus, string> = {
  modified: "var(--plc-warning)",
  added: "var(--plc-success)",
  deleted: "var(--plc-error)",
  moved: "var(--plc-accent)",
  reverted: "var(--plc-on-disabled)",
};

export const STATUS_ORDER: ChunkStatus[] = ["modified", "added", "deleted", "moved", "reverted"];

/** Matches the UI names; `exact` and `none` need no badge. */
export const MATCH_LABEL: Partial<Record<ChunkMatch, string>> = {
  uncertain: "Uncertain match",
  moved: "Moved",
  "renamed-file": "File renamed",
};

export const churn = (c: { added: number; deleted: number }) => c.added + c.deleted;
export const net = (c: LensChunk) => c.netAdded + c.netDeleted;

const complexity = (c: LensChunk) => c.metrics.complexity ?? { before: null, after: null };

/** Chunks in a bucket, in review order: highest complexity first, then most churn. */
export function bucketList(chunks: LensChunk[], bucket: "complex-and-changed" | "new-hotspot"): LensChunk[] {
  const side = bucket === "complex-and-changed" ? "before" : "after";
  return chunks
    .filter((c) => c.buckets.includes(bucket))
    .sort((a, b) => (complexity(b)[side] ?? 0) - (complexity(a)[side] ?? 0) || churn(b) - churn(a));
}

/** Every chunk, most churn first; ties by path and line so the order is stable. */
export function editsByChurn(chunks: LensChunk[], status: ChunkStatus | "", fileClass: string): LensChunk[] {
  return chunks
    .filter((c) => (!status || c.status === status) && (!fileClass || c.fileClass === fileClass))
    .sort((a, b) => churn(b) - churn(a) || a.path.localeCompare(b.path) || a.startLine - b.startLine);
}

/** Count of each value, in first-seen order. */
export function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return [...out];
}

/**
 * Commit positions in [0, 1], oldest at 0. Each gap counts as `1 + ln(1 + minutes)`,
 * so three commits five minutes apart stay apart and a quiet weekend doesn't
 * push them into one pixel. One commit sits in the middle.
 */
export function railPositions(dates: string[]): number[] {
  if (dates.length === 0) return [];
  if (dates.length === 1) return [0.5];
  const times = dates.map((d) => Date.parse(d));
  const steps = [0];
  for (let i = 1; i < times.length; i++) {
    const minutes = Math.max(0, (times[i] - times[i - 1]) / 60000);
    steps.push(steps[i - 1] + 1 + Math.log1p(minutes));
  }
  const total = steps[steps.length - 1];
  return steps.map((s) => s / total);
}

export interface TouchMark {
  sha: string;
  /** Index in the window's commits. */
  index: number;
  /** 0..1 along the window's commit order. */
  x: number;
  lines: number;
  /** 0..1 against the chunk's largest touch (square root, so small touches stay visible). */
  size: number;
}

/** Place a chunk's touches on the window's commit order. Touches of unknown commits are dropped. */
export function touchMarks(commits: LensCommit[], touches: LensTouch[]): TouchMark[] {
  const at = new Map(commits.map((c, i) => [c.sha, i]));
  const n = commits.length;
  const max = Math.max(1, ...touches.map(churn));
  return touches.flatMap((t) => {
    const index = at.get(t.sha);
    if (index === undefined) return [];
    const lines = churn(t);
    return [{ sha: t.sha, index, x: n > 1 ? index / (n - 1) : 0.5, lines, size: Math.sqrt(lines / max) }];
  });
}

export const isWorktree = (sha: string | null | undefined) => sha === WORKTREE;

/** "Nov 18, 10:05" in the payload's time zone. */
export function formatTime(iso: string | null, timeZone: string, withYear = false): string {
  if (!iso) return "Working tree";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "Nov 18" in the payload's time zone. */
export function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(iso));
}

export function lineRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}–${end}`;
}

/** Last path segment, for compact rows. */
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
