import type * as TypeScript from "typescript";
import { importedCallee, symbolAtNode, unwrap } from "./program-evidence-support";
import { frameworkFlow, wrappedPosition } from "./framework-flows";

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
  const at = imported ? wrappedPosition(imported.module, imported.name) : null;
  return at !== null && value.arguments[at] ? unwrap(ts, value.arguments[at]) : null;
}

/** The function under any wrappers (`on(source, fn)` in `createMemo(on(source, fn))`), else the expression. */
export function throughWrappers(ts: typeof TypeScript, checker: TypeScript.TypeChecker, value: TypeScript.Expression): TypeScript.Expression {
  let current = value;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const inner = wrappedArgument(ts, checker, current);
    if (!inner) break;
    current = inner;
  }
  return current;
}

/** Whether calling this runs a function through a wrapper that fills its parameters itself (`on`'s fills them from its source), so the call's arguments do not bind them. */
export function wrapperFillsParameters(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): boolean {
  return (resolveValue(ts, checker, callee)?.steps ?? []).some((step) => {
    if (step.kind !== "wrapper" || !ts.isCallExpression(step.node)) return false;
    const imported = importedCallee(ts, checker, step.node.expression);
    return imported !== null && frameworkFlow(imported.module, imported.name)?.source !== undefined;
  });
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
    // A property the checker declares by its one assignment (JavaScript's `Account.prototype.describe = function …`, an expando `f.x = …`): every assignment of such a property is a declaration, so one declaration is one value.
    const assigned = ts.isPropertyAccessExpression(declaration) && ts.isBinaryExpression(declaration.parent) && declaration.parent.left === declaration && declaration.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken ? declaration.parent.right : undefined;
    const property = ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration) || assigned !== undefined;
    if (!property && !(ts.isVariableDeclaration(declaration) && isConst(ts, declaration))) return null;
    const initializer = assigned ?? (declaration as TypeScript.PropertyAssignment | TypeScript.PropertyDeclaration | TypeScript.VariableDeclaration).initializer;
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

/** The prototypes a value parsed from JSON can have, besides `Object`'s, which all of them share. */
const JSON_PROTOTYPES = ["Array", "String", "Number", "Boolean"] as const;
const libInterfacesByChecker = new WeakMap<TypeScript.TypeChecker, Map<string, TypeScript.Type | null>>();

/** The declared type of one of TypeScript's own lib interfaces (`Array`), found from a file's global scope. */
function libInterface(ts: typeof TypeScript, checker: TypeScript.TypeChecker, at: TypeScript.Node, name: string): TypeScript.Type | null {
  const known = libInterfacesByChecker.get(checker) ?? libInterfacesByChecker.set(checker, new Map()).get(checker)!;
  if (!known.has(name)) {
    // A package may augment a global interface; the lib's own declaration names it.
    const symbol = checker.getSymbolsInScope(at.getSourceFile(), ts.SymbolFlags.Interface).find((item) => item.name === name && item.declarations?.some((declaration) => declaration.getSourceFile().hasNoDefaultLib));
    known.set(name, symbol ? checker.getDeclaredTypeOfSymbol(symbol) : null);
  }
  return known.get(name)!;
}

/** Whether an expression's value is what JSON parsing made: `JSON.parse(text)` or a fetch `Response`'s `json()`, awaited or not, through `const` copies. */
export function parsedFromJson(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): boolean {
  const value = unwrap(ts, expression);
  const origin = ts.isCallExpression(value) ? value : resolveValue(ts, checker, value)?.origin;
  const call = origin && ts.isExpression(origin) ? unwrap(ts, origin) : undefined;
  if (!call || !ts.isCallExpression(call)) return false;
  const callee = unwrap(ts, call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const declarations = checker.getSymbolAtLocation(callee.name)?.declarations ?? [];
  const declaration = declarations.length === 1 ? declarations[0]! : null;
  const owner = declaration && declaration.getSourceFile().hasNoDefaultLib && ts.isInterfaceDeclaration(declaration.parent) ? declaration.parent.name.text : null;
  return (owner === "Body" && callee.name.text === "json") || (owner === "JSON" && callee.name.text === "parse");
}

/**
 * The standard method a call on an untyped (`any`) value runs, when that
 * value was parsed from JSON (`parsedFromJson`). Such a value is only ever
 * null, a boolean, a number, a string, an array or a plain object, and none
 * of them holds a function of its own: a method call that runs at all runs
 * its prototype's method. When exactly one of those prototypes declares the
 * name (`map` is only `Array`'s), the call is that method: `{ owner, name }`.
 * Null for a typed receiver, any other origin, or a name several declare.
 */
export function jsonValueMember(ts: typeof TypeScript, checker: TypeScript.TypeChecker, access: TypeScript.Expression): { owner: string; name: string } | null {
  const node = unwrap(ts, access);
  if (!ts.isPropertyAccessExpression(node) || !(checker.getTypeAtLocation(node.expression).flags & ts.TypeFlags.Any)) return null;
  if (!parsedFromJson(ts, checker, node.expression)) return null;
  const name = node.name.text;
  if (libInterface(ts, checker, node, "Object")?.getProperty(name)) return null;
  const owners = JSON_PROTOTYPES.filter((owner) => libInterface(ts, checker, node, owner)?.getProperty(name));
  return owners.length === 1 ? { owner: owners[0]!, name } : null;
}
