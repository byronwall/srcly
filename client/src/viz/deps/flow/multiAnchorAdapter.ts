// Several anchors on one canvas (T20): each anchor graph is its own query
// from the engine, all of one generation, merged by element id. A box that
// more than one trace reaches is shared: drawn lit, with a note naming the
// anchors that meet there. Frames merge the same way, since the owning
// scope has one id across graphs.
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { ViewEdge, ViewNode } from "../viewModel";
import type { FlowViewModel } from "./adapter";
import { anchorGraphToViewModel } from "./anchorAdapter";

export interface MergedAnchors {
  model: FlowViewModel;
  /** Boxes reached by more than one anchor's trace, by id, with the anchors' texts. */
  shared: Map<string, string[]>;
}

export function anchorsToViewModel(graphs: readonly AnchorGraphResult[]): MergedAnchors {
  const models = graphs.map((graph) => ({ graph, model: anchorGraphToViewModel(graph) }));
  const owners = new Map<string, string[]>();
  for (const { graph, model } of models) for (const node of model.vm.nodes) owners.set(node.id, [...(owners.get(node.id) ?? []), graph.anchor.text]);
  const shared = new Map([...owners].filter(([, texts]) => texts.length > 1));
  const nodes: ViewNode[] = [];
  const seenNodes = new Set<string>();
  const edges: ViewEdge[] = [];
  const seenEdges = new Set<string>();
  const byId: FlowViewModel["byId"] = new Map();
  const shownAs = new Map<string, string>();
  for (const { model } of models) {
    for (const node of model.vm.nodes) {
      if (seenNodes.has(node.id)) continue;
      seenNodes.add(node.id);
      const meets = shared.get(node.id);
      nodes.push(meets ? { ...node, lit: true, note: [node.note, `where ${meets.join(" and ")} meet`].filter(Boolean).join(" · ") } : node);
    }
    for (const edge of model.vm.edges) {
      const key = `${edge.source}|${edge.target}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push(edge);
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
