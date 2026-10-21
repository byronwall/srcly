import { createSignal } from "solid-js";
import {
  cancelScan,
  emptySnapshot,
  fetchScanFindings,
  fetchScanResult,
  startScan,
  watchScan,
  type ScanSnapshot,
} from "../services/scanJobs";
import type { ClientStage } from "../utils/scanProgress";
import { defaultActivityWindow, type FindingsInfo } from "../utils/metricsStore";
import { nameScanRoot } from "../utils/explorerScope";

const FINDINGS_POLL_MS = 2000;

const ACTIVITY_WINDOW_KEY = "srcly.activityWindow";

function storedActivityWindow(): string | null {
  try {
    return localStorage.getItem(ACTIVITY_WINDOW_KEY);
  } catch {
    return null;
  }
}

// The analyzed repo lives here, outside any component, so switching to compare
// mode or stepping through history can never drop it. `AppContent` drives it
// and draws it; nothing here touches the DOM except waiting for a frame.

/** Resolves after the browser has painted a frame (or 100ms in a hidden tab). */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0)
    );
  });

export interface StartOptions {
  force?: boolean;
  /** Shown in the progress panel before the server reports the real root. */
  displayPath?: string;
  /** Resolves once the view has painted the new tree (keeps the progress panel up until then). */
  waitForPaint?: () => Promise<void>;
  /** Called after a completed scan is on screen. */
  onComplete?: (snapshot: ScanSnapshot) => void;
}

export function createScanStore() {
  const [data, setData] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [scan, setScan] = createSignal<ScanSnapshot | null>(null);
  const [cancelling, setCancelling] = createSignal(false);
  const [clientStage, setClientStage] = createSignal<ClientStage | null>(null);
  // Path of the last requested analysis ("" = server's current directory).
  const [scannedPath, setScannedPath] = createSignal<string | null>(null);
  // Git history window for commit_count / churn_lines. Changing it refetches
  // the finished result (the server re-lays activity over its cached tree);
  // it never rescans.
  const [activityWindow, setActivityWindowSignal] = createSignal<string | null>(storedActivityWindow());
  const [activityLoading, setActivityLoading] = createSignal(false);
  let completedScanId: string | null = null;
  // Identifies the newest request so late responses from a superseded scan are ignored.
  let activeRequest = 0;
  let stopWatching: (() => void) | null = null;
  let findingsTimer: ReturnType<typeof setTimeout> | null = null;

  const stopFindingsPoll = () => {
    if (findingsTimer) clearTimeout(findingsTimer);
    findingsTimer = null;
  };

  // Lint/type checks run beside the scan and can outlast it (tsc on a big
  // project). The first result says "running"; poll until they finish, then
  // refetch so the counts land without a rescan.
  const pollFindings = (request: number, id: string) => {
    stopFindingsPoll();
    if ((data()?.findings as FindingsInfo | undefined)?.status !== "running") return;
    findingsTimer = setTimeout(async () => {
      findingsTimer = null;
      if (request !== activeRequest || completedScanId !== id) return;
      try {
        const info = await fetchScanFindings<FindingsInfo>(id);
        if (request !== activeRequest || completedScanId !== id) return;
        if (info.status === "running") return pollFindings(request, id);
        const result = await fetchScanResult<any>(id, currentActivityWindow());
        if (request === activeRequest && completedScanId === id) setData(nameScanRoot(result));
      } catch (err) {
        // The tree is still good without counts; try again shortly.
        console.warn("Couldn't read the checks' status", err);
        if (request === activeRequest) pollFindings(request, id);
      }
    }, FINDINGS_POLL_MS);
  };

  const currentActivityWindow = () => activityWindow() ?? defaultActivityWindow();

  /** Pick the activity window; refetches the current result with it. */
  const setActivityWindow = async (next: string) => {
    setActivityWindowSignal(next);
    try {
      localStorage.setItem(ACTIVITY_WINDOW_KEY, next);
    } catch {
      // Per-viewer convenience only.
    }
    const id = completedScanId;
    if (!id || !data()) return;
    const request = activeRequest;
    setActivityLoading(true);
    try {
      const result = await fetchScanResult<any>(id, next);
      if (request === activeRequest && completedScanId === id) {
        setData(nameScanRoot(result));
        pollFindings(request, id);
      }
    } catch (err) {
      if (request === activeRequest) setError(String(err instanceof Error ? err.message : err));
    } finally {
      if (request === activeRequest) setActivityLoading(false);
    }
  };

  const finish = async (request: number, snapshot: ScanSnapshot, options: StartOptions) => {
    if (request !== activeRequest) return;
    try {
      if (snapshot.phase === "complete") {
        // Keep the progress panel up through download, parse and the first
        // paint: on large repos those take seconds after the scan ends.
        setClientStage("loading");
        const result = await fetchScanResult<any>(snapshot.id, currentActivityWindow());
        if (request !== activeRequest) return;
        setClientStage("rendering");
        // Let the browser show "Drawing treemap" before the layout work
        // below holds the main thread.
        await nextFrame();
        if (request !== activeRequest) return;
        const painted = options.waitForPaint?.();
        completedScanId = snapshot.id;
        setData(nameScanRoot(result));
        pollFindings(request, snapshot.id);
        await painted;
        if (request !== activeRequest) return;
        options.onComplete?.(snapshot);
      } else if (snapshot.phase === "failed") {
        setError(snapshot.error || "The scan failed.");
      }
      // "cancelled" needs no message: the user asked for it.
    } catch (err) {
      if (request !== activeRequest) return;
      console.error(err);
      setError(String(err));
    } finally {
      if (request === activeRequest) {
        setLoading(false);
        setScan(null);
        setCancelling(false);
        setClientStage(null);
      }
    }
  };

  /** Analyze `path` ("" = the server's directory), superseding any running scan. */
  const start = async (path: string, options: StartOptions = {}) => {
    const request = ++activeRequest;
    stopFindingsPoll();
    stopWatching?.();
    stopWatching = null;
    const previous = scan();
    if (previous) void cancelScan(previous.id);

    // Clear existing analysis data immediately so we don't show stale visuals
    completedScanId = null;
    setData(null);
    setLoading(true);
    setCancelling(false);
    setClientStage(null);
    setError(null);

    const trimmed = path?.trim() || null;
    setScannedPath(trimmed ?? "");
    setScan(emptySnapshot("", trimmed ?? options.displayPath ?? ""));
    try {
      const started = await startScan(trimmed, { force: options.force });
      if (request !== activeRequest) {
        void cancelScan(started.id);
        return;
      }
      setScan(started);
      stopWatching = watchScan(started.id, {
        onUpdate: (snapshot) => {
          if (request === activeRequest) setScan(snapshot);
        },
        onDone: (snapshot) => void finish(request, snapshot, options),
      });
    } catch (err) {
      if (request !== activeRequest) return;
      console.error(err);
      setError(String(err instanceof Error ? err.message : err));
      setLoading(false);
      setScan(null);
    }
  };

  const cancel = () => {
    const current = scan();
    if (!current?.id) return;
    setCancelling(true);
    void cancelScan(current.id);
  };

  /** Stop watching and forget everything (tests, HMR). */
  const dispose = () => {
    activeRequest++;
    stopFindingsPoll();
    stopWatching?.();
    stopWatching = null;
    setData(null);
    setLoading(false);
    setScan(null);
    setScannedPath(null);
  };

  return {
    data,
    loading,
    error,
    setError,
    scan,
    cancelling,
    clientStage,
    scannedPath,
    activityWindow: currentActivityWindow,
    activityLoading,
    setActivityWindow,
    start,
    cancel,
    dispose,
  };
}

export type ScanStore = ReturnType<typeof createScanStore>;

/** The app's one scan. */
export const scanStore = createScanStore();

if (import.meta.hot) import.meta.hot.dispose(() => scanStore.dispose());
