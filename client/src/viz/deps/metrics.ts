// Joins treemap metrics onto dependency-graph boxes.
//
// The treemap tree already holds LOC and every metric, keyed by the same
// absolute path the graph carries as `absPath`. Indexing it once per scan
// lets the graph show LOC and the treemap's color without any server change.

import type { GraphIndex } from "./hierarchy";
import type { ViewNode } from "./viewModel";

/** The parts of a treemap node this join reads. */
export interface MetricsNode {
  name: string;
  path: string;
  type: string;
  children?: MetricsNode[];
  metrics?: Record<string, any>;
}

export type MetricsIndex = Map<string, MetricsNode>;

/** absPath → folder/file node, built once per scan (scopes stay under their file). */
export function buildMetricsIndex(root: MetricsNode | null | undefined): MetricsIndex {
  const index: MetricsIndex = new Map();
  const stack = root ? [root] : [];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.type !== "folder" && n.type !== "file") continue;
    index.set(n.path, n);
    if (n.type === "folder") for (const c of n.children ?? []) stack.push(c);
  }
  return index;
}

/** Metrics for a folder or file by absolute path; undefined when the treemap has no match. */
export function nodeMetrics(index: MetricsIndex | undefined, absPath: string | undefined): Record<string, any> | undefined {
  if (!index || !absPath) return undefined;
  return index.get(absPath)?.metrics;
}

/**
 * Metrics for a symbol: the file's top-level scope with that name. Scope
 * names may carry a kind, e.g. `ViewNode (interface)` or `(class) ScanJob`.
 */
export function symbolMetrics(
  index: MetricsIndex | undefined,
  fileAbsPath: string | undefined,
  name: string,
): Record<string, any> | undefined {
  if (!index || !fileAbsPath) return undefined;
  const scopes = index.get(fileAbsPath)?.children ?? [];
  const hit =
    scopes.find((s) => s.name === name) ??
    scopes.find((s) => s.name.startsWith(`${name} (`) || /^\([^)]*\) /.test(s.name) && s.name.replace(/^\([^)]*\) /, "") === name);
  return hit?.metrics;
}

/** Metrics per box id for the boxes that have a treemap match. */
export function viewMetrics(graph: GraphIndex, nodes: ViewNode[], index: MetricsIndex | undefined): Map<string, Record<string, any>> {
  const out = new Map<string, Record<string, any>>();
  if (!index) return out;
  for (const n of nodes) {
    const g = graph.byId.get(n.graphId);
    if (!g) continue;
    const m =
      g.kind === "symbol"
        ? symbolMetrics(index, g.parent ? graph.byId.get(g.parent)?.absPath : undefined, g.name)
        : nodeMetrics(index, g.absPath);
    if (m) out.set(n.id, m);
  }
  return out;
}

/** `840 LOC`, `4.1k LOC`, `12k LOC`. */
export function formatLoc(loc: number): string {
  if (loc < 1000) return `${Math.round(loc)} LOC`;
  const k = loc / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k LOC`;
}
