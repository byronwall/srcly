import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceProof, ProgramElement, ProgramRelation, SourceLocation } from "./scope-seam";
import {
  fieldAttachmentId,
  fieldConsumerId,
  fieldDependencyId,
  fieldFrontierId,
  fieldTransformationId,
} from "./route-totality-field-lineage-id";
import { addFrontier, type FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import type {
  RouteTotalityFieldAttachment,
  RouteTotalityFieldDependency,
  RouteTotalityFieldFrontier,
  RouteTotalityFieldLineage,
  RouteTotalityFieldOrigin,
  RouteTotalityField,
  RouteTotalityFieldTransformation,
  RouteTotalityFieldTargetConsumer,
} from "./route-totality-field-lineage";
import type { ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";

export type FieldProofResultInput = {
  origin: RouteTotalityFieldOrigin;
  collectionField: ProgramElement;
  collectionElement: ProgramElement | null;
  consumerField: ProgramElement;
  occurrence: ProgramElement;
  consumerValue: ProgramElement;
  binding: ProgramElement;
  occurrenceId: string;
  terminalId: string;
  transformations: RouteTotalityFieldTransformation[];
  partial: boolean;
  consumerKind: "render" | "condition" | "handler";
  consumerLabel: string;
  directConsumer: boolean;
  sourceField: ProgramElement | null;
  boundaryMode: "direct" | "whole-object" | "scalar-alias";
  alias: string | null;
  targetConsumer: RouteTotalityFieldTargetConsumer;
  fieldLineageTerminalElementId: string;
  fieldLineageTerminalRelationId: string;
  dependency?: Omit<RouteTotalityFieldDependency, "id" | "target"> & {
    target: Omit<RouteTotalityFieldDependency["target"], "attachmentId">;
  };
  field?: RouteTotalityField;
};

export type FieldDependencyInput = Omit<RouteTotalityFieldDependency, "id" | "target"> & {
  target: Omit<RouteTotalityFieldDependency["target"], "attachmentId">;
};

export type FieldDependencyAttachmentResult =
  | { ok: true; lineage: RouteTotalityFieldLineage }
  | { ok: false; lineage: RouteTotalityFieldLineage; reason: "owner-not-found" };

/** Attach one exact dependency without changing the owning field ledger. */
export function attachFieldDependency(
  lineage: RouteTotalityFieldLineage,
  attachmentId: string,
  dependency: FieldDependencyInput,
  dependencyTransformations: readonly RouteTotalityFieldTransformation[],
  cancellation: AnalysisCancellationToken,
): FieldDependencyAttachmentResult {
  const attachment = lineage.attachments.find((item) => item.id === attachmentId);
  if (!attachment) return { ok: false, lineage, reason: "owner-not-found" };
  const target = { ...dependency.target, attachmentId: attachment.id };
  const id = fieldDependencyId({
    kind: dependency.kind,
    sourceFieldElementIds: dependency.sourceField.elementIds,
    sourceTransformationIds: dependency.sourceTransformationIds,
    sourceEvidencePathElementIds: dependency.sourceEvidencePathElementIds,
    sourceEvidencePathRelationIds: dependency.sourceEvidencePathRelationIds,
    targetAttachmentId: target.attachmentId,
    targetConsumerId: target.consumerId,
    targetTerminalId: target.terminalId,
    targetTerminalRelationId: target.terminalRelationId,
    targetKey: target.targetKey,
  });
  const nextDependency = { ...dependency, id, target };
  const dependencies = attachment.dependencies.some((item) => item.id === id)
    ? attachment.dependencies
    : [...attachment.dependencies, nextDependency];
  const nextAttachment = { ...attachment, dependencies };
  const attachments = lineage.attachments.map((item) => item.id === attachment.id ? nextAttachment : item);
  const merged = mergeTransformations([...lineage.transformations, ...dependencyTransformations]);
  if (merged.conflicts.length > 0) {
    throw new Error(`Route totality field lineage has conflicting transformation definitions: ${merged.conflicts.join(", ")}.`);
  }
  const transformations = merged.values;
  cancellation.throwIfCancelled();
  const nextLineage = {
    ...lineage,
    status: merged.conflicts.length > 0 ? "partial" as const : lineage.status,
    attachments,
    counts: { ...lineage.counts, transformations: transformations.length },
    omissions: [...new Set([...lineage.omissions, ...merged.conflicts.map((id) => `Conflicting transformation definitions were omitted: ${id}.`)])],
    transformations,
  };
  return { ok: true, lineage: nextLineage };
}

export function provenFieldProof(input: FieldProofResultInput, cancellation: AnalysisCancellationToken): RouteTotalityFieldLineage {
  const locations = uniqueLocations([
    ...input.transformations.flatMap((item) => item.locations),
    input.consumerValue.location,
  ], cancellation);
  const consumer = {
    id: "",
    elementId: input.consumerValue.id,
    occurrenceElementId: input.occurrence.id,
    kind: input.consumerKind,
    label: input.consumerLabel,
    occurrenceId: input.occurrenceId,
    routeTerminalId: input.terminalId,
    fieldLineageTerminalElementId: input.fieldLineageTerminalElementId,
    fieldLineageTerminalRelationId: input.fieldLineageTerminalRelationId,
    target: input.targetConsumer,
    location: input.consumerValue.location,
  };
  consumer.id = fieldConsumerId(consumer);
  const field = input.field ?? {
    elementIds: [input.collectionField.id, input.collectionElement!.id, (input.sourceField ?? input.consumerField).id],
    segments: [
      { kind: "property" as const, value: input.collectionField.fieldName! },
      { kind: "collection-element" as const, value: "*" },
      { kind: "property" as const, value: (input.sourceField ?? input.consumerField).fieldName! },
    ],
    label: `${input.collectionField.fieldName}[*].${(input.sourceField ?? input.consumerField).fieldName!}`,
    location: input.sourceField?.location ?? input.consumerField.location,
  };
  const attachment: RouteTotalityFieldAttachment = {
    id: "",
    origin: input.origin,
    field,
    occurrenceId: input.occurrenceId,
    terminalIds: [input.terminalId],
    evidencePathElementIds: [input.origin.elementId],
    evidencePathRelationIds: [],
    proof: [proof("The shared verifier accepts every exact C01-C12 transfer.", locations)],
    locations,
    consumer,
    dependencies: [],
    alias: input.alias,
    transformationIds: input.transformations.map((item) => item.id),
    transformationKinds: input.transformations.map((item) => item.kind),
  };
  attachment.id = fieldAttachmentId({
    origin: attachment.origin,
    fieldElementIds: attachment.field.elementIds,
    occurrenceId: attachment.occurrenceId,
    terminalIds: attachment.terminalIds,
    consumerId: attachment.consumer?.id ?? null,
    transformationIds: attachment.transformationIds,
    evidencePathElementIds: attachment.evidencePathElementIds,
    evidencePathRelationIds: attachment.evidencePathRelationIds,
  });
  if (input.dependency) {
    const target = { ...input.dependency.target, attachmentId: attachment.id };
    attachment.dependencies = [{
      ...input.dependency,
      id: fieldDependencyId({
        kind: input.dependency.kind,
        sourceFieldElementIds: input.dependency.sourceField.elementIds,
        sourceTransformationIds: input.dependency.sourceTransformationIds,
        sourceEvidencePathElementIds: input.dependency.sourceEvidencePathElementIds,
        sourceEvidencePathRelationIds: input.dependency.sourceEvidencePathRelationIds,
        targetAttachmentId: target.attachmentId,
        targetConsumerId: target.consumerId,
        targetTerminalId: target.terminalId,
        targetTerminalRelationId: target.terminalRelationId,
        targetKey: target.targetKey,
      }),
      target,
    }];
  }
  return {
    status: input.partial ? "partial" : "complete",
    unavailableReason: null,
    attachments: [attachment],
    frontiers: [],
    counts: { origins: 1, fields: 1, occurrences: 1, terminals: 1, frontiers: 0, transformations: input.transformations.length },
    omissions: input.partial ? ["The shared route evidence is partial."] : [],
    transformations: input.transformations,
  };
}

export function mergeProvenFieldProofs(
  values: readonly RouteTotalityFieldLineage[],
  partial: boolean,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage {
  const attachments = values.flatMap((value) => value.attachments);
  const frontierAccumulator: FrontierAccumulator = { emitted: new Map(), omittedIds: new Set() };
  for (const frontier of values.flatMap((value) => value.frontiers)) {
    addFrontier(frontierAccumulator, frontier, cancellation);
  }
  const frontiers = [...frontierAccumulator.emitted.values()];
  const merged = mergeTransformations(values.flatMap((value) => value.transformations));
  if (merged.conflicts.length > 0) {
    throw new Error(`Route totality field lineage has conflicting transformation definitions: ${merged.conflicts.join(", ")}.`);
  }
  const transformations = merged.values;
  const fields = new Set(attachments.map((attachment) => attachment.field.elementIds.join("\u0000")));
  for (const frontier of frontiers) {
    cancellation.throwIfCancelled();
    if (frontier.field) fields.add(frontier.field.elementIds.join("\u0000"));
  }
  const occurrences = new Set(attachments.map((attachment) => attachment.occurrenceId));
  const terminals = new Set(attachments.flatMap((attachment) => attachment.terminalIds));
  const omissions = [...new Set([
    ...values.flatMap((value) => value.omissions),
    ...merged.conflicts.map((id) => `Conflicting transformation definitions were omitted: ${id}.`),
  ])];
  cancellation.throwIfCancelled();
  return {
    status: partial || frontiers.length > 0 || merged.conflicts.length > 0 ? "partial" : "complete",
    unavailableReason: null,
    attachments: attachments.sort((left, right) => left.id.localeCompare(right.id)),
    frontiers: frontiers.sort((left, right) => left.id.localeCompare(right.id)),
    counts: {
      origins: values.length > 0 ? 1 : 0,
      fields: fields.size,
      occurrences: occurrences.size,
      terminals: terminals.size,
      frontiers: frontiers.length,
      transformations: transformations.length,
    },
    omissions,
    transformations: transformations.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function mergeTransformations(values: readonly RouteTotalityFieldTransformation[]): {
  values: RouteTotalityFieldTransformation[];
  conflicts: string[];
} {
  const groups = new Map<string, RouteTotalityFieldTransformation[]>();
  for (const value of values) groups.set(value.id, [...(groups.get(value.id) ?? []), value]);
  const conflicts: string[] = [];
  const merged: RouteTotalityFieldTransformation[] = [];
  for (const [id, group] of groups) {
    const first = group[0]!;
    if (group.every((value) => canonicalValue(value) === canonicalValue(first))) merged.push(first);
    else conflicts.push(id);
  }
  return {
    values: merged.sort((left, right) => left.id.localeCompare(right.id)),
    conflicts: conflicts.sort(),
  };
}

function canonicalValue(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}

export function failedFieldProof(
  origin: RouteTotalityFieldOrigin,
  current: ProgramElement | null,
  missingTransformationKind: ExactFieldTransferKind | "unsupported-transform",
  accepted: readonly RouteTotalityFieldTransformation[],
  detail: string,
  cancellation: AnalysisCancellationToken,
  reason: RouteTotalityFieldFrontier["reason"] = "partial-proof",
): RouteTotalityFieldLineage {
  const locations = current ? uniqueLocations([current.location], cancellation) : [];
  const stoppedAtElementId = accepted.at(-1)?.toElementIds.at(-1) ?? current?.id ?? origin.elementId;
  const frontier: RouteTotalityFieldFrontier = {
    id: "",
    origin,
    field: null,
    occurrenceId: null,
    reason,
    gapId: null,
    stoppedAtElementId,
    stoppedAtRelationId: null,
    evidencePathElementIds: [origin.elementId],
    evidencePathRelationIds: [],
    location: current?.location ?? null,
    proof: locations.length ? [proof(detail, locations, "partial")] : [],
    missingTransformationKind,
    transformationIds: accepted.map((item) => item.id),
  };
  frontier.id = fieldFrontierId({
    origin: frontier.origin,
    fieldElementIds: [],
    occurrenceId: frontier.occurrenceId,
    reason: frontier.reason,
    gapId: frontier.gapId,
    stoppedAtElementId: frontier.stoppedAtElementId,
    stoppedAtRelationId: frontier.stoppedAtRelationId,
    missingTransformationKind: frontier.missingTransformationKind,
    transformationIds: frontier.transformationIds,
  });
  return {
    status: "partial",
    unavailableReason: null,
    attachments: [],
    frontiers: [frontier],
    counts: { origins: 1, fields: 0, occurrences: 0, terminals: 0, frontiers: 1, transformations: accepted.length },
    omissions: [detail],
    transformations: [...accepted],
  };
}

export function fieldTransformation(
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  relations: readonly ProgramRelation[],
  supportingElements: readonly ProgramElement[] = [],
  supportingRelations: readonly ProgramRelation[] = [],
  cancellation: AnalysisCancellationToken,
  targetConsumer: RouteTotalityFieldTargetConsumer | null = null,
): RouteTotalityFieldTransformation {
  const locations = uniqueLocations(relations.flatMap((relation) => relation.proof.locations), cancellation);
  return {
    id: fieldTransformationId({
      kind,
      fromElementIds: [from.id],
      toElementIds: [to.id],
      evidenceRelationIds: relations.map((item) => item.id),
      supportingElementIds: supportingElements.map((item) => item.id),
      supportingRelationIds: supportingRelations.map((item) => item.id),
      targetConsumer,
    }),
    kind,
    fromElementIds: [from.id],
    toElementIds: [to.id],
    evidenceRelationIds: relations.map((item) => item.id),
    supportingElementIds: supportingElements.map((item) => item.id).sort(),
    supportingRelationIds: supportingRelations.map((item) => item.id).sort(),
    targetConsumer,
    locations,
    proof: [proof(`The shared compiler evidence proves the exact ${kind} transfer.`, locations)],
    status: "proven",
  };
}

function proof(detail: string, locations: SourceLocation[], status: "proven" | "partial" = "proven"): EvidenceProof {
  return { kind: "route-totality-field-transfer", detail, locations, status };
}

function uniqueLocations(locations: readonly SourceLocation[], cancellation: AnalysisCancellationToken): SourceLocation[] {
  const records = new Map<string, SourceLocation>();
  for (const location of locations) {
    cancellation.throwIfCancelled();
    records.set(JSON.stringify(location), location);
  }
  return [...records.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
