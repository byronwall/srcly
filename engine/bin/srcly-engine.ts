#!/usr/bin/env node
// srcly's data-flow engine: one JSON request per stdin line, one reply per
// stdout line (engine/src/srcly/protocol.ts). Python owns this process.
import "../src/srcly/stdio";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { isAnalysisCancelledError } from "../src/analysis/cancellation";
import { createAnalysisService, type AnalysisOperation, type AnalysisProgress, type AnalysisService } from "../src/service/analysis-service";
import { helloResultSchema } from "../src/srcly/contracts/hello";
import { ENGINE_VERSION } from "../src/srcly/fingerprint";
import { statusOp } from "../src/srcly/ops/status";
import {
  EngineError,
  PROTOCOL_VERSION,
  errorPayload,
  parseFrame,
  type CancelFrame,
  type ProgressPayload,
  type ReplyFrame,
  type RequestFrame,
} from "../src/srcly/protocol";
import { engineArgs, type EngineConfig } from "../src/srcly/session";
import { chooseTypescript, type TypescriptChoice } from "../src/srcly/typescript-choice";

const options = parseCommandLine(process.argv.slice(2));
let choice: TypescriptChoice | null = null;
let choiceError: unknown = null;
try {
  choice = chooseTypescript(options.root, options.source);
} catch (error) {
  choiceError = error;
}

let service: AnalysisService | null = null;
let latestProgress: ProgressPayload | null = null;
const inFlight = new Map<number, AbortController>();

function send(frame: ReplyFrame) {
  process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function serviceFor(): AnalysisService {
  if (!choice) throw choiceError;
  if (!service) {
    const config: EngineConfig = { root: options.root, source: options.source, tsconfig: options.tsconfig, typescriptFrom: choice.from };
    service = createAnalysisService(engineArgs(config), config);
  }
  return service;
}

/** Ops the worker answers. Everything else is answered on this thread. */
function workerOperation(frame: RequestFrame): AnalysisOperation | null {
  const params = frame.params ?? {};
  const expectedGeneration = typeof params.expectedGeneration === "number" ? params.expectedGeneration : undefined;
  if (frame.op === "routes") return { kind: "routes", expectedGeneration };
  // Rebuild tier 1 from the sources as they are now: a new generation, answered like `routes`.
  if (frame.op === "refresh") return { kind: "session-refresh" };
  if (frame.op === "selectExpression") return { kind: "select-expression", params };
  if (frame.op === "valueFlow") return { kind: "value-flow", params };
  if (frame.op === "anchorGraph") return { kind: "anchor-graph", params };
  if (frame.op === "routeGraph") {
    if (typeof params.route !== "string") throw new EngineError("invalid-request", "routeGraph needs params.route");
    return { kind: "route-graph", route: params.route, source: typeof params.source === "string" ? params.source : undefined, expectedGeneration };
  }
  return null;
}

function toProgress(progress: AnalysisProgress): ProgressPayload | null {
  if (progress.phase === "complete" || progress.phase === "error" || progress.phase === "cancelled") return null;
  const phase = progress.phase === "queued" ? "queued" : progress.step ?? "program";
  return {
    phase: phase === "project" || phase === "program" || phase === "identity" || phase === "trace" || phase === "summarize" || phase === "queued" ? phase : "program",
    message: progress.message,
    ...(progress.completed !== undefined ? { completed: progress.completed } : {}),
    ...(progress.total !== undefined ? { total: progress.total } : {}),
  };
}

async function handle(frame: RequestFrame) {
  if (frame.op === "hello") {
    if (!choice) throw choiceError;
    return helloResultSchema.parse({
      protocol: PROTOCOL_VERSION,
      engine: ENGINE_VERSION,
      node: process.version,
      typescript: choice.version,
      typescriptFrom: choice.origin,
      root: options.root,
      source: options.source,
    });
  }
  if (frame.op === "status") return statusOp(service?.sessionSnapshot() ?? null, latestProgress);
  const operation = workerOperation(frame);
  if (!operation) throw new EngineError("invalid-request", `Unknown op: ${frame.op}`);
  const controller = new AbortController();
  inFlight.set(frame.id, controller);
  try {
    return await serviceFor().request(operation, controller.signal, undefined, (progress) => {
      const payload = toProgress(progress);
      if (!payload) return;
      latestProgress = payload;
      send({ id: frame.id, progress: payload });
    });
  } finally {
    inFlight.delete(frame.id);
    if (inFlight.size === 0) latestProgress = null;
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let frame: ReturnType<typeof parseFrame>;
  try {
    frame = parseFrame(line);
  } catch (error) {
    const id = idOf(line);
    if (id !== null) send({ id, ok: false, error: errorPayload(error) });
    else process.stderr.write(`srcly-engine: dropped a request without an id: ${errorPayload(error).message}\n`);
    return;
  }
  if (frame.op === "cancel") {
    inFlight.get((frame as CancelFrame).params.id)?.abort();
    return;
  }
  const request = frame as RequestFrame;
  void handle(request).then(
    (result) => send({ id: request.id, ok: true, result }),
    (error) => send({
      id: request.id,
      ok: false,
      error: isAnalysisCancelledError(error) ? { code: "cancelled", message: "Analysis request was cancelled" } : errorPayload(error),
    }),
  );
});
lines.on("close", () => {
  for (const controller of inFlight.values()) controller.abort();
  void Promise.resolve(service?.close()).finally(() => process.exit(0));
});

function idOf(line: string): number | null {
  try {
    const id = (JSON.parse(line) as { id?: unknown }).id;
    return Number.isInteger(id) && (id as number) > 0 ? (id as number) : null;
  } catch {
    return null;
  }
}

function parseCommandLine(argv: string[]) {
  let root: string | null = null;
  let source: string | null = null;
  let tsconfig: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--root" && value) root = value;
    else if (argv[index] === "--source" && value) source = value;
    else if (argv[index] === "--tsconfig" && value) tsconfig = value;
    else continue;
    index += 1;
  }
  if (!root) {
    process.stderr.write("usage: srcly-engine --root <dir> [--source <dir>] [--tsconfig <file>]\n");
    process.exit(2);
  }
  const absoluteRoot = path.resolve(root);
  const absoluteSource = path.resolve(absoluteRoot, source ?? (fs.existsSync(path.join(absoluteRoot, "src")) ? "src" : "."));
  return { root: absoluteRoot, source: absoluteSource, tsconfig: tsconfig ? path.resolve(absoluteRoot, tsconfig) : null };
}
