// A hand-made Change Lens payload for the panel tests and the dev harness.
// It covers every status, kind and match, a not-measured chunk, a reverted
// chunk, a burst of commits, and uncommitted work.

import type { ChangeLensPayload, LensChunk, LensCommit, LensFile, LensHunkDiff, LensTouch } from "../types";
import { WORKTREE } from "../types";

const sha = (seed: string) => (seed.repeat(40) + "0".repeat(40)).slice(0, 40);

function commit(seed: string, date: string, subject: string, files: number, added: number, deleted: number): LensCommit {
  const full = sha(seed);
  return { sha: full, short: full.slice(0, 7), subject, author: "Byron Wall", date, files, added, deleted, chunkIds: [] };
}

const C = {
  config: commit("a1f3", "2026-11-17T15:12:00Z", "Add backoff settings to job config", 2, 24, 3),
  extract: commit("b27c", "2026-11-17T21:40:00Z", "Extract retry policy from the queue runner", 3, 88, 61),
  backoff: commit("c3d9", "2026-11-18T16:05:00Z", "Retry failed jobs with exponential backoff", 4, 112, 14),
  offByOne: commit("d4e1", "2026-11-18T16:09:00Z", "Fix off-by-one in the attempt count", 1, 3, 3),
  logRetry: commit("e5a0", "2026-11-18T16:14:00Z", "Log each retry attempt with its delay", 2, 19, 2),
  jitter: commit("f6b8", "2026-11-18T16:22:00Z", "Try a jittered delay between attempts", 2, 16, 5),
  revert: commit("07c2", "2026-11-19T19:30:00Z", 'Revert "Try a jittered delay between attempts"', 2, 5, 16),
  rename: commit("18d5", "2026-11-19T22:02:00Z", "Rename queue/worker.ts to queue/runner.ts", 1, 4, 3),
  legacy: commit("29e7", "2026-11-20T17:47:00Z", "Drop the legacy schedule parser and update the docs", 4, 31, 74),
};

const worktree: LensCommit = {
  sha: WORKTREE,
  short: "WORKTREE",
  subject: "Uncommitted changes",
  author: "",
  date: null,
  files: 3,
  added: 21,
  deleted: 6,
  chunkIds: [],
};

const touch = (c: LensCommit | typeof WORKTREE, added: number, deleted: number): LensTouch => ({
  sha: typeof c === "string" ? c : c.sha,
  added,
  deleted,
});

type ChunkSeed = Omit<LensChunk, "id" | "added" | "deleted" | "firstTouched" | "lastTouched" | "hunks"> & {
  qualified?: string;
};

const dateOf = (s: string) => Object.values(C).find((c) => c.sha === s)?.date ?? null;

function chunk(seed: ChunkSeed): LensChunk {
  const { qualified, ...rest } = seed;
  const dated = seed.touches.map((t) => dateOf(t.sha)).filter((d): d is string => d !== null);
  return {
    ...rest,
    id: qualified === undefined ? seed.path : `${seed.path}::${qualified}`,
    added: seed.touches.reduce((n, t) => n + t.added, 0),
    deleted: seed.touches.reduce((n, t) => n + t.deleted, 0),
    firstTouched: dated[0] ?? null,
    lastTouched: dated.at(-1) ?? null,
    hunks: [{ sha: null, oldStart: seed.baseStartLine ?? seed.startLine, oldLines: seed.netDeleted, newStart: seed.startLine, newLines: seed.netAdded }],
  };
}

const m = (before: number | null, after: number | null) => ({ before, after });

const chunks: LensChunk[] = [
  chunk({
    path: "src/jobs/retry.ts",
    qualified: "retryJob",
    kind: "function",
    name: "retryJob",
    startLine: 42,
    endLine: 118,
    baseStartLine: 30,
    baseEndLine: 84,
    status: "modified",
    match: "exact",
    netAdded: 41,
    netDeleted: 17,
    touches: [touch(C.backoff, 38, 9), touch(C.offByOne, 2, 2), touch(C.logRetry, 11, 1), touch(C.jitter, 6, 3), touch(C.revert, 3, 6), touch(WORKTREE, 8, 2)],
    metrics: {
      complexity: m(12, 17),
      cognitive_complexity: m(18, 26),
      loc: m(55, 77),
      max_nesting_depth: m(3, 4),
      parameter_count: m(2, 3),
    },
    measured: true,
    buckets: ["complex-and-changed", "new-hotspot"],
    fileClass: "code",
  }),
  chunk({
    path: "src/jobs/retry.ts",
    qualified: "backoffDelay",
    kind: "function",
    name: "backoffDelay",
    startLine: 120,
    endLine: 168,
    status: "added",
    match: "none",
    netAdded: 49,
    netDeleted: 0,
    touches: [touch(C.backoff, 44, 0), touch(C.jitter, 7, 2), touch(C.revert, 2, 7)],
    metrics: { complexity: m(null, 11), cognitive_complexity: m(null, 15), loc: m(null, 49), max_nesting_depth: m(null, 3), parameter_count: m(null, 2) },
    measured: true,
    buckets: ["new-hotspot"],
    fileClass: "code",
  }),
  chunk({
    path: "src/jobs/policy.ts",
    oldPath: "src/queue/retry-utils.ts",
    qualified: "RetryPolicy",
    kind: "class",
    name: "RetryPolicy",
    startLine: 8,
    endLine: 61,
    baseStartLine: 112,
    baseEndLine: 160,
    status: "moved",
    match: "moved",
    netAdded: 9,
    netDeleted: 3,
    touches: [touch(C.extract, 54, 48)],
    metrics: { complexity: m(4, 5), loc: m(49, 54), max_nesting_depth: m(2, 2) },
    measured: true,
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "src/jobs/retry.ts",
    qualified: "nextAttemptAt",
    kind: "function",
    name: "nextAttemptAt",
    startLine: 170,
    endLine: 181,
    baseStartLine: 86,
    baseEndLine: 97,
    status: "reverted",
    match: "exact",
    netAdded: 0,
    netDeleted: 0,
    touches: [touch(C.jitter, 3, 0), touch(C.revert, 0, 3)],
    metrics: { complexity: m(3, 3), cognitive_complexity: m(2, 2), loc: m(12, 12), max_nesting_depth: m(1, 1), parameter_count: m(1, 1) },
    measured: true,
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "src/queue/runner.ts",
    oldPath: "src/queue/worker.ts",
    qualified: "drainQueue",
    kind: "function",
    name: "drainQueue",
    startLine: 64,
    endLine: 131,
    baseStartLine: 64,
    baseEndLine: 129,
    status: "modified",
    match: "renamed-file",
    netAdded: 9,
    netDeleted: 7,
    touches: [touch(C.extract, 6, 9), touch(C.rename, 4, 3)],
    metrics: { complexity: m(14, 15), cognitive_complexity: m(21, 22), loc: m(66, 68), max_nesting_depth: m(4, 4), parameter_count: m(2, 2) },
    measured: true,
    buckets: ["complex-and-changed", "new-hotspot"],
    fileClass: "code",
  }),
  chunk({
    path: "src/queue/runner.ts",
    oldPath: "src/queue/worker.ts",
    qualified: "QueueRunner",
    kind: "class",
    name: "QueueRunner",
    startLine: 12,
    endLine: 60,
    baseStartLine: 12,
    baseEndLine: 60,
    status: "moved",
    match: "renamed-file",
    netAdded: 0,
    netDeleted: 0,
    touches: [touch(C.rename, 0, 0)],
    metrics: { complexity: m(6, 6), loc: m(49, 49), max_nesting_depth: m(2, 2) },
    measured: true,
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "src/jobs/schedule.ts",
    qualified: "parseLegacySchedule",
    kind: "function",
    name: "parseLegacySchedule",
    startLine: 88,
    endLine: 151,
    baseStartLine: 88,
    baseEndLine: 151,
    status: "deleted",
    match: "none",
    netAdded: 0,
    netDeleted: 64,
    touches: [touch(C.legacy, 0, 64)],
    metrics: { complexity: m(19, null), cognitive_complexity: m(31, null), loc: m(64, null), max_nesting_depth: m(5, null), parameter_count: m(2, null) },
    measured: true,
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "src/jobs/schedule.ts",
    qualified: "parseSchedule",
    kind: "function",
    name: "parseSchedule",
    startLine: 20,
    endLine: 52,
    baseStartLine: 20,
    baseEndLine: 48,
    status: "modified",
    match: "uncertain",
    netAdded: 9,
    netDeleted: 5,
    touches: [touch(C.legacy, 9, 5)],
    metrics: { complexity: m(8, 9), cognitive_complexity: m(9, 11), loc: m(29, 33), max_nesting_depth: m(2, 3), parameter_count: m(1, 1) },
    measured: true,
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "src/jobs/settings.ts",
    kind: "file",
    name: "settings.ts",
    startLine: 1,
    endLine: 52,
    baseStartLine: 1,
    baseEndLine: 40,
    status: "modified",
    match: "exact",
    netAdded: 14,
    netDeleted: 2,
    touches: [touch(C.config, 14, 2)],
    metrics: { loc: m(40, 52) },
    measured: true,
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "config/jobs.toml",
    kind: "file",
    name: "jobs.toml",
    startLine: 1,
    endLine: 34,
    baseStartLine: 1,
    baseEndLine: 25,
    status: "modified",
    match: "exact",
    netAdded: 13,
    netDeleted: 2,
    touches: [touch(C.config, 10, 1), touch(WORKTREE, 3, 1)],
    metrics: {},
    measured: false,
    naReason: "No analyzer reads TOML files.",
    buckets: [],
    fileClass: "config",
  }),
  chunk({
    path: "docs/jobs.md",
    qualified: "## Retries",
    kind: "heading",
    name: "## Retries",
    startLine: 58,
    endLine: 91,
    baseStartLine: 58,
    baseEndLine: 70,
    status: "modified",
    match: "exact",
    netAdded: 22,
    netDeleted: 1,
    touches: [touch(C.legacy, 22, 1)],
    metrics: {},
    measured: true,
    buckets: [],
    fileClass: "docs",
  }),
  chunk({
    path: "scripts/requeue-dead-jobs.sh",
    qualified: "L40-62",
    kind: "range",
    name: "lines 40–62",
    startLine: 40,
    endLine: 62,
    baseStartLine: 40,
    baseEndLine: 57,
    status: "modified",
    match: "exact",
    netAdded: 8,
    netDeleted: 3,
    touches: [touch(C.logRetry, 8, 1), touch(C.legacy, 0, 4)],
    metrics: {},
    measured: false,
    naReason: "No analyzer reads shell scripts.",
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "src/jobs/retry.test.ts",
    qualified: "retries with backoff",
    kind: "function",
    name: "retries with backoff",
    startLine: 14,
    endLine: 58,
    status: "added",
    match: "none",
    netAdded: 36,
    netDeleted: 0,
    touches: [touch(C.backoff, 30, 0), touch(C.offByOne, 1, 1), touch(WORKTREE, 6, 0)],
    metrics: { complexity: m(null, 2), loc: m(null, 36), max_nesting_depth: m(null, 2) },
    measured: true,
    buckets: [],
    fileClass: "test",
  }),
  chunk({
    path: "src/ui/JobRow.tsx",
    qualified: "JobRow",
    kind: "function",
    name: "JobRow",
    startLine: 18,
    endLine: 74,
    baseStartLine: 18,
    baseEndLine: 70,
    status: "modified",
    match: "exact",
    netAdded: 4,
    netDeleted: 3,
    touches: [touch(WORKTREE, 4, 3)],
    metrics: {
      complexity: m(6, 7),
      loc: m(53, 57),
      component_hook_count: m(2, 3),
      component_jsx_depth: m(6, 6),
      component_prop_count: m(4, 5),
    },
    measured: true,
    buckets: [],
    fileClass: "code",
  }),
  chunk({
    path: "src/features/notifications/delivery/handlers/createExponentialBackoffNotificationDeliveryHandler.ts",
    qualified: "createExponentialBackoffNotificationDeliveryHandlerWithJitterAndCircuitBreaker",
    kind: "function",
    name: "createExponentialBackoffNotificationDeliveryHandlerWithJitterAndCircuitBreaker",
    startLine: 210,
    endLine: 344,
    baseStartLine: 204,
    baseEndLine: 331,
    status: "modified",
    match: "exact",
    netAdded: 22,
    netDeleted: 9,
    touches: [touch(C.extract, 28, 4)],
    metrics: { complexity: m(10, 13), cognitive_complexity: m(16, 21), loc: m(128, 135), max_nesting_depth: m(4, 5), parameter_count: m(4, 4) },
    measured: true,
    buckets: ["complex-and-changed", "new-hotspot"],
    fileClass: "code",
  }),
];

const commits = [...Object.values(C), worktree];
for (const c of chunks) for (const t of c.touches) commits.find((x) => x.sha === t.sha)?.chunkIds.push(c.id);

const files: LensFile[] = Object.values(
  chunks.reduce<Record<string, LensFile>>((out, c) => {
    const f = (out[c.path] ??= {
      path: c.path,
      ...(c.oldPath && c.match === "renamed-file" ? { oldPath: c.oldPath } : {}),
      status: c.match === "renamed-file" ? "renamed" : c.status === "added" ? "added" : "modified",
      added: 0,
      deleted: 0,
      loc: 120,
      fileClass: c.fileClass,
      chunkIds: [],
      outOfScope: false,
    });
    f.added += c.added;
    f.deleted += c.deleted;
    f.chunkIds.push(c.id);
    return out;
  }, {})
);

export const samplePayload: ChangeLensPayload = {
  selection: {
    window: "branch",
    mode: "touched",
    ref: "HEAD",
    repoRoot: "/repo/jobs-service",
    base: { ref: "merge-base(main, HEAD)", sha: sha("3f9a"), label: "main @ 3f9a3f9", date: "2026-11-17T14:02:00Z" },
    head: { ref: WORKTREE, sha: null, label: "Working tree", date: null },
    since: null,
    until: null,
    timezone: "America/Chicago",
    includesWorktree: true,
    notes: [],
    repoRoot: "/Users/you/projects/jobs",
    scope: "",
  },
  commits,
  chunks,
  files,
  summary: {
    filesEdited: files.length,
    filesTotal: 214,
    chunks: chunks.length,
    churnLines: chunks.reduce((n, c) => n + c.added + c.deleted, 0),
    netLines: chunks.reduce((n, c) => n + c.netAdded + c.netDeleted, 0),
    reverted: chunks.filter((c) => c.status === "reverted").length,
  },
  metricIds: ["complexity", "cognitive_complexity", "loc", "max_nesting_depth", "parameter_count", "component_hook_count", "component_jsx_depth", "component_prop_count"],
};

/** A window with no edits. */
export const emptyPayload: ChangeLensPayload = {
  ...samplePayload,
  selection: { ...samplePayload.selection, notes: ["No commits on this branch since main, and no uncommitted edits."] },
  commits: [],
  chunks: [],
  files: [],
  summary: { filesEdited: 0, filesTotal: 214, chunks: 0, churnLines: 0, netLines: 0, reverted: 0 },
  metricIds: [],
};

export const sampleHunkDiff: LensHunkDiff = {
  chunkId: "src/jobs/retry.ts::retryJob",
  path: "src/jobs/retry.ts",
  from: "main @ 3f9a3f9",
  to: "Working tree",
  truncated: false,
  diff: `diff --git a/src/jobs/retry.ts b/src/jobs/retry.ts
index 3f9a3f9..8c1e2d0 100644
--- a/src/jobs/retry.ts
+++ b/src/jobs/retry.ts
@@ -30,24 +42,38 @@ import { RetryPolicy } from "./policy";

-export async function retryJob(job: Job, queue: Queue): Promise<JobResult> {
-  const max = job.maxAttempts ?? 3;
-  for (let attempt = 0; attempt < max; attempt++) {
+export async function retryJob(job: Job, queue: Queue, policy = RetryPolicy.default()): Promise<JobResult> {
+  const max = job.maxAttempts ?? policy.maxAttempts;
+  for (let attempt = 1; attempt <= max; attempt++) {
     try {
       const result = await queue.run(job);
-      return result;
+      if (result.ok) return result;
+      if (!policy.shouldRetry(result.error)) return result;
     } catch (error) {
-      if (attempt === max - 1) throw error;
+      if (attempt === max || !policy.shouldRetry(error)) throw error;
     }
-    await sleep(1000);
+    const delay = backoffDelay(attempt, policy);
+    logger.info("retrying job", { id: job.id, attempt, delay });
+    await sleep(delay);
   }
-  return { ok: false, error: new Error("retries exhausted") };
+  return { ok: false, error: new RetryExhaustedError(job.id, max) };
 }
@@ -71,14 +97,22 @@ export async function retryJob(job: Job, queue: Queue): Promise<JobResult> {
 export function retryAll(jobs: Job[], queue: Queue) {
-  return Promise.all(jobs.map((job) => retryJob(job, queue)));
+  const policy = RetryPolicy.fromSettings(settings.jobs.retry);
+  return Promise.all(jobs.map((job) => retryJob(job, queue, policy)));
 }

 function isTransient(error: unknown): boolean {
   if (error instanceof TimeoutError) return true;
   if (error instanceof NetworkError) return error.status !== 401;
+  if (error instanceof RateLimitError) return true;
   return false;
 }
`,
};

/** A long generated diff for checking speed and truncation. */
export function bigHunkDiff(lines: number): LensHunkDiff {
  const out = ["--- a/src/generated/routes.ts", "+++ b/src/generated/routes.ts"];
  let written = 0;
  for (let h = 0; written < lines; h++) {
    const start = h * 60 + 1;
    out.push(`@@ -${start},36 +${start},36 @@ export const routes = {`);
    for (let i = 0; i < 40 && written < lines; i++, written++) {
      const n = start + i;
      if (i % 10 === 4) out.push(`-  route${n}: { path: "/v1/items/${n}", method: "GET", auth: false },`);
      else if (i % 10 === 5) out.push(`+  route${n - 1}: { path: "/v2/items/${n - 1}", method: "GET", auth: true },`);
      else out.push(`   route${n}: { path: "/v1/items/${n}", method: "GET", auth: false },`);
    }
  }
  return {
    chunkId: "src/generated/routes.ts",
    path: "src/generated/routes.ts",
    from: "main @ 3f9a3f9",
    to: "29e7029",
    diff: out.join("\n"),
    truncated: true,
  };
}
