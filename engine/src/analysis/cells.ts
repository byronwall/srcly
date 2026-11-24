import type * as TypeScript from "typescript";
import { frameworkFlow, frameworkRow, makesAccessor, rowPaths, type Flow, type FrameworkFlow } from "./framework-flows";
import type { LibraryModelRow } from "./library-models";
import { importedCallee, unwrap } from "./program-evidence-support";
import { resolveValue } from "./value-origin";

/**
 * Cells: library calls that make one state each time they run (a `cell` row:
 * `createSignal`, `useState`, `useReducer`, `createStore`, zustand's
 * `create`, `createResource`). The row's access paths say where the state is
 * seeded (`init`), written (`writes`) and read (`reads`), through the handles
 * the call returns (`ReturnValue.Member[1]`, a setter) or hands its function
 * (`Argument[0].Parameter[0]`, a store's `set`). These readers find a call's
 * cell and the handle an expression names; the collector emits the edges.
 * Each call is its own state, anchored at the binding that holds it, so two
 * calls never share one.
 */

type Field = "init" | "writes" | "reads";

/** A cell row's paths in one field (a `consumes` row's `writes: "this"` is not paths). */
function paths(row: LibraryModelRow, field: Field): string[] {
  const value = row[field];
  return Array.isArray(value) ? value : [];
}

/** A `cell` row for an imported call, or null. */
export function cellRow(module: string, name: string): LibraryModelRow | null {
  const row = frameworkRow(module, name);
  return row?.model === "cell" ? row : null;
}

/** Whether the row names this path in a field. */
export function cellHas(row: LibraryModelRow, field: Field, path: string): boolean {
  return paths(row, field).includes(path);
}

/** Whether a cell holds a state (it names where the state is seeded, written or read); a watch row names only `yields`. */
export function holdsState(row: LibraryModelRow | null): boolean {
  return !!row && row.model === "cell" && (["init", "writes", "reads"] as const).some((field) => paths(row, field).length);
}

/** Whether the cell's handles are a `[value, setter]` tuple (`ReturnValue.Member[0]`), as for a state pair. */
export function pairShaped(row: LibraryModelRow): boolean {
  return !settlesAsync(row) && [...paths(row, "init"), ...paths(row, "writes"), ...paths(row, "reads")].some((path) => path.startsWith("ReturnValue.Member[0]"));
}

/** Whether the state is seeded by what a fetcher settles to (`createResource`): the call is an asynchronous input. */
export function settlesAsync(row: LibraryModelRow | null): boolean {
  return !!row && row.model === "cell" && paths(row, "init").some((path) => path.endsWith(".Awaited"));
}

/** Whether a function initial value is called for the state (`useState(() => …)`), as Solid's `createSignal` does not. */
export function callsInitialValue(row: LibraryModelRow): boolean {
  return cellHas(row, "init", "Argument[0].ReturnValue");
}

/** Where a handle's argument goes, past the state: the argument and parameter a `yields` flow names (`dispatch(action)` → the reducer's action). */
function yieldsInto(row: LibraryModelRow, from: string): { argument: number; parameter: number } | null {
  for (const flow of rowPaths(row)) {
    const match = flow.from === from ? /^Argument\[(\d+)\]\.Parameter\[(\d+)\]$/.exec(flow.to) : null;
    if (match) return { argument: Number(match[1]), parameter: Number(match[2]) };
  }
  return null;
}

/** The argument a reducer cell's reducer is at (`useReducer(reducer, …)`): its dispatch hands its action to that function's parameter. Null for any other cell. */
export function reducerArgument(row: LibraryModelRow): number | null {
  return yieldsInto(row, "ReturnValue.Member[1].Parameter[0]")?.argument ?? null;
}

/** The flow of a reducer cell's call: what the reducer returns is the call's value (`frameworkFlow`). */
export function cellFlow(row: LibraryModelRow): FrameworkFlow | undefined {
  const reducer = reducerArgument(row);
  return reducer === null ? undefined : { returns: reducer };
}

/**
 * The flow of one asynchronous cell's call (`createResource`): with its
 * optional first argument, the source reaches the fetcher's first parameter
 * and the fetcher's settled return is the state; a call that leaves it out
 * (`(fetcher, options?)`) has each argument one place earlier. As in Solid,
 * a second of two arguments that is an object is the options; one the
 * checker cannot type counts as a fetcher.
 */
export function asyncCellFlow(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression, row: LibraryModelRow): FrameworkFlow {
  const fetcher = Number(/^Argument\[(\d+)\]/.exec(paths(row, "init").find((path) => path.endsWith(".Awaited")) ?? "")?.[1] ?? 0);
  const source = rowPaths(row).map((flow) => /^Argument\[(\d+)\]/.exec(flow.from)?.[1]).find((at) => at !== undefined && Number(at) !== fetcher);
  if (row.optional === undefined || source === undefined) return { returns: fetcher };
  const second = call.arguments[1] ? unwrap(ts, call.arguments[1]) : undefined;
  const type = second && checker.getTypeAtLocation(second);
  const options = second && call.arguments.length === 2 && (ts.isObjectLiteralExpression(second)
    || !(type!.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) && type!.getCallSignatures().length === 0);
  return !second || options ? { returns: fetcher - 1 } : { returns: fetcher, source: Number(source), callback: fetcher };
}

/** The `cell` row of a call whose state a fetcher settles (`createResource`), or null. */
export function asyncCellCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression): LibraryModelRow | null {
  if (!ts.isCallExpression(node)) return null;
  const imported = importedCallee(ts, checker, node.expression);
  const row = imported ? cellRow(imported.module, imported.name) : null;
  return settlesAsync(row) ? row : null;
}

/** A call that makes a cell: the call whose arguments are the row's `Argument[n]`, and the row. */
export type CellCall = { node: TypeScript.CallExpression; row: LibraryModelRow };

/**
 * The cell a call makes: a call of a `cell` row that holds state, a curried
 * one (`create<T>()(fn)`), or a call that hands on the one cell it is given
 * (`makePersisted(createSignal(…))`, a `passes-through` row at one argument).
 */
export function cellCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): CellCall | null {
  if (!ts.isCallExpression(expression)) return null;
  const imported = importedCallee(ts, checker, expression.expression);
  const row = imported ? cellRow(imported.module, imported.name) : null;
  if (holdsState(row)) return { node: expression, row: row! };
  const curried = ts.isCallExpression(expression.expression) && expression.expression.arguments.length === 0 ? importedCallee(ts, checker, expression.expression.expression) : null;
  const inner = curried ? cellRow(curried.module, curried.name) : null;
  if (holdsState(inner) && !pairShaped(inner!)) return { node: expression, row: inner! };
  const passes = imported ? frameworkFlow(imported.module, imported.name)?.passes : undefined;
  const passed = Array.isArray(passes) && passes.length === 1 ? expression.arguments[passes[0]] : undefined;
  return passed ? cellCall(ts, checker, passed) : null;
}

/** Whether the call makes a `[value, setter]` cell (a state pair). */
export function pairCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): boolean {
  const cell = cellCall(ts, checker, expression);
  return !!cell && pairShaped(cell.row);
}

/** A cell held by a binding: the call, its row, and the binding its state element sits at (a pair's value, or a store hook's name). */
export type CellSite = CellCall & { anchor: TypeScript.Identifier };

/** The cell a declaration holds: `const [v, setV] = createSignal(…)` (a pair, at `v`) or `const useStore = create(…)` (named handles, at `useStore`). */
export function cellSite(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.Node): CellSite | null {
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return null;
  const cell = cellCall(ts, checker, declaration.initializer);
  if (!cell) return null;
  if (pairShaped(cell.row)) {
    const first = ts.isArrayBindingPattern(declaration.name) ? declaration.name.elements[0] : undefined;
    return first && ts.isBindingElement(first) && ts.isIdentifier(first.name) ? { ...cell, anchor: first.name } : null;
  }
  return ts.isIdentifier(declaration.name) && !settlesAsync(cell.row) ? { ...cell, anchor: declaration.name } : null;
}

/** A handle of a cell an expression names: its path from the cell's call (`ReturnValue.Member[1]`), and `through` when found through what a callback returns (`createRoot`). */
export type CellHandle = { site: CellSite; path: string; through?: true; shared?: CellSite[] };

/** Whether the row names any path at or under this one. */
function mentions(row: LibraryModelRow, path: string): boolean {
  const under = (item: string) => item === path || item.startsWith(`${path}.`);
  return [...paths(row, "init"), ...paths(row, "writes"), ...paths(row, "reads")].some(under) || rowPaths(row).some((flow) => under(flow.from) || under(flow.to));
}

/** The flows of a cell's row (`yields`). */
export function cellYields(row: LibraryModelRow): Flow[] {
  return rowPaths(row);
}

/**
 * Cells and the functions that make their state, found once over the
 * program's files. A cell's creator is the function at an argument whose
 * parameters are handles (`create((set, get) => …)`): through a call whose
 * declared parameter and result are the type the cell's call declares for
 * that argument (middleware: `persist(fn)`, `immer(fn)`), and each function
 * a creator calls with all its own parameters (a slice, `fishSlice(...a)`).
 */
export class CellSites {
  private creators: Map<TypeScript.Node, { site: CellSite; at: number }[]> | null = null;
  private readonly bySite = new Map<TypeScript.CallExpression, CreatorFunction[]>();

  constructor(
    private readonly ts: typeof TypeScript,
    private readonly checker: TypeScript.TypeChecker,
    private readonly files: readonly TypeScript.SourceFile[],
  ) {}

  /** The cells a creator function makes, and the argument it is at in each: more than one for a slice two stores call. */
  creatorOf(fn: TypeScript.Node): readonly { site: CellSite; at: number }[] {
    return this.index().get(fn) ?? [];
  }

  /** A cell's creators, the call's own first. */
  creatorsOf(site: CellSite): readonly CreatorFunction[] {
    this.index();
    return this.bySite.get(site.node) ?? [];
  }

  /** Every cell with creators, in the order found. */
  creatorSites(): CellSite[] {
    const seen = new Set<TypeScript.CallExpression>();
    return [...this.index().values()].flat().map((item) => item.site).filter((site) => !seen.has(site.node) && seen.add(site.node));
  }

  private index(): Map<TypeScript.Node, { site: CellSite; at: number }[]> {
    if (this.creators) return this.creators;
    const creators = new Map<TypeScript.Node, { site: CellSite; at: number }[]>();
    const ts = this.ts;
    const visit = (node: TypeScript.Node) => {
      if (ts.isVariableDeclaration(node)) {
        const site = cellSite(ts, this.checker, node);
        if (site && !pairShaped(site.row)) {
          const found: CreatorFunction[] = [];
          for (const at of creatorArguments(site.row)) {
            const fn = site.node.arguments[at] ? this.creator(site.node, at) : null;
            if (!fn) continue;
            for (const item of [fn, ...this.slices(fn)]) {
              if (found.includes(item)) continue;
              creators.set(item, [...(creators.get(item) ?? []), { site, at }]);
              found.push(item);
            }
          }
          if (found.length) this.bySite.set(site.node, found);
        }
      }
      ts.forEachChild(node, visit);
    };
    for (const file of this.files) if (!file.isDeclarationFile) visit(file);
    this.creators = creators;
    return creators;
  }

  /** The function at an argument of a cell's call, through calls whose declared parameter and result are the type the call declares for that argument. */
  private creator(call: TypeScript.CallExpression, at: number): CreatorFunction | null {
    const ts = this.ts;
    const declared = this.checker.getResolvedSignature(call)?.getDeclaration();
    const expected = declared?.parameters[at] ? this.checker.getTypeAtLocation(declared.parameters[at]).aliasSymbol : undefined;
    let value = unwrap(ts, call.arguments[at]);
    for (let depth = 0; depth < 8; depth += 1) {
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return value;
      if (!expected || !ts.isCallExpression(value) || !value.arguments[0]) return null;
      const signature = this.checker.getResolvedSignature(value);
      const wrapper = signature?.getDeclaration();
      // The declared signature keeps the alias as written (`StateCreator<T, …>`); an instantiated one may not.
      const parameter = wrapper?.parameters[0] ? this.checker.getTypeAtLocation(wrapper.parameters[0]).aliasSymbol : undefined;
      const result = (wrapper?.type ? this.checker.getTypeAtLocation(wrapper.type) : signature?.getReturnType())?.aliasSymbol;
      if (parameter !== expected || result !== expected) return null;
      value = unwrap(ts, value.arguments[0]);
    }
    return null;
  }

  /** The functions a creator calls with all its own parameters (`fishSlice(...a)`): each gets the same handles, so each is a creator of the same cell. */
  private slices(fn: CreatorFunction): CreatorFunction[] {
    const ts = this.ts;
    const own = new Set(fn.parameters.map((parameter) => (ts.isIdentifier(parameter.name) ? this.checker.getSymbolAtLocation(parameter.name) : undefined)).filter(Boolean));
    const found: CreatorFunction[] = [];
    const visit = (node: TypeScript.Node) => {
      if (ts.isFunctionLike(node)) return;
      const forwards = own.size > 0 && ts.isCallExpression(node) && node.arguments.length > 0 && node.arguments.every((argument) => {
        const passed = ts.isSpreadElement(argument) ? argument.expression : argument;
        return ts.isIdentifier(passed) && own.has(this.checker.getSymbolAtLocation(passed));
      });
      const target = forwards ? boundFunction(ts, this.checker, (node as TypeScript.CallExpression).expression) : null;
      if (target && !found.includes(target)) found.push(target);
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
    return found;
  }

  /**
   * The handle of a cell an expression names, resolved through the checker:
   * an element of a pair's tuple (`setName`, `{ setDoc }`, a `const` copy),
   * a key destructured from one (`{ mutate }`), a store hook or a member of
   * it (`useStore.getState`), or a parameter of a creator (`set`). Null for
   * anything else, and for a path the row does not name.
   */
  handleOf(expression: TypeScript.Expression, depth = 0): CellHandle | null {
    const ts = this.ts;
    const node = unwrap(ts, expression);
    if (ts.isPropertyAccessExpression(node)) {
      const receiver = this.handleOf(node.expression, depth);
      if (receiver?.path === "ReturnValue") return this.named(receiver.site, `ReturnValue.Member[${node.name.text}]`);
    }
    if (ts.isIdentifier(node)) {
      const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
      // `{ mutate }` destructured from a tuple's element.
      if (declaration && ts.isBindingElement(declaration) && !declaration.dotDotDotToken && ts.isObjectBindingPattern(declaration.parent) && ts.isBindingElement(declaration.parent.parent) && ts.isArrayBindingPattern(declaration.parent.parent.parent)) {
        const element = declaration.parent.parent;
        const site = cellSiteOrAsync(ts, this.checker, element.parent.parent);
        const key = (declaration.propertyName ?? declaration.name).getText();
        return site ? this.named(site, `ReturnValue.Member[${(element.parent as TypeScript.ArrayBindingPattern).elements.indexOf(element)}].Member[${key}]`) : null;
      }
    }
    if (ts.isIdentifier(node)) {
      const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
      const site = declaration ? cellSite(ts, this.checker, declaration) : null;
      if (site && !pairShaped(site.row)) return { site, path: "ReturnValue" };
    }
    const binding = resolveValue(ts, this.checker, expression)?.origin;
    // A call whose value is what its callback returns (`createRoot(() => { …; return n; })`, a `returns: callback` row that makes no accessor): that return.
    if (binding && ts.isCallExpression(binding) && depth < 3) {
      const returned = callbackReturn(ts, this.checker, binding);
      const handle = returned ? this.handleOf(returned, depth + 1) : null;
      return handle ? { ...handle, through: true } : null;
    }
    if (binding && ts.isParameter(binding)) {
      // A slice two stores call gets each one's handles: the handle cannot be pinned to one store (`shared`).
      const owners = this.creatorOf(binding.parent);
      const index = binding.parent.parameters.indexOf(binding);
      const handle = owners[0] && !binding.dotDotDotToken ? this.named(owners[0].site, `Argument[${owners[0].at}].Parameter[${index}]`) : null;
      return handle && owners.length > 1 ? { ...handle, shared: owners.map((owner) => owner.site) } : handle;
    }
    if (binding && ts.isBindingElement(binding) && ts.isArrayBindingPattern(binding.parent)) {
      const site = cellSiteOrAsync(ts, this.checker, binding.parent.parent);
      return site ? this.named(site, `ReturnValue.Member[${binding.parent.elements.indexOf(binding)}]`) : null;
    }
    return null;
  }

  private named(site: CellSite, path: string): CellHandle | null {
    return mentions(site.row, path) ? { site, path } : null;
  }

  /**
   * The function a member of a cell's state names, read through a handle
   * that reads the state: `setCount` after `const setCount = useStore((s) => s.setCount)`,
   * a destructured `const { setCount } = useStore()`, or
   * `useStore.getState().setCount` (directly or through a name bound to the
   * state): the `setCount` of the object one of the cell's creators returns.
   */
  memberOf(callee: TypeScript.Expression): TypeScript.Node[] {
    const ts = this.ts;
    if (this.index().size === 0) return [];
    const node = unwrap(ts, callee);
    let site: CellSite | null = null;
    let name: string | undefined;
    if (ts.isPropertyAccessExpression(node)) {
      let read = unwrap(ts, node.expression);
      const bound = ts.isIdentifier(read) ? this.checker.getSymbolAtLocation(read)?.valueDeclaration : undefined;
      if (bound && ts.isVariableDeclaration(bound) && bound.initializer) read = unwrap(ts, bound.initializer);
      const handle = ts.isCallExpression(read) ? this.handleOf(read.expression) : null;
      if (!handle || handle.path === "ReturnValue" || !cellHas(handle.site.row, "reads", `${handle.path}.ReturnValue`)) return [];
      site = handle.site;
      name = node.name.text;
    } else if (ts.isIdentifier(node)) {
      const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
        const read = unwrap(ts, declaration.initializer);
        const handle = ts.isCallExpression(read) ? this.handleOf(read.expression) : null;
        const selector = handle && ts.isCallExpression(read) && read.arguments[0] ? unwrap(ts, read.arguments[0]) : undefined;
        const body = selector && ts.isArrowFunction(selector) && !ts.isBlock(selector.body) ? unwrap(ts, selector.body) : undefined;
        const selects = handle && rowPaths(handle.site.row).some((flow) => flow.from === `${handle.path}.Parameter[0].ReturnValue` && flow.to === `${handle.path}.ReturnValue`);
        if (selects && body && ts.isPropertyAccessExpression(body)) [site, name] = [handle.site, body.name.text];
      } else if (declaration && ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent) && ts.isVariableDeclaration(declaration.parent.parent) && declaration.parent.parent.initializer) {
        const read = unwrap(ts, declaration.parent.parent.initializer);
        const handle = ts.isCallExpression(read) ? this.handleOf(read.expression) : null;
        const key = declaration.propertyName ?? declaration.name;
        if (handle && cellHas(handle.site.row, "reads", `${handle.path}.ReturnValue`) && ts.isIdentifier(key)) [site, name] = [handle.site, key.text];
      }
    }
    if (!site || !name) return [];
    for (const creator of this.creatorsOf(site)) {
      const made = !ts.isBlock(creator.body) ? unwrap(ts, creator.body) : undefined;
      if (!made || !ts.isObjectLiteralExpression(made)) continue;
      const member = made.properties.find((property) => property.name && ts.isIdentifier(property.name) && property.name.text === name);
      if (member && ts.isPropertyAssignment(member)) return [member.initializer];
      if (member && ts.isMethodDeclaration(member)) return [member];
    }
    return [];
  }

}

type CreatorFunction = TypeScript.ArrowFunction | TypeScript.FunctionExpression;

/** The arguments whose function gets handles: a path calls or reads a parameter of it (`Argument[0].Parameter[0].Parameter[0]`). */
function creatorArguments(row: LibraryModelRow): number[] {
  const found = new Set<number>();
  for (const path of [...paths(row, "writes"), ...paths(row, "reads")]) {
    const match = /^Argument\[(\d+)\]\.Parameter\[\d+\]\.(?:Parameter|ReturnValue)/.exec(path);
    if (match) found.add(Number(match[1]));
  }
  return [...found];
}

/** The cell a declaration holds, an asynchronous one included (`const [data, { mutate }] = createResource(…)`, at `data`). */
function cellSiteOrAsync(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.Node): CellSite | null {
  const site = cellSite(ts, checker, declaration);
  if (site) return site;
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer || !ts.isArrayBindingPattern(declaration.name)) return null;
  const cell = cellCall(ts, checker, declaration.initializer);
  const first = declaration.name.elements[0];
  return cell && settlesAsync(cell.row) && first && ts.isBindingElement(first) && ts.isIdentifier(first.name) ? { ...cell, anchor: first.name } : null;
}

/** The function a name is bound to (`const fishSlice = (set) => …`), or null. */
function boundFunction(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression): CreatorFunction | null {
  const name = unwrap(ts, node);
  const declaration = ts.isIdentifier(name) ? checker.getSymbolAtLocation(name)?.valueDeclaration : undefined;
  const value = declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? unwrap(ts, declaration.initializer) : undefined;
  return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : null;
}

/** The one expression a callback returns, when a row says the call's value is that return (`createRoot`, `batch`, `untrack`) and the call makes no accessor; null otherwise. */
function callbackReturn(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): TypeScript.Expression | null {
  const imported = importedCallee(ts, checker, call.expression);
  const flow = imported ? frameworkFlow(imported.module, imported.name) : undefined;
  if (!imported || flow?.returns === undefined || flow.source !== undefined || flow.compares || makesAccessor(imported.module, imported.name)) return null;
  const fn = call.arguments[flow.returns];
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return null;
  if (!ts.isBlock(fn.body)) return fn.body;
  const returns: TypeScript.ReturnStatement[] = [];
  const visit = (node: TypeScript.Node) => {
    if (ts.isReturnStatement(node)) returns.push(node);
    else if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return returns.length === 1 && returns[0].expression ? returns[0].expression : null;
}

/** Half of a state pair (`stateRoleOf` before cells): the value's binding the state sits at, and which half. */
export type PairRole = { getter: TypeScript.Identifier; role: "getter" | "setter"; through?: true; row: LibraryModelRow };

/** Which half of a `[value, setter]` cell an expression names, or null. */
export function pairRole(handle: CellHandle | null): PairRole | null {
  if (!handle || !pairShaped(handle.site.row)) return null;
  const role = handle.path === "ReturnValue.Member[0]" ? "getter" : handle.path === "ReturnValue.Member[1]" ? "setter" : null;
  return role ? { getter: handle.site.anchor, role, row: handle.site.row, ...(handle.through ? { through: true as const } : {}) } : null;
}

/**
 * The initial value a destructured state pair is seeded with as it is
 * (`createStore({ left, right })`), which becomes the state whole, so its
 * fields stay apart; null for a cell that calls its initial value or takes a
 * reducer, a function held as the state, and a pair that is not destructured.
 */
export function seedArgument(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): TypeScript.Expression | null {
  const imported = importedCallee(ts, checker, call.expression);
  const row = imported ? cellRow(imported.module, imported.name) : null;
  if (!row || !pairShaped(row) || !cellHas(row, "init", "Argument[0]")) return null;
  const pair = call.parent;
  const seed = call.arguments[0];
  // A factory that calls a function initial value (`useState(fn)`) still holds an object literal as it is.
  if (callsInitialValue(row) && !(seed && ts.isObjectLiteralExpression(unwrap(ts, seed)))) return null;
  // A function held as the state is found through its call (`make()()`), so it keeps its argument edge.
  if (!seed || ts.isSpreadElement(seed) || ts.isArrowFunction(seed) || ts.isFunctionExpression(seed)) return null;
  return ts.isVariableDeclaration(pair) && pair.initializer === call && ts.isArrayBindingPattern(pair.name) ? seed : null;
}

/** The value binding of the pair a call makes when it calls a function initial value (`const [n] = useState(() => …)`); null otherwise. */
export function lazyCellAnchor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): TypeScript.Identifier | null {
  const imported = importedCallee(ts, checker, call.expression);
  const row = imported ? cellRow(imported.module, imported.name) : null;
  if (!row || !callsInitialValue(row)) return null;
  const pair = call.parent;
  const first = ts.isVariableDeclaration(pair) && pair.initializer === call && ts.isArrayBindingPattern(pair.name) ? pair.name.elements[0] : undefined;
  return first && ts.isBindingElement(first) && ts.isIdentifier(first.name) ? first.name : null;
}

/** The reducer of the pair whose value binding this is (`useReducer(reducer, …)`), which its dispatch calls with the action; null for any other pair. */
export function reducerOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, anchor: TypeScript.Identifier): TypeScript.Expression | null {
  const pair = anchor.parent.parent.parent;
  if (!ts.isVariableDeclaration(pair) || !pair.initializer || !ts.isCallExpression(pair.initializer)) return null;
  const imported = importedCallee(ts, checker, pair.initializer.expression);
  const row = imported ? cellRow(imported.module, imported.name) : null;
  const at = row ? reducerArgument(row) : null;
  return at === null ? null : pair.initializer.arguments[at] ?? null;
}

/** Whether a handle writes a cell through a name (a store's `set`, `useStore.setState(…)`), not a pair's setter: what it receives is the state, never an assumed effect. */
export function writesByName(handle: CellHandle | null): boolean {
  return !!handle && !pairShaped(handle.site.row) && cellHas(handle.site.row, "writes", `${handle.path}.Parameter[0]`);
}
