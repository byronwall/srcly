// Calls to /api/dataflow/*. The engine results are the generated contract
// types; the wrappers are the server's own responses (routers/dataflow.py).
import type { AnchorGraphResult, FunctionEffectsResult, RouteGraphResult, RoutePathResult, RoutesResult, SelectExpressionResult, StatusResult, ValueFlowResult } from "./contract.generated";

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

/** Rebuild tier 1 from the sources as they are now: the reply names the new generation, and every open graph is fetched again with it. */
export async function refreshDataflow(path: string, signal?: AbortSignal): Promise<RoutesResponse> {
  const res = await fetch("/api/dataflow/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    signal,
  });
  return json(res, "Refreshing data flow");
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

/** The route's render backbone alone (`phase: surface`), answered before the first full graph on a large app. */
export async function fetchRouteSurface(args: { path: string; route: string; expectedGeneration?: number; signal?: AbortSignal }): Promise<RouteGraphResponse> {
  const query = new URLSearchParams({ path: args.path, route: args.route });
  if (args.expectedGeneration !== undefined) query.set("expectedGeneration", String(args.expectedGeneration));
  const res = await fetch(`/api/dataflow/route-surface?${query}`, { signal: args.signal });
  return json(res, "Route surface");
}

export interface FunctionEffectsResponse extends OutcomeFields {
  effects: FunctionEffectsResult | null;
}

/** What the function enclosing `line` in `file` touches: facts with witnesses, frontiers, promise handling, assumptions. */
export function fetchFunctionEffects(req: { path: string; file: string; line: number; column?: number; expectedGeneration?: number; signal?: AbortSignal }): Promise<FunctionEffectsResponse> {
  return post("/api/dataflow/function-effects", req, "Function effects");
}

export interface RoutePathResponse extends OutcomeFields {
  path: RoutePathResult | null;
}

/** One lit edge of a route graph, explained in order; field edges need the origin the graph was lit for. */
export async function fetchRoutePath(args: { path: string; route: string; edge: string; source?: string; expectedGeneration?: number; signal?: AbortSignal }): Promise<RoutePathResponse> {
  const query = new URLSearchParams({ path: args.path, route: args.route, edge: args.edge });
  if (args.source) query.set("source", args.source);
  if (args.expectedGeneration !== undefined) query.set("expectedGeneration", String(args.expectedGeneration));
  const res = await fetch(`/api/dataflow/route-path?${query}`, { signal: args.signal });
  return json(res, "Edge steps");
}

export interface SelectResponse extends OutcomeFields {
  result: SelectExpressionResult | null;
}

export interface ValueFlowResponse extends OutcomeFields {
  ledger: ValueFlowResult | null;
}

type SelectionRequest = {
  /** The scan root the engine analyzes. */
  path: string;
  /** Absolute path of the file in the code viewer. */
  file: string;
  span: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  text?: string;
  expectedGeneration?: number;
  signal?: AbortSignal;
};

async function post<T>(url: string, req: { signal?: AbortSignal } & Record<string, unknown>, what: string): Promise<T> {
  const { signal, ...body } = req;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  return json(res, what);
}

export interface AnchorGraphResponse extends OutcomeFields {
  graph: AnchorGraphResult | null;
}

export type AnchorRequest = {
  path: string;
  /** Absolute path of the file, or relative to the scan root. */
  file: string;
  direction: "forward" | "backward" | "both";
  expectedGeneration?: number;
  signal?: AbortSignal;
} & ({ span: { startLine: number; startColumn: number; endLine: number; endColumn: number }; text?: string } | { name: string; line: number });

/** A value's neighbourhood from any expression: where it comes from, where it goes, or both. */
export function fetchAnchorGraph(req: AnchorRequest): Promise<AnchorGraphResponse> {
  return post("/api/dataflow/anchor-graph", req, "Anchor graph");
}

export function selectExpression(req: SelectionRequest): Promise<SelectResponse> {
  return post("/api/dataflow/select", req, "Finding the expression");
}

export function fetchValueFlow(req: SelectionRequest): Promise<ValueFlowResponse> {
  return post("/api/dataflow/value-flow", req, "Value flow");
}
