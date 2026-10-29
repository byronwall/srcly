import type * as TypeScript from "typescript";
import { calleeName, importModule, lastName } from "./program-evidence-support";
import { resolveValue } from "./value-origin";

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
  const binding = resolveValue(ts, checker, expression)?.origin;
  if (!binding || !ts.isBindingElement(binding) || !ts.isArrayBindingPattern(binding.parent) || !ts.isVariableDeclaration(binding.parent.parent)) return null;
  const index = binding.parent.elements.indexOf(binding);
  const first = binding.parent.elements[0];
  const pair = binding.parent.parent;
  if (index > 1 || !pair.initializer || !stateFactory(ts, checker, pair.initializer)) return null;
  if (!first || ts.isOmittedExpression(first) || !ts.isIdentifier(first.name)) return null;
  return { getter: first.name, role: index === 0 ? "getter" : "setter" };
}

/** The reducer of a `useReducer` pair (its first argument), which its dispatch calls with the action; null for any other pair. */
export function reducerOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, getter: TypeScript.Identifier): TypeScript.Expression | null {
  const pair = getter.parent.parent.parent;
  if (!ts.isVariableDeclaration(pair) || !pair.initializer || !ts.isCallExpression(pair.initializer)) return null;
  const callee = pair.initializer.expression;
  const module = importModule(ts, checker, callee) ?? (ts.isPropertyAccessExpression(callee) ? importModule(ts, checker, callee.expression) : null);
  return module === "react" && lastName(calleeName(ts, callee)) === "useReducer" ? pair.initializer.arguments[0] ?? null : null;
}
