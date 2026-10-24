import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldOrigin, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { CollectionFieldProofCandidate, ScalarFieldProofCandidate } from "./route-totality-field-proof-candidate";
import type { FieldCarrierPath } from "./route-totality-field-proof-carrier";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { fieldTransformation } from "./route-totality-field-proof-result";
import { deriveTargetConsumerDescriptor } from "./route-totality-field-target-consumer";
import type { ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";
import type { ProgramElement, ProgramRelation } from "./scope-seam";

export function assembleFieldProofTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: CollectionFieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  if (candidate.flow === "filter-for" || candidate.flow === "cross-collection") return assembleFilterForTransformations(index, origin, candidate, carrier, cancellation);
  if (candidate.boundary) return assembleComponentBoundaryTransformations(index, origin, candidate, carrier, cancellation);
  const source = index.byId(origin.elementId)!;
  const occurrenceRelation = candidate.directConsumer ? null : one(index.exactRelations(
    candidate.occurrence.id,
    candidate.definition.id,
    "component-occurrence",
    "compiler-symbol",
    cancellation,
  ));
  return [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, candidate.collectionField, [["field-input", "property-access"]], cancellation),
    step(index, "find-element", candidate.collectionField, candidate.collectionElement, [["collection-element", "array-find-element"]], cancellation),
    step(index, "callback-parameter", candidate.collectionElement, candidate.parameter, [["callback-parameter", "array-find-callback"]], cancellation),
    chainedStep(index, "predicate-return", candidate.parameter, candidate.predicateResult, [
      [candidate.parameter, candidate.parameterValue, "references", "compiler-symbol"],
      [candidate.parameterValue, candidate.predicateField, "field-input", "property-access"],
      [candidate.predicateField, candidate.predicateResult, "predicate-return", "array-find-predicate-return"],
    ], cancellation),
    step(index, "find-result", candidate.predicateResult, candidate.findResult, [["find-result", "array-find-result"]], cancellation),
    chainedStep(index, "function-return", candidate.findResult, candidate.accessorCall, [
      [candidate.findResult, candidate.returnExpression, "function-return", "return-expression"],
      [candidate.returnExpression, candidate.accessorCall, "function-call", "function-call"],
    ], cancellation),
    step(index, "show-when", candidate.accessorCall, candidate.showBinding, [["show-when", "solid-show-when"]], cancellation),
    step(index, "show-render-prop", candidate.showBinding, candidate.currentParameter, [["show-render-parameter", "solid-show-render-parameter"]], cancellation),
    step(index, "accessor-call", candidate.currentParameter, candidate.currentCall, [["accessor-call", "accessor-call"]], cancellation),
    step(index, "nested-property-read", candidate.currentCall, candidate.consumerField, [["field-input", "property-access"]], cancellation),
    candidate.directConsumer
      ? directConsumerStep(index, candidate, cancellation)
      : componentConsumerStep(index, candidate, occurrenceRelation, cancellation),
  ];
}

export function assembleCrossCollectionDependencyTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: CollectionFieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  const dependency = candidate.dependency;
  if (!dependency) return [];
  const source = index.byId(origin.elementId)!;
  const firstPredicateBranch = predicateBranch(index, dependency.availabilityParameter, dependency.predicateFields[0], dependency.availabilityPredicate, cancellation);
  const secondPredicateBranch = predicateBranch(index, dependency.availabilityParameter, dependency.predicateFields[1], dependency.availabilityPredicate, cancellation);
  const mapProperty = one(index.exactRelations(dependency.mapParameter.id, dependency.mappedField.id, "field-input", "array-map-property-return", cancellation));
  const mapResult = one(index.exactRelations(dependency.mappedField.id, dependency.mapResult.id, "map-result", "array-map-result", cancellation));
  const joinBranch = predicateBranch(index, candidate.parameter, candidate.predicateField, dependency.includesResult, cancellation, "array-includes-argument");
  const receiverRelation = one(index.exactRelations(dependency.availableIdsCall.id, dependency.includesResult.id, "includes-membership", "array-includes-membership", cancellation));
  const joinSourceProof = {
    kind: "array-join-source" as const,
    detail: "The compiler resolves this exact mapped result as the membership receiver for the collection filter.",
    locations: [dependency.availableIdsCall.location, candidate.collectionField.location],
    status: "proven" as const,
  };
  const joinSource = index.materializeRelation(dependency.availableIdsCall, candidate.collectionField, "join-source", joinSourceProof);
  return [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, dependency.availabilityField, [["field-input", "property-access"]], cancellation),
    step(index, "cross-filter-element", dependency.availabilityField, dependency.availabilityElement, [["collection-element", "array-filter-element"]], cancellation),
    step(index, "cross-filter-callback-parameter", dependency.availabilityElement, dependency.availabilityParameter, [["callback-parameter", "array-filter-callback"]], cancellation),
    firstPredicateBranch && secondPredicateBranch ? fieldTransformation("cross-filter-predicate-return", dependency.availabilityParameter, dependency.availabilityPredicate, firstPredicateBranch.primary, [...dependency.predicateFields], secondPredicateBranch.primary, cancellation) : null,
    step(index, "cross-filter-result", dependency.availabilityPredicate, dependency.availabilityFilterResult, [["filter-result", "array-filter-result"]], cancellation),
    step(index, "cross-map-element", dependency.availabilityFilterResult, dependency.mapElement, [["map-element", "array-map-element"]], cancellation),
    step(index, "cross-map-callback-parameter", dependency.mapElement, dependency.mapParameter, [["map-callback-parameter", "array-map-callback"]], cancellation),
    mapProperty ? fieldTransformation("cross-map-property-read", dependency.mapParameter, dependency.mappedField, [mapProperty], [], [], cancellation) : null,
    mapResult ? fieldTransformation("cross-map-result", dependency.mappedField, dependency.mapResult, [mapResult], [], [], cancellation) : null,
    chainedStep(index, "cross-function-return", dependency.mapResult, dependency.availableIdsCall, [
      [dependency.mapResult, dependency.availabilityReturnExpression, "function-return", "return-expression"],
      [dependency.availabilityReturnExpression, dependency.availableIdsCall, "function-call", "function-call"],
    ], cancellation),
    fieldTransformation("cross-join-source", dependency.availableIdsCall, candidate.collectionField, [joinSource], [], [], cancellation),
    step(index, "cross-join-filter-element", candidate.collectionField, candidate.collectionElement, [["collection-element", "array-filter-element"]], cancellation),
    step(index, "cross-join-filter-callback-parameter", candidate.collectionElement, candidate.parameter, [["callback-parameter", "array-filter-callback"]], cancellation),
    joinBranch ? fieldTransformation("cross-join-membership", candidate.parameter, dependency.includesResult, joinBranch.primary, [dependency.availableIdsCall], [receiverRelation].filter((relation): relation is ProgramRelation => Boolean(relation)), cancellation) : null,
    step(index, "cross-join-filter-result", dependency.includesResult, candidate.findResult, [["filter-result", "array-filter-result"]], cancellation),
  ];
}

function predicateBranch(
  index: RouteTotalityFieldProofIndex,
  parameter: ProgramElement,
  field: ProgramElement,
  predicate: ProgramElement,
  cancellation: AnalysisCancellationToken,
  fieldProof = "array-filter-predicate-return",
): { primary: ProgramRelation[] } | null {
  const valueRelation = index.outgoing(parameter.id, cancellation).filter((relation) => relation.kind === "references" && relation.proof.kind === "compiler-symbol");
  const branch = valueRelation.map((relation) => {
    const value = index.byId(relation.to);
    const fieldRelation = value ? one(index.exactRelations(value.id, field.id, "field-input", "property-access", cancellation)) : null;
    const predicateRelation = one(index.exactRelations(field.id, predicate.id, fieldProof === "array-includes-argument" ? "includes-membership" : "predicate-return", fieldProof, cancellation));
    return fieldRelation && predicateRelation ? [relation, fieldRelation, predicateRelation] : null;
  }).find((item): item is ProgramRelation[] => Boolean(item));
  return branch ? { primary: branch } : null;
}

function assembleFilterForTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: CollectionFieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  const source = index.byId(origin.elementId)!;
  const boundary = candidate.boundary!;
  const occurrenceRelation = one(index.exactRelations(boundary.occurrence.id, boundary.definition.id, "component-occurrence", "compiler-symbol", cancellation));
  const valueToBinding = one(index.exactRelations(candidate.accessorCall.id, boundary.binding.id, "component-prop-binding", "component-prop-binding", cancellation));
  const bindingToReceiver = boundary.receiver ? one(index.exactRelations(boundary.binding.id, boundary.receiver.id, "component-prop-binding", "component-prop-binding", cancellation)) : null;
  const consumerRelation = one(index.exactRelations(candidate.consumerField.id, candidate.consumerValue.id, "consumer-value", "render-consumer", cancellation));
  const terminal = index.consumerRenderTerminal(candidate.consumerValue.id, candidate.renderTerminal.id);
  const targetConsumer = targetConsumerDescriptor(candidate);
  return [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, candidate.collectionField, [["field-input", "property-access"]], cancellation),
    step(index, "filter-element", candidate.collectionField, candidate.collectionElement, [["collection-element", "array-filter-element"]], cancellation),
    step(index, "filter-callback-parameter", candidate.collectionElement, candidate.parameter, [["callback-parameter", "array-filter-callback"]], cancellation),
    chainedStep(index, "filter-predicate-return", candidate.parameter, candidate.predicateResult, [
      [candidate.parameter, candidate.parameterValue, "references", "compiler-symbol"],
      [candidate.parameterValue, candidate.predicateField, "field-input", "property-access"],
      [candidate.predicateField, candidate.predicateResult, "predicate-return", "array-filter-predicate-return"],
    ], cancellation),
    step(index, "filter-result", candidate.predicateResult, candidate.findResult, [["filter-result", "array-filter-result"]], cancellation),
    chainedStep(index, "function-return", candidate.findResult, candidate.accessorCall, [
      [candidate.findResult, candidate.returnExpression, "function-return", "return-expression"],
      [candidate.returnExpression, candidate.accessorCall, "function-call", "function-call"],
    ], cancellation),
    valueToBinding && bindingToReceiver ? fieldTransformation("component-boundary", candidate.accessorCall, boundary.receiver!, [valueToBinding, bindingToReceiver], [boundary.binding, boundary.occurrence, boundary.definition], occurrenceRelation ? [occurrenceRelation] : [], cancellation) : null,
    candidate.forEach ? step(index, "for-element", boundary.receiver!, candidate.showBinding, [["for-element", "solid-for-each"]], cancellation) : null,
    step(index, "for-callback-parameter", candidate.showBinding, candidate.currentParameter, [["for-callback-parameter", "solid-for-render-parameter"]], cancellation),
    step(index, "for-property-read", candidate.currentParameter, candidate.consumerField, [["field-input", "property-access"]], cancellation),
    consumerRelation && terminal ? fieldTransformation("occurrence-consumer", candidate.consumerField, candidate.consumerValue, [consumerRelation], [candidate.binding, candidate.occurrence, candidate.definition, candidate.renderTerminal], [terminal], cancellation, targetConsumer) : null,
  ];
}

export function assembleScalarFieldProofTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: ScalarFieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  const source = index.byId(origin.elementId)!;
  return [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, candidate.collectionField, [["field-input", "property-access"]], cancellation),
    scalarConsumerStep(index, candidate, cancellation),
  ];
}

function assembleComponentBoundaryTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: CollectionFieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  const source = index.byId(origin.elementId)!;
  const boundary = candidate.boundary!;
  const occurrenceRelation = one(index.exactRelations(
    boundary.occurrence.id,
    boundary.definition.id,
    "component-occurrence",
    "compiler-symbol",
    cancellation,
  ));
  const valueToBinding = one(index.exactRelations(
    candidate.sourceField?.id ?? candidate.currentCall.id,
    boundary.binding.id,
    "component-prop-binding",
    "component-prop-binding",
    cancellation,
  ));
  const bindingToReceiver = boundary.receiver
    ? one(index.exactRelations(boundary.binding.id, boundary.receiver.id, "component-prop-binding", "component-prop-binding", cancellation))
    : null;
  const base: Array<RouteTotalityFieldTransformation | null> = [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, candidate.collectionField, [["field-input", "property-access"]], cancellation),
    step(index, "find-element", candidate.collectionField, candidate.collectionElement, [["collection-element", "array-find-element"]], cancellation),
    step(index, "callback-parameter", candidate.collectionElement, candidate.parameter, [["callback-parameter", "array-find-callback"]], cancellation),
    chainedStep(index, "predicate-return", candidate.parameter, candidate.predicateResult, [
      [candidate.parameter, candidate.parameterValue, "references", "compiler-symbol"],
      [candidate.parameterValue, candidate.predicateField, "field-input", "property-access"],
      [candidate.predicateField, candidate.predicateResult, "predicate-return", "array-find-predicate-return"],
    ], cancellation),
    step(index, "find-result", candidate.predicateResult, candidate.findResult, [["find-result", "array-find-result"]], cancellation),
    chainedStep(index, "function-return", candidate.findResult, candidate.accessorCall, [
      [candidate.findResult, candidate.returnExpression, "function-return", "return-expression"],
      [candidate.returnExpression, candidate.accessorCall, "function-call", "function-call"],
    ], cancellation),
    step(index, "show-when", candidate.accessorCall, candidate.showBinding, [["show-when", "solid-show-when"]], cancellation),
    step(index, "show-render-prop", candidate.showBinding, candidate.currentParameter, [["show-render-parameter", "solid-show-render-parameter"]], cancellation),
    step(index, "accessor-call", candidate.currentParameter, candidate.currentCall, [["accessor-call", "accessor-call"]], cancellation),
  ];
  if (boundary.mode === "scalar-alias") {
    base.push(step(index, "component-source-field", candidate.currentCall, candidate.sourceField!, [["field-input", "property-access"]], cancellation));
    base.push(valueToBinding && bindingToReceiver
      ? fieldTransformation("component-boundary", candidate.sourceField!, boundary.receiver!, [valueToBinding, bindingToReceiver], [boundary.binding, boundary.occurrence, boundary.definition], occurrenceRelation ? [occurrenceRelation] : [], cancellation)
      : null);
  } else {
    base.push(valueToBinding && bindingToReceiver
      ? fieldTransformation("component-boundary", candidate.currentCall, boundary.receiver!, [valueToBinding, bindingToReceiver], [boundary.binding, boundary.occurrence, boundary.definition], occurrenceRelation ? [occurrenceRelation] : [], cancellation)
      : null);
  }
  if (boundary.mode === "whole-object") {
    base.push(step(index, "component-property-read", boundary.receiver!, candidate.consumerField, [["field-input", "property-access"]], cancellation));
  }
  base.push(candidate.directConsumer
    ? directConsumerStep(index, candidate, cancellation)
    : null);
  return base;
}

function directConsumerStep(
  index: RouteTotalityFieldProofIndex,
  candidate: CollectionFieldProofCandidate,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  const relation = one(index.exactRelations(
    candidate.consumerField.id,
    candidate.binding.id,
    "consumer-value",
    candidate.binding.attributes?.consumerKind === "condition"
      ? "condition-consumer"
      : candidate.binding.attributes?.consumerKind === "handler" ? "handler-consumer" : "render-consumer",
    cancellation,
  ));
  const terminalRelation = index.consumerRenderTerminal(candidate.binding.id, candidate.renderTerminal.id);
  const targetConsumer = targetConsumerDescriptor(candidate);
  return relation && terminalRelation && targetConsumer
    ? fieldTransformation("occurrence-consumer", candidate.consumerField, candidate.binding, [relation], [candidate.occurrence, candidate.renderTerminal], [terminalRelation], cancellation, targetConsumer)
    : null;
}

function scalarConsumerStep(
  index: RouteTotalityFieldProofIndex,
  candidate: ScalarFieldProofCandidate,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  const relation = one(index.exactRelations(
    candidate.consumerField.id,
    candidate.binding.id,
    "consumer-value",
    "render-consumer",
    cancellation,
  ));
  const terminal = index.fieldConsumerTerminal(candidate.binding.id);
  const terminalRelation = terminal ? index.consumerRenderTerminal(candidate.binding.id, terminal.id) : null;
  return relation && terminal && terminalRelation
    ? fieldTransformation(
      "scalar-consumer",
      candidate.consumerField,
      candidate.binding,
      [relation],
      [candidate.occurrence, terminal],
      [terminalRelation],
      cancellation,
      candidate.targetConsumer,
    )
    : null;
}

function componentConsumerStep(
  index: RouteTotalityFieldProofIndex,
  candidate: CollectionFieldProofCandidate,
  occurrenceRelation: ProgramRelation | null,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  const nestedConsumerRelations = [
    one(index.exactRelations(candidate.consumerField.id, candidate.consumerValue.id, "consumer-value", "jsx-consumer-value", cancellation)),
    one(index.exactRelations(candidate.consumerValue.id, candidate.binding.id, "component-prop-binding", "component-prop-binding", cancellation)),
  ];
  const wholeObjectConsumerRelation = candidate.boundary?.mode === "whole-object"
    ? one(index.exactRelations(candidate.consumerField.id, candidate.binding.id, "consumer-value", "render-consumer", cancellation))
    : null;
  const consumerRelations = nestedConsumerRelations.every(Boolean)
    ? nestedConsumerRelations
    : wholeObjectConsumerRelation ? [wholeObjectConsumerRelation] : nestedConsumerRelations;
  const terminalRelation = index.consumerRenderTerminal(candidate.consumerValue.id, candidate.renderTerminal.id);
  const targetConsumer = targetConsumerDescriptor(candidate);
  return consumerRelations.every(Boolean) && occurrenceRelation && terminalRelation && targetConsumer
    ? fieldTransformation(
      "occurrence-consumer",
      candidate.consumerField,
      candidate.binding,
      consumerRelations as ProgramRelation[],
      [candidate.occurrence, candidate.definition, candidate.renderTerminal],
      [occurrenceRelation, terminalRelation],
      cancellation,
      targetConsumer,
    )
    : null;
}

function targetConsumerDescriptor(candidate: CollectionFieldProofCandidate) {
  const descriptor = deriveTargetConsumerDescriptor(candidate.targetKey, {
    consumerField: candidate.consumerField,
    consumerValue: candidate.directConsumer ? candidate.binding : candidate.consumerValue,
    binding: candidate.binding,
    occurrence: candidate.occurrence,
    definition: candidate.definition,
    renderTerminal: candidate.renderTerminal,
    directConsumer: candidate.directConsumer,
  });
  return descriptor?.targetKey === candidate.targetKey ? descriptor : null;
}

function step(
  index: RouteTotalityFieldProofIndex,
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  relations: readonly (readonly [string, string])[],
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  if (relations.length !== 1) return null;
  const relation = one(index.exactRelations(from.id, to.id, relations[0][0], relations[0][1], cancellation));
  return relation ? fieldTransformation(kind, from, to, [relation], [], [], cancellation) : null;
}

function chainedStep(
  index: RouteTotalityFieldProofIndex,
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  definitions: readonly (readonly [ProgramElement, ProgramElement, string, string])[],
  cancellation: AnalysisCancellationToken,
  supportElements: readonly ProgramElement[] = [],
  supportRelations: readonly ProgramRelation[] = [],
): RouteTotalityFieldTransformation | null {
  const relations = definitions.map(([source, target, relationKind, proofKind]) => one(
    index.exactRelations(source.id, target.id, relationKind, proofKind, cancellation),
  ));
  return relations.every(Boolean)
    ? fieldTransformation(kind, from, to, relations as ProgramRelation[], supportElements, supportRelations, cancellation)
    : null;
}

function one<T>(values: readonly T[]): T | null {
  return values.length === 1 ? values[0] : null;
}
