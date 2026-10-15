import type { DependencyGraphContract, GraphEdge, GraphNode } from "./contract";

export interface FilterOptions {
  showExternal: boolean;
  showTests: boolean;
  showTypeOnly: boolean;
}

export const DEFAULT_FILTERS: FilterOptions = {
  showExternal: false,
  showTests: false,
  showTypeOnly: false,
};

export interface GraphIndex {
  graph: DependencyGraphContract;
  byId: Map<string, GraphNode>;
  children: Map<string, string[]>;
  edges: GraphEdge[];
}

export function applyFilters(
  graph: DependencyGraphContract,
  filters: FilterOptions,
): DependencyGraphContract {
  const keep = new Set<string>();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const hiddenFile = (n: GraphNode): boolean => {
    if (n.kind === "external" && !filters.showExternal) return true;
    if (n.isTest && !filters.showTests) return true;
    if (n.kind === "symbol" && n.parent) {
      const p = byId.get(n.parent);
      return p ? hiddenFile(p) : false;
    }
    return false;
  };
  for (const n of graph.nodes) if (!hiddenFile(n)) keep.add(n.id);

  // Drop folders that end up empty.
  const hasContent = new Set<string>();
  for (const n of graph.nodes) {
    if (!keep.has(n.id) || n.kind === "folder") continue;
    let p = n.parent;
    while (p !== null && p !== undefined && !hasContent.has(p)) {
      hasContent.add(p);
      p = byId.get(p)?.parent ?? null;
    }
  }
  const nodes = graph.nodes.filter(
    (n) => keep.has(n.id) && (n.kind !== "folder" || hasContent.has(n.id) || n.id === graph.root),
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target) && (filters.showTypeOnly || !e.typeOnly),
  );
  return { root: graph.root, nodes, edges };
}

export function buildIndex(graph: DependencyGraphContract): GraphIndex {
  const byId = new Map<string, GraphNode>();
  const children = new Map<string, string[]>();
  for (const n of graph.nodes) byId.set(n.id, n);
  for (const n of graph.nodes) {
    if (n.parent === null || n.parent === undefined) continue;
    const arr = children.get(n.parent) ?? [];
    arr.push(n.id);
    children.set(n.parent, arr);
  }
  return { graph, byId, children, edges: graph.edges };
}

/** Ancestors from the root down to (and excluding) the node. */
export function ancestors(index: GraphIndex, id: string): string[] {
  const out: string[] = [];
  let p = index.byId.get(id)?.parent ?? null;
  while (p !== null && p !== undefined) {
    out.unshift(p);
    p = index.byId.get(p)?.parent ?? null;
  }
  return out;
}

export function isAncestorOrSelf(index: GraphIndex, maybeAncestor: string, id: string): boolean {
  let cur: string | null | undefined = id;
  while (cur !== null && cur !== undefined) {
    if (cur === maybeAncestor) return true;
    cur = index.byId.get(cur)?.parent;
  }
  return false;
}

/**
 * Walk down chains of folders that contain exactly one child folder and nothing
 * else, so drilling into `src` lands on `src/app/services` when that is the
 * first level with real choices.
 */
export function collapseChain(index: GraphIndex, id: string): string {
  let cur = id;
  for (;;) {
    const node = index.byId.get(cur);
    if (!node || node.kind !== "folder") return cur;
    const kids = index.children.get(cur) ?? [];
    if (kids.length !== 1) return cur;
    const only = index.byId.get(kids[0]);
    if (!only || only.kind !== "folder") return cur;
    cur = only.id;
  }
}

/** The file that owns a node (itself for files/externals, parent for symbols). */
export function owningFile(index: GraphIndex, id: string): string {
  const n = index.byId.get(id);
  if (n?.kind === "symbol" && n.parent) return n.parent;
  return id;
}

export function displayName(index: GraphIndex, id: string): string {
  const n = index.byId.get(id);
  if (!n) return id;
  if (n.kind === "file" && /^(index|__init__|mod|main)\.[a-z]+$/i.test(n.name) && n.parent) {
    const p = index.byId.get(n.parent);
    if (p && p.name) return `${p.name}/${n.name}`;
  }
  return n.name || "(root)";
}
