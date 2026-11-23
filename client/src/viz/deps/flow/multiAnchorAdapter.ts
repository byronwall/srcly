// Several anchors on one canvas (T20): each anchor graph is its own query
// from the engine, all of one generation, merged by element id. A box that
// more than one trace reaches is shared: drawn lit, with a note naming the
// anchors that meet there. Frames merge the same way, since the owning
// scope has one id across graphs. An edge both traces draw is one edge
// that keeps every witness, and names the traces that have it.
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { ViewEdge, ViewNode } from "../viewModel";
import type { FlowViewModel } from "./adapter";
import { anchorGraphToViewModel, sameProof } from "./anchorAdapter";

export interface MergedAnchors {
  model: FlowViewModel;
  /** Boxes reached by more than one anchor's trace, by id, with the anchors' texts. */
  shared: Map<string, string[]>;
}

const WALK_STRENGTH = { structural: 0, faint: 1, proven: 2 } as const;
const STRENGTH: Record<NonNullable<ViewEdge["status"]>, number> = { structural: 0, unsupported: 1, partial: 2, proven: 3 };

/** One edge, two traces' witnesses: every relation and proof stays, with the strongest status any of them has, as one trace's edges do. */
function merge(known: ViewEdge, edge: ViewEdge) {
  for (const kind of (edge.relation ?? "").split(", ").filter(Boolean)) if (!(known.relation ?? "").split(", ").includes(kind)) known.relation = known.relation ? `${known.relation}, ${kind}` : kind;
  for (const field of (edge.label ?? "").split(", ").filter(Boolean)) if (!(known.label ?? "").split(", ").includes(field)) known.label = known.label ? `${known.label}, ${field}` : field;
  for (const p of edge.proof ?? []) if (!known.proof?.some((item) => sameProof(item, p))) known.proof = [...(known.proof ?? []), p];
  if (edge.status && STRENGTH[edge.status] > STRENGTH[known.status ?? "structural"]) Object.assign(known, { status: edge.status, faint: edge.faint, style: edge.style });
  if (known.assumed && !edge.assumed) delete known.assumed;
}

/** How one trace's own witness lets reach walk an edge. */
const walkOf = (edge: ViewEdge) => (edge.style === "structural" ? "structural" : edge.faint ? "faint" : "proven");

export function anchorsToViewModel(graphs: readonly AnchorGraphResult[]): MergedAnchors {
  const models = graphs.map((graph) => ({ graph, model: anchorGraphToViewModel(graph) }));
  const owners = new Map<string, string[]>();
  for (const { graph, model } of models) for (const node of model.vm.nodes) owners.set(node.id, [...(owners.get(node.id) ?? []), graph.anchor.text]);
  const shared = new Map([...owners].filter(([, texts]) => texts.length > 1));
  const nodes: ViewNode[] = [];
  const seenNodes = new Set<string>();
  const edges: ViewEdge[] = [];
  const seenEdges = new Map<string, ViewEdge>();
  const byId: FlowViewModel["byId"] = new Map();
  const shownAs = new Map<string, string>();
  for (const [index, { model }] of models.entries()) {
    const trace = String(index);
    for (const node of model.vm.nodes) {
      if (seenNodes.has(node.id)) continue;
      seenNodes.add(node.id);
      const meets = shared.get(node.id);
      nodes.push(meets ? { ...node, lit: true, note: [node.note, `where ${meets.join(" and ")} meet`].filter(Boolean).join(" · ") } : node);
    }
    for (const edge of model.vm.edges) {
      const key = `${edge.source}|${edge.target}`;
      const known = seenEdges.get(key);
      // A trace that draws one pair twice (it cannot; the adapter merges pairs) keeps its stronger witness.
      const walk = walkOf(edge);
      if (known) {
        merge(known, edge);
        const had = known.traces![trace];
        if (!had || WALK_STRENGTH[walk] > WALK_STRENGTH[had]) known.traces![trace] = walk;
        continue;
      }
      // One id per drawn pair: two traces can project different engine relations onto one pair, or one relation onto two.
      const own: ViewEdge = { ...edge, id: `pair:${key}`, traces: { [trace]: walk }, ...(edge.proof ? { proof: [...edge.proof] } : {}) };
      seenEdges.set(key, own);
      edges.push(own);
    }
    for (const [id, box] of model.byId) if (!byId.has(id)) byId.set(id, box);
    for (const [id, drawn] of model.shownAs) if (!shownAs.has(id)) shownAs.set(id, drawn);
  }
  const first = models[0]?.model;
  return {
    model: {
      vm: {
        focusId: first?.vm.focusId ?? "",
        focusKind: "symbol",
        focusLabel: graphs.map((graph) => graph.anchor.text).join(" + "),
        breadcrumbs: [],
        nodes,
        edges,
        rolledUp: 0,
      },
      hidden: new Set(),
      notFlow: new Set(),
      byId,
      shownAs,
      lit: shared.size ? { nodes: new Set(shared.keys()), edges: new Set() } : null,
    },
    shared,
  };
}
