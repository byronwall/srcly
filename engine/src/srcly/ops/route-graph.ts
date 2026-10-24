import path from "node:path";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { projectRouteTotality } from "../../api/projections/route-totality";
import type { RouteTotality } from "../../api/route-totality-contracts";
import { routeGraphResultSchema, type FlowEdge, type FlowNode, type RouteGraphResult } from "../contracts/route-graph";
import { EngineError } from "../protocol";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";

/** Route graphs bigger than this are refused as `budget-exhausted`, never truncated. */
export const ROUTE_GRAPH_MAX_BYTES = 8 * 1024 * 1024;

type Location = { file: string; line: number; column: number; span: FlowNode["span"] };
type Surface = Exclude<RouteTotality["occurrenceSurface"], { reason: string }>;

export function routeGraphOp(
  session: EngineSession,
  params: { route?: unknown; expectedGeneration?: unknown },
  cancellation?: AnalysisCancellationToken,
): RouteGraphResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  if (typeof params.route !== "string" || !params.route) throw new EngineError("invalid-request", "routeGraph needs params.route");
  const route = tier1.routes.find((item) => item.key === params.route || item.pathPattern === params.route);
  if (!route) throw new EngineError("not-found", `No route ${params.route}`);
  const record = tier1.totality().get(route.key, null, cancellation);
  const totality = record ? projectRouteTotality(record, cancellation) : null;
  if (!totality) throw new EngineError("not-found", `No route totality for ${route.pathPattern}`);
  const result = routeGraphResultSchema.parse(projectRouteGraph(tier1, totality));
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

/** Project a validated RouteTotality onto the flow graph contract. Exported for tests. */
export function projectRouteGraph(tier1: Tier1, totality: RouteTotality): RouteGraphResult {
  const root = path.resolve(tier1.args.root);
  const absPath = (file: string) => path.resolve(root, file);
  const routeAbsPath = absPath(totality.route.file);
  const base = {
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    route: { ...totality.route, absPath: routeAbsPath },
    status: totality.status,
    selectedSource: null,
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
      counts: { occurrences: 0, boundaries: 0, terminals: 0, origins: 0, handoffs: 0, omittedItems: 0 },
    };
  }

  const status: FlowNode["status"] = surface.status === "complete" ? "proven" : "partial";
  const nodes: FlowNode[] = [];
  const node = (fields: Omit<FlowNode, "file" | "absPath" | "line" | "span" | "status" | "collapsedByDefault" | "repetition" | "external" | "reason"> & Partial<FlowNode>, at: Location): FlowNode => {
    const made: FlowNode = {
      status,
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

  const ids = new Set(nodes.map((item) => item.id));
  const resolve = (id: string) => terminalAlias.get(id) ?? id;
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
    addEdge({ id: edge.id, source: resolve(edge.from), target, kind: "render", status, proof: [], pathIds: null });
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
      status: bridge.status,
      proof: [bridge.proof],
      pathIds: { elements: bridge.evidencePathElementIds, relations: bridge.evidencePathRelationIds },
    });
    if (edges.length > before) handoffs += 1;
  }

  const count = (kind: FlowNode["kind"]) => nodes.filter((item) => item.kind === kind).length;
  return {
    ...base,
    outcome: totality.status === "complete" ? "ok" : "partial",
    unavailableReason: null,
    nodes,
    edges,
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
