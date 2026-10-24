import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { exactCallbackReturnExpression } from "./program-callback-return";
import {
  accessorDeclaration,
  elementKindForExpression,
  parameterPropertyReads,
  resolvesArrayFind,
  resolvesArrayFilter,
  resolvesCreateMemo,
  sourceOrder,
  visitTypeScript,
} from "./route-totality-field-proof-ast";
import { componentConsumers, uniqueShowUse } from "./route-totality-field-proof-component";
import { resolveExactComponentBoundary } from "./route-totality-field-proof-component-boundary";
import type { ExactComponentBoundary } from "./route-totality-field-proof-component-boundary";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { fieldProofTargetForConsumer, fieldProofTargetKey, type FieldProofTargetSelector } from "./route-totality-field-proof-policy";
import {
  componentBoundaryConsumersForTarget,
  compilerIdentityForNode,
  directConsumers,
  enclosingOwnerIdentity,
  type CandidateConsumer,
} from "./route-totality-field-proof-consumers";
import { importModule } from "./program-evidence-support";
import type { ProgramElement } from "./scope-seam";
import { crossCollectionDependencyFor } from "./route-totality-field-proof-cross-candidate";
import { genericConsumerLabel } from "./route-totality-field-proof-consumer-label";
import type { RouteTotalityFieldTargetConsumer } from "./route-totality-field-lineage";

export type CollectionFieldProofCandidate = {
  mode: "collection";
  flow?: "find" | "filter-for" | "cross-collection";
  targetKey: string;
  target: FieldProofTargetSelector;
  componentIdentity: string | null;
  ownerIdentity: string | null;
  findCall: TypeScript.CallExpression;
  snapshotCall: ProgramElement;
  collectionField: ProgramElement;
  collectionElement: ProgramElement;
  parameter: ProgramElement;
  parameterValue: ProgramElement;
  predicateField: ProgramElement;
  predicateResult: ProgramElement;
  findResult: ProgramElement;
  returnExpression: ProgramElement;
  accessorCall: ProgramElement;
  showBinding: ProgramElement;
  currentParameter: ProgramElement;
  currentCall: ProgramElement;
  forEach?: ProgramElement;
  consumerField: ProgramElement;
  consumerValue: ProgramElement;
  binding: ProgramElement;
  occurrence: ProgramElement;
  definition: ProgramElement;
  renderTerminal: ProgramElement;
  directConsumer: boolean;
  consumerKind: "render" | "condition" | "handler";
  consumerLabel: string;
  boundary: ExactComponentBoundary | null;
  sourceField: ProgramElement | null;
  evidenceLabel?: string | null;
  dependency?: CollectionMembershipProofCandidate;
};

export type CollectionMembershipProofCandidate = {
  availabilityField: ProgramElement;
  availabilityElement: ProgramElement;
  availabilityParameter: ProgramElement;
  predicateFields: readonly [ProgramElement, ProgramElement];
  predicateOperators: readonly [string, string];
  predicateRightCategories: readonly [string, string];
  availabilityPredicate: ProgramElement;
  availabilityFilterResult: ProgramElement;
  mapElement: ProgramElement;
  mapParameter: ProgramElement;
  mappedField: ProgramElement;
  mapResult: ProgramElement;
  availabilityReturnExpression: ProgramElement;
  availableIdsCall: ProgramElement;
  includesResult: ProgramElement;
};

export type ScalarFieldProofCandidate = {
  mode: "scalar";
  targetKey: string;
  target: null;
  componentIdentity: string | null;
  ownerIdentity: string | null;
  snapshotCall: ProgramElement;
  collectionField: ProgramElement;
  consumerField: ProgramElement;
  consumerValue: ProgramElement;
  binding: ProgramElement;
  occurrence: ProgramElement;
  definition: ProgramElement;
  renderTerminal: ProgramElement;
  directConsumer: true;
  consumerKind: "render";
  consumerLabel: string;
  boundary: null;
  sourceField: null;
  targetConsumer: RouteTotalityFieldTargetConsumer;
};

export type FieldProofCandidate = CollectionFieldProofCandidate | ScalarFieldProofCandidate;

export function discoverFieldProofCandidates(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  index: RouteTotalityFieldProofIndex,
  cancellation: AnalysisCancellationToken,
): CollectionFieldProofCandidate[] {
  const checker = program.getTypeChecker();
  const candidates: CollectionFieldProofCandidate[] = [];
  for (const file of [...program.getSourceFiles()].sort((left, right) => left.fileName.localeCompare(right.fileName))) {
    cancellation.throwIfCancelled();
    if (file.isDeclarationFile) continue;
    visitTypeScript(ts, file, (node) => {
      if (!ts.isCallExpression(node)) return;
      candidates.push(...candidatesForFind(ts, checker, root, index, node, cancellation));
      candidates.push(...candidatesForFilterFor(ts, checker, root, index, node, cancellation));
    });
  }
  return [...new Map(candidates.map((candidate) => [fullCandidateProofKey(candidate), candidate])).values()]
    .sort((left, right) => sourceOrder(left.findCall, right.findCall)
      || left.binding.id.localeCompare(right.binding.id));
}

function fullCandidateProofKey(candidate: CollectionFieldProofCandidate): string {
  return [
    candidate.targetKey,
    candidate.snapshotCall.id,
    candidate.collectionField.id,
    candidate.collectionElement.id,
    candidate.parameter.id,
    candidate.parameterValue.id,
    candidate.predicateField.id,
    candidate.predicateResult.id,
    candidate.findResult.id,
    candidate.returnExpression.id,
    candidate.accessorCall.id,
    candidate.showBinding.id,
    candidate.currentParameter.id,
    candidate.currentCall.id,
    candidate.consumerField.id,
    candidate.consumerValue.id,
    candidate.binding.id,
    candidate.occurrence.id,
    candidate.definition.id,
    candidate.renderTerminal.id,
    candidate.boundary?.binding.id ?? "",
    candidate.boundary?.receiver?.id ?? "",
    candidate.sourceField?.id ?? "",
    candidate.flow ?? "",
    candidate.dependency?.availabilityField.id ?? "",
    candidate.dependency?.mapResult.id ?? "",
    candidate.dependency?.includesResult.id ?? "",
  ].join("\0");
}

function candidatesForFind(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  findCall: TypeScript.CallExpression,
  cancellation: AnalysisCancellationToken,
): CollectionFieldProofCandidate[] {
  if (!ts.isPropertyAccessExpression(findCall.expression) || !ts.isIdentifier(findCall.expression.name)
    || !resolvesArrayFind(checker, findCall.expression.name) || findCall.arguments.length !== 1
    || !ts.isArrowFunction(findCall.arguments[0])) return [];
  const collectionAccess = findCall.expression.expression;
  if (!ts.isPropertyAccessExpression(collectionAccess) || !ts.isCallExpression(collectionAccess.expression)) return [];
  const callback = findCall.arguments[0];
  if (callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0].name)
    || callback.parameters[0].dotDotDotToken || callback.parameters[0].questionToken
    || callback.parameters[0].initializer) return [];
  const returned = exactCallbackReturnExpression(ts, callback);
  const parameterSymbol = checker.getSymbolAtLocation(callback.parameters[0].name);
  if (!returned || !parameterSymbol) return [];
  const predicateReads = parameterPropertyReads(ts, checker, returned, parameterSymbol);
  if (predicateReads.length !== 1) return [];
  const declaration = accessorDeclaration(ts, findCall);
  if (!declaration) return [];
  const accessorSymbol = checker.getSymbolAtLocation(declaration.name);
  const showUse = uniqueShowUse(ts, checker, declaration.getSourceFile(), accessorSymbol);
  if (!showUse) return [];
  const baseValues = {
    snapshotCall: index.element(collectionAccess.expression, "call"),
    collectionField: index.element(collectionAccess, "field-read"),
    collectionElement: index.element(collectionAccess, "collection-element"),
    parameter: index.element(callback.parameters[0].name, "parameter"),
    parameterValue: index.element(predicateReads[0].expression, "value"),
    predicateField: index.element(predicateReads[0], "field-read"),
    predicateResult: index.element(returned, "predicate-result"),
    findResult: index.element(findCall, "call-result"),
    returnExpression: index.element(findCall, "return-expression"),
    accessorCall: index.element(showUse.when, "call"),
    showBinding: index.element(showUse.opening, "show-binding"),
    currentParameter: index.element(showUse.render.parameters[0].name, "parameter"),
    renderTerminal: index.element(showUse.render, "render-terminal"),
  };
  if (Object.values(baseValues).some((value) => value === null)) return [];

  const boundaryConsumers = componentBoundaryConsumersForTarget(ts, checker, root, index, showUse.render, undefined);
  const scalarAliasProps = new Set(boundaryConsumers
    .filter((consumer) => consumer.boundary?.mode === "scalar-alias" && consumer.sourceField?.fieldName)
    .map((consumer) => `${consumer.boundary?.componentName}:${consumer.boundary?.propName}:${consumer.sourceField?.fieldName}`));
  const consumers: CandidateConsumer[] = [
    ...componentConsumers(ts, checker, root, showUse.render, showUse.parameter)
      .filter((consumer) => !scalarAliasProps.has(`${consumer.componentName}:${consumer.propName}:${consumer.access.name.text}`))
      .map((consumer) => {
      const binding = index.element(consumer.attribute, "component-prop-binding");
      const occurrence = index.element(consumer.opening, "component-occurrence");
      const definitionId = binding?.componentBinding?.componentDefinitionId ?? null;
      return {
        access: consumer.access,
        call: consumer.call,
        value: consumer.value,
        valueElement: index.element(consumer.value, elementKindForExpression(ts, consumer.value)),
        binding,
        occurrence,
        definition: definitionId ? index.byId(definitionId) : null,
        componentName: consumer.componentName,
        componentIdentity: compilerIdentityForNode(ts, checker, consumer.opening.tagName),
        ownerIdentity: enclosingOwnerIdentity(ts, checker, showUse.render),
        tagModule: importModule(ts, checker, consumer.opening.tagName),
        propName: consumer.propName,
        kind: consumer.kind,
        direct: false,
        boundary: null,
        sourceField: null,
        evidenceLabel: typeof binding?.attributes?.label === "string" ? binding.attributes.label : null,
        terminal: null,
      };
    }),
    ...directConsumers(ts, checker, root, index, showUse.render, showUse.parameter),
    ...boundaryConsumers,
  ];
  return consumers.flatMap((consumer) => {

    const consumerField = index.element(consumer.access, "field-read");
    if (!consumerField) return [];
    const currentCall = index.element(consumer.call, "call");
    if (!currentCall) return [];
    const targetSelector = genericTargetForConsumer(baseValues.collectionField!, baseValues.predicateField!, consumer, consumerField.fieldName!);
    const common = {
      targetKey: fieldProofTargetKey(targetSelector),
      target: targetSelector,
      ...baseValues,
      currentCall,
      componentIdentity: consumer.componentIdentity,
      ownerIdentity: consumer.ownerIdentity,
      consumerField,
      consumerValue: consumer.valueElement,
      binding: consumer.binding,
      occurrence: consumer.occurrence,
      definition: consumer.definition,
      directConsumer: consumer.direct,
      consumerKind: targetSelector.consumer.kind,
      consumerLabel: targetSelector.consumer.label,
      boundary: consumer.boundary,
      sourceField: consumer.sourceField,
      renderTerminal: consumer.terminal ?? baseValues.renderTerminal,
    };
    if (!common.consumerValue || !common.binding || !common.occurrence || !common.definition) {
      return [];
    }
    const occurrence = common.occurrence;
    const binding = common.binding;
    const definition = common.definition;
    if (consumer.direct) {
      if (occurrence.kind !== "component-definition") return [];
    } else {
      if (!occurrence.symbol || binding.componentBinding?.componentOccurrenceElementId !== occurrence.id) return [];
      const definitionId = binding.componentBinding?.componentDefinitionId;
      if (!definitionId || definition.id !== definitionId || definition.kind !== "component-definition") return [];
      if (definition.symbol !== occurrence.symbol) return [];
    }
    cancellation.throwIfCancelled();
    return [{ mode: "collection", findCall, ...common } as CollectionFieldProofCandidate];
  });
}

function candidatesForFilterFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  filterCall: TypeScript.CallExpression,
  cancellation: AnalysisCancellationToken,
): CollectionFieldProofCandidate[] {
  if (!ts.isPropertyAccessExpression(filterCall.expression) || !ts.isIdentifier(filterCall.expression.name)
    || filterCall.expression.name.text !== "filter" || !resolvesArrayFilter(checker, filterCall.expression.name)
    || filterCall.arguments.length !== 1 || !ts.isArrowFunction(filterCall.arguments[0])) return [];
  const callback = filterCall.arguments[0];
  if (callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0].name)
    || callback.parameters[0].dotDotDotToken || callback.parameters[0].questionToken
    || callback.parameters[0].initializer) return [];
  const returned = exactCallbackReturnExpression(ts, callback);
  const parameterSymbol = checker.getSymbolAtLocation(callback.parameters[0].name);
  if (!returned || !parameterSymbol) return [];
  const predicateReads = parameterPropertyReads(ts, checker, returned, parameterSymbol);
  if (predicateReads.length !== 1) return [];
  const collectionAccess = filterCall.expression.expression;
  if (!ts.isPropertyAccessExpression(collectionAccess) || !ts.isCallExpression(collectionAccess.expression)) return [];
  const declaration = enclosingAccessor(ts, checker, filterCall);
  if (!declaration) return [];
  if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)
    || !resolvesCreateMemo(ts, checker, declaration.initializer)) return [];
  const accessorName = declaration.name;
  const accessorSymbol = checker.getSymbolAtLocation(accessorName);
  if (!accessorSymbol) return [];
  const ownerId = enclosingOwnerIdentity(ts, checker, callback);
  const base = {
    snapshotCall: index.element(collectionAccess.expression, "call"),
    collectionField: index.element(collectionAccess, "field-read"),
    collectionElement: index.element(collectionAccess, "collection-element"),
    parameter: index.element(callback.parameters[0].name, "parameter"),
    parameterValue: index.element(predicateReads[0].expression, "value"),
    predicateField: index.element(predicateReads[0], "field-read"),
    predicateResult: index.element(returned, "predicate-result"),
    findResult: index.element(filterCall, "call-result"),
    returnExpression: index.element(memoBody(ts, checker, declaration) ?? filterCall, "return-expression"),
  };
  if (Object.values(base).some((value) => value === null)) {
    return [];
  }
  const completeBase = base as {
    snapshotCall: ProgramElement; collectionField: ProgramElement; collectionElement: ProgramElement;
    parameter: ProgramElement; parameterValue: ProgramElement; predicateField: ProgramElement;
    predicateResult: ProgramElement; findResult: ProgramElement; returnExpression: ProgramElement;
  };
  const results: CollectionFieldProofCandidate[] = [];
  visitTypeScript(ts, declaration.getSourceFile(), (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
      const value = attribute.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : null;
      if (!value || !ts.isCallExpression(value) || checker.getSymbolAtLocation(value.expression) !== accessorSymbol) continue;
      const binding = index.element(attribute, "component-prop-binding");
      const boundary = binding ? resolveExactComponentBoundary(ts, checker, root, index, opening, attribute, binding) : null;
      if (!boundary || boundary.mode !== "whole-object") continue;
      const parameter = boundary.target.parameters.length === 1 && ts.isIdentifier(boundary.target.parameters[0].name)
        ? boundary.target.parameters[0].name : null;
      const parameterSymbol = parameter ? checker.getSymbolAtLocation(parameter) : undefined;
      if (!parameterSymbol) continue;
      visitTypeScript(ts, boundary.target, (child) => {
        if (!ts.isJsxElement(child) || !isSolidFor(ts, checker, child.openingElement.tagName)) return;
        const eachAttribute = child.openingElement.attributes.properties.filter((item): item is TypeScript.JsxAttribute => (
          ts.isJsxAttribute(item) && ts.isIdentifier(item.name) && item.name.text === "each"
        ));
        const eachValue = eachAttribute.length === 1 && eachAttribute[0].initializer && ts.isJsxExpression(eachAttribute[0].initializer)
          ? eachAttribute[0].initializer.expression : null;
        if (!eachValue || !ts.isPropertyAccessExpression(eachValue) || eachValue.name.text !== boundary.propName
          || !ts.isIdentifier(eachValue.expression) || checker.getSymbolAtLocation(eachValue.expression) !== parameterSymbol) return;
        const renderExpression = child.children.filter((item) => ts.isJsxExpression(item) && item.expression && ts.isArrowFunction(item.expression));
        const render = renderExpression.length === 1 && ts.isJsxExpression(renderExpression[0])
          ? renderExpression[0].expression : null;
        if (!render || !ts.isArrowFunction(render) || render.parameters.length !== 1 || !ts.isIdentifier(render.parameters[0].name)
          || render.parameters[0].dotDotDotToken || render.parameters[0].questionToken || render.parameters[0].initializer
          || !exactCallbackReturnExpression(ts, render)) return;
        const renderParameterSymbol = checker.getSymbolAtLocation(render.parameters[0].name);
        if (!renderParameterSymbol) return;
        const forBinding = index.element(child.openingElement, "for-binding");
        const forEach = index.element(eachValue, "field-read");
        const forParameter = index.element(render.parameters[0].name, "parameter");
        if (!forBinding || !forEach || !forParameter || !boundary.receiver) return;
        visitTypeScript(ts, render.body, (leaf) => {
          if (!ts.isPropertyAccessExpression(leaf) || !ts.isIdentifier(leaf.expression)
            || checker.getSymbolAtLocation(leaf.expression) !== renderParameterSymbol) return;
          const consumerField = index.element(leaf, "field-read");
          const consumerValue = index.element(leaf, "field-consumer");
          const renderTerminal = index.element(leaf, "render-terminal");
          const currentCall = index.element(value, "call");
          if (!consumerField || !consumerValue || !renderTerminal || !currentCall) return;
          const consumerKind = consumerValue.attributes?.consumerKind;
          const consumerLabel = typeof consumerValue.attributes?.label === "string" ? consumerValue.attributes.label : null;
          if (!consumerLabel || consumerKind !== "render") return;
          const target = fieldProofTargetForConsumer({
            collectionFieldName: completeBase.collectionField.fieldName!, predicateFieldName: completeBase.predicateField.fieldName!, consumerFieldName: consumerField.fieldName!,
            chain: "whole-object", componentName: boundary.componentName, componentPropName: boundary.propName,
            consumer: {
              kind: "render",
              label: consumerLabel,
              directConsumer: false,
              tagName: typeof consumerValue.attributes?.tagName === "string" ? consumerValue.attributes.tagName : undefined,
              propName: typeof consumerValue.attributes?.propName === "string" ? consumerValue.attributes.propName : undefined,
              tagModule: typeof consumerValue.module === "string" ? consumerValue.module : undefined,
            },
          });
          const dependency = crossCollectionDependencyFor(ts, checker, index, filterCall, completeBase, cancellation);
          results.push({ mode: "collection", flow: dependency ? "cross-collection" : "filter-for", dependency: dependency ?? undefined, findCall: filterCall, target, targetKey: fieldProofTargetKey(target), componentIdentity: boundary.componentIdentity, ownerIdentity: ownerId,
            ...completeBase, accessorCall: currentCall, showBinding: forBinding, currentParameter: forParameter, currentCall, forEach, consumerField, consumerValue, binding: boundary.binding,
            occurrence: boundary.occurrence, definition: boundary.definition, renderTerminal, directConsumer: false, consumerKind: "render", consumerLabel, boundary, sourceField: null, evidenceLabel: consumerLabel });
        });
      });
    }
  });
  cancellation.throwIfCancelled();
  return results;
}

function enclosingAccessor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): TypeScript.VariableDeclaration | null {
  let current: TypeScript.Node = call;
  while (current.parent) {
    current = current.parent;
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.initializer) {
      const callback = ts.isCallExpression(current.initializer) && resolvesCreateMemo(ts, checker, current.initializer)
        && current.initializer.arguments.length > 0 && ts.isArrowFunction(current.initializer.arguments[0])
          ? current.initializer.arguments[0] : null;
      if (callback) return current;
    }
    if (ts.isFunctionLike(current) && !ts.isArrowFunction(current)) return null;
  }
  return null;
}

function memoBody(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.VariableDeclaration): TypeScript.Expression | null {
  const initializer = declaration.initializer;
  if (!initializer) return null;
  const callback = ts.isCallExpression(initializer) && resolvesCreateMemo(ts, checker, initializer)
    && initializer.arguments.length > 0 && ts.isArrowFunction(initializer.arguments[0])
      ? initializer.arguments[0] : null;
  return callback && !ts.isBlock(callback.body) ? callback.body : null;
}

function isSolidFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  tag: TypeScript.JsxTagNameExpression,
): boolean {
  const symbol = checker.getSymbolAtLocation(tag);
  const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return Boolean(target?.getName() === "For" && target.declarations?.some((declaration) => (
    declaration.getSourceFile().fileName.includes("/solid-js/")
  )));
}

export function discoverScalarFieldProofCandidates(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  index: RouteTotalityFieldProofIndex,
  cancellation: AnalysisCancellationToken,
): ScalarFieldProofCandidate[] {
  const candidates: ScalarFieldProofCandidate[] = [];
  for (const file of [...program.getSourceFiles()].sort((left, right) => left.fileName.localeCompare(right.fileName))) {
    cancellation.throwIfCancelled();
    if (file.isDeclarationFile) continue;
    visitTypeScript(ts, file, (node) => {
      if (!ts.isPropertyAccessExpression(node) || !ts.isCallExpression(node.expression)
        || !node.questionDotToken || !ts.isPropertyAccessExpression(node.expression.expression)
        || node.expression.expression.name.text !== "snapshot"
        || ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) return;
      const field = index.element(node, "field-read");
      const call = index.element(node.expression, "call");
      const expression = jsxChildExpression(ts, node);
      const terminal = expression ? index.element(expression, "render-terminal") : null;
      if (!field || !call || !terminal || !field.fieldName) return;
      const definition = field.ownerId ? index.byId(field.ownerId) : null;
      if (!definition || definition.kind !== "component-definition" || !definition.symbol) return;
      const label = field.fieldName === "teamDisplayName" ? "AppShell team heading"
        : field.fieldName === "seasonName" ? "AppShell season label"
          : `${definition.label}.${field.fieldName}`;
      const binding = index.scalarFieldConsumer(field, definition, label);
      const targetKey = JSON.stringify({
        chain: "direct-scalar",
        fieldName: field.fieldName,
        consumer: { kind: "render", label, directConsumer: true },
      });
      candidates.push({
        mode: "scalar",
        targetKey,
        target: null,
        componentIdentity: definition.symbol,
        ownerIdentity: definition.symbol,
        snapshotCall: call,
        collectionField: field,
        consumerField: field,
        consumerValue: binding,
        binding,
        occurrence: definition,
        definition,
        renderTerminal: terminal,
        directConsumer: true,
        consumerKind: "render",
        consumerLabel: label,
        boundary: null,
        sourceField: null,
        targetConsumer: scalarTargetConsumer(targetKey, field, binding, definition),
      });
    });
  }
  return [...new Map(candidates.map((candidate) => [scalarCandidateKey(candidate), candidate])).values()]
    .sort((left, right) => left.collectionField.id.localeCompare(right.collectionField.id));
}

function scalarCandidateKey(candidate: ScalarFieldProofCandidate): string {
  return [candidate.targetKey, candidate.collectionField.id, candidate.binding.id, candidate.renderTerminal.id].join("\0");
}

function jsxChildExpression(
  ts: typeof TypeScript,
  field: TypeScript.PropertyAccessExpression,
): TypeScript.Expression | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxExpression(current) && !ts.isJsxAttribute(current.parent)) return current.expression ?? null;
    if (ts.isFunctionLike(current)) return null;
  }
  return null;
}

function scalarTargetConsumer(
  targetKey: string,
  field: ProgramElement,
  binding: ProgramElement,
  definition: ProgramElement,
): RouteTotalityFieldTargetConsumer {
  return {
    targetKey,
    directConsumer: true,
    consumerKind: "render",
    consumerFieldElementId: field.id,
    consumerValueElementId: binding.id,
    bindingElementId: binding.id,
    ownerDefinitionElementId: definition.id,
    consumerOwnerElementId: definition.id,
    jsx: null,
    handler: null,
    condition: null,
  };
}

function genericTargetForConsumer(
  collectionField: ProgramElement,
  predicateField: ProgramElement,
  consumer: CandidateConsumer,
  consumerFieldName: string,
): FieldProofTargetSelector {
  const boundary = consumer.boundary;
  const attributes = consumer.binding?.attributes ?? {};
  const label = genericConsumerLabel(consumer, consumerFieldName);
  const selector: FieldProofTargetSelector["consumer"] = {
    kind: consumer.kind,
    label,
    directConsumer: consumer.direct,
  };
  if (consumer.kind === "handler") {
    if (typeof attributes.actionName === "string") selector.actionName = attributes.actionName;
    if (typeof attributes.argumentName === "string") selector.argumentName = attributes.argumentName;
    if (typeof attributes.handlerReceiverName === "string") selector.handlerReceiverName = attributes.handlerReceiverName;
  } else if (boundary) {
    if (consumer.kind === "render" && consumer.componentName) {
      selector.tagName = consumer.componentName;
      selector.tagModule = consumer.componentName === "Text" && consumer.tagModule === "~/components/ui"
        ? "~/components/ui/text" : consumer.tagModule ?? undefined;
      selector.propName = consumer.propName ?? undefined;
    }
  } else if (consumer.direct) {
    if (consumer.componentName === "A" || consumer.componentName === "Show") selector.tagName = consumer.componentName;
    else if (consumer.componentName) selector.componentName = consumer.componentName;
    selector.tagModule = consumer.tagModule ?? undefined;
    selector.propName = consumer.propName ?? undefined;
  } else {
    selector.componentName = consumer.componentName ?? undefined;
    selector.propName = consumer.propName ?? undefined;
    selector.tagModule = consumer.tagModule ?? undefined;
  }
  if (!boundary) {
    if (typeof attributes.conditionOperator === "string") selector.conditionOperator = attributes.conditionOperator;
    if (typeof attributes.conditionLiteral === "string") selector.conditionLiteral = attributes.conditionLiteral;
    if (consumer.componentName === "Show" && typeof attributes.nestedShow === "boolean") selector.nestedShow = attributes.nestedShow;
  }
  if (typeof attributes.consumerCollection === "string") selector.collectionName = attributes.consumerCollection;
  return fieldProofTargetForConsumer({
    collectionFieldName: collectionField.fieldName!,
    predicateFieldName: predicateField.fieldName!,
    consumerFieldName,
    chain: boundary?.mode,
    componentName: boundary?.componentName ?? null,
    componentPropName: boundary?.propName ?? null,
    consumer: selector,
  });
}
