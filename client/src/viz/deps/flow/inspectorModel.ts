// What the inspector rail says about the route and about one selected box,
// as plain data from the engine's route graph and the drawn view model. No
// UI here, so the rail's wording is testable against the fixture.
import type { AnchorGraphResult, RouteGraphResult } from "../../../dataflow/contract.generated";
import { isAssumedProof } from "../../../dataflow/outcome";
import type { FlowBox, FlowViewModel } from "./adapter";
import { humanizeDetail, MARK_OF_ANCHOR_KIND, MARK_OF_KIND, STOP_REASONS, stopWord, type FlowMark } from "./marks";

/** Route mode words for the render backbone; anchor mode names the engine's relation (`argument`, `return value`, …). */
export type EdgeKindWord = "renders" | "rendered by" | "handoff" | "field" | "structural" | (string & {});

export interface NeighborRow {
  /** The drawn box at the other end. */
  id: string;
  label: string;
  mark: FlowMark;
  kind: EdgeKindWord;
  status?: "proven" | "partial" | "unsupported" | "structural";
  /** A field edge's path. */
  path?: string;
  /** The step is assumed: library code with no source to read. */
  assumed?: boolean;
}

export interface NodeDetails {
  node: FlowBox;
  mark: FlowMark;
  /** The engine's kind words for the box, spelled out. */
  detail?: string;
  /** Boxes drawn inside its frame, and boxes folded into it. */
  inside: { shown: number; hidden: number; wrappers: number };
  flowsIn: NeighborRow[];
  flowsOut: NeighborRow[];
  /** Links found by structure (a declaration's parameters and returns), counted apart from traced flows. */
  structural: number;
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

/** The mark of a route graph's or an anchor graph's node. */
export function markOfBox(box: FlowBox): FlowMark {
  return "side" in box ? MARK_OF_ANCHOR_KIND[box.kind] : MARK_OF_KIND[box.kind];
}
const markOf = (m: FlowViewModel, id: string): FlowMark => {
  const box = m.byId.get(id);
  return box ? markOfBox(box) : "component";
};

export interface AnchorOverview {
  text: string;
  kind: string;
  typeText: string | null;
  file: string;
  absPath: string;
  line: number;
  direction: AnchorGraphResult["direction"];
  outcome: AnchorGraphResult["outcome"];
  reason: string | null;
  generation: number;
  counts: AnchorGraphResult["counts"];
  origins: { id: string; label: string; roles: string; status: AnchorGraphResult["origins"][number]["status"] }[];
  terminals: { id: string; label: string; roles: string; status: AnchorGraphResult["terminals"][number]["status"] }[];
  coverage: AnchorGraphResult["coverage"];
  /** Where the trace stops, grouped by why, the most common reason first. */
  stops: { reason: string; word: string; hint: string; rows: { id: string; label: string; file: string; line: number }[] }[];
  /** The steps the trace takes on trust: library code with no source, one row per call. Click selects the call's box. */
  assumed: { id: string; label: string; detail: string; file: string; line: number }[];
}

/** What the rail says about an anchor graph when nothing is selected. */
export function anchorOverview(graph: AnchorGraphResult): AnchorOverview {
  return {
    text: graph.anchor.text,
    kind: humanizeDetail(graph.nodes.find((n) => n.kind === "anchor")?.detail) ?? graph.anchor.kind,
    typeText: graph.anchor.typeText,
    file: graph.anchor.file,
    absPath: graph.anchor.absPath,
    line: graph.anchor.span.startLine,
    direction: graph.direction,
    outcome: graph.outcome,
    reason: graph.reason,
    generation: graph.generation,
    counts: graph.counts,
    origins: graph.origins.map((o) => ({ id: o.nodeId, label: o.label, roles: humanizeDetail(o.roles.join(" · ")) ?? "", status: o.status })),
    terminals: graph.terminals.map((t) => ({ id: t.nodeId, label: t.label, roles: humanizeDetail(t.roles.join(" · ")) ?? "", status: t.status })),
    coverage: graph.coverage,
    stops: stopsOf(graph),
    assumed: assumedOf(graph),
  };
}

/** Each assumed step once per call: the callee its proof names, at the call. */
function assumedOf(graph: AnchorGraphResult): AnchorOverview["assumed"] {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const rows = new Map<string, AnchorOverview["assumed"][number]>();
  for (const e of graph.edges) {
    if (e.status === "structural") continue;
    for (const p of e.proof) {
      if (!isAssumedProof(p.kind)) continue;
      const target = nodes.get(e.target);
      const at = p.locations[0];
      const label = /^Assumed: (.+?) has no source/.exec(p.detail)?.[1] ?? target?.label ?? e.target;
      const file = at?.file ?? target?.file ?? "";
      const line = at?.line ?? target?.line ?? 0;
      const key = `${label}|${file}:${line}`;
      if (!rows.has(key)) rows.set(key, { id: e.target, label, detail: p.detail, file, line });
    }
  }
  return [...rows.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Where a trace stops, as the engine counts it: each frontier, and each boundary the walk could not pass. The footer counts the same list. */
export function stopsOf(graph: AnchorGraphResult): AnchorOverview["stops"] {
  const groups = new Map<string, AnchorOverview["stops"][number]>();
  for (const n of graph.nodes) {
    if (n.kind !== "frontier" && !(n.kind === "boundary" && n.status !== "proven")) continue;
    const reason = n.reason ?? "frontier";
    const group = groups.get(reason) ?? { reason, word: stopWord(n.reason), hint: STOP_REASONS[reason]?.hint ?? n.note ?? "", rows: [] };
    group.rows.push({ id: n.id, label: n.label, file: n.file, line: n.line });
    groups.set(reason, group);
  }
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || a.word.localeCompare(b.word));
}

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
    kind: e.style === "structural" ? "structural" : e.relation ? e.relation.replaceAll("-", " ") : e.style === "field" ? "field" : e.style === "handoff" ? "handoff" : dir === "in" ? "rendered by" : "renders",
    ...(e.status ? { status: e.status } : {}),
    ...(e.label ? { path: e.label } : {}),
    ...(e.assumed ? { assumed: true } : {}),
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
    mark: markOfBox(node),
    detail: humanizeDetail(node.detail),
    inside: { shown: m.vm.nodes.filter((n) => n.group?.id === id).length, hidden: view.memberCount - 1, wrappers },
    flowsIn,
    flowsOut,
    structural: [...flowsIn, ...flowsOut].filter((r) => r.kind === "structural").length,
  };
}

/** The status words the rail uses, shared with its chips. */
export const STATUS_WORD: Record<"proven" | "partial" | "unsupported" | "structural", string> = { proven: "proven", partial: "partial proof", unsupported: "unsupported", structural: "structural" };
