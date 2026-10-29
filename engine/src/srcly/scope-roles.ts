// What a function is for, by how the code writes and uses it: the role word
// a Data flow frame carries (component, hook, handler, server query, …), so a
// helper never reads as a component. Conventions of the frameworks srcly
// draws, read from syntax and the checker; never part of the analysis.
import type * as TypeScript from "typescript";

export type ScopeRole = "component" | "hook" | "handler" | "fetcher" | "server" | "callback" | "helper";

/** Calls whose function argument fetches a resource's value. */
const FETCHER_CALLS = new Set(["createResource", "createAsync", "useQuery", "useSWR", "createQuery", "useMutation", "createMutation"]);
/** Calls that make a server function of the function they wrap. */
const SERVER_WRAPPERS = new Set(["query", "action", "createServerFn", "server$"]);
/** Object keys whose function fetches (`useQuery({ queryFn })`). */
const FETCHER_KEYS = new Set(["queryFn", "mutationFn", "fetcher"]);

export function scopeRole(ts: typeof TypeScript, fn: TypeScript.SignatureDeclaration, sourceFile: TypeScript.SourceFile): ScopeRole {
  if (usesServer(ts, fn, sourceFile)) return "server";
  const name = bindingName(ts, fn);
  let parent: TypeScript.Node = fn.parent;
  while (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent)) parent = parent.parent;
  const call = ts.isCallExpression(parent) && parent.arguments.includes(fn as TypeScript.Expression) ? parent : null;
  const callee = call ? calleeName(ts, call) : null;
  if (callee && SERVER_WRAPPERS.has(callee)) return "server";
  // `createResource(source, fetcher)`: with two functions, the first only says what to fetch.
  if (callee && FETCHER_CALLS.has(callee) && (callee !== "createResource" || call!.arguments.length < 2 || call!.arguments[1] === fn)) return "fetcher";
  if (ts.isPropertyAssignment(parent) && FETCHER_KEYS.has(parent.name.getText(sourceFile))) return "fetcher";
  if (ts.isCallExpression(parent) && callee === "addEventListener") return "handler";
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) && /^on[A-Z:]/.test(parent.parent.name.getText(sourceFile))) return "handler";
  if (name && /^use[A-Z]/.test(name)) return "hook";
  if (name && /^[A-Z]/.test(name) && rendersJsx(ts, fn)) return "component";
  if (name && (/^(handle|on)[A-Z]/.test(name) || handlesEvent(ts, sourceFile, name))) return "handler";
  if (!name || call || ts.isJsxExpression(parent)) return "callback";
  return "helper";
}

/** `const name = …`, `function name`, a method: the name the code gives the function itself. */
function bindingName(ts: typeof TypeScript, fn: TypeScript.SignatureDeclaration): string | null {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  let parent: TypeScript.Node = fn.parent;
  // `const save = async () => …`, also through a wrapper call: `const getDoc = query(async () => …)`.
  if (ts.isCallExpression(parent)) parent = parent.parent;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : null;
}

function calleeName(ts: typeof TypeScript, call: TypeScript.CallExpression): string | null {
  const callee = call.expression;
  return ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

/** A `"use server"` directive at the top of the function's body, or of its file. */
function usesServer(ts: typeof TypeScript, fn: TypeScript.SignatureDeclaration, sourceFile: TypeScript.SourceFile): boolean {
  const directive = (statements: readonly TypeScript.Statement[] | undefined) => {
    for (const statement of statements ?? []) {
      if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
      if (statement.expression.text === "use server") return true;
    }
    return false;
  };
  const body = "body" in fn ? (fn.body as TypeScript.Node | undefined) : undefined;
  return (body !== undefined && ts.isBlock(body) && directive(body.statements)) || directive(sourceFile.statements);
}

function rendersJsx(ts: typeof TypeScript, fn: TypeScript.Node): boolean {
  let found = false;
  const visit = (node: TypeScript.Node) => {
    if (found) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) found = true;
    // A nested function's JSX is its own, not this function's.
    else if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return found;
}

/** The function's name handed to an `on*` attribute somewhere in its file: `<button onClick={save}>`. */
function handlesEvent(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, name: string): boolean {
  let found = false;
  const visit = (node: TypeScript.Node) => {
    if (found) return;
    if (ts.isJsxAttribute(node) && /^on[A-Z:]/.test(node.name.getText(sourceFile)) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === name) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
