// Data flow mode: the engine's route graph → the dependency view's ViewModel,
// so the same layout and canvas draw it. Every node sits in the center
// region; each node's parent in the render hierarchy becomes its frame
// (`group`), so an occurrence reads as an opened frame holding what it
// renders. The graph is reach, not order: nothing here invents a step.
import type { RouteGraphResult } from "../../../dataflow/contract.generated";
import type { ViewEdge, ViewModel, ViewNode } from "../viewModel";

export type FlowNode = RouteGraphResult["nodes"][number];
export type FlowEdge = RouteGraphResult["edges"][number];

/** Boxes drawn before deeper frames fold into their parent (the import view's budget). */
export const FLOW_BUDGET = 64;

export interface FlowViewOptions {
  /** Flow node ids opened in place: a frame that shows its children whatever the budget, or a primitive drawn as a box. */
  expanded?: Iterable<string>;
  budget?: number;
}

export interface FlowViewModel {
  vm: ViewModel;
  /** Containment edges that order the columns but are not drawn: frames already show ownership. */
  hidden: Set<string>;
  /** Flow node by view id (they are the same ids). */
  byId: Map<string, FlowNode>;
  /** The drawn box that stands for each flow node (itself, or the frame it folded into). */
  shownAs: Map<string, string>;
}

const SYMBOL_KIND: Record<FlowNode["kind"], string> = {
  route: "route",
  occurrence: "component",
  control: "control",
  origin: "origin",
  field: "origin",
  terminal: "terminal",
  frontier: "terminal",
};

/** Drawn edges between frames: what renders what. Terminals and origins are owned, not rendered. */
const RENDERS = new Set<FlowNode["kind"]>(["route", "occurrence", "control"]);

export function routeGraphToViewModel(graph: RouteGraphResult, opts: FlowViewOptions = {}): FlowViewModel {
  const expanded = new Set(opts.expanded ?? []);
  const budget = opts.budget ?? FLOW_BUDGET;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const children = new Map<string, FlowNode[]>();
  let root: FlowNode | undefined;
  for (const n of graph.nodes) {
    if (n.parent === null || !byId.has(n.parent)) {
      root ??= n;
      continue;
    }
    (children.get(n.parent) ?? children.set(n.parent, []).get(n.parent)!).push(n);
  }
  const empty: FlowViewModel = {
    vm: { focusId: "", focusKind: "file", focusLabel: graph.route.pathPattern, breadcrumbs: [], nodes: [], edges: [], rolledUp: 0 },
    hidden: new Set(),
    byId,
    shownAs: new Map(),
  };
  if (!root) return empty;

  // A primitive that is collapsed by default is transparent: its children
  // belong to the nearest drawn ancestor's frame, and it counts there.
  const transparent = (n: FlowNode) => n.collapsedByDefault && !expanded.has(n.id);
  const effectiveChildren = (n: FlowNode): { shown: FlowNode[]; primitives: number } => {
    const shown: FlowNode[] = [];
    let primitives = 0;
    const visit = (k: FlowNode) => {
      if (transparent(k)) {
        primitives += 1;
        for (const g of children.get(k.id) ?? []) visit(g);
      } else shown.push(k);
    };
    for (const k of children.get(n.id) ?? []) visit(k);
    return { shown, primitives };
  };
  const descendants = (n: FlowNode): number => (children.get(n.id) ?? []).reduce((a, k) => a + 1 + descendants(k), 0);

  const parentOf = new Map<string, string>();
  const shownAs = new Map<string, string>();
  const drawn: FlowNode[] = [root];
  const folded = new Map<string, number>();
  const primitivesIn = new Map<string, number>();
  shownAs.set(root.id, root.id);

  // Breadth first, so the budget keeps the shallow backbone and folds the deep leaves.
  const queue: FlowNode[] = [root];
  while (queue.length) {
    const n = queue.shift()!;
    const { shown, primitives } = effectiveChildren(n);
    if (primitives) primitivesIn.set(n.id, primitives);
    if (!shown.length) continue;
    // A frame shows all of its children or none, so it never reads half full.
    const open = n === root || expanded.has(n.id) || drawn.length + shown.length <= budget;
    if (!open) {
      folded.set(n.id, shown.reduce((a, k) => a + 1 + descendants(k), 0));
      const fold = (k: FlowNode) => {
        shownAs.set(k.id, n.id);
        for (const g of children.get(k.id) ?? []) fold(g);
      };
      for (const k of children.get(n.id) ?? []) fold(k);
      continue;
    }
    for (const k of shown) {
      drawn.push(k);
      parentOf.set(k.id, n.id);
      shownAs.set(k.id, k.id);
      queue.push(k);
    }
  }
  // Transparent primitives stand for themselves through the frame that holds them.
  for (const n of graph.nodes) {
    if (shownAs.has(n.id)) continue;
    let p = n.parent;
    while (p && !shownAs.has(p)) p = byId.get(p)?.parent ?? null;
    shownAs.set(n.id, p ? shownAs.get(p)! : root.id);
  }

  const nodes: ViewNode[] = drawn.map((n) => {
    const parent = parentOf.get(n.id);
    const frame = parent ? byId.get(parent)! : undefined;
    const hiddenInside = folded.get(n.id) ?? 0;
    const primitives = primitivesIn.get(n.id) ?? 0;
    return {
      id: n.id,
      graphId: n.id,
      region: "center",
      kind: "symbol",
      symbolKind: SYMBOL_KIND[n.kind],
      label: n.label,
      title: `${n.label} · ${n.file}:${n.line}`,
      subtitle: [n.detail, `${baseName(n.file)}:${n.line}`].filter(Boolean).join(" · "),
      note: noteFor(n, hiddenInside, primitives),
      memberCount: 1 + hiddenInside,
      isFocus: n === root,
      ...(frame ? { group: { id: frame.id, label: frameLabel(frame), opened: true } } : {}),
      expandable: hiddenInside > 0,
      ...(n.kind === "frontier" ? { outline: "hatched" as const } : n.collapsedByDefault ? { outline: "dotted" as const } : {}),
    };
  });

  const edges: ViewEdge[] = [];
  const hidden = new Set<string>();
  for (const n of drawn) {
    const parent = parentOf.get(n.id);
    if (!parent) continue;
    const id = `contains:${parent}>${n.id}`;
    edges.push({ id, source: parent, target: n.id, weight: 1, faint: n.status !== "proven", symbols: [] });
    if (!RENDERS.has(n.kind) || !RENDERS.has(byId.get(parent)!.kind)) hidden.add(id);
  }
  const seen = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind === "render") continue;
    const source = shownAs.get(e.source);
    const target = shownAs.get(e.target);
    if (!source || !target || source === target) continue;
    const key = `${e.kind}|${source}|${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: `${e.kind}:${e.id}`,
      source,
      target,
      weight: 1,
      faint: e.status !== "proven",
      symbols: [],
      style: e.kind === "field" ? "field" : "handoff",
    });
  }

  return {
    vm: {
      focusId: root.id,
      focusKind: "file",
      focusLabel: graph.route.pathPattern,
      breadcrumbs: [],
      nodes,
      edges,
      rolledUp: [...folded.values()].reduce((a, b) => a + b, 0),
      expanded: [...expanded].filter((id) => byId.has(id)),
    },
    hidden,
    byId,
    shownAs,
  };
}

function frameLabel(n: FlowNode): string {
  return n.kind === "route" ? n.label : n.kind === "control" ? `${n.label} (${n.detail?.split(" · ")[0] ?? "control"})` : n.label;
}

function noteFor(n: FlowNode, hiddenInside: number, primitives: number): string {
  const parts: string[] = [];
  if (n.status !== "proven") parts.push(n.status);
  if (n.repetition === "conditional" || n.repetition === "collection") parts.push(n.repetition);
  if (hiddenInside) parts.push(`+${hiddenInside} inside`);
  if (primitives) parts.push(`${primitives} wrapper${primitives === 1 ? "" : "s"}`);
  if (n.reason) parts.push(n.reason);
  return parts.join(" · ");
}

function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}
