import type * as TypeScript from "typescript";
import { calleeName, importModule, lastName, symbolAtNode } from "./program-evidence-support";

/**
 * Reactive state pairs: a factory that returns `[getter, setter]`, where what
 * goes into the setter is what later reads of the getter see, and what the
 * factory is called with (the initial value) seeds it. One table entry per
 * factory; the mechanism is the same for each.
 */
const STATE_FACTORIES: Record<string, readonly string[]> = {
  "solid-js": ["createSignal"],
  "solid-js/store": ["createStore"],
  react: ["useState", "useReducer"],
};

/** Whether this call is a state factory. */
export function stateFactory(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.Expression): boolean {
  if (!ts.isCallExpression(call)) return false;
  const callee = call.expression;
  // `useState` imported by name, or `React.useState` through the namespace it was imported as.
  const module = importModule(ts, checker, callee) ?? (ts.isPropertyAccessExpression(callee) ? importModule(ts, checker, callee.expression) : null);
  return !!module && (STATE_FACTORIES[module]?.includes(lastName(calleeName(ts, callee))) ?? false);
}

export type StateRole = { getter: TypeScript.Identifier; role: "getter" | "setter" };

/**
 * Which half of a state pair this expression is, resolved through the
 * checker: the binding itself, a property that holds it (`{ setDoc }`,
 * `{ set: setDoc }`), or a `const` that copies either. Null otherwise.
 */
export function stateRoleOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): StateRole | null {
  let node: TypeScript.Node | undefined = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
  for (let depth = 0; node && depth < 6; depth += 1) {
    let symbol: TypeScript.Symbol | undefined = symbolAtNode(checker, node) ?? undefined;
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declaration: TypeScript.Declaration | undefined = symbol?.valueDeclaration;
    if (!declaration) return null;
    if (ts.isBindingElement(declaration) && ts.isArrayBindingPattern(declaration.parent) && ts.isVariableDeclaration(declaration.parent.parent)) {
      const index = declaration.parent.elements.indexOf(declaration);
      const first = declaration.parent.elements[0];
      const pair = declaration.parent.parent;
      if (index > 1 || !pair.initializer || !stateFactory(ts, checker, pair.initializer)) return null;
      if (!first || ts.isOmittedExpression(first) || !ts.isIdentifier(first.name)) return null;
      return { getter: first.name, role: index === 0 ? "getter" : "setter" };
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const value = checker.getShorthandAssignmentValueSymbol(declaration);
      node = value?.valueDeclaration && ts.isBindingElement(value.valueDeclaration) ? value.valueDeclaration.name : declaration.name;
      if (node === declaration.name) return null;
      continue;
    }
    const copy: boolean = ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
    const initializer: TypeScript.Expression | undefined = ts.isPropertyAssignment(declaration) || copy ? (declaration as TypeScript.PropertyAssignment | TypeScript.VariableDeclaration).initializer : undefined;
    if (!initializer || !(ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer))) return null;
    node = ts.isPropertyAccessExpression(initializer) ? initializer.name : initializer;
  }
  return null;
}
