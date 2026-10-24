// Calls to /api/dataflow/*. The engine results are the generated contract
// types; the wrappers are the server's own responses (routers/dataflow.py).
import type { RouteGraphResult, RoutesResult, StatusResult } from "./contract.generated";

export type Outcome = RoutesResult["outcome"];
export type NaReason =
  | "node-not-found"
  | "engine-missing"
  | "no-tsconfig"
  | "non-strict-tsconfig"
  | "no-ts-files"
  | "typescript-not-found"
  | "engine-crashed"
  | "timed-out"
  | "engine-protocol-mismatch";
export type Progress = NonNullable<StatusResult["progress"]>;

export interface DataflowStatus {
  available: boolean;
  state: "idle" | "starting" | "running" | "ready" | "na";
  reason?: NaReason;
  message?: string;
  node?: string;
  engine?: string;
  typescript?: string;
  typescriptFrom?: "project" | "bundled";
  generation?: number;
  programHash?: string;
  stale: boolean;
  rssBytes?: number;
  progress?: Progress;
}

/** Every analysis state is a 200 with an outcome; these fields say which. */
interface OutcomeFields {
  outcome: Outcome;
  reason?: NaReason | null;
  message?: string | null;
  generation?: number | null;
  programHash?: string | null;
}

export interface RoutesResponse extends OutcomeFields {
  routes: RoutesResult["routes"];
  tsconfig?: string;
  typescript?: string;
}

export interface RouteGraphResponse extends OutcomeFields {
  graph: RouteGraphResult | null;
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : body.detail?.message ?? "";
    } catch {
      // A body that is not JSON adds nothing to the status line.
    }
    throw new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

export async function fetchDataflowStatus(path: string, signal?: AbortSignal): Promise<DataflowStatus> {
  const res = await fetch(`/api/dataflow/status?${new URLSearchParams({ path })}`, { signal });
  return json(res, "Data-flow status");
}

export async function startDataflow(path: string, signal?: AbortSignal): Promise<DataflowStatus> {
  const res = await fetch("/api/dataflow/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    signal,
  });
  return json(res, "Starting data flow");
}

export async function fetchRoutes(path: string, signal?: AbortSignal): Promise<RoutesResponse> {
  const res = await fetch(`/api/dataflow/routes?${new URLSearchParams({ path })}`, { signal });
  return json(res, "Routes");
}

export async function fetchRouteGraph(args: { path: string; route: string; source?: string; expectedGeneration?: number; signal?: AbortSignal }): Promise<RouteGraphResponse> {
  const query = new URLSearchParams({ path: args.path, route: args.route });
  if (args.source) query.set("source", args.source);
  if (args.expectedGeneration !== undefined) query.set("expectedGeneration", String(args.expectedGeneration));
  const res = await fetch(`/api/dataflow/route-graph?${query}`, { signal: args.signal });
  return json(res, "Route graph");
}
