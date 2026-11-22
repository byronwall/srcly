// A hand-made Change Lens result for `?clmock=1`: one afternoon and morning of
// work on scan retries in srcly itself. It covers every chunk status, kind and
// match, a not-measured chunk, a reverted change, a merge and the working tree.
// The paths are real srcly files, so Show in repo lines up with the scan tree.

import type { LensQuery } from "./api";
import {
  WORKTREE,
  type BeforeAfter,
  type ChangeLensPayload,
  type ChunkKind,
  type ChunkMatch,
  type ChunkStatus,
  type LensChunk,
  type LensCommit,
  type LensFile,
  type LensHunkDiff,
  type ReviewBucket,
} from "./types";

const TZ = "America/Chicago";

const COMMITS: Omit<LensCommit, "files" | "added" | "deleted" | "chunkIds">[] = [
  { sha: "a41c9e27d0b35f1c8e6a2b9d4f70c1e5a3b8d6f2", short: "a41c9e2", subject: "feat(scan): retry a file that timed out once", author: "Byron Wall", date: "2026-11-19T14:02:11-06:00" },
  { sha: "7be03d14c9a2e6f5b8d1037a6c4e9f2b5d8a1c3e", short: "7be03d1", subject: "test(scan): cover the retry path", author: "Byron Wall", date: "2026-11-19T14:31:40-06:00" },
  { sha: "c55f8a0e3b7d2c9f6a1e4b8d5c2f9a6e3b0d7c4a", short: "c55f8a0", subject: "refactor(scan): move the backoff helper to scan_workers", author: "Byron Wall", date: "2026-11-19T15:10:05-06:00" },
  { sha: "19d4e77a2c5f8b1e4d7a0c3f6b9e2d5a8c1f4b7e", short: "19d4e77", subject: "feat(scan): try a thread pool for retries", author: "Byron Wall", date: "2026-11-19T16:20:48-06:00" },
  { sha: "e02b6f4d8a1c5e9b3f7d2a6c0e4b8f1d5a9c3e7b", short: "e02b6f4", subject: 'Revert "feat(scan): try a thread pool for retries"', author: "Byron Wall", date: "2026-11-19T17:05:22-06:00" },
  { sha: "58aa3c1f7e2b9d4a6c0f3e8b1d5a7c9e2f4b6d8a", short: "58aa3c1", subject: "Merge branch 'progress-panel': show retried files", author: "Byron Wall", date: "2026-11-20T09:40:17-06:00" },
  { sha: "d9017bb3e6a2c8f4d0b5e1a7c3f9d6b2e8a4c0f5", short: "d9017bb", subject: "fix(scan): cap retries per job, add POST /scans/{id}/retry", author: "Byron Wall", date: "2026-11-20T10:15:33-06:00" },
  { sha: "3f6e2ad9c5b1e7a3d8f4c0b6e2a9d5f1c7b3e8a4", short: "3f6e2ad", subject: "docs: retry rules; rename budget.py to size_budget.py", author: "Byron Wall", date: "2026-11-20T11:02:09-06:00" },
  { sha: WORKTREE, short: "now", subject: "Uncommitted changes", author: "", date: null },
];
const [C1, C2, C3, C4, C5, C6, C7, C8] = COMMITS.map((c) => c.sha);

/** path → [LOC at head (null: deleted), file class, status, old path]. */
const FILES: Record<string, [number | null, string, LensFile["status"]?, string?]> = {
  "server/app/services/scan_jobs.py": [480, "code"],
  "server/app/services/scan_workers.py": [342, "code"],
  "server/app/services/scan_progress.py": [39, "code"],
  "server/app/services/size_budget.py": [90, "code", "renamed", "server/app/services/budget.py"],
  "server/app/routers/scans.py": [133, "code"],
  "server/tests/test_scan_jobs.py": [207, "test"],
  "server/tests/test_scan_workers.py": [245, "test"],
  "server/tests/test_scan_error_handling.py": [123, "test"],
  "server/pyproject.toml": [60, "config"],
  "server/uv.lock": [2140, "generated"],
  "client/src/state/scanStore.ts": [251, "code"],
  "client/src/services/scanJobs.ts": [205, "code"],
  "client/src/utils/scanProgress.ts": [183, "code"],
  "client/src/components/feedback/ScanProgress.tsx": [214, "code"],
  "client/src/components/feedback/RetryBadge.tsx": [38, "code", "added"],
  "scripts/dev-server.sh": [34, "config"],
  "docs/adding-a-metric.md": [73, "docs"],
  "README.md": [236, "docs"],
};

type Touch = [sha: string, added: number, deleted: number];
type Pair = [before: number | null, after: number | null];

interface Spec {
  path: string;
  name: string;
  /** Qualified name for the id, when it differs from the display name. */
  q?: string;
  kind: ChunkKind;
  lines: [number, number];
  base?: [number, number];
  status?: ChunkStatus;
  match?: ChunkMatch;
  oldPath?: string;
  touches: Touch[];
  /** Lines that still differ at head; defaults to the touch total. */
  net?: [number, number];
  /** [complexity, cognitive, loc, nesting] pairs; omit a metric with `undefined`. */
  m?: [Pair?, Pair?, Pair?, Pair?];
  na?: string;
  buckets?: ReviewBucket[];
}

const SCAN_JOBS = "server/app/services/scan_jobs.py";
const SCAN_WORKERS = "server/app/services/scan_workers.py";
const SCANS = "server/app/routers/scans.py";
const TEST_JOBS = "server/tests/test_scan_jobs.py";
const TEST_WORKERS = "server/tests/test_scan_workers.py";
const STORE = "client/src/state/scanStore.ts";
const JOBS_TS = "client/src/services/scanJobs.ts";
const PROGRESS_TS = "client/src/utils/scanProgress.ts";
const PANEL = "client/src/components/feedback/ScanProgress.tsx";

const SPECS: Spec[] = [
  // The handler the session kept coming back to: four commits, one of them reverted.
  { path: SCAN_JOBS, name: "run", q: "ScanJob.run", kind: "function", lines: [372, 405], base: [372, 390], touches: [[C1, 14, 2], [C4, 9, 3], [C5, 3, 9], [C7, 6, 1]], net: [18, 3], m: [[6, 11], [8, 17], [19, 34], [2, 4]], buckets: ["new-hotspot"] },
  { path: SCAN_JOBS, name: "file_done", q: "ScanJob.file_done", kind: "function", lines: [334, 352], base: [334, 344], touches: [[C1, 9, 2], [C7, 3, 1]], net: [10, 2], m: [[12, 14], [15, 19], [11, 19], [3, 3]], buckets: ["complex-and-changed"] },
  { path: SCAN_JOBS, name: "start", q: "ScanJobManager.start", kind: "function", lines: [436, 466], touches: [[C7, 4, 1]], m: [[9, 9], [11, 11], [28, 31], [3, 3]] },
  { path: SCAN_JOBS, name: "cancel", q: "ScanJob.cancel", kind: "function", lines: [225, 227], status: "reverted", touches: [[C4, 5, 1], [C5, 1, 5]], net: [0, 0], m: [[2, 2], [1, 1], [3, 3], [1, 1]] },
  { path: SCAN_JOBS, name: "snapshot", q: "ScanJob.snapshot", kind: "function", lines: [193, 222], touches: [[C1, 3, 0], [C7, 2, 1]], net: [4, 0], m: [[5, 5], [4, 4], [27, 31], [2, 2]] },
  { path: SCAN_JOBS, name: "ScanJob", kind: "class", lines: [143, 182], touches: [[C1, 4, 0]], m: [undefined, undefined, [36, 40], undefined] },
  { path: SCAN_JOBS, name: "_legacy_retry", kind: "function", lines: [131, 142], status: "deleted", match: "none", touches: [[C3, 0, 12]], m: [[4, null], [5, null], [12, null], [2, null]] },

  { path: SCAN_WORKERS, name: "_retry_backoff", kind: "function", lines: [118, 131], base: [47, 60], status: "moved", match: "moved", oldPath: SCAN_JOBS, touches: [[C1, 14, 0], [C3, 14, 14]], net: [0, 0], m: [[3, 3], [3, 3], [12, 12], [1, 1]] },
  { path: SCAN_WORKERS, name: "run_file_analyses", kind: "function", lines: [173, 322], base: [160, 296], touches: [[C1, 22, 6], [C4, 31, 4], [C5, 4, 31], [C7, 5, 2]], net: [24, 7], m: [[24, 27], [38, 44], [118, 131], [5, 5]], buckets: ["complex-and-changed"] },
  { path: SCAN_WORKERS, name: "_retry_pool", kind: "function", lines: [133, 133], status: "reverted", match: "none", touches: [[C4, 26, 0], [C5, 0, 26]], net: [0, 0], m: [[null, null], [null, null], [null, null], [null, null]] },
  { path: SCAN_WORKERS, name: "_worker_main", kind: "function", lines: [78, 113], touches: [[C1, 3, 1]], m: [[7, 7], [9, 9], [33, 35], [3, 3]] },

  { path: "server/app/services/scan_progress.py", name: "ScanObserver", kind: "class", lines: [12, 39], base: [12, 33], touches: [[C1, 4, 0], [C6, 2, 0]], m: [undefined, undefined, [20, 26], undefined] },
  { path: "server/app/services/size_budget.py", name: "check", kind: "function", lines: [65, 90], status: "moved", match: "renamed-file", oldPath: "server/app/services/budget.py", touches: [[C8, 0, 0]], net: [0, 0], m: [[5, 5], [6, 6], [22, 22], [2, 2]] },

  { path: SCANS, name: "retry_scan", kind: "function", lines: [84, 118], status: "added", match: "none", touches: [[C7, 35, 0]], m: [[null, 12], [null, 16], [null, 31], [null, 4]], buckets: ["new-hotspot"] },
  { path: SCANS, name: "get_scan", kind: "function", lines: [74, 79], touches: [[C7, 2, 1]], m: [[4, 5], [3, 4], [4, 5], [1, 2]] },
  { path: SCANS, name: "stream_scan", kind: "function", lines: [137, 168], touches: [[C6, 6, 2]], m: [[8, 9], [12, 13], [28, 32], [3, 3]] },

  { path: TEST_JOBS, name: "test_retry_after_timeout", kind: "function", lines: [96, 121], status: "added", match: "none", touches: [[C2, 26, 0]], m: [[null, 2], [null, 1], [null, 22], [null, 1]] },
  { path: TEST_JOBS, name: "test_retry_cap", kind: "function", lines: [123, 139], status: "added", match: "none", touches: [[C7, 17, 0]], m: [[null, 1], [null, 0], [null, 14], [null, 0]] },
  { path: TEST_JOBS, name: "test_cancel_marks_job_cancelled", kind: "function", lines: [84, 94], touches: [[C2, 3, 1], [C4, 4, 0], [C5, 0, 4]], net: [3, 1], m: [[1, 1], [0, 0], [9, 11], [0, 0]] },
  { path: TEST_JOBS, name: "fake_scan", kind: "function", lines: [22, 49], touches: [[C2, 8, 2]], m: [[3, 4], [3, 5], [22, 28], [2, 2]] },
  { path: TEST_WORKERS, name: "test_pool_kills_hung_worker_and_keeps_going", kind: "function", lines: [52, 68], touches: [[C2, 5, 2]], m: [[2, 2], [1, 1], [11, 14], [1, 1]] },
  { path: TEST_WORKERS, name: "test_backoff_grows", kind: "function", lines: [246, 262], status: "added", match: "none", touches: [[C3, 17, 0]], m: [[null, 2], [null, 1], [null, 13], [null, 1]] },
  { path: "server/tests/test_scan_error_handling.py", name: "test_timeout_is_reported_once", kind: "function", lines: [88, 104], touches: [[C2, 6, 3]], m: [[1, 1], [0, 0], [12, 15], [0, 0]] },

  { path: "server/pyproject.toml", name: "pyproject.toml", kind: "file", lines: [18, 24], touches: [[C7, 2, 1]], na: "Config file: no analyzer measures it" },
  { path: "server/uv.lock", name: "uv.lock", kind: "file", lines: [1204, 1262], touches: [[C7, 42, 17]], na: "Generated lock file: out of scope" },

  { path: STORE, name: "createScanStore", kind: "function", lines: [53, 251], base: [53, 236], touches: [[C6, 19, 4], [WORKTREE, 6, 2]], net: [23, 5], m: [[18, 21], [26, 31], [171, 186], [4, 4]], buckets: ["complex-and-changed"] },
  { path: JOBS_TS, name: "watchScan", kind: "function", lines: [127, 205], touches: [[C6, 11, 3]], m: [[7, 8], [9, 11], [68, 76], [3, 3]] },
  { path: JOBS_TS, name: "ScanSnapshot", kind: "class", lines: [18, 42], touches: [[C6, 3, 0]], m: [undefined, undefined, [21, 24], undefined] },
  { path: JOBS_TS, name: "retryScan", kind: "function", lines: [102, 108], status: "added", match: "none", touches: [[C6, 7, 0]], m: [[null, 2], [null, 1], [null, 6], [null, 1]] },
  { path: PROGRESS_TS, name: "describeScan", kind: "function", lines: [93, 141], base: [93, 128], touches: [[C6, 15, 2], [WORKTREE, 4, 1]], net: [18, 3], m: [[5, 9], [6, 13], [33, 46], [2, 3]] },
  { path: PROGRESS_TS, name: "formatElapsed", kind: "function", lines: [55, 63], match: "uncertain", touches: [[C6, 6, 5]], m: [[3, 4], [2, 3], [7, 8], [1, 2]] },
  { path: PROGRESS_TS, name: "retryLabel", kind: "function", lines: [143, 151], status: "added", match: "none", touches: [[WORKTREE, 9, 0]], m: [[null, 2], [null, 1], [null, 8], [null, 1]] },
  { path: PANEL, name: "ScanProgress", kind: "function", lines: [41, 162], base: [41, 139], touches: [[C6, 27, 6], [WORKTREE, 5, 3]], net: [30, 7], m: [[8, 12], [11, 18], [92, 113], [3, 4]], buckets: ["new-hotspot"] },
  { path: PANEL, name: "FailedFileRow", kind: "function", lines: [164, 190], status: "deleted", match: "none", touches: [[C6, 0, 27]], m: [[4, null], [3, null], [24, null], [2, null]] },
  { path: "client/src/components/feedback/RetryBadge.tsx", name: "RetryBadge", kind: "function", lines: [9, 38], status: "added", match: "none", touches: [[C6, 30, 0]], m: [[null, 3], [null, 2], [null, 27], [null, 1]] },

  { path: "scripts/dev-server.sh", name: "lines 17–24", q: "L17-24", kind: "range", lines: [17, 24], touches: [[C7, 3, 1]], na: "No analyzer reads shell scripts" },
  { path: "docs/adding-a-metric.md", name: "## Timeouts and retries", kind: "heading", lines: [56, 73], status: "added", match: "none", touches: [[C8, 18, 0]], m: [undefined, undefined, [null, 14], undefined] },
  { path: "README.md", name: "## How the analysis engine works", kind: "heading", lines: [120, 164], touches: [[C8, 7, 3]], m: [undefined, undefined, [38, 42], undefined] },
];

const METRIC_IDS = ["complexity", "cognitive_complexity", "loc", "max_nesting_depth"];

const idOf = (s: Spec) => (s.kind === "file" ? s.path : `${s.path}::${s.q ?? s.name}`);
const dateOf = (sha: string) => COMMITS.find((c) => c.sha === sha)?.date ?? null;

function build(spec: Spec, shas: Set<string>, net: boolean): LensChunk | null {
  const touches = spec.touches.filter(([sha]) => shas.has(sha));
  if (!touches.length) return null;
  const status = spec.status ?? "modified";
  if (net && status === "reverted") return null;
  const added = touches.reduce((n, t) => n + t[1], 0);
  const deleted = touches.reduce((n, t) => n + t[2], 0);
  const [netAdded, netDeleted] = touches.length === spec.touches.length && spec.net ? spec.net : status === "reverted" ? [0, 0] : [added, deleted];
  const metrics: Record<string, BeforeAfter> = {};
  (spec.m ?? []).forEach((pair, i) => {
    if (pair) metrics[METRIC_IDS[i]] = { before: pair[0], after: pair[1] };
  });
  const dates = touches.map(([sha]) => dateOf(sha)).filter((d): d is string => d !== null);
  const fileClass = FILES[spec.path][1];
  return {
    id: idOf(spec),
    path: spec.path,
    ...(spec.oldPath ? { oldPath: spec.oldPath } : {}),
    kind: spec.kind,
    name: spec.name,
    startLine: spec.lines[0],
    endLine: spec.lines[1],
    ...(status !== "added" ? { baseStartLine: (spec.base ?? spec.lines)[0], baseEndLine: (spec.base ?? spec.lines)[1] } : {}),
    status,
    match: spec.match ?? "exact",
    added: net ? netAdded : added,
    deleted: net ? netDeleted : deleted,
    netAdded,
    netDeleted,
    touches: net ? [] : touches.map(([sha, a, d]) => ({ sha, added: a, deleted: d })),
    firstTouched: dates[0] ?? null,
    lastTouched: dates[dates.length - 1] ?? null,
    metrics,
    measured: !spec.na,
    ...(spec.na ? { naReason: spec.na } : {}),
    buckets: fileClass === "code" ? (spec.buckets ?? []) : [],
    fileClass,
    hunks: (net ? [[null, netAdded, netDeleted] as const] : touches).map(([sha, a, d], i) => ({
      sha,
      oldStart: (spec.base ?? spec.lines)[0] + i * 3,
      oldLines: d + 6,
      newStart: spec.lines[0] + i * 3,
      newLines: a + 6,
    })),
  };
}

const short = (ref: string) => (ref.length > 12 ? ref.slice(0, 7) : ref);

export function samplePayload(q: LensQuery): ChangeLensPayload {
  const net = q.mode === "net";
  // The last day holds the merge, the fix, the docs commit and the working tree.
  const window = q.window === "24h" ? COMMITS.slice(5) : COMMITS;
  const shas = new Set(window.map((c) => c.sha));
  const chunks = SPECS.map((s) => build(s, shas, net)).filter((c): c is LensChunk => c !== null);

  const touchesBySha = new Map<string, { ids: string[]; files: Set<string>; added: number; deleted: number }>();
  for (const spec of SPECS)
    for (const [sha, a, d] of spec.touches) {
      const entry = touchesBySha.get(sha) ?? { ids: [], files: new Set<string>(), added: 0, deleted: 0 };
      entry.ids.push(idOf(spec));
      entry.files.add(spec.path);
      entry.added += a;
      entry.deleted += d;
      touchesBySha.set(sha, entry);
    }
  const live = new Set(chunks.map((c) => c.id));
  const commits: LensCommit[] = window.map((c) => {
    const t = touchesBySha.get(c.sha)!;
    return { ...c, files: t.files.size, added: t.added, deleted: t.deleted, chunkIds: t.ids.filter((id) => live.has(id)) };
  });

  const byFile = new Map<string, LensChunk[]>();
  for (const c of chunks) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c]);
  const files: LensFile[] = [...byFile].map(([path, list]) => {
    const [loc, fileClass, status, oldPath] = FILES[path];
    return {
      path,
      ...(oldPath ? { oldPath } : {}),
      status: status ?? "modified",
      added: list.reduce((n, c) => n + c.added, 0),
      deleted: list.reduce((n, c) => n + c.deleted, 0),
      loc,
      fileClass,
      chunkIds: list.map((c) => c.id),
      outOfScope: fileClass === "generated" || fileClass === "vendor",
    };
  });

  const first = window[0];
  const base =
    q.window === "custom" && q.base
      ? { ref: q.base, sha: "e17633fb2a9c4d5e6f708192a3b4c5d6e7f80910", label: `${short(q.base)} @ e17633f`, date: "2026-11-18T16:44:02-06:00" }
      : q.window === "24h"
        ? { ref: "e02b6f4^1", sha: C5, label: "e02b6f4", date: dateOf(C5) }
        : q.window === "7d"
          ? { ref: "a41c9e2^1", sha: "e17633fb2a9c4d5e6f708192a3b4c5d6e7f80910", label: "e17633f", date: "2026-11-18T16:44:02-06:00" }
          : { ref: "merge-base(main, HEAD)", sha: "e17633fb2a9c4d5e6f708192a3b4c5d6e7f80910", label: "main @ e17633f", date: "2026-11-18T16:44:02-06:00" };
  const day = 24 * 3600 * 1000;
  const until = "2026-11-21T08:30:00-06:00";
  const since = q.window === "custom" ? q.since || null : q.window === "branch" ? null : new Date(Date.parse(until) - (q.window === "24h" ? day : 7 * day)).toISOString();

  return {
    selection: {
      window: q.window,
      mode: q.mode,
      ref: "scan-retries",
      repoRoot: "/repo/srcly",
      base,
      head: q.window === "custom" && q.head ? { ref: q.head, sha: C8, label: `${short(q.head)} @ 3f6e2ad`, date: dateOf(C8) } : { ref: WORKTREE, sha: null, label: "Working tree", date: null },
      since,
      until: q.window === "custom" ? q.until || null : q.window === "branch" ? null : until,
      timezone: TZ,
      includesWorktree: !(q.window === "custom" && q.head),
      notes: [
        `History is read first-parent on scan-retries: merge 58aa3c1 counts once, as its diff against ${first.short === "58aa3c1" ? "e02b6f4" : "its first parent"}.`,
        ...(net ? [] : ["2 chunks changed and were put back inside the window. They show as reverted."]).filter(() => q.window !== "24h"),
      ],
    },
    commits,
    chunks,
    files,
    summary: {
      filesEdited: files.length,
      filesTotal: 1184,
      chunks: chunks.length,
      churnLines: chunks.reduce((n, c) => n + c.touches.reduce((m, t) => m + t.added + t.deleted, 0), 0) || chunks.reduce((n, c) => n + c.added + c.deleted, 0),
      netLines: chunks.reduce((n, c) => n + c.netAdded + c.netDeleted, 0),
      reverted: chunks.filter((c) => c.status === "reverted").length,
    },
    metricIds: METRIC_IDS,
  };
}

export function emptyPayload(q: LensQuery): ChangeLensPayload {
  const full = samplePayload({ ...q, window: "branch" });
  const tip = { ref: "main", sha: "e17633fb2a9c4d5e6f708192a3b4c5d6e7f80910", label: "main @ e17633f", date: "2026-11-18T16:44:02-06:00" };
  return {
    selection: { ...full.selection, window: q.window, mode: q.mode, ref: "main", base: { ...tip, ref: "origin/main", label: "origin/main @ e17633f" }, head: tip, includesWorktree: false, notes: ["main is level with origin/main, and the working tree is clean. There is nothing to show in this window."] },
    commits: [],
    chunks: [],
    files: [],
    summary: { filesEdited: 0, filesTotal: 1184, chunks: 0, churnLines: 0, netLines: 0, reverted: 0 },
    metricIds: [],
  };
}

const RUN_DIFF = `@@ -372,19 +372,34 @@ class ScanJob(ScanObserver):
     def run(self) -> None:
         """Analyze the tree in this thread; the manager owns the thread."""
         try:
-            tree = scan_codebase(self.root_path, observer=self, cancel=self._cancel)
+            tree, timed_out = scan_codebase(self.root_path, observer=self, cancel=self._cancel)
         except ScanCancelled:
             self._finish(ScanPhase.CANCELLED)
             return
         except Exception as exc:  # noqa: BLE001 - reported to the client
             self._finish(ScanPhase.FAILED, error=str(exc))
             return
+        # One more pass over the files that hit the timeout: a cold cache or a
+        # busy machine explains most of them.
+        retried = 0
+        for path in timed_out:
+            if self._cancel.cancelled or retried >= MAX_RETRIES_PER_JOB:
+                break
+            retried += 1
+            self._update(retrying=path)
+            try:
+                node = analyze_with_timeout(path, timeout=self.timeout * _retry_backoff(retried))
+            except AnalysisTimeout:
+                self._failures.append(_Failure(path, "timeout", "timed out twice"))
+                continue
+            if node is not None:
+                tree.replace_file(path, node)
+        self._update(retrying=None, retried=retried)
         self._tree = tree
         self._save_to_cache()
         self._finish(ScanPhase.COMPLETE)
`;

const RETRY_SCAN_DIFF = `@@ -81,0 +84,35 @@ def cancel_scan(job_id: str) -> dict:
+@router.post("/scans/{job_id}/retry")
+def retry_scan(job_id: str, req: RetryRequest) -> dict:
+    """Run the failed files of a finished scan again."""
+    job = _job_or_404(job_id)
+    if not job.finished:
+        raise HTTPException(status_code=409, detail="The scan is still running")
+    if job.retried >= MAX_RETRIES_PER_JOB:
+        raise HTTPException(status_code=429, detail="This scan used all its retries")
+    paths = req.paths or [f.path for f in job.failures if f.reason == "timeout"]
+    if not paths:
+        return {"retried": 0, "snapshot": job.snapshot()}
+    for path in paths:
+        if not Path(path).is_file():
+            raise HTTPException(status_code=404, detail=f"No such file: {path}")
+    done = 0
+    for path in paths:
+        if job.retry_file(path):
+            done += 1
+        elif req.stop_on_failure:
+            break
+    return {"retried": done, "snapshot": job.snapshot()}
`;

const DOC_DIFF = `@@ -55,0 +56,18 @@
+## Timeouts and retries
+
+A file that passes the per-file timeout is analyzed once more, after every
+other file is done. The second try gets twice the time.
+
+- A scan retries at most 25 files. The rest keep their fallback LOC.
+- A file that times out twice is reported as \`timeout\`, once.
+- A retry never changes a metric's meaning: \`N/A\` stays \`None\`, never 0.
`;

const DIFFS: Record<string, string> = {
  [`${SCAN_JOBS}::ScanJob.run`]: RUN_DIFF,
  [`${SCANS}::retry_scan`]: RETRY_SCAN_DIFF,
  "docs/adding-a-metric.md::## Timeouts and retries": DOC_DIFF,
};

/** A stand-in diff for the chunks without a written one: the right shape and counts. */
function fillerDiff(c: LensChunk, added: number, deleted: number): string {
  const lines = [`@@ -${c.baseStartLine ?? c.startLine},${deleted + 2} +${c.startLine},${added + 2} @@ ${c.name}`, `     # ${c.name}: context`];
  for (let i = 0; i < deleted; i++) lines.push(`-    old line ${i + 1} of ${c.name}`);
  for (let i = 0; i < added; i++) lines.push(`+    new line ${i + 1} of ${c.name}`);
  lines.push("     # context");
  return `${lines.join("\n")}\n`;
}

export function sampleHunk(q: LensQuery, chunkId: string, commit?: string): LensHunkDiff {
  const payload = samplePayload(q);
  const chunk = payload.chunks.find((c) => c.id === chunkId);
  if (!chunk) throw new Error(`No chunk ${chunkId} in this window`);
  const step = commit ? payload.commits.find((c) => c.sha === commit) : undefined;
  const touch = commit ? chunk.touches.find((t) => t.sha === commit) : undefined;
  const reverted = !commit && chunk.status === "reverted";
  return {
    chunkId,
    path: chunk.path,
    ...(chunk.oldPath ? { oldPath: chunk.oldPath } : {}),
    from: step ? `${step.short}^` : payload.selection.base.label,
    to: step ? (step.sha === WORKTREE ? "Working tree" : step.short) : payload.selection.head.label,
    diff: reverted ? "" : !commit && DIFFS[chunkId] ? DIFFS[chunkId] : fillerDiff(chunk, touch?.added ?? chunk.netAdded, touch?.deleted ?? chunk.netDeleted),
    truncated: false,
  };
}
