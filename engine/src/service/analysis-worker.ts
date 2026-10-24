import "../srcly/stdio";
import { parentPort, workerData } from "node:worker_threads";
import { filePageResponseSchema, refreshResponseSchema, reportResponseSchema, routeDataDetailTransportResponseSchema, sourceExcerptResponseSchema, workspaceResponseSchema } from "../api/contracts";
import { buildFilePageDto } from "../api/projections/file-page";
import { buildReportDto } from "../api/projections/reports";
import { buildWorkspaceDto } from "../api/projections/workspace";
import { buildRouteDataDetail } from "../api/projections/route-data";
import type { ReportView } from "../api/report-views";
import { renderReport } from "../core";
import { renderMarkdownView } from "../reports/markdown-views";
import type { AnalyzerProgressUpdate } from "../analysis/progress";
import type { AnalysisOperation, AnalysisProgress, AnalysisWorkerData, AnalysisWorkerRequest } from "./analysis-service";
import { errorPayload } from "../srcly/protocol";
import { anchorGraphOp } from "../srcly/ops/anchor-graph";
import { routeGraphOp, routeSurfaceOp } from "../srcly/ops/route-graph";
import { routesOp } from "../srcly/ops/routes";
import { selectExpressionOp, valueFlowOp } from "../srcly/ops/value-flow";
import { createEngineSession, type EngineSession } from "../srcly/session";
import { createAnalysisCache } from "./cache";
import { buildSourceExcerpt } from "./source-excerpts";
import {
  createAnalysisCancellationToken,
  isAnalysisCancelledError,
  type AnalysisCancellationToken,
} from "../analysis/cancellation";

if (!parentPort) throw new Error("Analysis worker requires a parent port");
const port = parentPort;
const { args, engine } = workerData as AnalysisWorkerData;
let activeRequest: { requestId: number; operation: string } | null = null;
const reportProgress = (update: AnalyzerProgressUpdate) => {
  if (!activeRequest) return;
  port.postMessage({ kind: "progress", progress: { ...activeRequest, phase: "analyzing", ...update } });
};
const cache = createAnalysisCache(args, reportProgress);
// The tier-1 session srcly's protocol queries; null when the legacy cache drives the worker.
const session = engine ? createEngineSession(engine, reportProgress) : null;
let announcedGeneration = 0;

function progress(requestId: number, operation: string, phase: AnalysisProgress["phase"], message: string) {
  port.postMessage({ kind: "progress", progress: { requestId, operation, phase, message } });
}

port.on("message", ({ requestId, operation, cancellationBuffer }: AnalysisWorkerRequest) => {
  const cancellationState = new Int32Array(cancellationBuffer);
  const cancellation = createAnalysisCancellationToken(() => Atomics.load(cancellationState, 0) !== 0);
  try {
    cancellation.throwIfCancelled();
    activeRequest = { requestId, operation: operation.kind };
    if (operation.kind === "route-graph" && session?.built()) {
      port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "analyzing", step: "trace", message: `Tracing ${operation.route}: occurrences, boundaries and evidence` } });
    } else progress(requestId, operation.kind, "analyzing", "Building the TypeScript program and tracing render paths");
    const value = perform(operation, requestId, cancellation);
    cancellation.throwIfCancelled();
    progress(requestId, operation.kind, "complete", "Analysis complete");
    cancellation.throwIfCancelled();
    port.postMessage({ kind: "result", requestId, value });
  } catch (error) {
    if (isAnalysisCancelledError(error)) {
      port.postMessage({ kind: "cancelled", requestId });
      return;
    }
    const payload = errorPayload(error);
    progress(requestId, operation.kind, "error", payload.message);
    port.postMessage({ kind: "error", requestId, message: payload.message, code: payload.code, details: payload.details });
  } finally {
    activeRequest = null;
  }
});

function perform(operation: AnalysisOperation, requestId: number, cancellation: AnalysisCancellationToken) {
  if (operation.kind === "routes") return announce(routesOp(requireSession(), operation));
  if (operation.kind === "session-refresh") {
    requireSession().refresh();
    return announce(routesOp(requireSession(), {}));
  }
  if (operation.kind === "route-graph") return announce(routeGraphOp(requireSession(), operation, cancellation));
  if (operation.kind === "route-surface") return announce(routeSurfaceOp(requireSession(), operation, cancellation));
  if (operation.kind === "select-expression") return announce(selectExpressionOp(requireSession(), operation.params));
  if (operation.kind === "value-flow") return announce(valueFlowOp(requireSession(), operation.params, cancellation));
  if (operation.kind === "anchor-graph") return announce(anchorGraphOp(requireSession(), operation.params, cancellation));
  if (operation.kind === "refresh") {
    const report = cache.refresh();
    return refreshResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data: { refreshed: true } });
  }
  if (operation.kind === "workspace") {
    const report = cache.reviewReport();
    port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: "Preparing workspace rows and semantic map" } });
    return workspaceResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data: buildWorkspaceDto(report) });
  }
  if (operation.kind === "route-data") {
    cancellation.throwIfCancelled();
    const report = cache.ensureBuilt();
    cancellation.throwIfCancelled();
    if (operation.generation !== undefined && operation.generation !== cache.generation()) return null;
    const detail = buildRouteDataDetail(report, operation.route, operation.flow, operation.source ?? null, cancellation);
    cancellation.throwIfCancelled();
    if (!detail) return null;
    const response = routeDataDetailTransportResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data: detail });
    cancellation.throwIfCancelled();
    return response;
  }
  if (operation.kind === "source-excerpt") {
    const report = cache.ensureBuilt();
    if (operation.generation !== cache.generation()) return null;
    const source = cache.sourceFor(operation.path);
    if (source === null) return null;
    const data = buildSourceExcerpt(cache.typescript(), operation, source);
    if (!data) return null;
    return sourceExcerptResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data });
  }
  if (operation.kind === "file") {
    const source = cache.sourceFor(operation.path);
    if (source === null) return null;
    const full = cache.ensureBuilt();
    port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: `Preparing ${operation.path}` } });
    return filePageResponseSchema.parse({ apiVersion: 1, analysisVersion: full.analysisVersion, generation: cache.generation(), generatedAt: full.generatedAt, data: buildFilePageDto(full, full, operation.path, source, cache.sourceFor, cache.identitiesForFile(operation.path)) });
  }
  if (operation.kind === "report") {
    if (operation.path && cache.sourceFor(operation.path) === null) return null;
    const report = operation.path ? cache.reportForFile(operation.path) : cache.reviewReport();
    const full = cache.ensureBuilt();
    port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: `Preparing ${operation.view} report` } });
    return reportResponseSchema.parse({ apiVersion: 1, analysisVersion: full.analysisVersion, generation: cache.generation(), generatedAt: full.generatedAt, data: buildReportDto(report, operation.view as Exclude<ReportView, "overview">) });
  }
  if (operation.path && cache.sourceFor(operation.path) === null) return null;
  const report = operation.path ? cache.reportForFile(operation.path) : cache.reviewReport();
  const reportArgs = { ...args, ...(operation.path ? { file: [operation.path] } : {}), view: operation.view, format: "markdown" as const, maxItems: args.maxItems ?? 20 };
  port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: `Rendering ${operation.view} Markdown` } });
  return operation.path ? renderMarkdownView(report, reportArgs) : renderReport(report, reportArgs);
}

function requireSession(): EngineSession {
  if (!session) throw new Error("This worker was started without an engine session");
  return session;
}

/** Tell the protocol thread what a new tier-1 build was made from, so `status` can rehash it. */
function announce<T>(value: T): T {
  const tier1 = session?.built() ? session.tier1() : null;
  if (tier1 && tier1.generation.id !== announcedGeneration) {
    announcedGeneration = tier1.generation.id;
    port.postMessage({ kind: "session", snapshot: { generation: tier1.generation.id, programHash: tier1.generation.programHash, inputs: tier1.inputs } });
  }
  return value;
}
