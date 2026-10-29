import type * as TypeScript from "typescript";
import { importedCallee, symbolAtNode, unwrap } from "./program-evidence-support";
import { wrapsFunction } from "./framework-flows";

/** One step the checker proved on the way to a value's origin. */
export type ValueStep = {
  kind: "alias" | "const" | "shorthand" | "property" | "binding" | "wrapper";
  node: TypeScript.Node;
};

/**
 * Where an expression's value comes from: a function the project declares
 * (`declaration` and `origin` both the function), a parameter or an array
 * binding (`origin` the declaration itself), or the initializer it cannot
 * follow further (`origin` the expression, `declaration` its holder).
 */
export type ValueOrigin = {
  origin: TypeScript.Node;
  declaration: TypeScript.Declaration;
  steps: ValueStep[];
};

const MAX_STEPS = 8;

/** The function a wrapper call (`query(async (id) => …, "key")`, a `wraps` row) is given, or null. */
export function wrappedArgument(ts: typeof TypeScript, checker: TypeScript.TypeChecker, value: TypeScript.Expression): TypeScript.Expression | null {
  if (!ts.isCallExpression(value) || value.arguments.length === 0) return null;
  const imported = importedCallee(ts, checker, value.expression);
  return imported && wrapsFunction(imported.module, imported.name) ? unwrap(ts, value.arguments[0]) : null;
}

/**
 * What an expression's value is, through the checker: an import or export
 * alias, a `const` copy, a shorthand or property assignment (a property of an
 * object literal a function returns included, since the checker names it), a
 * destructured binding by its key, and `this.x`. Null where the value is not
 * proven to be one thing: a symbol with several declarations (a union of two
 * objects' members, overloads), a `let`, a declaration with no value
 * (`declare`, an interface member), or more than eight steps.
 */
export function resolveValue(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): ValueOrigin | null {
  const steps: ValueStep[] = [];
  const at = (node: TypeScript.Expression) => symbolAtNode(checker, ts.isPropertyAccessExpression(node) ? node.name : node) ?? undefined;
  let value = unwrap(ts, expression);
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return { origin: value, declaration: value, steps };
  if (!ts.isIdentifier(value) && !ts.isPropertyAccessExpression(value)) return null;
  let symbol = at(value);
  while (symbol && steps.length < MAX_STEPS) {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      steps.push({ kind: "alias", node: symbol.declarations?.[0] ?? value });
      symbol = checker.getAliasedSymbol(symbol);
    }
    if (symbol.declarations?.length !== 1) return null;
    const declaration = symbol.declarations[0]!;
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) return declaration.body ? { origin: declaration, declaration, steps } : null;
    if (ts.isParameter(declaration)) return { origin: declaration, declaration, steps };
    if (ts.isShorthandPropertyAssignment(declaration)) {
      steps.push({ kind: "shorthand", node: declaration });
      symbol = checker.getShorthandAssignmentValueSymbol(declaration);
      continue;
    }
    if (ts.isBindingElement(declaration)) {
      const key = declaration.propertyName ?? declaration.name;
      if (!ts.isObjectBindingPattern(declaration.parent)) return { origin: declaration, declaration, steps };
      if (declaration.dotDotDotToken || !ts.isIdentifier(key) || !isConst(ts, declaration)) return null;
      steps.push({ kind: "binding", node: declaration });
      symbol = checker.getTypeAtLocation(declaration.parent).getProperty(key.text);
      continue;
    }
    const property = ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration);
    if (!property && !(ts.isVariableDeclaration(declaration) && isConst(ts, declaration))) return null;
    const initializer = (declaration as TypeScript.PropertyAssignment | TypeScript.PropertyDeclaration | TypeScript.VariableDeclaration).initializer;
    if (!initializer) return null;
    steps.push({ kind: property ? "property" : "const", node: declaration });
    value = unwrap(ts, initializer);
    for (let wrapped = wrappedArgument(ts, checker, value); wrapped && steps.length < MAX_STEPS; wrapped = wrappedArgument(ts, checker, value)) {
      steps.push({ kind: "wrapper", node: value });
      value = wrapped;
    }
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return { origin: value, declaration: value, steps };
    if (!ts.isIdentifier(value) && !ts.isPropertyAccessExpression(value)) return { origin: value, declaration, steps };
    symbol = at(value);
  }
  return null;
}

function isConst(ts: typeof TypeScript, declaration: TypeScript.Node): boolean {
  return (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
}

/**
 * Whether an expression names several values the project declares (a
 * member of a union of two object literals' types): the checker cannot say
 * which one it is, so a caller must not guess.
 */
export function namesSeveralValues(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): boolean {
  const declarations = symbolAtNode(checker, ts.isPropertyAccessExpression(expression) ? expression.name : expression)?.declarations ?? [];
  return declarations.length > 1 && declarations.every((declaration) => !declaration.getSourceFile().isDeclarationFile);
}
