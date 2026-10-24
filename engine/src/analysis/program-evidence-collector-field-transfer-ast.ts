import * as TypeScript from "typescript";
import { asFunctionLike, unwrap } from "./program-evidence-support";
import { isStandardTypeScriptLibraryDeclaration } from "./route-totality-field-proof-ast";

export function directParameterReads(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  visit: (node: TypeScript.Node, callback: (node: TypeScript.Node) => void) => void,
  expression: TypeScript.Expression,
  parameter: TypeScript.Symbol,
): TypeScript.PropertyAccessExpression[] {
  const matches: TypeScript.PropertyAccessExpression[] = [];
  visit(expression, (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && checker.getSymbolAtLocation(node.expression) === parameter) matches.push(node);
  });
  return matches;
}

export function returnedByFunction(
  ts: typeof TypeScript,
  expression: TypeScript.Expression,
): { expression: TypeScript.Expression; declaration: TypeScript.FunctionLikeDeclaration } | null {
  const parent = expression.parent;
  if (ts.isArrowFunction(parent) && unwrap(ts, parent.body as TypeScript.Expression) === expression) {
    return { expression, declaration: parent };
  }
  if (ts.isReturnStatement(parent) && parent.expression === expression) {
    let current: TypeScript.Node | undefined = parent.parent;
    while (current) {
      const declaration = asFunctionLike(ts, current);
      if (declaration) return { expression, declaration };
      current = current.parent;
    }
  }
  return null;
}

export function resolvesArrayMethod(
  checker: TypeScript.TypeChecker,
  name: TypeScript.Identifier,
): boolean {
  return Boolean(checker.getSymbolAtLocation(name)?.declarations?.some((declaration) => (
    declaration.getSourceFile().isDeclarationFile
    && isStandardTypeScriptLibraryDeclaration(declaration.getSourceFile().fileName)
  )));
}

export function isSolidComponent(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  tag: TypeScript.JsxTagNameExpression,
  name: "Show" | "For",
): boolean {
  const symbol = checker.getSymbolAtLocation(tag);
  const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return Boolean(target?.declarations?.some((declaration) => (
    declaration.getSourceFile().fileName.includes("/solid-js/") && target.getName() === name
  )));
}

export function staticAttributeName(
  ts: typeof TypeScript,
  attribute: TypeScript.JsxAttribute,
): string | null {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : null;
}

export function directJsxChild(
  ts: typeof TypeScript,
  field: TypeScript.PropertyAccessExpression,
): TypeScript.JsxOpeningLikeElement | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxExpression(current)) {
      if (!current.expression || current.expression !== field || !ts.isJsxElement(current.parent)) return null;
      return current.parent.openingElement;
    }
    if (ts.isJsxAttribute(current) || ts.isFunctionLike(current)) return null;
  }
  return null;
}
