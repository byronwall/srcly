import path from "node:path";
import type * as TypeScript from "typescript";
import type { Tier1 } from "./session";

export type CallSites = {
  /** Calls whose callee resolves to the function, as `file:line`, in source order. */
  calls: string[];
  /** The function is also referenced as a value (passed, stored), so its callers are not all visible. */
  escapes: boolean;
};

/**
 * Who calls a function, from the TypeScript program rather than the lazy
 * evidence provider (which only knows the files it has loaded). Value-flow
 * walks a call only when this finds exactly one call and no escape (R7).
 */
export function createCallSiteIndex(tier1: Tier1) {
  const { ts, program } = tier1;
  const checker = program.getTypeChecker();
  const root = path.resolve(tier1.args.root);
  const files = program.getSourceFiles().filter((file) => !file.isDeclarationFile && !path.relative(root, file.fileName).startsWith(".."));
  const cache = new Map<TypeScript.Symbol, CallSites>();

  const resolve = (symbol: TypeScript.Symbol | undefined) =>
    symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  const sitesOf = (symbol: TypeScript.Symbol): CallSites => {
    const cached = cache.get(symbol);
    if (cached) return cached;
    const name = symbol.getName();
    const calls: string[] = [];
    let escapes = false;
    const declarations = new Set(symbol.declarations ?? []);
    for (const file of files) {
      if (!file.text.includes(name)) continue;
      const visit = (node: TypeScript.Node) => {
        if (ts.isIdentifier(node) && node.text === name && resolve(checker.getSymbolAtLocation(node)) === symbol) {
          const parent = node.parent;
          const isDeclarationName = declarations.has(parent as TypeScript.Declaration);
          const isImport = ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isExportSpecifier(parent);
          const callee = ts.isCallExpression(parent) && parent.expression === node;
          if (callee) {
            const point = file.getLineAndCharacterOfPosition(node.getStart(file));
            calls.push(`${path.relative(root, file.fileName).split(path.sep).join("/")}:${point.line + 1}`);
          } else if (!isDeclarationName && !isImport) escapes = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    const result = { calls, escapes };
    cache.set(symbol, result);
    return result;
  };

  /** The named function a declaration node belongs to (`function f`, `const f = () => …`). */
  const symbolOfFunction = (fn: TypeScript.Node): TypeScript.Symbol | undefined => {
    if (ts.isFunctionDeclaration(fn) && fn.name) return checker.getSymbolAtLocation(fn.name);
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
      return checker.getSymbolAtLocation(fn.parent.name);
    }
    if (ts.isMethodDeclaration(fn) && ts.isIdentifier(fn.name)) return checker.getSymbolAtLocation(fn.name);
    return undefined;
  };

  return {
    /** Call sites of the function a call expression invokes; null when the callee has no name to follow. */
    forCall(call: TypeScript.CallExpression): CallSites | null {
      const target = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
      const symbol = resolve(checker.getSymbolAtLocation(target));
      return symbol ? sitesOf(symbol) : null;
    },
    /** Call sites of the function that owns a node (a parameter, the function itself). */
    forFunctionOf(node: TypeScript.Node): CallSites | null {
      let fn: TypeScript.Node | undefined = node;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      const symbol = fn ? symbolOfFunction(fn) : undefined;
      return symbol ? sitesOf(symbol) : null;
    },
  };
}

export type CallSiteIndex = ReturnType<typeof createCallSiteIndex>;

/** One call and no escape: the only shape the M3 walk may cross. */
export function singleCall(sites: CallSites | null): boolean {
  return !!sites && sites.calls.length === 1 && !sites.escapes;
}

export function describeSites(name: string, sites: CallSites | null): string {
  if (!sites) return `${name}'s callers cannot be named, so its values cannot be paired with this call`;
  const where = sites.calls.length ? ` (${sites.calls.slice(0, 4).join(", ")}${sites.calls.length > 4 ? ", …" : ""})` : "";
  const escape = sites.escapes ? "; it is also passed as a value" : "";
  return `${name} has ${sites.calls.length} call site${sites.calls.length === 1 ? "" : "s"}${where}${escape}; its values cannot be paired with this call until invocation identity lands`;
}
