import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { exactCallbackReturnExpression } from "./program-callback-return";
import { unwrap } from "./program-evidence-support";
import {
  resolvesArrayFilter,
  resolvesArrayIncludes,
  resolvesArrayMap,
  resolvesCreateMemo,
} from "./route-totality-field-proof-ast";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import type { CollectionFieldProofCandidate, CollectionMembershipProofCandidate } from "./route-totality-field-proof-candidate";
import type { ProgramElement } from "./scope-seam";

type PlayersBase = Pick<CollectionFieldProofCandidate, "collectionField" | "predicateField" | "predicateResult" | "findResult" | "returnExpression">;

export function crossCollectionDependencyFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  index: RouteTotalityFieldProofIndex,
  playersFilterCall: TypeScript.CallExpression,
  playersBase: PlayersBase,
  cancellation: AnalysisCancellationToken,
): CollectionMembershipProofCandidate | null {
  if (!ts.isArrowFunction(playersFilterCall.arguments[0])) return null;
  const playersCallback = playersFilterCall.arguments[0];
  if (playersCallback.parameters.length !== 1 || !ts.isIdentifier(playersCallback.parameters[0].name)) return null;
  const playersParameterSymbol = checker.getSymbolAtLocation(playersCallback.parameters[0].name);
  const playersReturned = exactCallbackReturnExpression(ts, playersCallback);
  if (!playersParameterSymbol || !playersReturned || !ts.isCallExpression(playersReturned)
    || !ts.isPropertyAccessExpression(playersReturned.expression)
    || !ts.isIdentifier(playersReturned.expression.name)
    || !resolvesArrayIncludes(checker, playersReturned.expression.name)
    || playersReturned.arguments.length !== 1
    || !ts.isPropertyAccessExpression(playersReturned.arguments[0])
    || !ts.isIdentifier(playersReturned.arguments[0].expression)
    || checker.getSymbolAtLocation(playersReturned.arguments[0].expression) !== playersParameterSymbol) return null;
  const availableIdsCallAst = playersReturned.expression.expression;
  if (!ts.isCallExpression(availableIdsCallAst) || !ts.isIdentifier(availableIdsCallAst.expression)) return null;
  const availableIdsSymbol = checker.getSymbolAtLocation(availableIdsCallAst.expression);
  const availableIdsDeclaration = availableIdsSymbol?.valueDeclaration
    ?? availableIdsSymbol?.declarations?.find((declaration): declaration is TypeScript.VariableDeclaration => ts.isVariableDeclaration(declaration));
  if (!availableIdsDeclaration || !ts.isVariableDeclaration(availableIdsDeclaration)
    || !availableIdsDeclaration.initializer || !ts.isCallExpression(availableIdsDeclaration.initializer)
    || !resolvesCreateMemo(ts, checker, availableIdsDeclaration.initializer)
    || availableIdsDeclaration.initializer.arguments.length !== 1
    || !ts.isArrowFunction(availableIdsDeclaration.initializer.arguments[0])
    || ts.isBlock(availableIdsDeclaration.initializer.arguments[0].body)) return null;
  const mapCall = exactMemoExpression(ts, availableIdsDeclaration.initializer.arguments[0].body);
  if (!ts.isCallExpression(mapCall) || !ts.isPropertyAccessExpression(mapCall.expression)
    || !ts.isIdentifier(mapCall.expression.name) || mapCall.expression.name.text !== "map"
    || !resolvesArrayMap(checker, mapCall.expression.name)
    || mapCall.arguments.length !== 1 || !ts.isArrowFunction(mapCall.arguments[0])) return null;
  const mapCallback = mapCall.arguments[0];
  if (mapCallback.parameters.length !== 1 || !ts.isIdentifier(mapCallback.parameters[0].name)) return null;
  const mapParameterSymbol = checker.getSymbolAtLocation(mapCallback.parameters[0].name);
  const mapReturned = exactCallbackReturnExpression(ts, mapCallback);
  if (!mapParameterSymbol || !mapReturned || !ts.isPropertyAccessExpression(mapReturned)
    || !ts.isIdentifier(mapReturned.expression)
    || checker.getSymbolAtLocation(mapReturned.expression) !== mapParameterSymbol) return null;
  const availabilityFilterCall = mapCall.expression.expression;
  if (!ts.isCallExpression(availabilityFilterCall) || !ts.isPropertyAccessExpression(availabilityFilterCall.expression)
    || !ts.isIdentifier(availabilityFilterCall.expression.name)
    || availabilityFilterCall.expression.name.text !== "filter"
    || !resolvesArrayFilter(checker, availabilityFilterCall.expression.name)
    || availabilityFilterCall.arguments.length !== 1 || !ts.isArrowFunction(availabilityFilterCall.arguments[0])) return null;
  const availabilityCallback = availabilityFilterCall.arguments[0];
  if (availabilityCallback.parameters.length !== 1 || !ts.isIdentifier(availabilityCallback.parameters[0].name)) return null;
  const availabilityParameterSymbol = checker.getSymbolAtLocation(availabilityCallback.parameters[0].name);
  const availabilityReturned = exactCallbackReturnExpression(ts, availabilityCallback);
  if (!availabilityParameterSymbol || !availabilityReturned) return null;
  if (!ts.isPropertyAccessExpression(availabilityFilterCall.expression)
    || !ts.isPropertyAccessExpression(playersFilterCall.expression)) return null;
  const availabilityCollectionAccess = availabilityFilterCall.expression.expression;
  const playersCollectionAccess = playersFilterCall.expression.expression;
  if (!ts.isPropertyAccessExpression(availabilityCollectionAccess)
    || !ts.isPropertyAccessExpression(playersCollectionAccess)
    || !ts.isCallExpression(availabilityCollectionAccess.expression)
    || !ts.isCallExpression(playersCollectionAccess.expression)
    || !sameSnapshotCall(ts, checker, availabilityCollectionAccess.expression, playersCollectionAccess.expression)) return null;
  const compoundPredicate = exactCompoundPredicate(ts, checker, index, availabilityReturned, availabilityParameterSymbol);
  if (!compoundPredicate) return null;
  const values = {
    availabilityField: index.element(availabilityCollectionAccess, "field-read"),
    targetCollectionField: index.element(playersCollectionAccess, "field-read"),
    targetKeyField: index.element(playersReturned.arguments[0], "field-read"),
    availabilityElement: index.element(availabilityCollectionAccess, "collection-element"),
    availabilityParameter: index.element(availabilityCallback.parameters[0].name, "parameter"),
    predicateFields: compoundPredicate.fields,
    predicateOperators: compoundPredicate.operators,
    predicateRightCategories: compoundPredicate.rightCategories,
    availabilityPredicate: index.element(availabilityReturned, "predicate-result"),
    availabilityFilterResult: index.element(availabilityFilterCall, "call-result"),
    mapElement: index.element(availabilityFilterCall, "collection-element"),
    mapParameter: index.element(mapCallback.parameters[0].name, "parameter"),
    mappedField: index.element(mapReturned, "field-read"),
    mapResult: index.element(mapCall, "call-result"),
    availabilityReturnExpression: index.element(availableIdsDeclaration.initializer.arguments[0].body, "return-expression"),
    availableIdsCall: index.element(availableIdsCallAst, "call"),
    includesResult: index.element(playersReturned, "predicate-result"),
  };
  if (Object.values(values).some((value) => value === null)
    || values.targetCollectionField!.id !== playersBase.collectionField.id
    || values.targetKeyField!.id !== playersBase.predicateField.id) return null;
  cancellation.throwIfCancelled();
  return values as CollectionMembershipProofCandidate;
}

function exactMemoExpression(
  ts: typeof TypeScript,
  body: TypeScript.Expression,
): TypeScript.Expression {
  const expression = unwrap(ts, body);
  const fallback = ts.isBinaryExpression(expression) ? unwrap(ts, expression.right) : null;
  if (ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    && fallback && ts.isArrayLiteralExpression(fallback)
    && fallback.elements.length === 0) {
    return unwrap(ts, expression.left);
  }
  return expression;
}

function exactCompoundPredicate(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  index: RouteTotalityFieldProofIndex,
  expression: TypeScript.Expression,
  parameter: TypeScript.Symbol,
): { fields: readonly [ProgramElement, ProgramElement]; operators: readonly [string, string]; rightCategories: readonly [string, string] } | null {
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return null;
  const comparisons = [expression.left, expression.right];
  const evidence = comparisons.map((comparison) => {
    if (!ts.isBinaryExpression(comparison) || comparison.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
      || !ts.isPropertyAccessExpression(comparison.left)
      || !ts.isIdentifier(comparison.left.expression)
      || checker.getSymbolAtLocation(comparison.left.expression) !== parameter) return null;
    const field = index.element(comparison.left, "field-read");
    return field ? { field, operator: comparison.operatorToken.getText(comparison.getSourceFile()), rightCategory: rightCategory(ts, comparison.right) } : null;
  });
  if (evidence.some((item) => item === null)) return null;
  const [first, second] = evidence as [{ field: ProgramElement; operator: string; rightCategory: string }, { field: ProgramElement; operator: string; rightCategory: string }];
  if (first.field.id === second.field.id || !first.rightCategory || !second.rightCategory) return null;
  return {
    fields: [first.field, second.field],
    operators: [first.operator, second.operator],
    rightCategories: [first.rightCategory, second.rightCategory],
  };
}

function rightCategory(ts: typeof TypeScript, expression: TypeScript.Expression): string {
  if (ts.isPropertyAccessExpression(expression)) return "property-access";
  if (ts.isElementAccessExpression(expression)) return "element-access";
  if (ts.isStringLiteral(expression)) return "string-literal";
  if (ts.isNumericLiteral(expression)) return "numeric-literal";
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) return "boolean-literal";
  if (expression.kind === ts.SyntaxKind.NullKeyword) return "null-literal";
  return "compiler-expression";
}

function sameSnapshotCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  left: TypeScript.CallExpression,
  right: TypeScript.CallExpression,
): boolean {
  if (!ts.isPropertyAccessExpression(left.expression) || !ts.isPropertyAccessExpression(right.expression)) return false;
  const leftReceiver = checker.getSymbolAtLocation(left.expression.expression)
    ?? checker.getTypeAtLocation(left.expression.expression).getSymbol();
  const rightReceiver = checker.getSymbolAtLocation(right.expression.expression)
    ?? checker.getTypeAtLocation(right.expression.expression).getSymbol();
  return left.expression.name.text === "snapshot"
    && right.expression.name.text === "snapshot"
    && checker.getSymbolAtLocation(left.expression.name) === checker.getSymbolAtLocation(right.expression.name)
    && leftReceiver !== undefined
    && leftReceiver === rightReceiver;
}
