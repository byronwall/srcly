import path from "node:path";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { toSliceElement, toSliceRelation } from "../../analysis/evidence-slice-normalization";
import { projectRouteTotality } from "../../api/projections/route-totality";
import type { RouteTotality } from "../../api/route-totality-contracts";
import { routePathResultSchema, type RoutePathResult } from "../contracts/route-path";
import type { LedgerRow } from "../contracts/value-flow";
import { elementTraits, relationTraits } from "../kinds";
import { EngineError } from "../protocol";
import { checkGeneration, requireTypescript, type EngineSession, type TsTier1 } from "../session";

type Slice = Exclude<RouteTotality["evidenceSlice"], { reason: string }>;
type Lineage = Exclude<RouteTotality["fieldLineage"], { reason: string }>;
type Transformation = Lineage["transformations"][number];

/**
 * Explain one lit edge of a route graph in order (M4, T16): the field
 * attachment, field frontier or handoff bridge the edge was drawn from, as
 * ledger rows from the origin to where the edge ends. A handoff's steps are
 * the engine's own `evidencePathElementIds`; a field edge's steps are its
 * accepted transfers (C01-C12) chained from the origin to the consumer. Both
 * are mapped through the slice or the fact index; nothing is invented. An
 * edge the totality does not carry is `not-found`.
 */
export function routePathOp(
  session: EngineSession,
  params: { route?: unknown; source?: unknown; edge?: unknown; expectedGeneration?: unknown },
  cancellation?: AnalysisCancellationToken,
): RoutePathResult {
  const tier1 = requireTypescript(session.tier1(), "Explaining a route edge");
  checkGeneration(tier1, params.expectedGeneration);
  if (typeof params.route !== "string" || !params.route) throw new EngineError("invalid-request", "routePath needs params.route");
  if (typeof params.edge !== "string" || !params.edge) throw new EngineError("invalid-request", "routePath needs params.edge");
  const route = tier1.routes.find((item) => item.key === params.route || item.pathPattern === params.route);
  if (!route) throw new EngineError("not-found", `No route ${params.route}`);
  const source = typeof params.source === "string" && params.source ? params.source : null;
  const selected = source ? selectedSourceFor(tier1, source) : null;
  const record = tier1.totality().get(route.key, selected, cancellation);
  const totality = record ? projectRouteTotality(record, cancellation) : null;
  if (!totality) throw new EngineError("not-found", `No route totality for ${route.pathPattern}`);
  const slice = "reason" in totality.evidenceSlice ? null : (totality.evidenceSlice as Slice);
  if (!slice) throw new EngineError("not-found", `The ${route.pathPattern} evidence slice is unavailable: ${(totality.evidenceSlice as { reason: string }).reason}`);
  const root = path.resolve(tier1.args.root);
  const base = {
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    route: { key: route.key, pathPattern: route.pathPattern },
  };
  const edgeId = params.edge;
  const lineage: Lineage | null = source && !("reason" in totality.fieldLineage) ? (totality.fieldLineage as Lineage) : null;
  const attachment = lineage?.attachments.find((item) => item.id === edgeId) ?? null;
  const frontier = lineage?.frontiers.find((item) => `${item.id}:edge` === edgeId || item.id === edgeId) ?? null;
  const bridge = totality.bridges.find((item) => item.id === edgeId) ?? null;
  if (!attachment && !frontier && !bridge) {
    throw new EngineError("not-found", source ? `No edge ${edgeId} for origin ${source} on ${route.pathPattern}` : `No edge ${edgeId} on ${route.pathPattern}; field edges need params.source`);
  }

  // A field path can pass through elements the projected slice left out; the provider's index still knows them.
  const provider = tier1.provider();
  const rows = new RowBuilder(
    root,
    slice,
    (id) => {
      const element = provider.facts.getElement(id);
      return element ? toSliceElement(element as unknown as Parameters<typeof toSliceElement>[0]) : null;
    },
    (from, id) => {
      const relation = provider.getRelations(from, "forward").find((item) => item.id === id);
      return relation ? toSliceRelation(relation as unknown as Parameters<typeof toSliceRelation>[0]) : null;
    },
  );
  if (attachment) {
    rows.path(attachment.evidencePathElementIds, attachment.evidencePathRelationIds, new Set(attachment.transformationIds));
    rows.transfers(attachment.origin.elementId, chainTransfers(attachment.origin.elementId, attachment.transformationIds, lineage!.transformations));
    rows.consumer(attachment.consumer);
    const terminal = attachment.consumer?.routeTerminalId ?? attachment.terminalIds[0];
    const status = attachment.proof.every((proof) => proof.status === "proven") ? "proven" : "partial";
    return routePathResultSchema.parse({
      outcome: status === "proven" ? "ok" : "partial",
      ...base,
      reason: null,
      edge: { id: attachment.id, kind: "field", label: attachment.field.label, status, source: attachment.origin.elementId, target: terminal },
      rows: rows.rows,
      proof: attachment.proof,
      frontier: null,
    });
  }
  if (frontier) {
    rows.path(frontier.evidencePathElementIds, frontier.evidencePathRelationIds, new Set(frontier.transformationIds));
    rows.transfers(frontier.origin.elementId, chainTransfers(frontier.origin.elementId, frontier.transformationIds, lineage!.transformations));
    rows.stop(frontier.reason, frontier.location ?? null, frontier.stoppedAtElementId, frontier.proof);
    return routePathResultSchema.parse({
      outcome: "partial",
      ...base,
      reason: null,
      edge: { id: `${frontier.id}:edge`, kind: "field", label: frontier.field?.label ?? null, status: "partial", source: frontier.origin.elementId, target: frontier.id },
      rows: rows.rows,
      proof: frontier.proof,
      frontier: { reason: frontier.reason, label: frontier.field?.label ?? "value" },
    });
  }
  const handoff = bridge!;
  rows.path(handoff.evidencePathElementIds, handoff.evidencePathRelationIds, new Set());
  const origin = handoff.direction === "origin-to-render" ? handoff.from : handoff.to;
  const render = handoff.direction === "origin-to-render" ? handoff.to : handoff.from;
  return routePathResultSchema.parse({
    outcome: handoff.status === "proven" ? "ok" : "partial",
    ...base,
    reason: null,
    edge: {
      id: handoff.id,
      kind: "handoff",
      label: null,
      status: handoff.status,
      source: "elementId" in origin ? origin.elementId : "",
      target: "terminalId" in render ? render.terminalId : "occurrenceId" in render ? render.occurrenceId : "",
    },
    rows: rows.rows,
    proof: [handoff.proof],
    frontier: null,
  });
}

function selectedSourceFor(tier1: TsTier1, elementId: string) {
  const element = tier1.provider().facts.getElement(elementId);
  if (!element) throw new EngineError("not-found", `No program element ${elementId}`);
  const at = element.location;
  return { key: elementId, evidence: { id: elementId, elementId, file: at.file, line: at.line, column: at.column, span: at.span } };
}

/**
 * The accepted transfers of one field edge in walking order: each starts where
 * the previous one ended, from the origin. The lineage lists them sorted by id,
 * so the order is recovered by chaining; a transfer that does not chain is
 * appended after the ones that do, never dropped.
 */
function chainTransfers(originId: string, ids: readonly string[], all: readonly Transformation[]): Transformation[] {
  const wanted = new Set(ids);
  const pending = all.filter((item) => wanted.has(item.id));
  const ordered: Transformation[] = [];
  let at = originId;
  while (pending.length) {
    const index = pending.findIndex((item) => item.fromElementIds.includes(at));
    if (index < 0) break;
    const [next] = pending.splice(index, 1);
    ordered.push(next);
    at = next.toElementIds.at(-1) ?? at;
  }
  return [...ordered, ...pending];
}

type SliceElement = Pick<Slice["elements"][number], "id" | "kind" | "label" | "location" | "status" | "proof" | "terminalRoles">;
type SliceRelation = Pick<Slice["relations"][number], "id" | "kind" | "status" | "proof" | "from" | "to">;

/** Ledger rows from a path of element ids, with the relation between each pair as the row's proof. */
class RowBuilder {
  readonly rows: LedgerRow[] = [];
  private readonly elements: Map<string, Slice["elements"][number]>;
  private readonly relations: Map<string, Slice["relations"][number]>;

  constructor(
    private readonly root: string,
    slice: Slice,
    private readonly lookup: (id: string) => SliceElement | null,
    private readonly lookupRelation: (from: string, id: string) => SliceRelation | null,
  ) {
    this.elements = new Map(slice.elements.map((element) => [element.id, element]));
    this.relations = new Map(slice.relations.map((relation) => [relation.id, relation]));
  }

  private elementOf(id: string) {
    return this.elements.get(id) ?? this.lookup(id);
  }

  private relationOf(from: string, id: string) {
    return this.relations.get(id) ?? this.lookupRelation(from, id);
  }

  /** One row per accepted field transfer: the element it reaches, with the transfer's evidence as the row's proof. */
  transfers(originId: string, items: readonly Transformation[]) {
    let at = originId;
    for (const item of items) {
      const to = item.toElementIds.at(-1);
      const element = to ? this.elementOf(to) : null;
      if (!element || to === at) continue;
      const relation = item.evidenceRelationIds.length ? this.relationOf(at, item.evidenceRelationIds[0]) : null;
      const kind: LedgerRow["kind"] = /^(select|pack|map|filter|find|parse|serializ|validat|index|pick|destructur)/.test(item.kind) ? "transform" : "transfer";
      this.add({
        kind,
        label: element.label,
        file: element.location.file,
        span: element.location.span,
        status: item.status === "proven" ? "proven" : "partial",
        elementId: element.id,
        relationId: relation?.id ?? item.evidenceRelationIds[0] ?? null,
        proof: [...item.proof],
        typeText: null,
        note: `${item.kind.replaceAll("-", " ")} → ${element.kind.replaceAll("-", " ")}`,
        reason: null,
      });
      at = to!;
    }
  }

  /** The consumer a field edge ends at, as the terminal row, unless the transfers already reached it. */
  consumer(consumer: { elementId: string; label: string; kind: string; location: { file: string; span: LedgerRow["span"] }; fieldLineageTerminalRelationId: string } | null) {
    if (!consumer || this.rows.at(-1)?.elementId === consumer.elementId) {
      if (this.rows.length > 1) this.rows[this.rows.length - 1] = { ...this.rows[this.rows.length - 1], kind: "terminal" };
      return;
    }
    const element = this.elementOf(consumer.elementId);
    this.add({
      kind: "terminal",
      label: element?.label ?? consumer.label,
      file: consumer.location.file,
      span: consumer.location.span,
      status: "proven",
      elementId: consumer.elementId,
      relationId: consumer.fieldLineageTerminalRelationId || null,
      proof: element ? [...element.proof] : [],
      typeText: null,
      note: `${consumer.kind} consumer${element && element.kind !== consumer.kind ? ` → ${element.kind.replaceAll("-", " ")}` : ""}`,
      reason: null,
    });
  }

  path(elementIds: readonly string[], relationIds: readonly string[], transformations: Set<string>) {
    elementIds.forEach((elementId, index) => {
      const element = this.elementOf(elementId);
      if (!element) return;
      const relation = index > 0 ? this.relations.get(relationIds[index - 1]) ?? this.relationBetween(elementIds[index - 1], elementId) : null;
      const kind: LedgerRow["kind"] =
        index === 0 ? "input"
          : index === elementIds.length - 1 && (elementTraits(element.kind).terminal || element.terminalRoles.length > 0) ? "terminal"
            : transformations.has(elementId) || elementTraits(element.kind).role === "transform" || (relation !== null && relationTraits(relation.kind).role === "transform") ? "transform"
              : relation?.kind === "show-when" || element.kind === "type-narrow" ? "branch"
                : "transfer";
      this.add({
        kind,
        label: element.label,
        file: element.location.file,
        span: element.location.span,
        status: relation ? relation.status : element.status,
        elementId: element.id,
        relationId: relation?.id ?? null,
        proof: relation ? [relation.proof] : [...element.proof],
        typeText: null,
        note: relation ? `${relation.kind.replaceAll("-", " ")}${element.kind !== relation.kind ? ` → ${element.kind.replaceAll("-", " ")}` : ""}` : element.kind.replaceAll("-", " "),
        reason: null,
      });
    });
  }

  /** A frontier at the end of the path: where the lineage stops and why. */
  stop(reason: string, location: { file: string; span: LedgerRow["span"] } | null, elementId: string | null, proof: LedgerRow["proof"]) {
    const element = elementId ? this.elementOf(elementId) : null;
    const at = location ?? element?.location ?? null;
    if (!at) return;
    this.add({
      kind: "boundary",
      label: element?.label ?? "lineage stops",
      file: at.file,
      span: at.span,
      status: "partial",
      elementId: element?.id ?? null,
      relationId: null,
      proof,
      typeText: null,
      note: `The field's proof stops here: ${reason.replaceAll("-", " ")}.`,
      reason,
    });
  }

  private relationBetween(from: string, to: string) {
    for (const relation of this.relations.values()) if (relation.from === from && relation.to === to) return relation;
    return null;
  }

  private add(row: Omit<LedgerRow, "id" | "absPath" | "line">) {
    this.rows.push({ ...row, id: `row:${this.rows.length + 1}`, absPath: path.resolve(this.root, row.file), line: row.span.startLine });
  }
}
