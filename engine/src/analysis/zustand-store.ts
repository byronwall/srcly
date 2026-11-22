import type * as TypeScript from "typescript";
import { makesStore } from "./framework-flows";
import { importedCallee, unwrap } from "./program-evidence-support";

/**
 * Type facts for a zustand store (a `store` row). A store's state creator is
 * the function that makes its state: the function handed to `create`, or the
 * one a middleware takes and hands back. The checker says which is which, so
 * no middleware is named: a call whose parameter and result are both a
 * `StateCreator` (persist, immer, devtools…) passes its creator through. A
 * slice creator the store's function calls with its own `(set, get, api)` is
 * a creator of the same store.
 */

export type StoreCreator = TypeScript.ArrowFunction | TypeScript.FunctionExpression;

/** Whether the alias the type was written with is the named one, declared by the named package (its `.d.ts` or a `declare module`). */
function declaredBy(ts: typeof TypeScript, type: TypeScript.Type | undefined, names: readonly string[], pkg: string): boolean {
  const alias = type?.aliasSymbol;
  if (!alias || !names.includes(alias.getName())) return false;
  return (alias.declarations ?? []).some((declaration) => {
    const module = ts.findAncestor(declaration, ts.isModuleDeclaration);
    if (module && ts.isStringLiteral(module.name)) return module.name.text === pkg || module.name.text.startsWith(`${pkg}/`);
    return declaration.getSourceFile().fileName.includes(`/node_modules/${pkg}/`);
  });
}

/** Whether a type is zustand's `StateCreator`. */
export function isStateCreator(ts: typeof TypeScript, type: TypeScript.Type | undefined): boolean {
  return declaredBy(ts, type, ["StateCreator"], "zustand");
}

/**
 * The state creator an expression makes: the function itself, or, through a
 * call whose first parameter and result are both `StateCreator`s, the creator
 * it is handed. Null for anything else.
 */
export function storeCreator(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression): StoreCreator | null {
  let value = unwrap(ts, node);
  for (let depth = 0; depth < 8; depth += 1) {
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return value;
    if (!ts.isCallExpression(value) || !value.arguments[0]) return null;
    const signature = checker.getResolvedSignature(value);
    const declared = signature?.getDeclaration();
    // The declared signature keeps the alias as written (`StateCreator<T, …>`); an instantiated one may not.
    const parameterType = declared?.parameters[0] ? checker.getTypeAtLocation(declared.parameters[0]) : undefined;
    const resultType = declared?.type ? checker.getTypeAtLocation(declared.type) : signature?.getReturnType();
    if (!isStateCreator(ts, parameterType) || !isStateCreator(ts, resultType)) return null;
    value = unwrap(ts, value.arguments[0]);
  }
  return null;
}

/** Whether a parameter is an immer draft (`Draft<T>`): what is written into it becomes the next state. */
export function isImmerDraft(ts: typeof TypeScript, checker: TypeScript.TypeChecker, parameter: TypeScript.ParameterDeclaration): boolean {
  return declaredBy(ts, checker.getTypeAtLocation(parameter.name), ["Draft", "WritableDraft"], "immer");
}

/** The function a name is bound to (`const fishSlice = (set) => …`), or null. */
function boundFunction(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression): StoreCreator | null {
  const name = unwrap(ts, node);
  const declaration = ts.isIdentifier(name) ? checker.getSymbolAtLocation(name)?.valueDeclaration : undefined;
  const value = declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? unwrap(ts, declaration.initializer) : undefined;
  return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : null;
}

/** The slice creators a store's function calls with its own `(set, get, api)` (`fishSlice(...a)`): each is a `StateCreator` of the same store. */
function sliceCreators(ts: typeof TypeScript, checker: TypeScript.TypeChecker, fn: StoreCreator): StoreCreator[] {
  const own = new Set(fn.parameters.map((parameter) => (ts.isIdentifier(parameter.name) ? checker.getSymbolAtLocation(parameter.name) : undefined)).filter(Boolean));
  const found: StoreCreator[] = [];
  const visit = (node: TypeScript.Node) => {
    if (ts.isFunctionLike(node)) return;
    const forwards = ts.isCallExpression(node) && node.arguments.length > 0 && node.arguments.every((argument) => {
      const passed = ts.isSpreadElement(argument) ? argument.expression : argument;
      return ts.isIdentifier(passed) && own.has(checker.getSymbolAtLocation(passed));
    });
    if (forwards && isStateCreator(ts, checker.getTypeAtLocation(node.expression))) {
      const target = boundFunction(ts, checker, node.expression);
      if (target && !found.includes(target)) found.push(target);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return found;
}

/** The store a `create` call makes (`create(fn)`, curried `create<T>()(fn)`): its creators, the store's own function first. Null for any other call. */
export function storeCreators(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): StoreCreator[] | null {
  if (!call.arguments[0]) return null;
  const curried = ts.isCallExpression(call.expression) ? call.expression : null;
  const imported = importedCallee(ts, checker, (curried ?? call).expression);
  if (!imported || !makesStore(imported.module, imported.name)) return null;
  const fn = storeCreator(ts, checker, call.arguments[0]);
  return fn ? [fn, ...sliceCreators(ts, checker, fn)] : null;
}

const hookCreators = new WeakMap<TypeScript.Symbol, StoreCreator[] | null>();

/** The creators of the store a hook names (`useStore` after `const useStore = create(…)`), or null. */
export function storeOfHook(ts: typeof TypeScript, checker: TypeScript.TypeChecker, hook: TypeScript.Symbol | undefined): StoreCreator[] | null {
  if (!hook) return null;
  if (!hookCreators.has(hook)) {
    const declaration = hook.valueDeclaration;
    const value = declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? unwrap(ts, declaration.initializer) : undefined;
    hookCreators.set(hook, value && ts.isCallExpression(value) ? storeCreators(ts, checker, value) : null);
  }
  return hookCreators.get(hook) ?? null;
}

/** `useStore.getState()` or `useStore.setState(…)`: zustand's store API, which every store hook carries. */
export function storeApiCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.CallExpression): { hook: TypeScript.Symbol; name: "getState" | "setState" } | null {
  const callee = unwrap(ts, node.expression);
  if (!ts.isPropertyAccessExpression(callee) || (callee.name.text !== "getState" && callee.name.text !== "setState")) return null;
  const receiver = unwrap(ts, callee.expression);
  const hook = ts.isIdentifier(receiver) ? checker.getSymbolAtLocation(receiver) : undefined;
  return hook && storeOfHook(ts, checker, hook) ? { hook, name: callee.name.text } : null;
}

/**
 * The function a store's member names, read through its hook: `setCount`
 * after `const setCount = useStore((s) => s.setCount)`, a destructured
 * `const { setCount } = useStore()`, or `useStore.getState().setCount`
 * (directly or through a name bound to the state): the `setCount` of the
 * object one of the store's creators returns.
 */
export function storeMember(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): TypeScript.Node[] {
  const node = unwrap(ts, callee);
  let creators: StoreCreator[] | null = null;
  let name: string | undefined;
  if (ts.isPropertyAccessExpression(node)) {
    let read = unwrap(ts, node.expression);
    const bound = ts.isIdentifier(read) ? checker.getSymbolAtLocation(read)?.valueDeclaration : undefined;
    if (bound && ts.isVariableDeclaration(bound) && bound.initializer) read = unwrap(ts, bound.initializer);
    const api = ts.isCallExpression(read) ? storeApiCall(ts, checker, read) : null;
    if (api?.name !== "getState") return [];
    creators = storeOfHook(ts, checker, api.hook);
    name = node.name.text;
  } else if (ts.isIdentifier(node)) {
    const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
    let read: TypeScript.Expression | undefined;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      read = unwrap(ts, declaration.initializer);
      const selector = ts.isCallExpression(read) && read.arguments[0] ? unwrap(ts, read.arguments[0]) : undefined;
      const body = selector && ts.isArrowFunction(selector) && !ts.isBlock(selector.body) ? unwrap(ts, selector.body) : undefined;
      name = body && ts.isPropertyAccessExpression(body) ? body.name.text : undefined;
    } else if (declaration && ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent) && ts.isVariableDeclaration(declaration.parent.parent) && declaration.parent.parent.initializer) {
      read = unwrap(ts, declaration.parent.parent.initializer);
      const key = declaration.propertyName ?? declaration.name;
      name = ts.isIdentifier(key) ? key.text : undefined;
    }
    if (name && read && ts.isCallExpression(read) && ts.isIdentifier(read.expression)) creators = storeOfHook(ts, checker, checker.getSymbolAtLocation(read.expression));
  }
  if (!creators || !name) return [];
  for (const creator of creators) {
    const made = !ts.isBlock(creator.body) ? unwrap(ts, creator.body) : undefined;
    if (!made || !ts.isObjectLiteralExpression(made)) continue;
    const member = made.properties.find((property) => property.name && ts.isIdentifier(property.name) && property.name.text === name);
    if (member && ts.isPropertyAssignment(member)) return [member.initializer];
    if (member && ts.isMethodDeclaration(member)) return [member];
  }
  return [];
}

/**
 * Whether a call writes a store: a creator's own `set` (the first parameter
 * of a function typed as a `StateCreator`) or `useStore.setState(…)`. The
 * store model carries what it receives into the state, so it is never an
 * assumed external effect.
 */
export function writesStore(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.CallExpression): boolean {
  if (storeApiCall(ts, checker, node)?.name === "setState") return true;
  const callee = unwrap(ts, node.expression);
  const declaration = ts.isIdentifier(callee) ? checker.getSymbolAtLocation(callee)?.valueDeclaration : undefined;
  const fn = declaration && ts.isParameter(declaration) ? declaration.parent : undefined;
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || fn.parameters[0] !== declaration) return false;
  return isStateCreator(ts, checker.getContextualType(fn));
}
