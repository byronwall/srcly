// Text for the Changes view: group labels, signed numbers, before → after.

import { formatMetricValue } from "../utils/metricsStore";
import type { BeforeAfter, ChunkMatch, ChunkStatus, LensChunk, LensSelection } from "./types";

const CLASS_PLURAL: Record<string, string> = {
  test: "tests",
  docs: "docs",
  style: "styles",
  config: "config",
  fixture: "fixtures",
  generated: "generated",
  vendor: "vendored",
};

/**
 * `5 edited / 43 files · mostly tests`. `total` is the number of files in the
 * folder, when the scan knows it. "mostly" needs more than half of the edited
 * files in one class, and never names plain code.
 */
export function folderLabel(g: { edited: number; total: number | null; classes: readonly string[] }): string {
  const count = g.total === null || g.total < g.edited ? `${g.edited} edited` : `${g.edited} edited / ${g.total} ${g.total === 1 ? "file" : "files"}`;
  const tally = new Map<string, number>();
  for (const c of g.classes) tally.set(c, (tally.get(c) ?? 0) + 1);
  const [top, n] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? ["code", 0];
  return top !== "code" && n * 2 > g.classes.length ? `${count} · mostly ${CLASS_PLURAL[top] ?? top}` : count;
}

export const STATUS_LABEL: Record<ChunkStatus, string> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  moved: "Moved",
  reverted: "Reverted",
};

/** What to say about how the chunk was paired with base; "" when there is nothing to add. */
export function matchNote(chunk: Pick<LensChunk, "match" | "oldPath">): string {
  const notes: Record<ChunkMatch, string> = {
    exact: "",
    none: "",
    "renamed-file": chunk.oldPath ? `File renamed from ${chunk.oldPath}` : "File renamed",
    moved: chunk.oldPath ? `Moved from ${chunk.oldPath}` : "Moved from another file",
    uncertain: "Paired with base by a best guess",
  };
  return notes[chunk.match];
}

export const signed = (n: number, digits = 0): string => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits).replace(/\.0+$/, "")}`;

/** `6 → 11`, `new → 12`, `4 → gone`; null when neither side has a value. */
export function beforeAfter(metric: string, pair: BeforeAfter | undefined): string | null {
  if (!pair || (pair.before === null && pair.after === null)) return null;
  const side = (v: number | null, missing: string) => (v === null ? missing : formatMetricValue(metric, v));
  return `${side(pair.before, "new")} → ${side(pair.after, "gone")}`;
}

/** `Nov 19, 2:02 PM` in the server's time zone. */
export function formatTime(iso: string | null, timezone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone });
  } catch {
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
}

/** The window's time limits with the zone, or "" for a window without them. */
export function timeLimits(s: Pick<LensSelection, "since" | "until" | "timezone">): string {
  if (!s.since && !s.until) return "";
  const from = s.since ? formatTime(s.since, s.timezone) : "the start";
  const to = s.until ? formatTime(s.until, s.timezone) : "now";
  return `${from} – ${to} (${s.timezone})`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
