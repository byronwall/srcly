// Per-root engine availability, outliving any one view (like scanStore).
// `ensureStarted` posts /start once and polls /status every 250 ms while the
// engine builds, so a view can show its progress within a poll.
import { createSignal } from "solid-js";
import { fetchDataflowStatus, startDataflow, type DataflowStatus } from "./api";

export const POLL_MS = 250;

export type Availability = "unknown" | "starting" | "ready" | "na";

const [statuses, setStatuses] = createSignal<Record<string, DataflowStatus>>({});
const polls = new Map<string, number>();
/** Roots with a request in flight that wants progress (e.g. a first route graph). */
const watchers = new Map<string, number>();

export function statusFor(root: string): DataflowStatus | undefined {
  return statuses()[root];
}

export function availabilityFor(root: string): Availability {
  const s = statusFor(root);
  if (!s) return "unknown";
  if (s.state === "na" || !s.available) return "na";
  return s.state === "ready" ? "ready" : "starting";
}

function record(root: string, status: DataflowStatus) {
  setStatuses((all) => ({ ...all, [root]: status }));
}

function schedule(root: string) {
  if (polls.has(root)) return;
  const tick = async () => {
    polls.delete(root);
    try {
      const status = await fetchDataflowStatus(root);
      record(root, status);
      const busy = status.state === "starting" || status.state === "running" || (watchers.get(root) ?? 0) > 0;
      if (busy && status.state !== "na") schedule(root);
    } catch {
      // The server is gone or restarting; the next explicit use retries.
    }
  };
  polls.set(root, window.setTimeout(tick, POLL_MS));
}

/** Start the engine for `root` (once) and keep its status current until it is ready or N/A. */
export async function ensureStarted(root: string): Promise<DataflowStatus> {
  const known = statusFor(root);
  if (known && (known.state === "ready" || known.state === "na")) return known;
  const status = await startDataflow(root);
  record(root, status);
  if (status.state !== "ready" && status.state !== "na") schedule(root);
  return status;
}

/** Keep polling while `promise` runs, so a long query shows the engine's progress. */
export async function watchProgress<T>(root: string, promise: Promise<T>): Promise<T> {
  watchers.set(root, (watchers.get(root) ?? 0) + 1);
  schedule(root);
  try {
    return await promise;
  } finally {
    const left = (watchers.get(root) ?? 1) - 1;
    if (left > 0) watchers.set(root, left);
    else watchers.delete(root);
    void fetchDataflowStatus(root).then((status) => record(root, status), () => {});
  }
}

/** Forget a root's status (after DELETE /api/dataflow). */
export function forget(root: string) {
  const id = polls.get(root);
  if (id !== undefined) window.clearTimeout(id);
  polls.delete(root);
  setStatuses((all) => {
    const next = { ...all };
    delete next[root];
    return next;
  });
}
