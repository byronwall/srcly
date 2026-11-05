import type { SymbolGraph, SymbolPath, SymbolSearch } from "./contract";

export class SymbolApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // The status is the message.
    }
    throw new SymbolApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

/** A symbol's neighbourhood: the focus and its members, the symbols within `hops` of them, the opened hops (`more`), and the references among them. */
export function fetchSymbolGraph(req: { path: string; at: string; hops?: number; more?: string[]; tests?: boolean }): Promise<SymbolGraph> {
  return get<SymbolGraph>("/api/symbols/graph", { path: req.path, at: req.at, hops: req.hops, more: req.more?.join(","), tests: req.tests });
}

/** The shortest chain of references from one symbol to another (forward, else backward), or that there is none. */
export function fetchSymbolPath(req: { path: string; from: string; to: string; kinds?: string[]; tests?: boolean }): Promise<SymbolPath> {
  return get<SymbolPath>("/api/symbols/path", { path: req.path, from: req.from, to: req.to, kinds: req.kinds?.join(","), tests: req.tests });
}

export function searchSymbols(req: { path: string; q: string; limit?: number; tests?: boolean }): Promise<SymbolSearch> {
  return get<SymbolSearch>("/api/symbols/search", { path: req.path, q: req.q, limit: req.limit, tests: req.tests });
}
