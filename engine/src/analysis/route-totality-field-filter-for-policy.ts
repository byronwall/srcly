import type { RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type {
  ExactFieldTargetPolicy,
  FieldTransferGraph,
} from "./route-totality-field-transfer-verifier";
import { deriveTargetConsumerDescriptor, sameTargetConsumerDescriptor } from "./route-totality-field-target-consumer";

export const FILTER_FOR_FIELD_TRANSFER_KINDS = [
  "source-carrier", "property-read", "filter-element", "filter-callback-parameter",
  "filter-predicate-return", "filter-result", "function-return", "component-boundary",
  "for-element", "for-callback-parameter", "for-property-read", "occurrence-consumer",
] as const;

export function deriveFilterForTargetPolicy(
  transfers: readonly RouteTotalityFieldTransformation[],
  graph: FieldTransferGraph,
): ExactFieldTargetPolicy | null {
  const kinds = transfers.map((transfer) => transfer.kind);
  if (kinds.length !== FILTER_FOR_FIELD_TRANSFER_KINDS.length || kinds.some((kind, index) => kind !== FILTER_FOR_FIELD_TRANSFER_KINDS[index])) return null;
  const collection = graph.element(transfers[1].toElementIds[0]);
  const predicateRelations = transfers[4].evidenceRelationIds.map((id) => graph.relation(id));
  const predicate = predicateRelations[1] ? graph.element(predicateRelations[1].to) : undefined;
  const consumerField = graph.element(transfers[10].toElementIds[0]);
  const binding = transfers[11].supportingElementIds.map((id) => graph.element(id)).find((item) => item?.kind === "component-prop-binding");
  const occurrence = transfers[11].supportingElementIds.map((id) => graph.element(id)).find((item) => item?.kind === "component-occurrence");
  const definition = transfers[11].supportingElementIds.map((id) => graph.element(id)).find((item) => item?.kind === "component-definition");
  const terminal = transfers[11].supportingElementIds.map((id) => graph.element(id)).find((item) => item?.kind === "render-terminal");
  const terminalRelation = transfers[11].supportingRelationIds.map((id) => graph.relation(id)).filter((item) => (
    item?.from === transfers[11].toElementIds[0] && item?.to === terminal?.id
      && item.kind === "render-terminal" && item.proof.kind === "field-consumer-terminal"
  ));
  const consumerValue = graph.element(transfers[11].toElementIds[0]);
  const consumerKind = consumerValue?.consumerKind ?? consumerValue?.attributes?.consumerKind;
  const consumerLabel = consumerValue?.consumerLabel ?? consumerValue?.attributes?.label;
  if (!collection?.fieldName || !predicate?.fieldName || !consumerField?.fieldName || consumerValue?.kind !== "field-consumer"
    || consumerKind !== "render" || typeof consumerLabel !== "string" || !binding || !occurrence?.symbol || !definition
    || occurrence.symbol !== definition.symbol || !terminal || terminalRelation.length !== 1 || !transfers[11].targetConsumer) return null;
  const targetConsumer = deriveTargetConsumerDescriptor(transfers[11].targetConsumer.targetKey, {
    consumerField,
    consumerValue,
    binding,
    occurrence,
    definition,
    renderTerminal: terminal,
    directConsumer: false,
  });
  if (!targetConsumer || !sameTargetConsumerDescriptor(targetConsumer, transfers[11].targetConsumer)) return null;
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
    currentValueElementId: transfers[7].fromElementIds[0],
    componentReceiverElementId: transfers[7].toElementIds[0],
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
