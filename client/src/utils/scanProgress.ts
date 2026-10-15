import type { ScanSnapshot } from "../services/scanJobs";

export type ScanStepId = "discovering" | "analyzing" | "building" | "drawing";

export const SCAN_STEPS: { id: ScanStepId; label: string }[] = [
  { id: "discovering", label: "Find files" },
  { id: "analyzing", label: "Analyze" },
  { id: "building", label: "Build tree" },
  { id: "drawing", label: "Draw map" },
];

/**
 * Work the client still does after the server finishes: downloading and
 * parsing the result ("loading"), then laying out and painting the treemap
 * ("rendering"). On large repos this takes seconds, so it gets its own step.
 */
export type ClientStage = "loading" | "rendering";

export type ScanStepState = "pending" | "active" | "done";

export type ScanProgressView = {
  /** 0..1, or null while the total is unknown (indeterminate bar). */
  fraction: number | null;
  headline: string;
  detail: string;
  /** Estimated seconds remaining, once there is enough signal. */
  etaSeconds: number | null;
  /** A file that has been running long enough to explain a stall. */
  slowFile: { path: string; seconds: number } | null;
  steps: { id: ScanStepId; label: string; state: ScanStepState }[];
};

// Wait for this many files before estimating; early rates are noisy because
// workers are still starting.
const MIN_FILES_FOR_ETA = 10;
const MIN_SECONDS_FOR_ETA = 1;
// Call out an in-flight file once it has run this long.
const SLOW_FILE_SECONDS = 2;

const STEP_ORDER: Record<string, number> = {
  queued: -1,
  discovering: 0,
  analyzing: 1,
  building: 2,
  drawing: 3,
  complete: 4,
  failed: 4,
  cancelled: 4,
};

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Summary of a finished scan: how many files, and how long or how old. */
export function describeResult(snapshot: ScanSnapshot, nowSeconds = Date.now() / 1000): string {
  const files = `${formatCount(snapshot.files_total)} files`;
  if (snapshot.cached && snapshot.cached_at) {
    return `${files}, scanned ${formatAgo(nowSeconds - snapshot.cached_at)}`;
  }
  return `${files} in ${formatDuration(snapshot.elapsed_seconds)}`;
}

/** Show the path relative to the scan root when possible. */
export function relativeToRoot(path: string | null, root: string): string {
  if (!path) return "";
  if (root && path.startsWith(root)) {
    const rel = path.slice(root.length).replace(/^[/\\]+/, "");
    return rel || ".";
  }
  return path;
}

export function describeScan(
  snapshot: ScanSnapshot,
  stage: ClientStage | null = null
): ScanProgressView {
  const order = stage ? STEP_ORDER.drawing : STEP_ORDER[snapshot.phase] ?? -1;
  const steps = SCAN_STEPS.map((step) => {
    const stepOrder = STEP_ORDER[step.id];
    const state: ScanStepState =
      order > stepOrder ? "done" : order === stepOrder ? "active" : "pending";
    return { ...step, state };
  });

  const { files_done: done, files_total: total, elapsed_seconds: elapsed } = snapshot;

  let fraction: number | null = null;
  let etaSeconds: number | null = null;
  let headline = "Starting scan";
  let detail = "";
  let slowFile: ScanProgressView["slowFile"] = null;

  if (stage) {
    // Indeterminate: parse and layout report no progress of their own.
    headline =
      stage === "rendering"
        ? "Drawing treemap"
        : snapshot.cached
          ? "Loading saved analysis"
          : "Loading results";
    detail = describeResult(snapshot);
    return { fraction: null, headline, detail, etaSeconds: null, slowFile: null, steps };
  }

  switch (snapshot.phase) {
    case "queued":
      break;
    case "discovering":
      headline = "Finding files";
      detail =
        snapshot.files_discovered > 0
          ? `${formatCount(snapshot.files_discovered)} files found so far`
          : "Reading .gitignore rules";
      break;
    case "analyzing": {
      headline = `Analyzing ${formatCount(done)} of ${formatCount(total)} files`;
      fraction = total > 0 ? done / total : 1;
      const oldest = snapshot.in_progress?.[0];
      if (oldest && oldest.running_seconds >= SLOW_FILE_SECONDS) {
        slowFile = {
          path: relativeToRoot(oldest.path, snapshot.path),
          seconds: oldest.running_seconds,
        };
      }
      if (
        !slowFile &&
        done >= MIN_FILES_FOR_ETA &&
        elapsed >= MIN_SECONDS_FOR_ETA &&
        done < total
      ) {
        // Elapsed covers discovery too, which slightly overestimates; fine
        // for a rough "about N left". Skipped during a stall (the rate says
        // nothing about one slow file) and when under a second.
        const eta = ((total - done) * elapsed) / done;
        etaSeconds = eta >= 1 ? eta : null;
      }
      detail =
        done === 0
          ? "Starting analysis workers…"
          : relativeToRoot(snapshot.current_path, snapshot.path);
      break;
    }
    case "building":
      headline = "Building tree";
      fraction = 1;
      detail = `${formatCount(total)} files analyzed`;
      break;
    case "complete":
      headline = "Scan complete";
      fraction = 1;
      detail = `${formatCount(total)} files in ${formatDuration(elapsed)}`;
      break;
    case "failed":
      headline = "Scan failed";
      detail = snapshot.error ?? "";
      break;
    case "cancelled":
      headline = "Scan cancelled";
      break;
  }

  return { fraction, headline, detail, etaSeconds, slowFile, steps };
}
