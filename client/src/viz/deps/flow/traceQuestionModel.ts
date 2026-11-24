import type { AnchorGraphResult, RouteGraphResult, RoutePathResult } from "../../../dataflow/contract.generated";

type AnchorNode = AnchorGraphResult["nodes"][number];
type AnchorEdge = AnchorGraphResult["edges"][number];
type SourceSpan = AnchorGraphResult["anchor"]["span"];

export type TraceWitness = { file: string; absPath: string; span: SourceSpan };
/** A witness with the source text it stands for. */
export type NamedWitness = TraceWitness & { text: string };

/** How the producer's value reaches the read: as a store's first value, out of a call's return, or as an object's field. */
export type HandoffKind = "initialization" | "return" | "field" | "mixed";

export type StopReason = AnchorGraphResult["producerStops"][number]["reason"];
/** Where a path stops, or why a candidate may not hold, with the source to open. */
export type StopWitness = NamedWitness & { reason: StopReason };

/** One expression that can fill the read field, how it gets there, and why it may not be the value the read sees. */
export type ProducerCandidate = {
  producer: NamedWitness;
  handoff: { kind: HandoffKind; object: NamedWitness };
  caveats: StopWitness[];
};

export type AnchorQuestion = {
  expression: string;
  direction: AnchorGraphResult["direction"];
  selection: TraceWitness;
  fieldRead: TraceWitness | null;
  context: TraceWitness | null;
  stop: string | null;
  /** The read field. */
  field: string | null;
  /** Every expression the engine's field walk found that can fill the field for its first value, nearest first. */
  candidates: ProducerCandidate[];
  /** One candidate, no caveat, and every path ended at it: the only producer the static source shows. */
  only: boolean;
  /** Writes to the read's own state after its first value: possible static writers, not observed updates. */
  laterWrites: NamedWitness[];
  /** Two or more call sites pass the value a field-read candidate reads: the earlier value depends on which one. */
  callers: NamedWitness[];
  /** Where paths that may fill the field end without a producer (`producerStops`), and why. */
  stops: StopWitness[];
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
  const base = { expression: graph.anchor.text, direction: graph.direction, selection, fieldRead: null, context: null, stop, field: null, candidates: [], only: false, laterWrites: [], callers: [], stops: [] };
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
 * (`graph.producers`): each expression that can fill the field where an
 * object is built, the handoff that carries it to the read, and the caveats
 * the walk passed on the way. A store's later writes stay apart from its
 * first value. The card claims one producer only when there is one, with no
 * caveat, and no path ended without a producer.
 */
function producerAnswer(graph: AnchorGraphResult): Pick<AnchorQuestion, "field" | "candidates" | "only" | "laterWrites" | "callers" | "stops"> {
  const nodes = byNode(graph);
  const found = graph.producers.flatMap((p) => {
    const value = nodes.get(p.nodeId);
    const object = nodes.get(p.packNodeId);
    return value && object ? [{ ...p, value, object }] : [];
  });
  const stopsAt = (list: readonly { nodeId: string; reason: StopReason }[]): StopWitness[] => list.flatMap((item) => {
    const node = nodes.get(item.nodeId);
    return node ? [{ ...witness(node), reason: item.reason }] : [];
  });
  // Whose state a path went through first, back from the read: a write there is a later write to the read's own state.
  // A write met only past a first value (another state that seeded this one) can still be that first value.
  const firstState = (via: readonly string[]) => via.find((step) => step !== "return") ?? null;
  const handoffOf = (via: readonly string[]): HandoffKind => (via.includes("initialization") ? "initialization" : via.includes("return") ? "return" : "field");
  // One expression reached by several handoffs is one candidate; its handoff is named only when they agree, and its caveats add up.
  const byValue = new Map<string, { item: (typeof found)[number]; kinds: Set<HandoffKind>; caveats: StopWitness[] }>();
  for (const p of found.filter((item) => firstState(item.via) !== "write")) {
    const seen = byValue.get(p.nodeId);
    const caveats = stopsAt(p.caveats);
    if (seen) {
      seen.kinds.add(handoffOf(p.via));
      for (const c of caveats) if (!seen.caveats.some((o) => o.reason === c.reason && sameSpan(o.span, c.span) && o.file === c.file)) seen.caveats.push(c);
    } else byValue.set(p.nodeId, { item: p, kinds: new Set([handoffOf(p.via)]), caveats });
  }
  const candidates: ProducerCandidate[] = [...byValue.values()].map(({ item, kinds, caveats }) => ({
    producer: witness(item.value, item.text),
    handoff: { kind: kinds.size === 1 ? [...kinds][0] : "mixed", object: witness(item.object, item.packText) },
    caveats,
  }));
  const first = [...byValue.values()];
  const only = first.length === 1 && first[0].caveats.length === 0 && first[0].item.status === "proven" && !graph.producersOpen;
  const initialized = first.some((p) => p.kinds.has("initialization"));
  return {
    field: found[0]?.field ?? null,
    candidates,
    only,
    laterWrites: initialized ? found.filter((p) => firstState(p.via) === "write").map((p) => witness(p.value, p.text)) : [],
    callers: first.length === 1 && first[0].item.value.elementKind === "field-read" ? callersOf(graph, first[0].item.value) : [],
    stops: stopsAt(graph.producerStops),
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
    // An operand or a condition (`flag ? a : b`) is no receiver of the producer's value.
    if (["selection", "derived"].includes(nodes.get(id)?.elementKind ?? "")) continue;
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
