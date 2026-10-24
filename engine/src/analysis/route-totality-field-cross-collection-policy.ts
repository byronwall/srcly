import type { RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { ExactFieldTargetPolicy, FieldTransferGraph } from "./route-totality-field-transfer-verifier";
import { deriveTargetConsumerDescriptor, sameTargetConsumerDescriptor } from "./route-totality-field-target-consumer";

export const CROSS_COLLECTION_FIELD_TRANSFER_KINDS = [
  "source-carrier", "property-read",
  "cross-filter-element", "cross-filter-callback-parameter", "cross-filter-predicate-return", "cross-filter-result",
  "cross-map-element", "cross-map-callback-parameter", "cross-map-property-read", "cross-map-result",
  "cross-function-return", "cross-join-source", "cross-join-filter-element", "cross-join-filter-callback-parameter",
  "cross-join-membership", "cross-join-filter-result", "cross-join-function-return",
  "cross-component-boundary", "cross-for-element", "cross-for-callback-parameter", "cross-for-property-read", "cross-occurrence-consumer",
] as const;

export const CROSS_COLLECTION_DEPENDENCY_FIELD_TRANSFER_KINDS = CROSS_COLLECTION_FIELD_TRANSFER_KINDS.slice(0, 16);
export const CROSS_COLLECTION_DEPENDENCY_TERMINAL_KIND = "cross-dependency-terminal" as const;

export type CrossCollectionFieldTransferKind = typeof CROSS_COLLECTION_FIELD_TRANSFER_KINDS[number];

export function deriveCrossCollectionTargetPolicy(
  transfers: readonly RouteTotalityFieldTransformation[],
  graph: FieldTransferGraph,
): ExactFieldTargetPolicy | null {
  const kinds = transfers.map((transfer) => transfer.kind);
  if (kinds.length !== CROSS_COLLECTION_FIELD_TRANSFER_KINDS.length
    || kinds.some((kind, index) => kind !== CROSS_COLLECTION_FIELD_TRANSFER_KINDS[index])) return null;
  const collection = graph.element(transfers[12].toElementIds[0]);
  const predicateRelation = transfers[14].evidenceRelationIds
    .map((id) => graph.relation(id))
    .find((relation) => relation?.to === transfers[14].toElementIds[0]
      && relation.kind === "includes-membership"
      && relation.proof.kind === "array-includes-argument");
  const predicate = predicateRelation ? graph.element(predicateRelation.from) : undefined;
  const consumerField = graph.element(transfers[20].toElementIds[0]);
  const consumerValue = graph.element(transfers[21].toElementIds[0]);
  const binding = transfers[21].supportingElementIds.map((id) => graph.element(id)).find((element) => element?.kind === "component-prop-binding");
  const occurrence = transfers[21].supportingElementIds.map((id) => graph.element(id)).find((element) => element?.kind === "component-occurrence");
  const definition = transfers[21].supportingElementIds.map((id) => graph.element(id)).find((element) => element?.kind === "component-definition");
  const terminal = transfers[21].supportingElementIds.map((id) => graph.element(id)).find((element) => element?.kind === "render-terminal");
  const terminalRelation = transfers[21].supportingRelationIds.map((id) => graph.relation(id)).filter((relation) => (
    relation !== undefined && relation.from === consumerValue?.id && relation.to === terminal?.id
      && relation.kind === "render-terminal" && relation.proof.kind === "field-consumer-terminal"
  ));
  const consumerKind = consumerValue?.consumerKind ?? consumerValue?.attributes?.consumerKind;
  const consumerLabel = consumerValue?.consumerLabel ?? consumerValue?.attributes?.label;
  if (!collection?.fieldName || !predicate?.fieldName || !consumerField?.fieldName || consumerValue?.kind !== "field-consumer"
    || consumerKind !== "render" || typeof consumerLabel !== "string" || !binding || !occurrence?.symbol || !definition
    || occurrence.symbol !== definition.symbol || !terminal || terminalRelation.length !== 1 || !transfers[21].targetConsumer) return null;
  const targetConsumer = deriveTargetConsumerDescriptor(transfers[21].targetConsumer.targetKey, {
    consumerField,
    consumerValue,
    binding,
    occurrence,
    definition,
    renderTerminal: terminal,
    directConsumer: false,
  });
  if (!targetConsumer || !sameTargetConsumerDescriptor(targetConsumer, transfers[21].targetConsumer)) return null;
  return {
    transferKinds: kinds,
    chain: "whole-object",
    collectionFieldElementId: collection.id,
    collectionFieldName: collection.fieldName,
    predicateFieldElementId: predicate.id,
    predicateFieldName: predicate.fieldName,
    consumerFieldElementId: consumerField.id,
    consumerFieldName: consumerField.fieldName,
    consumerValueElementId: consumerValue.id,
    bindingElementId: binding.id,
    currentValueElementId: transfers[17].fromElementIds[0],
    componentReceiverElementId: transfers[17].toElementIds[0],
    componentOccurrenceElementId: occurrence.id,
    componentDefinitionElementId: definition.id,
    componentSymbol: occurrence.symbol,
    componentLabel: occurrence.label,
    propName: binding.componentBinding?.propName ?? "",
    renderTerminalElementId: terminal.id,
    consumerKind: "render",
    consumerLabel,
    directConsumer: false,
    targetConsumer,
    consumerTerminalRelationId: terminalRelation[0]!.id,
  };
}
