import path from "node:path";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../../analysis/cancellation";
import { projectRouteTotality } from "../../api/projections/route-totality";
import type { RouteTotality } from "../../api/route-totality-contracts";
import { projectOccurrenceSurface } from "../../api/projections/route-totality-surface-projection";
import { routeGraphResultSchema, type FlowEdge, type FlowNode, type RouteGraphResult } from "../contracts/route-graph";
import type { RouteTotalitySelectedSource } from "../../analysis/route-totality-selected-source";
import { EngineError } from "../protocol";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";

/** Route graphs bigger than this are refused as `budget-exhausted`, never truncated. */
export const ROUTE_GRAPH_MAX_BYTES = 8 * 1024 * 1024;

type Location = { file: string; line: number; column: number; span: FlowNode["span"] };
type Surface = Exclude<RouteTotality["occurrenceSurface"], { reason: string }>;

export function routeGraphOp(
  session: EngineSession,
  params: { route?: unknown; source?: unknown; expectedGeneration?: unknown },
  cancellation?: AnalysisCancellationToken,
): RouteGraphResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const route = routeFor(tier1, params.route, "routeGraph");
  const selected = typeof params.source === "string" && params.source ? selectedSourceFor(tier1, params.source) : null;
  const record = tier1.totality().get(route.key, selected, cancellation);
  const totality = record ? projectRouteTotality(record, cancellation) : null;
  if (!totality) throw new EngineError("not-found", `No route totality for ${route.pathPattern}`);
  return bounded(route, routeGraphResultSchema.parse(projectRouteGraph(tier1, totality, selected?.key ?? null, "complete")));
}

/**
 * The route's render backbone alone, before the program-wide facts exist
 * (T9): the same boxes and render edges `routeGraph` draws, with no origins,
 * handoffs or gaps, from the route file's own facts and the Program. A
 * client draws this first and fills in the complete graph when it arrives;
 * the node ids are the same in both.
 */
export function routeSurfaceOp(
  session: EngineSession,
  params: { route?: unknown; expectedGeneration?: unknown },
  cancellation?: AnalysisCancellationToken,
): RouteGraphResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const route = routeFor(tier1, params.route, "routeSurface");
  const record = tier1.surface(route.key, cancellation);
  if (!record) throw new EngineError("not-found", `No route surface for ${route.pathPattern}`);
  const surface = projectOccurrenceSurface(record.occurrenceSurface, { status: "unavailable", reason: "The evidence slice is not built yet." }, cancellation ?? NO_ANALYSIS_CANCELLATION);
  const totality: SurfaceTotality = {
    route: record.route,
    status: "partial",
    occurrenceSurface: surface as RouteTotality["occurrenceSurface"],
    gaps: [],
    bridges: [],
    fieldLineage: { status: "unavailable", unavailableReason: "The evidence slice is not built yet.", attachments: [], frontiers: [] },
  };
  return bounded(route, routeGraphResultSchema.parse(projectRouteGraph(tier1, totality, null, "surface")));
}

/** What the projection reads from a totality: a surface-only record supplies the same fields with nothing from the slice. */
type SurfaceTotality = Pick<RouteTotality, "route" | "status" | "occurrenceSurface" | "gaps" | "bridges"> & {
  fieldLineage: Pick<RouteTotality["fieldLineage"], "status" | "unavailableReason"> & { attachments: RouteTotality["fieldLineage"]["attachments"]; frontiers: RouteTotality["fieldLineage"]["frontiers"] };
};

function routeFor(tier1: Tier1, key: unknown, op: string) {
  if (typeof key !== "string" || !key) throw new EngineError("invalid-request", `${op} needs params.route`);
  const route = tier1.routes.find((item) => item.key === key || item.pathPattern === key);
  if (!route) throw new EngineError("not-found", `No route ${key}`);
  return route;
}

function bounded(route: { pathPattern: string }, result: RouteGraphResult): RouteGraphResult {
  const bytes = Buffer.byteLength(JSON.stringify(result));
  if (bytes > ROUTE_GRAPH_MAX_BYTES) {
    throw new EngineError("budget-exhausted", `The ${route.pathPattern} graph is ${bytes} bytes, over the ${ROUTE_GRAPH_MAX_BYTES}-byte bound`, {
      bytes,
      nodes: result.nodes.length,
      edges: result.edges.length,
    });
  }
  return result;
}

/**
 * An origin picked by its program element id, in the shape route totality
 * takes. The element's own location is the selection; the engine decides
 * whether exact field lineage can start there.
 */
function selectedSourceFor(tier1: Tier1, elementId: string): RouteTotalitySelectedSource {
  const element = tier1.provider().facts.getElement(elementId);
  if (!element) throw new EngineError("not-found", `No program element ${elementId}`);
  const at = element.location;
  return { key: elementId, evidence: { id: elementId, elementId, file: at.file, line: at.line, column: at.column, span: at.span } };
}

/** Project a validated RouteTotality (or a surface-only record) onto the flow graph contract. Exported for tests. */
export function projectRouteGraph(tier1: Tier1, totality: SurfaceTotality, selectedSource: string | null = null, phase: RouteGraphResult["phase"] = "complete"): RouteGraphResult {
  const root = path.resolve(tier1.args.root);
  const absPath = (file: string) => path.resolve(root, file);
  const routeAbsPath = absPath(totality.route.file);
  const base = {
    phase,
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    route: { ...totality.route, absPath: routeAbsPath },
    status: totality.status,
    selectedSource,
    gaps: totality.gaps.map((gap) => ({ reason: gap.reason, label: gap.label, location: gap.location })),
  };
  const surface = "reason" in totality.occurrenceSurface ? null : (totality.occurrenceSurface as Surface);
  if (!surface) {
    const reason = (totality.occurrenceSurface as { reason: string }).reason;
    const routeNode: FlowNode = {
      id: `route:${totality.route.key}`,
      kind: "route",
      label: totality.route.pathPattern,
      detail: null,
      parent: null,
      file: totality.route.file,
      absPath: routeAbsPath,
      line: 1,
      span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
      status: "unsupported",
      collapsedByDefault: false,
      repetition: null,
      external: false,
      reason,
    };
    return {
      ...base,
      outcome: "unsupported",
      unavailableReason: reason,
      nodes: [routeNode],
      edges: [],
      origins: [],
      lineage: null,
      destinations: [],
      counts: { occurrences: 0, boundaries: 0, terminals: 0, origins: 0, handoffs: 0, omittedItems: 0 },
    };
  }

  // Every box starts proven. After all boxes are drawn, each located gap or
  // omission marks the deepest box that contains it (`markPartialBoxes`), so a
  // partial route shows partial strokes only where the engine named a gap.
  const nodes: FlowNode[] = [];
  const node = (fields: Omit<FlowNode, "file" | "absPath" | "line" | "span" | "status" | "collapsedByDefault" | "repetition" | "external" | "reason"> & Partial<FlowNode>, at: Location): FlowNode => {
    const made: FlowNode = {
      status: "proven",
      collapsedByDefault: false,
      repetition: null,
      external: false,
      reason: null,
      ...fields,
      file: at.file,
      absPath: absPath(at.file),
      line: at.line,
      span: at.span,
    };
    nodes.push(made);
    return made;
  };

  // The scope-entry occurrence is the route component itself: it is the root.
  const entry = surface.occurrences.find((occurrence) => occurrence.parentOccurrenceId === null) ?? null;
  const routeId = entry?.id ?? `route:${totality.route.key}`;
  node({ id: routeId, kind: "route", label: totality.route.pathPattern, detail: entry?.name === "default" ? null : entry?.name ?? null, parent: null }, entry?.callSite ?? {
    file: totality.route.file,
    line: 1,
    column: 1,
    span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
  });

  const definitions = new Map(surface.definitions.map((definition) => [definition.id, definition]));
  const hidden = new Set(surface.hiddenWrapperCompatibility.map((item) => item.occurrenceId));
  const occurrenceById = new Map(surface.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const parentOf = (renderParentId: string | null, ownerId: string | null) => renderParentId ?? ownerId ?? routeId;

  for (const occurrence of surface.occurrences) {
    if (occurrence === entry) continue;
    const external = definitions.get(occurrence.definitionId)?.external ?? false;
    node({
      id: occurrence.id,
      kind: "occurrence",
      label: occurrence.name,
      detail: definitions.get(occurrence.definitionId)?.sourceFile ? path.basename(definitions.get(occurrence.definitionId)!.sourceFile!) : null,
      parent: parentOf(occurrence.renderParentId, occurrence.parentOccurrenceId),
      repetition: occurrence.repetition,
      external,
      collapsedByDefault: external || hidden.has(occurrence.id),
    }, occurrence.callSite);
  }

  for (const boundary of surface.frameworkBoundaries) {
    const condition = boundary.condition && boundary.condition.outcome !== "unknown" ? ` · ${boundary.condition.outcome}` : "";
    node({
      id: boundary.id,
      kind: "control",
      label: boundary.name,
      detail: `${boundary.kind}${condition}`,
      parent: parentOf(boundary.renderParentId, boundary.parentOccurrenceId),
      repetition: boundary.repetition,
    }, boundary.location);
  }

  // A render-expression terminal at an occurrence's own call site is that
  // element itself; the occurrence node already stands for it.
  const sameSpan = (left: FlowNode["span"], right: FlowNode["span"]) =>
    left.startLine === right.startLine && left.startColumn === right.startColumn && left.endLine === right.endLine && left.endColumn === right.endColumn;
  const terminalAlias = new Map<string, string>();
  for (const terminal of surface.terminals) {
    const owner = terminal.ownerOccurrenceId ? occurrenceById.get(terminal.ownerOccurrenceId) : undefined;
    if (terminal.kind === "render-expression" && owner && owner.callSite.file === terminal.location.file && sameSpan(owner.callSite.span, terminal.location.span)) {
      terminalAlias.set(terminal.id, owner.id);
      continue;
    }
    node({
      id: terminal.id,
      kind: "terminal",
      label: terminal.label,
      detail: terminal.kind,
      parent: parentOf(terminal.renderParentId, terminal.ownerOccurrenceId),
      repetition: terminal.repetition,
    }, terminal.location);
  }

  const originNodes = new Map<string, { node: FlowNode; roles: Set<string> }>();
  for (const origin of surface.origins) {
    const existing = originNodes.get(origin.elementId);
    if (existing) {
      existing.roles.add(origin.role);
      existing.node.detail = [...existing.roles].join(" · ");
      continue;
    }
    const at = origin.proof[0]?.locations[0];
    if (!at) continue;
    originNodes.set(origin.elementId, {
      node: node({ id: origin.elementId, kind: "origin", label: origin.label, detail: origin.role, parent: routeId, status: origin.status }, at),
      roles: new Set([origin.role]),
    });
  }

  markPartialBoxes(nodes, routeId, surface, totality, definitions);
  // The surface alone cannot say the route is proven: the slice has not been walked.
  if (phase === "surface") {
    for (const item of nodes) {
      if (item.id !== routeId) continue;
      if (item.status === "proven" || item.reason === null || item.reason === "incomplete-surface") item.reason = "evidence-pending";
      item.status = "partial";
    }
  }

  const ids = new Set(nodes.map((item) => item.id));
  const resolve = (id: string) => terminalAlias.get(id) ?? id;
  const statusOf = new Map(nodes.map((item) => [item.id, item.status]));
  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (edge: FlowEdge) => {
    const key = `${edge.kind}|${edge.source}|${edge.target}`;
    if (seen.has(key) || edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target)) return;
    seen.add(key);
    edges.push(edge);
  };
  // Render edges follow the hierarchy: a slot forwarded through a boundary
  // (RouteFrame's children inside its Show) is drawn through that boundary.
  const parentById = new Map(nodes.map((item) => [item.id, item.parent]));
  for (const edge of surface.renderEdges) {
    const target = resolve(edge.to);
    if (parentById.get(target) !== resolve(edge.from)) continue;
    // A render edge is only as proven as the box it reaches.
    addEdge({ id: edge.id, source: resolve(edge.from), target, kind: "render", label: null, status: statusOf.get(target) ?? "proven", proof: [], pathIds: null });
  }
  let handoffs = 0;
  for (const bridge of totality.bridges) {
    const origin = bridge.direction === "origin-to-render" ? bridge.from : bridge.to;
    const render = bridge.direction === "origin-to-render" ? bridge.to : bridge.from;
    const originId = "elementId" in origin ? origin.elementId : null;
    const renderId = "terminalId" in render ? render.terminalId : "occurrenceId" in render ? render.occurrenceId : null;
    if (!originId || !renderId) continue;
    const before = edges.length;
    addEdge({
      id: bridge.id,
      source: originId,
      target: resolve(renderId),
      kind: "handoff",
      label: null,
      status: bridge.status,
      proof: [bridge.proof],
      pathIds: { elements: bridge.evidencePathElementIds, relations: bridge.evidencePathRelationIds },
    });
    if (edges.length > before) handoffs += 1;
  }

  // The selected origin's exact field lineage: one field edge per proven
  // attachment, and a frontier node wherever a field's proof stops.
  const lineage = selectedSource && phase === "complete" ? totality.fieldLineage : null;
  if (lineage) {
    for (const attachment of lineage.attachments) {
      const terminal = attachment.consumer?.routeTerminalId ?? attachment.terminalIds[0];
      const target = ids.has(resolve(terminal)) ? resolve(terminal) : attachment.occurrenceId;
      addEdge({
        id: attachment.id,
        source: attachment.origin.elementId,
        target,
        kind: "field",
        label: attachment.field.label,
        status: attachment.proof.every((proof) => proof.status === "proven") ? "proven" : "partial",
        proof: attachment.proof,
        pathIds: { elements: attachment.evidencePathElementIds, relations: attachment.evidencePathRelationIds },
      });
    }
    for (const frontier of lineage.frontiers) {
      const owner = frontier.occurrenceId && ids.has(frontier.occurrenceId) ? frontier.occurrenceId : routeId;
      const at = frontier.location ?? nodes[0];
      node({
        id: frontier.id,
        kind: "frontier",
        label: frontier.field?.label ?? "value",
        detail: `stops · ${frontier.reason}`,
        parent: owner,
        status: "partial",
        reason: frontier.reason,
      }, { file: at.file, line: at.line, column: "column" in at ? at.column : 1, span: at.span });
      ids.add(frontier.id);
      addEdge({
        id: `${frontier.id}:edge`,
        source: frontier.origin.elementId,
        target: frontier.id,
        kind: "field",
        label: frontier.field?.label ?? null,
        status: "partial",
        proof: frontier.proof,
        pathIds: { elements: frontier.evidencePathElementIds, relations: frontier.evidencePathRelationIds },
      });
    }
  }
  const destinations = selectedSource
    ? [...new Set(edges
      .filter((edge) => edge.source === selectedSource && (edge.kind === "handoff" || edge.kind === "field") && edge.status === "proven")
      .map((edge) => edge.target))]
    : [];

  const count = (kind: FlowNode["kind"]) => nodes.filter((item) => item.kind === kind).length;
  return {
    ...base,
    outcome: totality.status === "complete" && phase === "complete" ? "ok" : "partial",
    unavailableReason: null,
    nodes,
    edges,
    lineage: lineage
      ? { status: lineage.status, unavailableReason: lineage.unavailableReason, fields: lineage.attachments.length, frontiers: lineage.frontiers.length }
      : null,
    destinations,
    origins: [...originNodes.values()].map(({ node: originNode, roles }) => ({
      nodeId: originNode.id,
      elementId: originNode.id,
      roles: [...roles] as RouteGraphResult["origins"][number]["roles"],
      label: originNode.label,
      status: originNode.status,
    })),
    counts: {
      occurrences: count("occurrence"),
      boundaries: count("control"),
      terminals: count("terminal"),
      origins: count("origin"),
      handoffs,
      omittedItems: surface.totals.omittedItems.total ?? surface.totals.omittedItems.emitted,
    },
  };
}

/** A located gap or omission: the thing that makes one box partial. */
type PartialMark = { location: Location; reason: string };

/**
 * Give each drawn box its own status. A mark (an omission's location, or a
 * located gap from the surface or the slice) belongs to the deepest box whose
 * own span contains it: a call site, a control, a terminal. When no drawn
 * span contains it but it falls inside a component's declaration, every
 * occurrence of that component is partial, since each of them runs that
 * code. A mark nothing contains goes to the route box, and so does an
 * incomplete surface. Origins and frontiers keep the status the engine gave
 * them. The first mark on a box names its reason.
 */
export function markPartialBoxes(
  nodes: FlowNode[],
  routeId: string,
  surface: Surface,
  totality: Pick<RouteTotality, "gaps">,
  definitions: Map<string, Surface["definitions"][number]>,
): void {
  const marks: PartialMark[] = [];
  for (const omission of surface.omissions) for (const location of omission.locations) marks.push({ location, reason: omission.reason });
  for (const gap of totality.gaps) {
    if (!gap.location || (gap.source !== "occurrence-surface" && gap.source !== "evidence-slice")) continue;
    marks.push({ location: gap.location, reason: gap.reason });
  }

  const owned = new Set<FlowNode["kind"]>(["route", "occurrence", "control", "terminal"]);
  const drawn = nodes.filter((item) => owned.has(item.kind) && item.id !== routeId);
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const route = byId.get(routeId);
  const occurrencesOf = new Map<string, FlowNode[]>();
  for (const occurrence of surface.occurrences) {
    const definition = definitions.get(occurrence.definitionId);
    const drawnOccurrence = byId.get(occurrence.id);
    if (!definition?.declaration || definition.external || !drawnOccurrence) continue;
    (occurrencesOf.get(definition.id) ?? occurrencesOf.set(definition.id, []).get(definition.id)!).push(drawnOccurrence);
  }
  const spanLength = (span: FlowNode["span"]) => (span.endLine - span.startLine) * 100_000 + (span.endColumn - span.startColumn);
  const contains = (outer: Location, inner: Location) =>
    outer.file === inner.file
    && (outer.span.startLine < inner.span.startLine || (outer.span.startLine === inner.span.startLine && outer.span.startColumn <= inner.span.startColumn))
    && (outer.span.endLine > inner.span.endLine || (outer.span.endLine === inner.span.endLine && outer.span.endColumn >= inner.span.endColumn));
  const deepest = <T,>(items: T[], spanOf: (item: T) => Location, mark: PartialMark): T[] => {
    let best: { items: T[]; size: number } | null = null;
    for (const item of items) {
      const span = spanOf(item);
      if (!contains(span, mark.location)) continue;
      const size = spanLength(span.span);
      if (!best || size < best.size) best = { items: [item], size };
      else if (size === best.size) best.items.push(item);
    }
    return best?.items ?? [];
  };
  const ownersOf = (mark: PartialMark): FlowNode[] => {
    const own = deepest(drawn, (item) => ({ file: item.file, line: item.line, column: item.span.startColumn, span: item.span }), mark);
    if (own.length > 0) return [own[0]];
    const defined = deepest([...occurrencesOf.entries()], ([id]) => definitions.get(id)!.declaration!, mark);
    if (defined.length > 0) return defined.flatMap(([, occurrences]) => occurrences);
    return route ? [route] : [];
  };

  if (route && surface.status !== "complete") {
    route.status = "partial";
    route.reason ??= "incomplete-surface";
  }
  for (const mark of marks) {
    for (const owner of ownersOf(mark)) {
      if (owner.status === "partial" && owner.reason) continue;
      owner.status = "partial";
      owner.reason = mark.reason;
    }
  }
}
