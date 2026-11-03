import type * as TypeScript from "typescript";
import { importedCallee } from "./program-evidence-support";
import { resolveValue } from "./value-origin";
import { callsInitialValue, makesStatePair, reducerArgument } from "./framework-flows";

/**
 * Reactive state pairs: a factory (a `state-pair` row) that returns
 * `[getter, setter]`, where what goes into the setter is what later reads of
 * the getter see, and what the factory is called with (the initial value)
 * seeds it. The mechanism is the same for each factory.
 */

/** Whether this call is a state factory. */
export function stateFactory(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.Expression): boolean {
  if (!ts.isCallExpression(call)) return false;
  const factory = importedCallee(ts, checker, call.expression);
  return !!factory && makesStatePair(factory.module, factory.name);
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

/** The reducer of a reducer pair (`useReducer(reducer, …)`, the row's `args`), which its dispatch calls with the action; null for any other pair. */
export function reducerOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, getter: TypeScript.Identifier): TypeScript.Expression | null {
  const pair = getter.parent.parent.parent;
  if (!ts.isVariableDeclaration(pair) || !pair.initializer || !ts.isCallExpression(pair.initializer)) return null;
  const factory = importedCallee(ts, checker, pair.initializer.expression);
  const at = factory ? reducerArgument(factory.module, factory.name) : null;
  return at === null ? null : pair.initializer.arguments[at] ?? null;
}

/** The getter of the state pair this factory call makes, when the factory calls a function initial value (`const [n] = useState(() => …)`); null otherwise. */
export function lazyFactoryGetter(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): TypeScript.Identifier | null {
  const factory = importedCallee(ts, checker, call.expression);
  if (!factory || !callsInitialValue(factory.module, factory.name)) return null;
  const pair = call.parent;
  const first = ts.isVariableDeclaration(pair) && pair.initializer === call && ts.isArrayBindingPattern(pair.name) ? pair.name.elements[0] : undefined;
  return first && ts.isBindingElement(first) && ts.isIdentifier(first.name) ? first.name : null;
}

/**
 * The initial value a destructured state pair is seeded with as it is
 * (`createStore({ left, right })`), which becomes the state whole, so its
 * fields stay apart; null for a factory that calls its initial value or
 * takes a reducer, a function held as the state, and a pair that is not
 * destructured.
 */
export function seedArgument(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): TypeScript.Expression | null {
  const factory = importedCallee(ts, checker, call.expression);
  if (!factory || !makesStatePair(factory.module, factory.name) || callsInitialValue(factory.module, factory.name) || reducerArgument(factory.module, factory.name) !== null) return null;
  const pair = call.parent;
  const seed = call.arguments[0];
  // A function held as the state is found through its call (`make()()`), so it keeps its argument edge.
  if (!seed || ts.isSpreadElement(seed) || ts.isArrowFunction(seed) || ts.isFunctionExpression(seed)) return null;
  return ts.isVariableDeclaration(pair) && pair.initializer === call && ts.isArrayBindingPattern(pair.name) ? seed : null;
}
