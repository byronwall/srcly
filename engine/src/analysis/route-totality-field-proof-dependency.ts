import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldAttachment, RouteTotalityFieldLineage, RouteTotalityFieldOrigin, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { FieldDependencyInput } from "./route-totality-field-proof-result";
import { failedFieldProof } from "./route-totality-field-proof-result";
import type { CollectionFieldProofCandidate, FieldProofCandidate } from "./route-totality-field-proof-candidate";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import type { ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";

export function dependencyInput(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: CollectionFieldProofCandidate & { dependency: NonNullable<CollectionFieldProofCandidate["dependency"]> },
  dependencyTransformations: readonly RouteTotalityFieldTransformation[],
  attachment: RouteTotalityFieldAttachment,
): FieldDependencyInput | null {
  const source = candidate.dependency;
  const sourceCollectionName = source.availabilityField.fieldName;
  const sourceMappedName = source.mappedField.fieldName;
  if (!sourceCollectionName || !sourceMappedName) return null;
  const sourcePathElements = [origin.elementId];
  const sourcePathRelations: string[] = [];
  for (const transformation of dependencyTransformations) {
    for (const relationId of transformation.evidenceRelationIds) {
      const relation = index.graph().relation(relationId);
      if (!relation) continue;
      sourcePathRelations.push(relation.id);
      if (sourcePathElements.at(-1) !== relation.from) sourcePathElements.push(relation.from);
      sourcePathElements.push(relation.to);
    }
  }
  return {
    kind: "collection-membership",
    sourceField: {
      elementIds: [source.availabilityField.id, source.availabilityElement.id, source.mappedField.id],
      segments: [
        { kind: "property", value: sourceCollectionName },
        { kind: "collection-element", value: "*" },
        { kind: "property", value: sourceMappedName },
      ],
      label: `${sourceCollectionName}[*].${sourceMappedName}`,
      location: source.mappedField.location,
    },
    sourceTransformationIds: dependencyTransformations.map((item) => item.id),
    sourceEvidencePathElementIds: sourcePathElements,
    sourceEvidencePathRelationIds: sourcePathRelations,
    target: {
      consumerId: attachment.consumer!.id,
      terminalId: attachment.terminalIds[0],
      terminalRelationId: attachment.consumer!.fieldLineageTerminalRelationId,
      targetKey: attachment.consumer!.target.targetKey,
    },
    proof: [{
      kind: "array-includes-membership",
      detail: "The compiler resolves mapped source values as the exact membership source for the collection filter.",
      locations: [source.mappedField.location, candidate.collectionField.location],
      status: "proven",
    }],
    locations: [source.mappedField.location, candidate.collectionField.location],
  };
}

export function exactOwnerMatch(
  attachment: RouteTotalityFieldAttachment,
  candidate: Extract<FieldProofCandidate, { mode: "collection" }>,
  anchor: { occurrenceId: string; terminalId: string },
): boolean {
  return Boolean(
    attachment.consumer
      && attachment.consumer.target.targetKey === candidate.targetKey
      && attachment.consumer.elementId === candidate.consumerValue.id
      && attachment.consumer.occurrenceId === anchor.occurrenceId
      && attachment.terminalIds.length === 1
      && attachment.terminalIds[0] === anchor.terminalId
      && attachment.consumer.fieldLineageTerminalRelationId,
  );
}

export function dependencyFrontier(
  origin: RouteTotalityFieldOrigin,
  candidate: Extract<FieldProofCandidate, { mode: "collection" }>,
  index: RouteTotalityFieldProofIndex,
  missingKind: string,
  accepted: readonly RouteTotalityFieldTransformation[],
  detail: string,
  cancellation: AnalysisCancellationToken,
  reason: "partial-proof" | "ambiguous-target" = "partial-proof",
): RouteTotalityFieldLineage {
  const current = accepted.length
    ? index.byId(accepted.at(-1)!.toElementIds[0])
    : candidate.dependency?.availabilityField ?? candidate.collectionField;
  return failedFieldProof(
    origin,
    current,
    missingKind as ExactFieldTransferKind,
    accepted,
    detail,
    cancellation,
    reason,
  );
}
