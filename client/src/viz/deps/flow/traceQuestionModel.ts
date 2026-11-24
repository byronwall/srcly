import type { AnchorGraphResult, RouteGraphResult, RoutePathResult } from "../../../dataflow/contract.generated";

type AnchorNode = AnchorGraphResult["nodes"][number];
type AnchorEdge = AnchorGraphResult["edges"][number];
type SourceSpan = AnchorGraphResult["anchor"]["span"];

export type TraceWitness = { file: string; absPath: string; span: SourceSpan };
/** A witness with the source text it stands for. */
export type NamedWitness = TraceWitness & { text: string };

/** How the producer's value reaches the read: as a store's first value, out of a call's return, or as an object's field. */
export type HandoffKind = "initialization" | "return" | "field";

export type FieldProducerAnswer = {
  field: string;
  producer: NamedWitness;
  handoff: { kind: HandoffKind; object: NamedWitness };
  /** Writes to the same state after its first value: possible static writers, not observed updates. */
  laterWrites: NamedWitness[];
};

export type AnchorQuestion = {
  expression: string;
  direction: AnchorGraphResult["direction"];
  selection: TraceWitness;
  fieldRead: TraceWitness | null;
  context: TraceWitness | null;
  stop: string | null;
  /** The one proven producer of the read field, when the engine found exactly one. */
  producer: FieldProducerAnswer | null;
  /** Several producers fill the field (not counting later writes): none is the answer. */
  alternatives: NamedWitness[];
  /** Two or more call sites pass the value the producer reads: the earlier value depends on which one. */
  callers: NamedWitness[];
  /** Where the field's trail ends with no producer (`producerStops`): a call nothing returns into, a spread. */
  boundary: (NamedWitness & { call: boolean }) | null;
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
  const base = { expression: graph.anchor.text, direction: graph.direction, selection, fieldRead: null, context: null, stop, producer: null, alternatives: [], callers: [], boundary: null };
  if (graph.outcome === "stale" || graph.outcome === "unsupported" || graph.outcome === "not-analyzed" || graph.outcome === "cancelled") return base;
  if (!subject || subject.elementKind !== "field-read" || subject.status !== "proven") return base;
  // A read with no local binding (`load().title`) has no field of its own: its field-input edge names it.
  const field = subject.field;
  // fieldOf in anchor-graph.ts supplies this label from this relation's own
  // field end. Matching a label somewhere else in the slice is insufficient.
  const direct = graph.edges.find((edge) =>
    edge.target === subject.id && edge.kind === "field-input" && edge.status === "proven"
    && (field ? edge.label === field.split(".").at(-1) : !!edge.label)
    && !!edge.proof.length
    && edge.proof.every((p) => p.kind === "property-access" && p.status === "proven")
    && edge.proof.some((p) => p.locations.some((l) => l.file === selection.file && sameSpan(l.span, selection.span))),
  );
  if (!direct) return base;

  const receiver = graph.nodes.find((node) => node.id === direct.source);
  const isEnclosingCarrier = (node: AnchorNode | undefined) => field && node?.symbol && node.symbol === subject.symbol &&
    (!node.field || field.startsWith(node.field + "."));
  // A component binding into this receiver shows what value enters the prop.
  // Do not treat it as carrying the selected subfield, even when it is proven.
  const bindings = isEnclosingCarrier(receiver) ? graph.edges.filter((edge) =>
    edge.target === receiver?.id && edge.kind === "component-prop-binding",
  ) : [];
  const binding = bindings.length === 1 && bindings[0].status === "proven" ? bindings[0] : null;
  const caller = binding ? graph.nodes.find((node) => node.id === binding.source) : undefined;
  const context = caller && binding ? witnessAt(binding, caller) : null;
  if (graph.direction === "forward") return { ...base, fieldRead: selection, context };
  return { ...base, fieldRead: selection, context, ...producerAnswer(graph) };
}

const byNode = (graph: AnchorGraphResult) => new Map(graph.nodes.map((node) => [node.id, node]));

/** A box with its source text: the engine's own text for a producer, else the box's label. */
const witness = (node: AnchorNode, text = node.label): NamedWitness => ({ file: node.file, absPath: node.absPath, span: node.span, text });

/**
 * The anchor's field producers, from the engine's own field walk
 * (`graph.producers`): the field's value where an object is built, with the
 * handoff that carries it to the read. A store's later writes stay apart
 * from its first value; two first values, or one beside a path the walk
 * could not finish (`producersOpen`), are no answer.
 */
function producerAnswer(graph: AnchorGraphResult): Pick<AnchorQuestion, "producer" | "alternatives" | "callers" | "boundary"> {
  const nodes = byNode(graph);
  const found = graph.producers.flatMap((p) => {
    const value = nodes.get(p.nodeId);
    const object = nodes.get(p.packNodeId);
    return value && object ? [{ ...p, value, object }] : [];
  });
  // Whose state a path went through first, back from the read: a write there is a later write to the read's own state.
  // A write met only past a first value (another state that seeded this one) can still be that first value.
  const firstState = (via: readonly string[]) => via.find((step) => step !== "return") ?? null;
  const writes = found.filter((p) => firstState(p.via) === "write");
  // One expression reached by two handoffs is one producer.
  const first = [...new Map(found.filter((p) => firstState(p.via) !== "write").map((p) => [p.nodeId, p])).values()];
  const none = { producer: null, alternatives: [], callers: [], boundary: null };
  const stopAt = graph.producerStops.map((id) => nodes.get(id)).find((node): node is AnchorNode => !!node);
  const boundary = stopAt ? { ...witness(stopAt), call: stopAt.elementKind === "call" } : null;
  if (first.length === 0) return { ...none, boundary };
  if (first.length > 1 || graph.producersOpen) return { ...none, alternatives: first.map((p) => witness(p.value, p.text)), boundary };
  const [only] = first;
  if (only.status !== "proven") return none;
  const kind: HandoffKind = only.via.includes("initialization") ? "initialization" : only.via.includes("return") ? "return" : "field";
  return {
    producer: {
      field: only.field,
      producer: witness(only.value, only.text),
      handoff: { kind, object: witness(only.object, only.packText) },
      laterWrites: kind === "initialization" ? writes.map((p) => witness(p.value, p.text)) : [],
    },
    alternatives: [],
    callers: only.value.elementKind === "field-read" ? callersOf(graph, only.value) : [],
    boundary: null,
  };
}

/** The component call sites that bind the prop a field-read producer reads (`props.note.title` ← `note={…}`), when there are two or more. */
function callersOf(graph: AnchorGraphResult, producer: AnchorNode): NamedWitness[] {
  const nodes = byNode(graph);
  const sites = new Map<string, NamedWitness>();
  const seen = new Set<string>([producer.id]);
  const queue = [producer.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.target !== id || edge.status === "structural") continue;
      const source = nodes.get(edge.source);
      if (!source || seen.has(source.id)) continue;
      seen.add(source.id);
      if (edge.kind === "component-prop-binding") sites.set(`${source.file}:${source.span.startLine}:${source.span.startColumn}`, witness(source));
      // Back along the producer's receiver: its field reads, and a proven alias (`const alias = props.note`).
      else if (edge.kind === "field-input" || (edge.kind === "references" && edge.status === "proven")) queue.push(source.id);
    }
  }
  return sites.size > 1 ? [...sites.values()] : [];
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
