import { Worker } from "node:worker_threads";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SourceExcerptRequest } from "../api/contracts";
import type { AnalyzerArgs } from "../types";
import { AnalysisCancelledError } from "../analysis/cancellation";
import type { SessionSnapshot } from "../srcly/ops/status";
import type { EngineConfig } from "../srcly/session";

export type AnalysisProgress = {
  requestId: number;
  operation: string;
  phase: "queued" | "analyzing" | "projecting" | "complete" | "error" | "cancelled";
  message: string;
  step?: "program" | "identity" | "trace" | "summarize" | "project";
  completed?: number;
  total?: number;
  file?: string;
};

type WorkerReply =
  | { kind: "progress"; progress: AnalysisProgress }
  | { kind: "result"; requestId: number; value: unknown }
  | { kind: "error"; requestId: number; message: string; code?: string; details?: Record<string, unknown> }
  | { kind: "cancelled"; requestId: number }
  | { kind: "session"; snapshot: SessionSnapshot };

/** The worker's data: the analyzer args, plus the engine session config when srcly drives it. */
export type AnalysisWorkerData = { args: AnalyzerArgs; engine: EngineConfig | null };

/** A worker failure that kept its engine error code across the thread boundary. */
export class AnalysisRequestError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly details: Record<string, unknown> | undefined) {
    super(message);
    this.name = "AnalysisRequestError";
  }
}

export type AnalysisWorkerRequest = {
  requestId: number;
  operation: AnalysisOperation;
  cancellationBuffer: SharedArrayBuffer;
};

type PendingRequest = {
  requestId: number;
  operation: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanupAbort: () => void;
  onProgress: ((progress: AnalysisProgress) => void) | null;
  routeRequestId: string | null;
  cancel: () => void;
};

export class RouteRequestConflictError extends Error {
  constructor(readonly routeRequestId: string) {
    super(`Route request id is already active: ${routeRequestId}`);
    this.name = "RouteRequestConflictError";
  }
}

export type AnalysisOperation =
  | { kind: "workspace" }
  | { kind: "file"; path: string }
  | { kind: "report"; view: string; path: string | null }
  | { kind: "refresh" }
  | { kind: "route-data"; route: string; flow: string; source?: string; generation?: number }
  | ({ kind: "source-excerpt" } & SourceExcerptRequest)
  | { kind: "markdown"; view: string; path: string | null }
  | { kind: "routes"; expectedGeneration?: number }
  /** srcly's refresh: drop the tier-1 session and rebuild it now, so the next generation is ready. */
  | { kind: "session-refresh" }
  | { kind: "route-graph"; route: string; source?: string; expectedGeneration?: number }
  | { kind: "route-surface"; route: string; expectedGeneration?: number }
  | { kind: "select-expression"; params: Record<string, unknown> }
  | { kind: "value-flow"; params: Record<string, unknown> }
  | { kind: "anchor-graph"; params: Record<string, unknown> }
  | { kind: "function-effects"; params: Record<string, unknown> }
  | { kind: "route-path"; params: Record<string, unknown> };

export function createAnalysisService(args: AnalyzerArgs, engine: EngineConfig | null = null) {
  let workerUrl = import.meta.url.endsWith(".ts")
    ? new URL("./analysis-worker.ts", import.meta.url)
    : new URL("./analysis-worker.js", import.meta.url);
  if (workerUrl.protocol !== "file:") workerUrl = pathToFileURL(path.resolve(process.cwd(), "src/service/analysis-worker.ts"));
  const workerData: AnalysisWorkerData = { args, engine };
  const worker = workerUrl.pathname.endsWith(".ts")
    ? new Worker(`import("tsx/esm/api").then(({ tsImport }) => tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(workerUrl.href)}))`, { eval: true, workerData })
    : new Worker(workerUrl, { workerData });
  worker.unref();
  let nextRequestId = 1;
  let workspaceEpoch = 0;
  const pending = new Map<number, PendingRequest>();
  const inFlightWorkspace = new Map<number, Promise<unknown>>();
  const routeRequests = new Map<string, { requestId: number; cancel: () => void }>();
  const listeners = new Set<(progress: AnalysisProgress) => void>();
  let latest: AnalysisProgress | null = null;
  let snapshot: SessionSnapshot | null = null;
  let shutdownError: Error | null = null;
  let closePromise: Promise<number> | null = null;

  const publish = (progress: AnalysisProgress) => {
    latest = progress;
    for (const listener of listeners) listener(progress);
  };

  const shutdown = (error: Error) => {
    if (shutdownError) return;
    shutdownError = error;
    const retained = [...pending.values()];
    pending.clear();
    inFlightWorkspace.clear();
    routeRequests.clear();
    latest = null;
    listeners.clear();
    for (const request of retained) {
      request.cleanupAbort();
      request.reject(error);
    }
  };

  worker.on("message", (reply: WorkerReply) => {
    if (reply.kind === "session") {
      snapshot = reply.snapshot;
      return;
    }
    if (reply.kind === "progress") {
      const retained = pending.get(reply.progress.requestId);
      if (retained) {
        publish(reply.progress);
        retained.onProgress?.(reply.progress);
      }
      return;
    }
    const request = pending.get(reply.requestId);
    if (!request) return;
    pending.delete(reply.requestId);
    if (request.routeRequestId && routeRequests.get(request.routeRequestId)?.requestId === request.requestId) routeRequests.delete(request.routeRequestId);
    request.cleanupAbort();
    if (reply.kind === "result") request.resolve(reply.value);
    else if (reply.kind === "cancelled") request.reject(new AnalysisCancelledError());
    else request.reject(new AnalysisRequestError(reply.message, reply.code, reply.details));
  });
  worker.on("error", shutdown);
  worker.on("exit", (code) => {
    if (!shutdownError) shutdown(new Error(`Analysis worker exited with code ${code}`));
  });

  const clearWorkspaceFlight = (epoch: number, promise: Promise<unknown>) => {
    if (inFlightWorkspace.get(epoch) === promise) inFlightWorkspace.delete(epoch);
  };

  const request = <T>(
    operation: AnalysisOperation,
    signal?: AbortSignal,
    routeRequestId?: string,
    onProgress?: (progress: AnalysisProgress) => void,
  ) => {
    if (shutdownError) return Promise.reject(shutdownError) as Promise<T>;
    if (routeRequestId && routeRequests.has(routeRequestId)) return Promise.reject(new RouteRequestConflictError(routeRequestId)) as Promise<T>;
    if (operation.kind === "refresh") workspaceEpoch += 1;
    const requestWorkspaceEpoch = operation.kind === "workspace" ? workspaceEpoch : null;
    if (requestWorkspaceEpoch !== null) {
      const existing = inFlightWorkspace.get(requestWorkspaceEpoch);
      if (existing) return existing as Promise<T>;
    }
    const requestId = nextRequestId++;
    const cancellationBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const cancellation = new Int32Array(cancellationBuffer);
    publish({ requestId, operation: operation.kind, phase: "queued", message: `Queued ${operation.kind} analysis` });
    const requestPromise = new Promise<T>((resolve, reject) => {
      let cleanupAbort = () => {};
      const cancel = () => {
        const retained = pending.get(requestId);
        if (!retained) return;
        Atomics.store(cancellation, 0, 1);
        Atomics.notify(cancellation, 0);
        pending.delete(requestId);
        if (retained.routeRequestId && routeRequests.get(retained.routeRequestId)?.requestId === requestId) routeRequests.delete(retained.routeRequestId);
        retained.cleanupAbort();
        publish({ requestId, operation: retained.operation, phase: "cancelled", message: `Cancelled ${retained.operation} analysis` });
        retained.reject(new AnalysisCancelledError());
      };
      if (signal) {
        signal.addEventListener("abort", cancel, { once: true });
        cleanupAbort = () => signal.removeEventListener("abort", cancel);
      }
      pending.set(requestId, {
        requestId,
        operation: operation.kind,
        resolve: resolve as (value: unknown) => void,
        reject,
        cleanupAbort,
        onProgress: onProgress ?? null,
        routeRequestId: operation.kind === "route-data" ? routeRequestId ?? null : null,
        cancel,
      });
      if (operation.kind === "route-data" && routeRequestId) routeRequests.set(routeRequestId, { requestId, cancel });
      if (signal?.aborted) {
        cancel();
        return;
      }
      const message: AnalysisWorkerRequest = { requestId, operation, cancellationBuffer };
      try {
        worker.postMessage(message);
      } catch (error) {
        shutdown(error instanceof Error ? error : new Error(String(error)));
      }
    });
    if (requestWorkspaceEpoch !== null) {
      const sharedPromise = requestPromise as Promise<unknown>;
      inFlightWorkspace.set(requestWorkspaceEpoch, sharedPromise);
      void sharedPromise.then(
        () => clearWorkspaceFlight(requestWorkspaceEpoch, sharedPromise),
        () => clearWorkspaceFlight(requestWorkspaceEpoch, sharedPromise),
      );
    }
    return requestPromise;
  };

  const close = () => {
    if (closePromise) return closePromise;
    shutdown(new Error("Analysis service closed"));
    closePromise = worker.terminate();
    return closePromise;
  };

  const cancelRouteRequest = (routeRequestId: string) => {
    const retained = routeRequests.get(routeRequestId);
    if (!retained) return false;
    retained.cancel();
    return true;
  };

  return {
    request,
    cancelRouteRequest,
    latest: () => latest,
    /** The worker's last built session, for answering `status` without queuing. */
    sessionSnapshot: () => snapshot,
    subscribe(listener: (progress: AnalysisProgress) => void) {
      if (shutdownError) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close,
  };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
