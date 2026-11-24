import path from "node:path";
import type * as TypeScript from "typescript";
import type { TsTier1 } from "./session";

export type CallSites = {
  /** Calls whose callee resolves to the function, as `file:line`, in source order. */
  calls: string[];
  /** The function is also referenced as a value (passed, stored), so its callers are not all visible. */
  escapes: boolean;
  /** The page calls it too, as a DOM event handler (`<button onClick={f}>`): with its own event, not an argument the program names. */
  handedToPage?: true;
  /** Its module is imported as a namespace somewhere (`import * as views`), which can call it by a computed key (`views[name](…)`). */
  namespaced?: true;
};

/**
 * Who calls a function, from the TypeScript program rather than the lazy
 * evidence provider (which only knows the files it has loaded). Value-flow
 * walks a call only when this finds exactly one call and no escape (R7).
 */
export function createCallSiteIndex(tier1: TsTier1) {
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
    // An import or re-export under another name (`import { id as renamed }`, `export { id as seed }`) calls it by that name too.
    const names = new Set([name]);
    for (let size = 0; size !== names.size; ) {
      size = names.size;
      // Every file's imports and exports: an importer may name it only by its alias (`import choose from "./barrel"`).
      for (const file of files) {
        for (const statement of file.statements) {
          if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
          const aliases = (node: TypeScript.Node) => {
            const local = ts.isImportSpecifier(node) || ts.isExportSpecifier(node) || ts.isImportClause(node) ? node.name : undefined;
            if (local && !names.has(local.text) && resolve(checker.getSymbolAtLocation(local)) === symbol) names.add(local.text);
            ts.forEachChild(node, aliases);
          };
          aliases(statement);
        }
      }
    }
    let handed = false;
    // A namespace import of its module (`views[name](…)`) can call it by a key the index cannot read.
    const home = symbol.declarations?.[0]?.getSourceFile();
    const namespaced = !!home && files.some((file) => file.statements.some((statement) => ts.isImportDeclaration(statement) && !!statement.importClause?.namedBindings && ts.isNamespaceImport(statement.importClause.namedBindings) && checker.getSymbolAtLocation(statement.moduleSpecifier)?.valueDeclaration === home));
    for (const file of files) {
      if (![...names].some((each) => file.text.includes(each))) continue;
      const visit = (node: TypeScript.Node) => {
        // A shorthand property (`{ action }`) names the property; its value is the function.
        const own = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : ts.isIdentifier(node) ? checker.getSymbolAtLocation(node) : undefined;
        if (ts.isIdentifier(node) && names.has(node.text) && resolve(own) === symbol) {
          const parent = node.parent;
          const isDeclarationName = declarations.has(parent as TypeScript.Declaration);
          const isImport = ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isExportSpecifier(parent);
          const callee = ts.isCallExpression(parent) && parent.expression === node;
          if (callee) {
            const point = file.getLineAndCharacterOfPosition(node.getStart(file));
            calls.push(`${path.relative(root, file.fileName).split(path.sep).join("/")}:${point.line + 1}`);
          } else if (!isDeclarationName && !isImport) {
            if (handedToPage(ts, node)) handed = true;
            else escapes = true;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    const result: CallSites = { calls, escapes, ...(handed ? { handedToPage: true as const } : {}), ...(namespaced ? { namespaced: true as const } : {}) };
    cache.set(symbol, result);
    return result;
  };

  /** Whether a call's callee has a body in the program's own source to walk into. */
  const hasBody = (call: TypeScript.CallExpression): boolean => {
    const target = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
    const symbol = resolve(checker.getSymbolAtLocation(target));
    return (symbol?.declarations ?? []).some((declaration) => {
      const file = declaration.getSourceFile();
      const own = !file.isDeclarationFile && !path.relative(root, file.fileName).startsWith("..") && !file.fileName.includes(`${path.sep}node_modules${path.sep}`);
      const body = ts.isFunctionLike(declaration) || (ts.isVariableDeclaration(declaration) && !!declaration.initializer && ts.isFunctionLike(declaration.initializer));
      return own && body;
    });
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
      // A function written as an argument to a call with no source to read is called by that call alone.
      const call = fn?.parent;
      if (fn && call && ts.isCallExpression(call) && call.arguments.some((argument) => argument === fn) && !hasBody(call)) {
        const file = call.getSourceFile();
        const point = file.getLineAndCharacterOfPosition(call.getStart(file));
        return { calls: [`${path.relative(root, file.fileName).split(path.sep).join("/")}:${point.line + 1}`], escapes: false };
      }
      const symbol = fn ? symbolOfFunction(fn) : undefined;
      return symbol ? sitesOf(symbol) : null;
    },
  };
}

export type CallSiteIndex = ReturnType<typeof createCallSiteIndex>;

/**
 * Whether a function value is handed to a page element as a handler
 * (`<button onClick={click}>`): the page calls it and drops what it returns,
 * so the hand-off takes nothing back into the program.
 */
function handedToPage(ts: typeof TypeScript, node: TypeScript.Identifier): boolean {
  const expression = node.parent;
  const attribute = ts.isJsxExpression(expression) ? expression.parent : undefined;
  if (!attribute || !ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name) || !/^on[A-Z]/.test(attribute.name.text)) return false;
  const tag = attribute.parent.parent.tagName;
  return ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);
}

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
