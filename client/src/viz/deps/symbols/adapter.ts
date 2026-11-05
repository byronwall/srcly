// Symbols mode: a symbol's neighbourhood → the dependency view's ViewModel,
// so the same layout and canvas draw it. The focus and its members sit in
// the center inside one frame; what references them is on the left (`in`),
// what they reference on the right (`out`), framed by file and, inside a
// file, grouped by class. Edges keep their kind and how sure the index is.
import { baseName, fileOf, qualifiedOf, REF_KIND_SPEC, RESOLUTION_SPEC, type RefKind, type SymbolEdge, type SymbolGraph, type SymbolNode, type SymbolPath } from "../../../symbols/contract";
import type { ViewEdge, ViewModel, ViewNode } from "../viewModel";

export interface SymbolViewOptions {
  /** Reference kinds drawn; an edge of another kind is left out, and a symbol only such edges reach with it. */
  kinds: Iterable<RefKind>;
  /** Symbol ids whose own hop is opened in place (the URL's `open` list). */
  expanded: Iterable<string>;
}

export interface SymbolViewModel {
  vm: ViewModel;
  /** The engine's node by id (the view uses the same ids). */
  byId: Map<string, SymbolNode>;
  /** The merged reference behind each drawn edge, by view edge id. */
  edgeById: Map<string, SymbolEdge>;
  /** Symbols of the answer left undrawn because every reference to them is of a hidden kind. */
  hiddenByKind: number;
}

/** The canvas style each kind is drawn with: dashes and color the import and flow views already know. */
const STYLE: Partial<Record<RefKind, ViewEdge["style"]>> = { write: "field", type: "structural", extends: "handoff", implements: "handoff" };
/** The word drawn along the edge where there is room (calls, the most common, stay bare). */
const LABEL: Partial<Record<RefKind, string>> = { instantiate: "new", write: "writes", type: "type", extends: "extends", implements: "implements", read: "reads" };

export const edgeId = (e: Pick<SymbolEdge, "source" | "target" | "kind">) => `${e.kind}:${e.source}>${e.target}`;

export function symbolGraphToViewModel(graph: SymbolGraph, options: SymbolViewOptions): SymbolViewModel {
  const kinds = new Set(options.kinds);
  const expanded = new Set(options.expanded);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const focus = byId.get(graph.focus);
  const edges = graph.edges.filter((e) => kinds.has(e.kind) && byId.has(e.source) && byId.has(e.target));
  const center = new Set(graph.nodes.filter((n) => n.hop === 0).map((n) => n.id));
  const touched = new Set<string>();
  for (const e of edges) {
    touched.add(e.source);
    touched.add(e.target);
  }
  const kept = graph.nodes.filter((n) => center.has(n.id) || expanded.has(n.id) || touched.has(n.id));
  const keptIds = new Set(kept.map((n) => n.id));
  // Sides: how far upstream (reaching the center) and downstream (reached from it) each symbol is.
  const up = distances(center, edges, (e) => [e.target, e.source]);
  const down = distances(center, edges, (e) => [e.source, e.target]);
  const region = (id: string): ViewNode["region"] => {
    if (center.has(id)) return "center";
    const u = up.get(id);
    const d = down.get(id);
    if (u === undefined && d === undefined) return "out";
    if (u === undefined) return "out";
    if (d === undefined) return "in";
    return u <= d ? "in" : "out";
  };
  const degree = new Map<string, Set<string>>();
  for (const e of edges) {
    (degree.get(e.source) ?? degree.set(e.source, new Set()).get(e.source)!).add(e.target);
    (degree.get(e.target) ?? degree.set(e.target, new Set()).get(e.target)!).add(e.source);
  }
  const focusLabel = focus ? labelOf(focus) : qualifiedOf(graph.focus) || baseName(graph.focus);
  const nodes: ViewNode[] = kept.map((n) => {
    const r = region(n.id);
    const drawn = degree.get(n.id)?.size ?? 0;
    const beyond = n.inCount + n.outCount - drawn;
    const container = n.container ? byId.get(n.container) : undefined;
    const where = `${baseName(n.file)}:${n.line}`;
    const node: ViewNode = {
      id: n.id,
      graphId: n.id,
      region: r,
      kind: "symbol",
      symbolKind: n.kind,
      label: labelOf(n),
      title: [n.kind, qualifiedOf(n.id) || baseName(n.file), `${n.file}:${n.line}`, n.isTest ? "test" : "", `${n.inCount} referencing · ${n.outCount} referenced`].filter(Boolean).join(" · "),
      subtitle: n.kind === "module" ? n.file : container ? `${container.name} · ${where}` : where,
      note: `${n.inCount} in · ${n.outCount} out`,
      memberCount: 1,
      isFocus: n.id === graph.focus,
      ...(r === "center"
        ? focus && n.id !== graph.focus
          ? { group: { id: graph.focus, label: focusLabel, opened: true }, subgroup: n.container ?? undefined }
          : {}
        : { group: { id: `file:${n.file}`, label: baseName(n.file), ...(expanded.has(n.id) ? { opened: true } : {}) }, subgroup: n.container ?? undefined }),
      ...(r !== "center" && !expanded.has(n.id) && beyond > 0 ? { expandable: true } : {}),
      ...(n.isTest ? { outline: "dotted" as const } : {}),
    };
    return node;
  });
  const edgeById = new Map<string, SymbolEdge>();
  const viewEdges: ViewEdge[] = edges
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .map((e) => {
      const id = edgeId(e);
      edgeById.set(id, e);
      return viewEdge(e, id);
    });
  return {
    vm: {
      focusId: graph.focus,
      focusKind: "symbol",
      focusLabel,
      breadcrumbs: [],
      nodes,
      edges: viewEdges,
      rolledUp: 0,
      expanded: [...expanded].filter((id) => keptIds.has(id)),
    },
    byId,
    edgeById,
    hiddenByKind: graph.nodes.length - kept.length,
  };
}

/**
 * A path between two symbols as a chain: the start in the centre, each step
 * one layer further on the side the chain runs to (right when the start
 * references its way to the end, left when the end references its way to
 * the start), framed by file. Without a chain, the two ends sit apart.
 */
export function symbolPathToViewModel(path: SymbolPath): SymbolViewModel {
  const byId = new Map(path.nodes.map((n) => [n.id, n]));
  const side: ViewNode["region"] = path.direction === "backward" ? "in" : "out";
  const nodes: ViewNode[] = path.nodes.map((n) => {
    const container = n.container ? byId.get(n.container) : undefined;
    const where = `${baseName(n.file)}:${n.line}`;
    const step = n.hop ?? 0;
    return {
      id: n.id,
      graphId: n.id,
      region: n.id === path.start ? "center" : side,
      kind: "symbol",
      symbolKind: n.kind,
      label: labelOf(n),
      title: [n.kind, qualifiedOf(n.id) || baseName(n.file), `${n.file}:${n.line}`, path.found ? `step ${step} of ${path.steps}` : ""].filter(Boolean).join(" · "),
      subtitle: n.kind === "module" ? n.file : container ? `${container.name} · ${where}` : where,
      note: path.found ? (n.id === path.start ? "start" : n.id === path.end ? `end · ${path.steps} step${path.steps === 1 ? "" : "s"}` : `step ${step}`) : n.id === path.start ? "start" : "end · no path",
      memberCount: 1,
      isFocus: n.id === path.start,
      ...(n.id !== path.start ? { group: { id: `file:${n.file}`, label: baseName(n.file) }, subgroup: n.container ?? undefined } : {}),
      ...(n.isTest ? { outline: "dotted" as const } : {}),
    };
  });
  const edgeById = new Map<string, SymbolEdge>();
  const edges: ViewEdge[] = path.edges.map((e) => {
    const id = edgeId(e);
    edgeById.set(id, e);
    return viewEdge(e, id);
  });
  return {
    vm: { focusId: path.start, focusKind: "symbol", focusLabel: byId.get(path.start) ? labelOf(byId.get(path.start)!) : qualifiedOf(path.start), breadcrumbs: [], nodes, edges, rolledUp: 0, expanded: [] },
    byId,
    edgeById,
    hiddenByKind: 0,
  };
}

/** A merged reference as the canvas draws it: kind and sureness in the style, a sentence for its card. */
function viewEdge(e: SymbolEdge, id: string): ViewEdge {
  const guess = e.resolution === "name";
  const times = e.count === 1 ? `once` : `${e.count} times`;
  const lines = e.lines.length ? ` at line${e.lines.length === 1 ? "" : "s"} ${e.lines.join(", ")}` : "";
  return {
    id,
    source: e.source,
    target: e.target,
    weight: e.count,
    faint: guess || e.kind === "read" || e.kind === "type",
    symbols: [],
    ...(STYLE[e.kind] ? { style: STYLE[e.kind] } : {}),
    ...(LABEL[e.kind] ? { label: LABEL[e.kind] } : {}),
    status: guess ? "partial" : "proven",
    relation: e.kind,
    detail: `${REF_KIND_SPEC[e.kind].verb} it ${times}${lines} · ${RESOLUTION_SPEC[e.resolution].label}: ${RESOLUTION_SPEC[e.resolution].hint}`,
  };
}

/** A module box is named by its file; anything else by its name. */
export function labelOf(n: SymbolNode): string {
  return n.kind === "module" ? baseName(n.file) : n.name;
}

/** Shortest hop count from the seeds along `step` (which end each edge is walked from and to). */
function distances(seeds: Set<string>, edges: SymbolEdge[], step: (e: SymbolEdge) => [from: string, to: string]): Map<string, number> {
  const next = new Map<string, string[]>();
  for (const e of edges) {
    const [from, to] = step(e);
    (next.get(from) ?? next.set(from, []).get(from)!).push(to);
  }
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of seeds) {
    dist.set(s, 0);
    queue.push(s);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of next.get(cur) ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, dist.get(cur)! + 1);
      queue.push(n);
    }
  }
  return dist;
}

export { fileOf };
