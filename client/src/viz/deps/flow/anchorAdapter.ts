// Anchor mode: the engine's anchor graph → the dependency view's ViewModel.
// The anchor is the focus in the center; what the value comes from sits on
// the left (`in`) and what it goes to on the right (`out`), the way the import
// graph places importers and imports. Each box's owning function is its frame.
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { ViewEdge, ViewNode } from "../viewModel";
import type { FlowViewModel } from "./adapter";
import { FLOW_MARKS, humanizeDetail, MARK_OF_ANCHOR_KIND } from "./marks";

export type AnchorNode = AnchorGraphResult["nodes"][number];
export type AnchorEdge = AnchorGraphResult["edges"][number];

/** Relation kinds where a value crosses a call or a prop: drawn dashed, like a handoff. */
const CROSSING = new Set(["argument", "argument-binding", "invokes", "function-call", "function-return", "return-value", "callback-parameter", "component-prop", "component-prop-binding", "http-bridge", "carrier", "gap"]);

export function anchorGraphToViewModel(graph: AnchorGraphResult): FlowViewModel {
  const byId = new Map<string, AnchorNode>(graph.nodes.map((n) => [n.id, n]));
  const scopes = new Map(graph.nodes.filter((n) => n.kind === "scope").map((n) => [n.id, n]));
  const anchor = graph.nodes.find((n) => n.kind === "anchor");
  const empty: FlowViewModel = {
    vm: { focusId: "", focusKind: "symbol", focusLabel: graph.anchor.text, breadcrumbs: [], nodes: [], edges: [], rolledUp: 0 },
    hidden: new Set(),
    notFlow: new Set(),
    byId,
    shownAs: new Map(),
    lit: null,
  };
  if (!anchor) return empty;
  const boxes = graph.nodes.filter((n) => n.kind !== "scope");
  const nodes: ViewNode[] = boxes.map((n) => {
    const mark = MARK_OF_ANCHOR_KIND[n.kind];
    const scope = n.parent ? scopes.get(n.parent) : undefined;
    return {
      id: n.id,
      graphId: n.id,
      region: n.side === "up" ? "in" : n.side === "down" ? "out" : "center",
      kind: "symbol",
      symbolKind: mark,
      label: n.label,
      title: `${n.label} · ${n.file}:${n.line}`,
      subtitle: [humanizeDetail(n.detail), `${baseName(n.file)}:${n.line}`].filter(Boolean).join(" · "),
      note: noteFor(n),
      memberCount: 1,
      isFocus: n.kind === "anchor",
      ...(scope ? { group: { id: scope.id, label: scope.detail === "module" ? scope.label : `${scope.label} · ${scope.detail}`, opened: true } } : {}),
      status: n.status,
      tint: FLOW_MARKS[mark].color,
      ...(n.kind === "frontier" ? { outline: "hatched" as const } : n.kind === "boundary" ? { outline: "dotted" as const } : {}),
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: ViewEdge[] = [];
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    const key = `${e.source}|${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      weight: 1,
      faint: e.status !== "proven",
      symbols: [],
      // A structural link (a declaration's parameter or return) is drawn dotted and neutral: found by structure, not traced.
      ...(e.status === "structural" ? { style: "structural" as const } : CROSSING.has(e.kind) ? { style: "handoff" as const } : {}),
      ...(e.label ? { label: e.label } : {}),
      status: e.status,
      proof: e.proof.map((p) => ({ kind: p.kind, detail: p.detail, status: p.status, at: p.locations[0] ? `${baseName(p.locations[0].file)}:${p.locations[0].line}` : undefined })),
      relation: e.kind,
    });
  }
  return {
    vm: { focusId: anchor.id, focusKind: "symbol", focusLabel: graph.anchor.text, breadcrumbs: [], nodes, edges, rolledUp: 0 },
    hidden: new Set(),
    notFlow: new Set(),
    byId,
    shownAs: new Map(boxes.map((n) => [n.id, n.id])),
    lit: null,
  };
}

function noteFor(n: AnchorNode): string | undefined {
  const parts: string[] = [];
  if (n.status !== "proven") parts.push(n.status);
  if (n.reason) parts.push(n.reason);
  if (n.typeText && n.kind !== "frontier") parts.push(n.typeText);
  return parts.length ? parts.join(" · ") : undefined;
}

function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}
