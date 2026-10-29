import path from "node:path";
import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "../cancellation";
import { boundaryRole, builtinLibraryModels, tsModel } from "../library-models";
import { calleeName, importModule, lastName } from "../program-evidence-support";

/**
 * What a function touches (M6, T14). A walk over the callable's own body
 * names each effect as a fact with a witness, follows calls into first-party
 * callables the checker resolves (bounded, memoized, cycle-safe) and merges
 * their facts behind a `via` chain, and names what it could not follow as a
 * frontier. Identity comes from the checker, never from a name alone: a
 * local arrow called `fetch` is a first-party call, a parameter called
 * `fetch` is a callback frontier.
 */

export type Activation = "direct" | "after-await" | "timer" | "latent";
export type Family = "external" | "input" | "write" | "throw" | "timer" | "promise";

export type Witness = { file: string; absPath: string; line: number; span: { startLine: number; startColumn: number; endLine: number; endColumn: number }; text: string };
export type Via = { callable: string; file: string; line: number };
export type Fact = { id: string; family: Family; kind: string; label: string; detail: string; status: "proven" | "partial"; activation: Activation; via: Via[]; witness: Witness; /** For a parameter write: which parameter, so a caller can say what it handed in. Internal. */ param?: number };
export type Frontier = { id: string; reason: string; label: string; detail: string; via: Via[]; witness: Witness };
export type Handling = { callee: string; handling: "awaited" | "returned" | "assigned" | "passed" | "discarded"; witness: Witness };

export type CallableInfo = {
  node: TypeScript.SignatureDeclaration;
  name: string;
  kind: "function" | "arrow" | "method" | "getter" | "setter" | "constructor";
  async: boolean;
  file: string;
  absPath: string;
  line: number;
  span: Witness["span"];
};

export type EffectsReport = {
  callable: CallableInfo;
  facts: Fact[];
  frontiers: Frontier[];
  resultHandling: Handling[];
  callables: number;
};

/** Callables followed per query, and the longest call chain. */
export const EFFECTS_BUDGET = { callables: 64, depth: 6 };

export const ASSUMPTIONS = [
  "ECMAScript and DOM intrinsics (TypeScript's own lib) are taken as pure unless named here: console, fetch, timers, Promise, Date.now and Math.random are effects; Array.prototype.sort, push, splice, pop, shift, unshift, reverse and fill and Map and Set set, add, delete and clear write their receiver; a callback handed to map, filter, reduce, forEach, some, every or find runs at once.",
  "A call that resolves to a declaration file outside the program is external: that it runs is a fact; what it does is not followed.",
  "A function the callable returns or hands to another call runs later, if at all: its effects are latent.",
  "Code after the first await runs once the function has yielded: its effects are after-await.",
];

const MODELLED_PURE = new Set(["split", "slice", "map", "filter", "join", "includes", "find", "some", "every", "indexOf", "trim", "toUpperCase", "toLowerCase", "concat", "flat", "flatMap", "reduce", "keys", "values", "entries", "at", "startsWith", "endsWith", "replace", "replaceAll", "toString", "localeCompare", "padStart", "padEnd"]);
const MODELLED_RECEIVER_WRITES = new Set(["sort", "push", "splice", "pop", "shift", "unshift", "reverse", "fill", "copyWithin", "set", "delete", "clear", "add"]);
const AMBIENT_INPUTS: Record<string, string> = { "Date.now": "the clock", "Math.random": "randomness", "performance.now": "the clock" };

export function callableAt(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, line: number, column: number | null, root: string): CallableInfo | null {
  const position = sourceFile.getPositionOfLineAndCharacter(line - 1, Math.max(0, (column ?? 1) - 1));
  let found: TypeScript.SignatureDeclaration | null = null;
  const visit = (node: TypeScript.Node) => {
    if (node.getStart(sourceFile) <= position && position < node.getEnd()) {
      if (ts.isFunctionLike(node) && !ts.isTypeNode(node)) found = node;
      ts.forEachChild(node, visit);
    } else if (column === null && ts.isFunctionLike(node) && sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 === line && !found) {
      found = node;
    }
  };
  ts.forEachChild(sourceFile, visit);
  return found ? describeCallable(ts, found, root) : null;
}

export function describeCallable(ts: typeof TypeScript, node: TypeScript.SignatureDeclaration, root: string): CallableInfo {
  const sourceFile = node.getSourceFile();
  const kind: CallableInfo["kind"] = ts.isArrowFunction(node) ? "arrow" : ts.isMethodDeclaration(node) ? "method" : ts.isGetAccessor(node) ? "getter" : ts.isSetAccessor(node) ? "setter" : ts.isConstructorDeclaration(node) ? "constructor" : "function";
  const async = Boolean(ts.getCombinedModifierFlags(node as TypeScript.Declaration) & ts.ModifierFlags.Async);
  const { line, span } = spanOf(sourceFile, node);
  return { node, name: nameOf(ts, node, sourceFile), kind, async, file: relativeTo(root, sourceFile.fileName), absPath: sourceFile.fileName, line, span };
}

export function analyzeFunctionEffects(ts: typeof TypeScript, program: TypeScript.Program, root: string, callable: CallableInfo, cancellation?: AnalysisCancellationToken): EffectsReport {
  const checker = program.getTypeChecker();
  const facts: Fact[] = [];
  const frontiers: Frontier[] = [];
  const resultHandling: Handling[] = [];
  const seen = new Set<string>();
  const memo = new Map<TypeScript.Node, { facts: Fact[]; frontiers: Frontier[] }>();
  const inProgress = new Set<TypeScript.Node>();
  let callables = 0;

  const witnessOf = (node: TypeScript.Node): Witness => {
    const sourceFile = node.getSourceFile();
    const { line, span } = spanOf(sourceFile, node);
    return { file: relativeTo(root, sourceFile.fileName), absPath: sourceFile.fileName, line, span, text: clip(node.getText(sourceFile)) };
  };
  const push = (list: Fact[] | Frontier[], item: Fact | Frontier) => {
    const key = `${"family" in item ? `${item.family}|${item.kind}` : `frontier|${item.reason}`}|${item.witness.file}:${item.witness.span.startLine}:${item.witness.span.startColumn}|${item.via.map((v) => `${v.file}:${v.line}`).join(">")}`;
    if (seen.has(key)) return;
    seen.add(key);
    (list as (Fact | Frontier)[]).push(item);
  };
  const nextId = (() => {
    let n = 0;
    return (prefix: string) => `${prefix}:${(n += 1)}`;
  })();

  /** Where a declaration lives: first party (in the root, not a declaration file), a library, or nowhere. */
  /** Where a declaration lives: first party, TypeScript's own lib (an ECMAScript or DOM intrinsic), another library, or nowhere. */
  const placeOf = (symbol: TypeScript.Symbol | undefined): "first-party" | "intrinsic" | "library" | "none" => {
    if (!symbol) return "none";
    const declarations = symbol.declarations ?? [];
    if (declarations.length === 0) return "none";
    const first = declarations.find((d) => isFirstParty(d.getSourceFile()));
    if (first) return "first-party";
    return declarations.every((d) => /[/\\]typescript[/\\]lib[/\\]lib\./.test(d.getSourceFile().fileName)) ? "intrinsic" : "library";
  };
  const isFirstParty = (sourceFile: TypeScript.SourceFile) => !sourceFile.isDeclarationFile && inside(root, sourceFile.fileName) && !/[/\\]node_modules[/\\]/.test(sourceFile.fileName);
  const resolvedSymbol = (node: TypeScript.Node): TypeScript.Symbol | undefined => {
    try {
      let symbol = checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      return symbol;
    } catch {
      return undefined;
    }
  };
  /** The function-like declaration a call resolves to, when it is first party. */
  const targetOf = (call: TypeScript.CallExpression): { node: TypeScript.SignatureDeclaration; symbol: TypeScript.Symbol } | null => {
    const callee = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
    let symbol = resolvedSymbol(callee);
    // `const alias = helper`: through the alias to the function, a few hops at most.
    for (let hops = 0; symbol && hops < 4; hops += 1) {
      if (placeOf(symbol) !== "first-party") return null;
      let next: TypeScript.Symbol | undefined;
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isFunctionLike(declaration)) return { node: declaration, symbol };
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const initializer = unparen(ts, declaration.initializer);
          if (ts.isFunctionLike(initializer)) return { node: initializer, symbol };
          if (ts.isIdentifier(initializer)) next = resolvedSymbol(initializer);
        }
      }
      if (!next) return null;
      symbol = next;
    }
    return null;
  };
  /** The declaration a symbol names when it is a parameter: of which function. */
  const parameterOf = (symbol: TypeScript.Symbol | undefined): TypeScript.ParameterDeclaration | null => {
    const declaration = symbol?.declarations?.[0];
    return declaration && ts.isParameter(declaration) ? declaration : null;
  };
  const returnsPromise = (call: TypeScript.CallExpression): boolean => {
    try {
      const type = checker.getTypeAtLocation(call);
      const symbol = type.getSymbol() ?? type.aliasSymbol;
      return symbol?.getName() === "Promise";
    } catch {
      return false;
    }
  };
  const handlingOf = (call: TypeScript.CallExpression): Handling["handling"] => {
    let node: TypeScript.Node = call;
    while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
    const parent = node.parent;
    if (ts.isAwaitExpression(parent)) return "awaited";
    if (ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === node)) return "returned";
    if (ts.isVariableDeclaration(parent) || ts.isBinaryExpression(parent) || ts.isPropertyAssignment(parent)) return "assigned";
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) return "passed";
    if (ts.isExpressionStatement(parent)) return "discarded";
    return "passed";
  };

  /** Walk one callable's body; nested functions are walked with their own activation. */
  const walk = (fn: TypeScript.SignatureDeclaration, via: Via[], depth: number, out: { facts: Fact[]; frontiers: Frontier[] }, seedHandling: boolean) => {
    const sourceFile = fn.getSourceFile();
    const moduleScope = sourceFile;
    const own = new Set<TypeScript.Symbol>();
    for (const parameter of fn.parameters) collectBindings(ts, parameter.name, (id) => { const s = checker.getSymbolAtLocation(id); if (s) own.add(s); });
    const parameters = new Set(own);
    const parameterIndex = (symbol: TypeScript.Symbol): number => fn.parameters.findIndex((parameter) => { let hit = false; collectBindings(ts, parameter.name, (id) => { if (checker.getSymbolAtLocation(id) === symbol) hit = true; }); return hit; });
    let yielded = false;
    const activationNow = (base: Activation): Activation => (base === "direct" && yielded ? "after-await" : base);

    const classifyCall = (call: TypeScript.CallExpression, activation: Activation) => {
      const expression = call.expression;
      const name = calleeName(ts, expression);
      const callee = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
      const symbol = ts.isIdentifier(callee) || ts.isPropertyAccessExpression(expression) ? resolvedSymbol(callee) : undefined;
      const place = placeOf(symbol);
      // The module an imported callee came from, read at the import, before the alias is followed.
      const importedFrom = (() => {
        try {
          const local = ts.isIdentifier(expression) ? checker.getSymbolAtLocation(expression) : ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) ? checker.getSymbolAtLocation(expression.expression) : undefined;
          return moduleOf(ts, local);
        } catch {
          return null;
        }
      })();
      const witness = witnessOf(call);
      const act = activationNow(activation);
      const fact = (family: Family, kind: string, label: string, detail: string, status: Fact["status"] = "proven") =>
        push(out.facts, { id: nextId("fact"), family, kind, label, detail, status, activation: act, via, witness });
      const frontier = (reason: string, label: string, detail: string) => push(out.frontiers, { id: nextId("frontier"), reason, label, detail, via, witness });

      if (seedHandling && returnsPromise(call) && via.length === 0) resultHandling.push({ callee: name, handling: handlingOf(call), witness });

      // An IIFE: its body is walked where it stands.
      if (ts.isFunctionLike(unparen(ts, expression))) return;
      // A callback or a function-typed value: who it is at run time is not visible here.
      const parameter = ts.isIdentifier(expression) ? parameterOf(symbol) : null;
      if (parameter) {
        const host = parameter.parent;
        let above: TypeScript.Node = host.parent;
        while (ts.isParenthesizedExpression(above)) above = above.parent;
        const executorOf = ts.isFunctionLike(host) && ts.isNewExpression(above) ? above : null;
        if (executorOf && ts.isIdentifier(executorOf.expression) && executorOf.expression.text === "Promise") return fact("promise", "promise-settle", name, `${name} settles the promise this executor made.`);
        return frontier("callback-parameter", name, `${name} is a parameter: what it does depends on the caller.`);
      }
      if (ts.isElementAccessExpression(expression)) return frontier("dynamic-dispatch", clip(expression.getText(sourceFile)), "The callee is computed; the checker cannot name it.");

      // Host and library behaviour, by resolved identity.
      // The boundary a library model row gives the callee, by its import module (or `global`) and dotted name.
      const role = boundaryRole(tsModel(builtinLibraryModels(), ts, checker, importModule(ts, checker, expression), expression));
      if (place === "library" || place === "none" || place === "intrinsic") {
        if (role === "fetch-input") return fact("external", "network-request", name, "A network request leaves the program.", place === "none" ? "partial" : "proven");
        if (role === "file-write") return fact("external", "filesystem-write", name, "A filesystem write leaves the program.");
        if (role === "file-input") return fact("input", "filesystem-read", name, "A filesystem read brings in what the function did not receive.");
        if (role === "stdout" || role === "stderr") return fact("external", role, name, `Host output on ${role}.`);
        if (role === "exit-status") return fact("external", "exit-status", name, "The process exits.");
        if (name === "setTimeout" || name === "setInterval" || name === "queueMicrotask" || name === "requestAnimationFrame") {
          fact("timer", "timer", name, `${name} schedules work for later.`);
          return;
        }
        if (name === "Promise.resolve" || name === "Promise.reject" || name === "Promise.all" || name === "Promise.allSettled" || name === "Promise.race") return fact("promise", "promise", name, `${name} makes a promise.`);
        if (AMBIENT_INPUTS[name]) return fact("input", "ambient-read", name, `${name} reads ${AMBIENT_INPUTS[name]}.`);
        const method = lastName(name);
        if (ts.isPropertyAccessExpression(expression) && MODELLED_PURE.has(method) && place !== "none") return;
        if (ts.isPropertyAccessExpression(expression) && MODELLED_RECEIVER_WRITES.has(method) && place !== "none") {
          const receiver = receiverSymbol(expression.expression);
          const target = receiver && parameters.has(receiver) ? "parameter" : receiver && isModuleLevel(receiver, moduleScope) ? "module" : "local";
          if (target === "local") return;
          push(out.facts, { id: nextId("fact"), family: "write", kind: `${target}-write`, label: clip(expression.getText(sourceFile)), detail: `${method} writes its receiver, ${target === "parameter" ? "a parameter the caller owns" : "module-level state"}.`, status: "proven", activation: act, via, witness, ...(target === "parameter" ? { param: parameterIndex(receiver!) } : {}) });
          return;
        }
        if (place === "none") return frontier("unresolved-callee", name, "The callee has no compiler-resolved symbol.");
        // An ECMAScript or DOM intrinsic not named above is taken as pure (an assumption, shown beside the facts).
        if (place === "intrinsic") return;
        return fact("external", "external-call", name, `${name} resolves outside the program: that it runs is known, what it does is not followed.`, "partial");
      }

      // First party: follow it.
      const target = targetOf(call);
      if (!target) return frontier("unresolved-callee", name, `${name} resolves to a value, not a function declaration.`);
      follow(target.node, name, call, via, depth, out, act);
    };

    const receiverSymbol = (node: TypeScript.Expression): TypeScript.Symbol | undefined => {
      let current: TypeScript.Expression = node;
      while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current) || ts.isNonNullExpression(current) || ts.isParenthesizedExpression(current)) current = current.expression;
      return ts.isIdentifier(current) || current.kind === ts.SyntaxKind.ThisKeyword ? resolvedSymbol(current) : undefined;
    };
    const isModuleLevel = (symbol: TypeScript.Symbol, file: TypeScript.SourceFile): boolean => {
      const declaration = symbol.declarations?.[0];
      if (!declaration || (declaration.getSourceFile() !== file && !isFirstParty(declaration.getSourceFile()))) return false;
      let node: TypeScript.Node | undefined = declaration;
      while (node && !ts.isFunctionLike(node) && !ts.isSourceFile(node)) node = node.parent;
      return node !== undefined && ts.isSourceFile(node);
    };

    const visit = (node: TypeScript.Node, activation: Activation) => {
      cancellation?.throwIfCancelled();
      if (ts.isFunctionLike(node) && node !== fn) {
        // A nested function: its activation is how it is used.
        const nested = nestedActivation(ts, node, activation);
        if (nested !== null) ts.forEachChild(node, (child) => visit(child, nested));
        return;
      }
      if (ts.isAwaitExpression(node)) {
        push(out.facts, { id: nextId("fact"), family: "promise", kind: "await", label: clip(node.expression.getText(sourceFile)), detail: "The function yields here; what follows runs after the awaited promise settles.", status: "proven", activation: activationNow(activation), via, witness: witnessOf(node) });
        ts.forEachChild(node, (child) => visit(child, activation));
        if (activation === "direct") yielded = true;
        return;
      }
      if (ts.isThrowStatement(node)) push(out.facts, { id: nextId("fact"), family: "throw", kind: "throw", label: clip(node.expression.getText(sourceFile)), detail: "The function can throw here.", status: "proven", activation: activationNow(activation), via, witness: witnessOf(node) });
      if (ts.isCallExpression(node)) classifyCall(node, activation);
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Promise" && placeOf(resolvedSymbol(node.expression)) !== "first-party") {
        push(out.facts, { id: nextId("fact"), family: "promise", kind: "promise-executor", label: "new Promise", detail: "The executor runs at once; what it settles runs later.", status: "proven", activation: activationNow(activation), via, witness: witnessOf(node) });
      }
      if (ts.isBinaryExpression(node) && isAssignment(ts, node.operatorToken.kind)) {
        const receiver = receiverSymbol(node.left);
        const isParameter = receiver !== undefined && parameters.has(receiver) && !ts.isIdentifier(node.left);
        const own = isParameter ? "parameter" : receiver && isModuleLevel(receiver, moduleScope) ? "module" : node.left.kind === ts.SyntaxKind.ThisKeyword || (ts.isPropertyAccessExpression(node.left) && node.left.expression.kind === ts.SyntaxKind.ThisKeyword) ? "this" : "local";
        if (own !== "local") push(out.facts, { id: nextId("fact"), family: "write", kind: `${own}-write`, label: clip(node.left.getText(sourceFile)), detail: own === "parameter" ? "Writes through a parameter the caller owns." : own === "module" ? "Writes module-level state." : "Writes this.", status: "proven", activation: activationNow(activation), via, witness: witnessOf(node.left), ...(isParameter ? { param: parameterIndex(receiver!) } : {}) });
      }
      if (ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node.parent) || (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && ts.isIdentifier(node))) {
        const symbol = resolvedSymbol(node);
        if (symbol && !parameters.has(symbol) && (symbol.flags & ts.SymbolFlags.Variable) && isModuleLevel(symbol, moduleScope) && !isWriteTarget(ts, node) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
          const declaration = symbol.valueDeclaration;
          const isConst = declaration && ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0 && declaration.initializer !== undefined && (ts.isStringLiteral(declaration.initializer) || ts.isNumericLiteral(declaration.initializer) || ts.isObjectLiteralExpression(declaration.initializer) && false);
          if (!isConst) push(out.facts, { id: nextId("fact"), family: "input", kind: "module-read", label: node.text, detail: "Reads module-level state the function did not receive.", status: "proven", activation: activationNow(activation), via, witness: witnessOf(node) });
        }
      }
      ts.forEachChild(node, (child) => visit(child, activation));
    };
    const body = (fn as TypeScript.FunctionLikeDeclaration).body;
    if (body) visit(body, "direct");
  };

  /** Follow a first-party callee: memoized per declaration, bounded, cycle-safe. */
  const follow = (target: TypeScript.SignatureDeclaration, name: string, call: TypeScript.CallExpression, via: Via[], depth: number, out: { facts: Fact[]; frontiers: Frontier[] }, activation: Activation) => {
    const step: Via = { callable: name, file: relativeTo(root, call.getSourceFile().fileName), line: spanOf(call.getSourceFile(), call).line };
    const chain = [...via, step];
    const witness = witnessOf(call);
    if (depth >= EFFECTS_BUDGET.depth || callables >= EFFECTS_BUDGET.callables) {
      push(out.frontiers, { id: nextId("frontier"), reason: "budget", label: name, detail: `Not followed: ${depth >= EFFECTS_BUDGET.depth ? `the call chain is ${depth} deep` : `${EFFECTS_BUDGET.callables} callables already followed`}.`, via, witness });
      return;
    }
    if (inProgress.has(target) || target === callable.node) {
      push(out.frontiers, { id: nextId("frontier"), reason: "recursion", label: name, detail: `${name} is already on the call chain: its effects are the ones listed for it.`, via, witness });
      return;
    }
    let result = memo.get(target);
    if (!result) {
      callables += 1;
      inProgress.add(target);
      result = { facts: [], frontiers: [] };
      walk(target, [], depth + 1, result, false);
      inProgress.delete(target);
      memo.set(target, result);
    }
    for (const fact of result.facts) push(out.facts, { ...fact, ...relocateWrite(fact, call), id: nextId("fact"), via: [...chain, ...fact.via], activation: combine(activation, fact.activation) });
    for (const frontier of result.frontiers) push(out.frontiers, { ...frontier, id: nextId("frontier"), via: [...chain, ...frontier.via] });
  };

  /** A callee's parameter write, seen from the call: a write to what this caller handed in. */
  const relocateWrite = (fact: Fact, call: TypeScript.CallExpression): Partial<Fact> => {
    if (fact.kind !== "parameter-write" || fact.param === undefined || fact.param < 0) return {};
    const argument = call.arguments[fact.param];
    if (!argument) return { param: undefined };
    const base = unparen(ts, argument);
    const symbol = ts.isIdentifier(base) ? resolvedSymbol(base) : undefined;
    const declaration = symbol?.valueDeclaration;
    if (declaration && ts.isParameter(declaration)) {
      const host = declaration.parent;
      const index = ts.isFunctionLike(host) ? host.parameters.indexOf(declaration) : -1;
      return { param: index };
    }
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && (ts.isObjectLiteralExpression(unparen(ts, declaration.initializer)) || ts.isArrayLiteralExpression(unparen(ts, declaration.initializer)) || ts.isNewExpression(unparen(ts, declaration.initializer)))) {
      return { kind: "fresh-write", status: "partial", detail: `Writes an object this function made (${base.getText(call.getSourceFile())}); whether it escapes is not followed.`, param: undefined };
    }
    if (symbol && (symbol.flags & ts.SymbolFlags.Variable) && declaration && !ts.isFunctionLike(declaration.parent) && isModuleScoped(ts, declaration)) {
      return { kind: "module-write", detail: "Writes module-level state, through a callee.", param: undefined };
    }
    return { status: "partial", detail: `${fact.detail} What was handed in here is not followed.`, param: undefined };
  };

  walk(callable.node, [], 0, { facts, frontiers }, true);
  return { callable, facts, frontiers, resultHandling, callables: callables + 1 };
}

/** A nested function's activation: an IIFE runs now, a timer or promise executor by its host, anything else later if at all. */
function nestedActivation(ts: typeof TypeScript, fn: TypeScript.Node, outer: Activation): Activation | null {
  let node: TypeScript.Node = fn;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.expression === node) return outer;
  if (ts.isCallExpression(parent) && parent.arguments.includes(node as TypeScript.Expression)) {
    const name = calleeName(ts, parent.expression);
    if (/^(setTimeout|setInterval|queueMicrotask|requestAnimationFrame|setImmediate)$/.test(name)) return "timer";
    if (/\.(then|catch|finally)$/.test(name)) return "after-await";
    // A callback an iteration intrinsic runs at once.
    if (/\.(map|filter|reduce|reduceRight|forEach|some|every|find|findIndex|flatMap|sort|replace|replaceAll)$/.test(name)) return outer;
    return "latent";
  }
  if (ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === "Promise") return outer;
  return "latent";
}

function combine(outer: Activation, inner: Activation): Activation {
  if (outer === "latent" || inner === "latent") return "latent";
  if (outer === "timer" || inner === "timer") return "timer";
  if (outer === "after-await" || inner === "after-await") return "after-await";
  return "direct";
}

function unparen(ts: typeof TypeScript, node: TypeScript.Expression): TypeScript.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function isModuleScoped(ts: typeof TypeScript, declaration: TypeScript.Node): boolean {
  let node: TypeScript.Node | undefined = declaration;
  while (node && !ts.isFunctionLike(node) && !ts.isSourceFile(node)) node = node.parent;
  return node !== undefined && ts.isSourceFile(node);
}

function isAssignment(ts: typeof TypeScript, kind: TypeScript.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isWriteTarget(ts: typeof TypeScript, node: TypeScript.Node): boolean {
  const parent = node.parent;
  return ts.isBinaryExpression(parent) && parent.left === node && isAssignment(ts, parent.operatorToken.kind);
}

function collectBindings(ts: typeof TypeScript, name: TypeScript.BindingName, each: (id: TypeScript.Identifier) => void) {
  if (ts.isIdentifier(name)) each(name);
  else for (const element of name.elements) if (ts.isBindingElement(element)) collectBindings(ts, element.name, each);
}

function moduleOf(ts: typeof TypeScript, symbol: TypeScript.Symbol | undefined): string | null {
  for (const declaration of symbol?.declarations ?? []) {
    let current: TypeScript.Node | undefined = declaration;
    while (current) {
      if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)) return current.moduleSpecifier.text;
      current = current.parent;
    }
    const file = declaration.getSourceFile().fileName;
    // The last node_modules segment: pnpm nests packages under .pnpm.
    const match = /.*node_modules\/(@types\/)?([^/]+)/.exec(file);
    if (match) return match[2] === "node" ? `node:${path.basename(file, ".d.ts")}` : match[2];
  }
  return null;
}

function nameOf(ts: typeof TypeScript, fn: TypeScript.SignatureDeclaration, sourceFile: TypeScript.SourceFile): string {
  if (fn.name) return fn.name.getText(sourceFile);
  if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  if (ts.isPropertyAssignment(fn.parent)) return fn.parent.name.getText(sourceFile);
  if (ts.isCallExpression(fn.parent) && fn.parent.expression === fn) return "(iife)";
  return "(anonymous)";
}

function spanOf(sourceFile: TypeScript.SourceFile, node: TypeScript.Node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { line: start.line + 1, span: { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 } };
}

function relativeTo(root: string, file: string): string {
  return path.relative(path.resolve(root), path.resolve(file)).split(path.sep).join("/");
}

function inside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function clip(text: string, max = 120): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
