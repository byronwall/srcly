import { fieldDependencyId } from "../analysis/route-totality-field-lineage-id";
import { isFullyProvenElement, isFullyProvenProof, isFullyProvenRelation } from "../analysis/route-totality-field-lineage-transition";
import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import {
  exactElement,
  exactRelation,
  sameLocations,
  type EvidenceIndexes,
  type FieldAttachment,
} from "./route-totality-field-lineage-validation-index";
import { validateSortedFieldLineageIds, validateUniqueFieldLineageIds } from "./route-totality-field-lineage-validation-structure";
import type { RouteTotality } from "./route-totality-contracts";

type Transformation = RouteTotality["fieldLineage"]["transformations"][number];

/** Validate dependency evidence without treating it as an ordinary render use. */
export function validateFieldLineageDependencies(
  attachments: readonly FieldAttachment[],
  transformations: readonly Transformation[],
  evidence: EvidenceIndexes,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const transformationsById = new Map(transformations.map((transformation) => [transformation.id, transformation]));
  const reportedCycles = new Set<string>();

  for (let index = 0; index < attachments.length; index += 1) {
    cancellation.throwIfCancelled();
    const attachment = attachments[index];
    const path = ["fieldLineage", "attachments", index, "dependencies"] as Array<string | number>;
    const seen = new Set<string>();
    validateSortedFieldLineageIds(attachment.dependencies.map((dependency) => dependency.id), path, "dependency", issues, cancellation);
    for (let dependencyIndex = 0; dependencyIndex < attachment.dependencies.length; dependencyIndex += 1) {
      cancellation.throwIfCancelled();
      const dependency = attachment.dependencies[dependencyIndex];
      const dependencyPath = [...path, dependencyIndex] as Array<string | number>;
      if (seen.has(dependency.id)) addIssue(issues, [...dependencyPath, "id"], "dependency ids must be unique within an attachment");
      seen.add(dependency.id);
      const expectedId = fieldDependencyId({
        kind: dependency.kind,
        sourceFieldElementIds: dependency.sourceField.elementIds,
        sourceTransformationIds: dependency.sourceTransformationIds,
        sourceEvidencePathElementIds: dependency.sourceEvidencePathElementIds,
        sourceEvidencePathRelationIds: dependency.sourceEvidencePathRelationIds,
        targetAttachmentId: dependency.target.attachmentId,
        targetConsumerId: dependency.target.consumerId,
        targetTerminalId: dependency.target.terminalId,
        targetTerminalRelationId: dependency.target.terminalRelationId,
        targetKey: dependency.target.targetKey,
      });
      if (dependency.id !== expectedId) addIssue(issues, [...dependencyPath, "id"], "dependency id must equal its deterministic semantic identity");

      const sourceFieldIds = validateDependencySourceField(
        dependency,
        transformationsById,
        evidence,
        [...dependencyPath, "sourceField"],
        issues,
        cancellation,
      );
      validateSourcePath(attachment, dependency, sourceFieldIds, transformationsById, evidence, [...dependencyPath, "sourceEvidencePathElementIds"], [...dependencyPath, "sourceEvidencePathRelationIds"], issues, cancellation);
      validateSourceTransformations(attachment, dependency, sourceFieldIds, transformationsById, [...dependencyPath, "sourceTransformationIds"], issues, cancellation);
      validateDependencyProof(dependency, dependencyPath, issues, cancellation);
      validateDependencyTarget(attachment, dependency, attachmentsById, evidence, dependencyPath, issues, cancellation);
    }
  }

  for (const attachment of attachments) {
    cancellation.throwIfCancelled();
    visitDependencyGraph(attachment.id, attachmentsById, new Set(), new Set(), reportedCycles, issues, cancellation);
  }
}

function validateSourcePath(
  owner: FieldAttachment,
  dependency: FieldAttachment["dependencies"][number],
  sourceFieldIds: readonly string[],
  transformations: ReadonlyMap<string, Transformation>,
  evidence: EvidenceIndexes,
  elementPath: Array<string | number>,
  relationPath: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const elements = dependency.sourceEvidencePathElementIds;
  const relations = dependency.sourceEvidencePathRelationIds;
  if (elements.length === 0) addIssue(issues, elementPath, "dependency source path must contain exact evidence elements");
  if (elements[0] !== owner.origin.elementId) addIssue(issues, [...elementPath, 0], "dependency source path must start at its attachment origin");
  validateUniqueFieldLineageIds(elements, elementPath, "dependency source evidence element", issues, cancellation);
  validateUniqueFieldLineageIds(relations, relationPath, "dependency source evidence relation", issues, cancellation);
  const canonicalRelationIds: string[] = [];
  const canonicalElementIds: string[] = [owner.origin.elementId];
  for (const transformationId of dependency.sourceTransformationIds) {
    const transformation = transformations.get(transformationId);
    if (!transformation) continue;
    canonicalRelationIds.push(...transformation.evidenceRelationIds);
  }
  if (relations.length !== canonicalRelationIds.length || relations.some((id, index) => id !== canonicalRelationIds[index])) {
    addIssue(issues, relationPath, "dependency source relation path must equal the ordered ledger relation path");
  }
  for (let index = 0; index < elements.length; index += 1) {
    cancellation.throwIfCancelled();
    const element = exactElement(evidence, elements[index]);
    if (!element || !isFullyProvenElement(element, cancellation)) addIssue(issues, [...elementPath, index], "dependency source path elements must be exact and fully proven");
  }
  let relationOffset = 0;
  for (const transformationId of dependency.sourceTransformationIds) {
    cancellation.throwIfCancelled();
    const transformation = transformations.get(transformationId);
    if (!transformation) continue;
    let expectedFrom = transformation.fromElementIds[0] ?? null;
    for (let index = 0; index < transformation.evidenceRelationIds.length; index += 1) {
      const relation = exactRelation(evidence, transformation.evidenceRelationIds[index]);
      if (!relation || relation.from !== expectedFrom || !isFullyProvenRelation(relation, cancellation)) {
        addIssue(issues, [...relationPath, relationOffset + index], "dependency source relation must follow the exact ordered ledger path");
      }
      if (relation) {
        if (canonicalElementIds.at(-1) !== relation.from) canonicalElementIds.push(relation.from);
        canonicalElementIds.push(relation.to);
      }
      expectedFrom = relation?.to ?? expectedFrom;
    }
    if (expectedFrom !== transformation.toElementIds[0]) addIssue(issues, [...relationPath, relationOffset], "dependency source relation segment must end at its exact ledger target");
    relationOffset += transformation.evidenceRelationIds.length;
  }
  if (canonicalElementIds.length !== elements.length || canonicalElementIds.some((id, index) => id !== elements[index])) {
    addIssue(issues, elementPath, "dependency source element path must equal the canonical ordered ledger element path");
  }
  if (!sourceFieldIds.every((id) => canonicalElementIds.includes(id))) {
    addIssue(issues, elementPath, "canonical dependency source path must retain every exact source field element");
  }
}

function validateDependencySourceField(
  dependency: FieldAttachment["dependencies"][number],
  transformations: ReadonlyMap<string, Transformation>,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): string[] {
  const propertyRead = firstTransformationTarget(transformations, dependency.sourceTransformationIds, "property-read", evidence, "field-read");
  const collectionElement = firstTransformationTarget(transformations, dependency.sourceTransformationIds, "cross-filter-element", evidence, "collection-element");
  const sourceField = firstTransformationTarget(transformations, dependency.sourceTransformationIds, "cross-map-property-read", evidence, "field-read");
  if (!propertyRead || !collectionElement || !sourceField) {
    addIssue(issues, path, "collection dependency source field requires exact property, collection-element, and mapped property ledger targets");
    return dependency.sourceField.elementIds;
  }
  const expectedIds = [propertyRead.id, collectionElement.id, sourceField.id];
  const expectedSegments = [
    { kind: "property", value: propertyRead.fieldName },
    { kind: "collection-element", value: "*" },
    { kind: "property", value: sourceField.fieldName },
  ];
  if (dependency.sourceField.elementIds.length !== expectedIds.length
    || dependency.sourceField.elementIds.some((id, index) => id !== expectedIds[index])) {
    addIssue(issues, [...path, "elementIds"], "dependency source field ids must equal the exact ledger-derived collection path");
  }
  if (dependency.sourceField.segments.length !== expectedSegments.length
    || dependency.sourceField.segments.some((segment, index) => segment.kind !== expectedSegments[index].kind || segment.value !== expectedSegments[index].value)) {
    addIssue(issues, [...path, "segments"], "dependency source field segments must equal the exact ledger-derived collection path");
  }
  const expectedLabel = `${propertyRead.fieldName}[*].${sourceField.fieldName}`;
  if (dependency.sourceField.label !== expectedLabel) addIssue(issues, [...path, "label"], "dependency source field label must derive from exact ledger field names");
  if (!sameLocations([dependency.sourceField.location], [sourceField.location], cancellation)) addIssue(issues, [...path, "location"], "dependency source field location must equal the exact mapped property read");
  for (const element of [propertyRead, collectionElement, sourceField]) {
    if (!isFullyProvenElement(element, cancellation)) addIssue(issues, path, "dependency source field elements must be fully proven");
  }
  return expectedIds;
}

function firstTransformationTarget(
  transformations: ReadonlyMap<string, Transformation>,
  ids: readonly string[],
  kind: string,
  evidence: EvidenceIndexes,
  targetKind: string,
) {
  for (const id of ids) {
    const transformation = transformations.get(id);
    if (transformation?.kind !== kind) continue;
    const target = exactElement(evidence, transformation.toElementIds[0] ?? "");
    if (target?.kind === targetKind) return target;
  }
  return undefined;
}

function validateSourceTransformations(
  owner: FieldAttachment,
  dependency: FieldAttachment["dependencies"][number],
  sourceFieldIds: readonly string[],
  transformations: ReadonlyMap<string, Transformation>,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  if (dependency.sourceTransformationIds.length === 0) {
    addIssue(issues, path, "collection dependency requires at least one source transformation");
    return;
  }
  validateUniqueFieldLineageIds(dependency.sourceTransformationIds, path, "dependency transformation", issues, cancellation);
  let previousTo: string | null = null;
  for (let index = 0; index < dependency.sourceTransformationIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const transformation = transformations.get(dependency.sourceTransformationIds[index]);
    if (!transformation) {
      addIssue(issues, [...path, index], "dependency transformation must resolve to one exact ledger record");
      continue;
    }
    if (transformation.status !== "proven" || transformation.proof.length === 0 || transformation.fromElementIds.length !== 1 || transformation.toElementIds.length !== 1) {
      addIssue(issues, [...path, index], "dependency transformation must be one fully proven exact transfer");
    }
    if (previousTo !== null && transformation.fromElementIds[0] !== previousTo) addIssue(issues, [...path, index], "dependency transformations must form one contiguous chain");
    if (index === 0 && transformation.fromElementIds[0] !== owner.origin.elementId) addIssue(issues, [...path, index], "dependency transformation chain must start at its attachment origin");
    previousTo = transformation.toElementIds[0] ?? null;
    for (const proof of transformation.proof) {
      if (!isFullyProvenProof(proof)) addIssue(issues, [...path, index, "proof"], "dependency transformation proof must be fully proven");
    }
  }
  if (!sourceFieldIds.every((id) => dependency.sourceEvidencePathElementIds.includes(id))) addIssue(issues, path, "dependency transformation chain must retain the exact source field path");
}

function validateDependencyProof(
  dependency: FieldAttachment["dependencies"][number],
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  if (dependency.proof.length === 0 || dependency.locations.length === 0) {
    addIssue(issues, [...path, "proof"], "dependency requires fully located proof");
    return;
  }
  for (const proof of dependency.proof) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenProof(proof) || !sameLocations(proof.locations, dependency.locations, cancellation)) {
      addIssue(issues, [...path, "proof"], "dependency proof must be fully proven and match dependency locations");
    }
  }
}

function validateDependencyTarget(
  owner: FieldAttachment,
  dependency: FieldAttachment["dependencies"][number],
  attachments: ReadonlyMap<string, FieldAttachment>,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const target = attachments.get(dependency.target.attachmentId);
  if (!target) {
    addIssue(issues, [...path, "target", "attachmentId"], "dependency target attachment must resolve exactly");
    return;
  }
  if (target.origin.elementId !== owner.origin.elementId || target.origin.role !== owner.origin.role) addIssue(issues, [...path, "target"], "dependency target must remain within the selected source origin");
  if (!target.consumer || target.consumer.id !== dependency.target.consumerId) {
    addIssue(issues, [...path, "target", "consumerId"], "dependency target consumer must equal the exact target attachment consumer");
    return;
  }
  if (!target.terminalIds.includes(dependency.target.terminalId)) addIssue(issues, [...path, "target", "terminalId"], "dependency target terminal must belong to the exact target attachment");
  if (target.consumer.target.targetKey !== dependency.target.targetKey) addIssue(issues, [...path, "target", "targetKey"], "dependency target key must equal the exact target consumer key");
  if (target.consumer.fieldLineageTerminalRelationId !== dependency.target.terminalRelationId) addIssue(issues, [...path, "target", "terminalRelationId"], "dependency target relation must equal the exact target consumer-terminal relation");
  const relation = exactRelation(evidence, dependency.target.terminalRelationId);
  const terminal = exactElement(evidence, target.consumer.fieldLineageTerminalElementId);
  const consumer = exactElement(evidence, target.consumer.elementId);
  if (!relation || !terminal || !consumer
    || relation.from !== consumer.id
    || relation.to !== terminal.id
    || relation.kind !== "render-terminal"
    || relation.proof.kind !== "field-consumer-terminal"
    || !isFullyProvenRelation(relation, cancellation)
    || !isFullyProvenElement(terminal, cancellation)
    || !isFullyProvenElement(consumer, cancellation)) {
    addIssue(issues, [...path, "target"], "dependency target must resolve to one exact proven consumer-terminal relation");
  }
}

function visitDependencyGraph(
  attachmentId: string,
  attachments: ReadonlyMap<string, FieldAttachment>,
  visiting: Set<string>,
  visited: Set<string>,
  reportedCycles: Set<string>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (visiting.has(attachmentId)) {
    if (!reportedCycles.has(attachmentId)) {
      reportedCycles.add(attachmentId);
      addIssue(issues, ["fieldLineage", "attachments"], "dependency graph cannot contain cycles between distinct attachments");
    }
    return;
  }
  if (visited.has(attachmentId)) return;
  const attachment = attachments.get(attachmentId);
  if (!attachment) return;
  visiting.add(attachmentId);
  for (const dependency of attachment.dependencies) {
    // A dependency intentionally targets its owning attachment terminal.
    if (dependency.target.attachmentId === attachmentId) continue;
    visitDependencyGraph(dependency.target.attachmentId, attachments, visiting, visited, reportedCycles, issues, cancellation);
  }
  visiting.delete(attachmentId);
  visited.add(attachmentId);
}
