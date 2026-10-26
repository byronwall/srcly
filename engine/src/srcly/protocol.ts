// The stdio protocol between srcly's Python server and this engine: one JSON
// frame per line. Requests are `{id, op, params}`; replies are
// `{id, ok: true, result}` or `{id, ok: false, error}`; progress frames are
// `{id, progress}` and may arrive any number of times before the reply.
// `{op: "cancel", params: {id}}` has no id and no reply of its own.

export const PROTOCOL_VERSION = 1;

/** Mirrored by `server/app/services/dataflow/models.py:EngineErrorCode`. */
export const ENGINE_ERROR_CODES = [
  "invalid-request",
  "no-tsconfig",
  "non-strict-tsconfig",
  "no-ts-files",
  "typescript-not-found",
  "python-not-found",
  "python-checker-not-found",
  "no-python-files",
  "stale-generation",
  "not-found",
  "unsupported-selection",
  "ambiguous-selection",
  "cancelled",
  "budget-exhausted",
  "memory-limit",
  "internal",
] as const;

export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export function isEngineErrorCode(value: unknown): value is EngineErrorCode {
  return typeof value === "string" && (ENGINE_ERROR_CODES as readonly string[]).includes(value);
}

export type RequestFrame = { id: number; op: string; params?: Record<string, unknown> };
export type CancelFrame = { op: "cancel"; params: { id: number } };

export type ProgressPayload = {
  phase: "queued" | "program" | "identity" | "trace" | "summarize" | "routes" | "project";
  message: string;
  completed?: number;
  total?: number;
};

export type ErrorPayload = { code: EngineErrorCode; message: string; details?: Record<string, unknown> };

export type ReplyFrame =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: ErrorPayload }
  | { id: number; progress: ProgressPayload };

/** Parse one stdin line. Throws `invalid-request` for anything that is not a frame. */
export function parseFrame(line: string): RequestFrame | CancelFrame {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new EngineError("invalid-request", "Request is not valid JSON");
  }
  if (!value || typeof value !== "object") throw new EngineError("invalid-request", "Request must be an object");
  const frame = value as { id?: unknown; op?: unknown; params?: unknown };
  if (typeof frame.op !== "string") throw new EngineError("invalid-request", "Request has no op");
  const params = frame.params ?? {};
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new EngineError("invalid-request", "Request params must be an object");
  }
  if (frame.op === "cancel") {
    const target = (params as { id?: unknown }).id;
    if (!Number.isInteger(target)) throw new EngineError("invalid-request", "cancel needs params.id");
    return { op: "cancel", params: { id: target as number } };
  }
  if (!Number.isInteger(frame.id) || (frame.id as number) <= 0) {
    throw new EngineError("invalid-request", "Request id must be a positive integer");
  }
  return { id: frame.id as number, op: frame.op, params: params as Record<string, unknown> };
}

export function errorPayload(error: unknown): ErrorPayload {
  if (error instanceof EngineError) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  const coded = error as { code?: unknown; message?: unknown; details?: unknown } | null;
  if (coded && isEngineErrorCode(coded.code)) {
    return {
      code: coded.code,
      message: String(coded.message ?? coded.code),
      ...(coded.details && typeof coded.details === "object" ? { details: coded.details as Record<string, unknown> } : {}),
    };
  }
  return { code: "internal", message: error instanceof Error ? error.message : String(error) };
}
