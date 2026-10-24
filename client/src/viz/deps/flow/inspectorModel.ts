// What the inspector rail says about the route and about one selected box,
// as plain data from the engine's route graph and the drawn view model. No
// UI here, so the rail's wording is testable against the fixture.
import type { RouteGraphResult } from "../../../dataflow/contract.generated";
import type { FlowNode, FlowViewModel } from "./adapter";
import { humanizeDetail, MARK_OF_KIND, type FlowMark } from "./marks";

export type EdgeKindWord = "renders" | "rendered by" | "handoff" | "field";

export interface NeighborRow {
  /** The drawn box at the other end. */
  id: string;
  label: string;
  mark: FlowMark;
  kind: EdgeKindWord;
  status?: "proven" | "partial" | "unsupported";
  /** A field edge's path. */
  path?: string;
}

export interface NodeDetails {
  node: FlowNode;
  mark: FlowMark;
  /** The engine's kind words for the box, spelled out. */
  detail?: string;
  /** Boxes drawn inside its frame, and boxes folded into it. */
  inside: { shown: number; hidden: number; wrappers: number };
  flowsIn: NeighborRow[];
  flowsOut: NeighborRow[];
}

export interface RouteOverview {
  pathPattern: string;
  file: string;
  absPath: string;
  outcome: RouteGraphResult["outcome"];
  status: RouteGraphResult["status"];
  unavailableReason: string | null;
  generation: number;
  counts: RouteGraphResult["counts"] & { folded: number };
  gaps: { reason: string; label: string; file?: string; absPath?: string; line?: number }[];
  origins: { id: string; label: string; roles: string; status: RouteGraphResult["origins"][number]["status"]; reaches: number }[];
}

const labelOf = (m: FlowViewModel, id: string) => m.vm.nodes.find((n) => n.id === id)?.label ?? m.byId.get(id)?.label ?? id;
const markOf = (m: FlowViewModel, id: string): FlowMark => MARK_OF_KIND[m.byId.get(id)?.kind ?? "occurrence"];

export function routeOverview(graph: RouteGraphResult, m: FlowViewModel, absRoot?: string): RouteOverview {
  const reaches = new Map<string, number>();
  for (const e of graph.edges) {
    if ((e.kind === "handoff" || e.kind === "field") && e.status === "proven") reaches.set(e.source, (reaches.get(e.source) ?? 0) + 1);
  }
  return {
    pathPattern: graph.route.pathPattern,
    file: graph.route.file,
    absPath: graph.route.absPath,
    outcome: graph.outcome,
    status: graph.status,
    unavailableReason: graph.unavailableReason,
    generation: graph.generation,
    counts: { ...graph.counts, folded: m.vm.rolledUp },
    gaps: graph.gaps.map((g) => ({
      reason: g.reason,
      label: g.label,
      ...(g.location ? { file: g.location.file, absPath: absRoot ? `${absRoot}/${g.location.file}` : undefined, line: g.location.line } : {}),
    })),
    origins: graph.origins.map((o) => ({ id: o.nodeId, label: o.label, roles: humanizeDetail(o.roles.join(" · ")) ?? "", status: o.status, reaches: reaches.get(o.nodeId) ?? 0 })),
  };
}

export function nodeDetails(m: FlowViewModel, id: string): NodeDetails | null {
  const node = m.byId.get(id);
  const view = m.vm.nodes.find((n) => n.id === id);
  if (!node || !view) return null;
  const row = (otherId: string, e: FlowViewModel["vm"]["edges"][number], dir: "in" | "out"): NeighborRow => ({
    id: otherId,
    label: labelOf(m, otherId),
    mark: markOf(m, otherId),
    kind: e.style === "field" ? "field" : e.style === "handoff" ? "handoff" : dir === "in" ? "rendered by" : "renders",
    ...(e.status ? { status: e.status } : {}),
    ...(e.label ? { path: e.label } : {}),
  });
  const flowsIn: NeighborRow[] = [];
  const flowsOut: NeighborRow[] = [];
  for (const e of m.vm.edges) {
    if (m.notFlow.has(e.id) || e.source === e.target) continue;
    if (e.target === id) flowsIn.push(row(e.source, e, "in"));
    else if (e.source === id) flowsOut.push(row(e.target, e, "out"));
  }
  const wrappers = Number(/(\d+) wrapper/.exec(view.note ?? "")?.[1] ?? 0);
  return {
    node,
    mark: MARK_OF_KIND[node.kind],
    detail: humanizeDetail(node.detail),
    inside: { shown: m.vm.nodes.filter((n) => n.group?.id === id).length, hidden: view.memberCount - 1, wrappers },
    flowsIn,
    flowsOut,
  };
}

/** The status words the rail uses, shared with its chips. */
export const STATUS_WORD: Record<"proven" | "partial" | "unsupported", string> = { proven: "proven", partial: "partial proof", unsupported: "unsupported" };
