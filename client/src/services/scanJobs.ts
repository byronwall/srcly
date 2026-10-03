/**
 * Client for the scan job API (`server/app/routers/scans.py`).
 *
 * Progress arrives over Server-Sent Events. Every event carries the full job
 * snapshot, so reconnects need no replay: EventSource retries on its own, and
 * if the stream is closed for good we fall back to polling the snapshot.
 */

export type ScanPhase =
  | "queued"
  | "discovering"
  | "analyzing"
  | "building"
  | "complete"
  | "failed"
  | "cancelled";

export type ScanFailure = { path: string; reason: string; detail: string };
export type ScanInFlight = { path: string; running_seconds: number };

export type ScanSnapshot = {
  id: string;
  path: string;
  phase: ScanPhase;
  version: number;
  files_discovered: number;
  files_total: number;
  files_done: number;
  files_failed: number;
  current_path: string | null;
  elapsed_seconds: number;
  error: string | null;
  failures: ScanFailure[];
  /** Files currently being analyzed, longest-running first. */
  in_progress: ScanInFlight[];
};

export const TERMINAL_PHASES: ReadonlySet<ScanPhase> = new Set([
  "complete",
  "failed",
  "cancelled",
]);

const POLL_INTERVAL_MS = 1000;

export function emptySnapshot(id: string, path = ""): ScanSnapshot {
  return {
    id,
    path,
    phase: "queued",
    version: 0,
    files_discovered: 0,
    files_total: 0,
    files_done: 0,
    files_failed: 0,
    current_path: null,
    elapsed_seconds: 0,
    error: null,
    failures: [],
    in_progress: [],
  };
}

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // Body was not JSON; keep the status text.
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function startScan(path: string | null): Promise<ScanSnapshot> {
  const res = await fetch("/api/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: path || null }),
  });
  return expectJson<ScanSnapshot>(res);
}

export async function cancelScan(id: string): Promise<void> {
  await fetch(`/api/scans/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchScanResult<T>(id: string): Promise<T> {
  const res = await fetch(`/api/scans/${encodeURIComponent(id)}/result`);
  return expectJson<T>(res);
}

/**
 * Subscribe to progress for a scan. `onUpdate` sees every snapshot (including
 * the terminal one); `onDone` fires once with the terminal snapshot. Returns
 * an unsubscribe function.
 */
export function watchScan(
  id: string,
  handlers: {
    onUpdate: (snapshot: ScanSnapshot) => void;
    onDone: (snapshot: ScanSnapshot) => void;
  }
): () => void {
  let stopped = false;
  let lastVersion = -1;
  let source: EventSource | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    stopped = true;
    source?.close();
    source = null;
    if (pollTimer) clearTimeout(pollTimer);
  };

  const accept = (snapshot: ScanSnapshot) => {
    if (stopped || snapshot.version < lastVersion) return;
    lastVersion = snapshot.version;
    handlers.onUpdate(snapshot);
    if (TERMINAL_PHASES.has(snapshot.phase)) {
      stop();
      handlers.onDone(snapshot);
    }
  };

  const poll = async () => {
    if (stopped) return;
    try {
      const res = await fetch(`/api/scans/${encodeURIComponent(id)}`);
      if (res.status === 404) {
        // The server restarted or pruned the job; it will never finish.
        const gone: ScanSnapshot = {
          ...emptySnapshot(id),
          version: lastVersion + 1,
          phase: "failed",
          error: "The server no longer knows about this scan. Start it again.",
        };
        accept(gone);
        return;
      }
      accept(await expectJson<ScanSnapshot>(res));
    } catch {
      // Transient failure; try again on the next tick.
    }
    if (!stopped) pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  if (typeof EventSource === "undefined") {
    void poll();
    return stop;
  }

  source = new EventSource(`/api/scans/${encodeURIComponent(id)}/events`);
  const onMessage = (event: MessageEvent<string>) => {
    try {
      accept(JSON.parse(event.data) as ScanSnapshot);
    } catch {
      // Ignore malformed frames; the next snapshot supersedes them.
    }
  };
  for (const name of ["progress", ...TERMINAL_PHASES]) {
    source.addEventListener(name, onMessage as EventListener);
  }
  source.onerror = () => {
    // CONNECTING means EventSource is retrying by itself. CLOSED means it
    // gave up (e.g. a proxy rejected the stream), so switch to polling.
    if (source?.readyState === EventSource.CLOSED && !stopped) {
      source.close();
      source = null;
      void poll();
    }
  };

  return stop;
}
