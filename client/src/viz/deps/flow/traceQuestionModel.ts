import type { AnchorGraphResult, RouteGraphResult, RoutePathResult } from "../../../dataflow/contract.generated";

type AnchorNode = AnchorGraphResult["nodes"][number];
type AnchorEdge = AnchorGraphResult["edges"][number];
type SourceSpan = AnchorGraphResult["anchor"]["span"];

export type TraceWitness = { file: string; absPath: string; span: SourceSpan };

export type AnchorQuestion = {
  expression: string;
  direction: AnchorGraphResult["direction"];
  selection: TraceWitness;
  fieldRead: TraceWitness | null;
  context: TraceWitness | null;
  stop: string | null;
};

function sameSpan(a: SourceSpan, b: SourceSpan) {
  return a.startLine === b.startLine && a.startColumn === b.startColumn && a.endLine === b.endLine && a.endColumn === b.endColumn;
}

/** Only describe the direct read, not transitive ancestry through the bounded slice.
 * The canvas deliberately folds edges, and its strongest status is not field proof. */
export function anchorQuestion(graph: AnchorGraphResult): AnchorQuestion {
  const selection = { file: graph.anchor.file, absPath: graph.anchor.absPath, span: graph.anchor.span };
  const subject = graph.nodes.find((n) => n.id === graph.anchor.elementId && n.kind === "anchor" && n.file === selection.file && sameSpan(n.span, selection.span));
  const stop = graph.reason ?? (graph.coverage.budget.exhausted ? "evidence budget exhausted" :
    graph.outcome === "partial" ? graph.nodes.find((n) => (n.kind === "frontier" || n.kind === "boundary") && n.status !== "proven" && n.reason)?.reason ?? "some steps are unproven" : null);
  const base = { expression: graph.anchor.text, direction: graph.direction, selection, fieldRead: null, context: null, stop };
  if (graph.outcome === "stale" || graph.outcome === "unsupported" || graph.outcome === "not-analyzed" || graph.outcome === "cancelled") return base;
  if (!subject?.field || subject.elementKind !== "field-read" || subject.status !== "proven") return base;
  const field = subject.field;
  // fieldOf in anchor-graph.ts supplies this label from this relation's own
  // field end. Matching a label somewhere else in the slice is insufficient.
  const direct = graph.edges.find((edge) =>
    edge.target === subject.id && edge.kind === "field-input" && edge.status === "proven"
    && edge.label === field.split(".").at(-1)
    && !!edge.proof.length
    && edge.proof.every((p) => p.kind === "property-access" && p.status === "proven")
    && edge.proof.some((p) => p.locations.some((l) => l.file === selection.file && sameSpan(l.span, selection.span))),
  );
  if (!direct) return base;

  const receiver = graph.nodes.find((node) => node.id === direct.source);
  const isEnclosingCarrier = (node: AnchorNode | undefined) => node?.symbol && node.symbol === subject.symbol &&
    (!node.field || field.startsWith(node.field + "."));
  // A component binding into this receiver shows what value enters the prop.
  // Do not treat it as carrying the selected subfield, even when it is proven.
  const bindings = isEnclosingCarrier(receiver) ? graph.edges.filter((edge) =>
    edge.target === receiver?.id && edge.kind === "component-prop-binding",
  ) : [];
  const binding = bindings.length === 1 && bindings[0].status === "proven" ? bindings[0] : null;
  const caller = binding ? graph.nodes.find((node) => node.id === binding.source) : undefined;
  const context = caller && binding ? witnessAt(binding, caller) : null;
  return { ...base, fieldRead: selection, context };
}

function witnessAt(edge: AnchorEdge, node: AnchorNode): TraceWitness | null {
  const location = edge.proof.filter((p) => p.kind === "component-prop-binding" && p.status === "proven").flatMap((p) => p.locations)
    .find((l) => l.file === node.file && sameSpan(l.span, node.span));
  return location ? { file: node.file, absPath: node.absPath, span: location.span } : null;
}

export function routeQuestion(graph: RouteGraphResult) {
  const origin = graph.origins.find((o) => o.nodeId === graph.selectedSource || o.elementId === graph.selectedSource);
  return { route: graph.route.pathPattern, origin: origin?.label ?? null, lineage: graph.lineage, tracing: graph.phase === "surface" };
}

export function matchingRoutePath(graph: RouteGraphResult | null, edgeId: string, path: RoutePathResult | null | undefined) {
  return path && path.outcome !== "stale" && graph && path.route.key === graph.route.key && path.generation === graph.generation && path.programHash === graph.programHash
    && path.edge.id.replace(/^(handoff|field|render):/, "") === edgeId.replace(/^(handoff|field|render):/, "") ? path : null;
}
