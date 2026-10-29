// The language host over a TypeScript Program: nodes found by span, types
// from the checker, call sites from the Program's own references.
import path from "node:path";
import type * as TypeScript from "typescript";
import { createCallSiteIndex, type CallSiteIndex } from "./call-sites";
import { compilerSymbolId } from "../analysis/program-evidence-support";
import { scopeRole } from "./scope-roles";
import { callSitesOfElement, enclosingFunction, functionName, nodeAtSpan } from "./facts";
import type { BindingState, HostCandidate, LanguageHost } from "./host";
import { candidatesAt, sourceFileFor, spanOf, type Span } from "./selection";
import type { TsTier1 } from "./session";

export function createTypescriptHost(tier1: TsTier1): LanguageHost {
  const { ts, program } = tier1;
  const checker = program.getTypeChecker();
  const root = path.resolve(tier1.args.root);
  let sites: CallSiteIndex | null = null;
  const sourceFile = (file: string) => program.getSourceFile(path.resolve(root, file));
  const nodeAt = (file: string, span: Span) => {
    const found = sourceFile(file);
    const node = found ? nodeAtSpan(ts, found, span) : null;
    return node && found ? { node, sourceFile: found } : null;
  };
  return {
    language: "typescript",
    evidence: { pairsCalls: true, deadEnds: true },
    file(file) {
      const { relative, absolute } = sourceFileFor(tier1, file);
      return { relative, absolute };
    },
    candidates(file, span, text) {
      const found = sourceFileFor(tier1, file).sourceFile;
      return candidatesAt(ts, found, span, text).map(({ kind, text: candidateText, span: candidateSpan }) => ({ kind, text: candidateText, span: candidateSpan }));
    },
    // The TypeScript ledger walks the Program's own nodes for its parts (`value-flow.ts` `compose`).
    parts() {
      return [];
    },
    identifierOnLine(file, name, line) {
      const found = sourceFile(file);
      return found ? identifierOnLine(ts, found, name, line) : null;
    },
    textAt(file, span) {
      const at = nodeAt(file, span);
      return at ? at.node.getText(at.sourceFile) : null;
    },
    typeTextAt(file, span) {
      const at = nodeAt(file, span);
      if (!at) return null;
      try {
        const text = checker.typeToString(checker.getTypeAtLocation(at.node));
        return text.length > 160 ? `${text.slice(0, 159)}…` : text;
      } catch {
        return null;
      }
    },
    bindingAt(file, span) {
      const at = nodeAt(file, span);
      return at ? bindingOf(ts, checker, root, at.node) : null;
    },
    scopeAt(file, span) {
      const at = nodeAt(file, span);
      const fn = at ? enclosingFunction(ts, at.node) : null;
      if (!fn || !at) return null;
      return { span: spanOf(at.sourceFile, fn), name: functionName(ts, fn, at.sourceFile), role: scopeRole(ts, fn, at.sourceFile) };
    },
    callSitesOf(element) {
      sites ??= createCallSiteIndex(tier1);
      return callSitesOfElement(tier1, sites, element);
    },
  };
}

/**
 * The identifier `name` on `line`: a declaration's name first, else the first
 * use. The engine's evidence for a declaration sits on its initializer (a
 * `createResource(...)` call) or on the whole function, not on the name, so
 * those nodes follow as fallbacks.
 */
function identifierOnLine(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, name: string, line: number): HostCandidate | null {
  const hits: TypeScript.Identifier[] = [];
  const visit = (node: TypeScript.Node) => {
    if (ts.isIdentifier(node) && node.text === name && sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 === line) hits.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const declares = (id: TypeScript.Identifier) => {
    const p = id.parent;
    return (
      (ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isClassDeclaration(p) || ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) &&
      p.name === id
    );
  };
  const node = hits.find(declares) ?? hits[0];
  if (!node) return null;
  const fallbacks: TypeScript.Node[] = [];
  const p = node.parent;
  // `const [records] = createResource(…)`: the name is a binding element; the evidence is on the initializer.
  let declaration: TypeScript.Node | undefined = p;
  while (declaration && !ts.isVariableDeclaration(declaration) && (ts.isBindingElement(declaration) || ts.isArrayBindingPattern(declaration) || ts.isObjectBindingPattern(declaration))) declaration = declaration.parent;
  if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) fallbacks.push(declaration.initializer);
  if (declares(node)) fallbacks.push(p);
  // `<RouteFrame …>`: a JSX tag's evidence is the occurrence, the element itself.
  if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === node) {
    fallbacks.push(p);
    if (ts.isJsxOpeningElement(p) && ts.isJsxElement(p.parent)) fallbacks.push(p.parent);
  }
  if (declaration && ts.isVariableDeclaration(declaration)) {
    fallbacks.push(declaration);
    if (ts.isVariableDeclarationList(declaration.parent) && ts.isVariableStatement(declaration.parent.parent)) fallbacks.push(declaration.parent.parent);
  }
  return { kind: ts.SyntaxKind[node.kind], text: name, span: spanOf(sourceFile, node), fallbacks: fallbacks.map((item) => spanOf(sourceFile, item)) };
}

/**
 * The local binding under an expression: down through field reads, `!`, parentheses and argument-free
 * calls of the binding itself (a Solid accessor) to an identifier declared as a variable, parameter or
 * destructured name in a source file of the root. A method call (`x.trim()`) is a new value, not a read.
 */
function bindingOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, found: TypeScript.Node) {
  // A lone attribute has the span of the attribute list around it.
  const node = ts.isJsxAttributes(found) && found.properties.length === 1 ? found.properties[0] : found;
  const fields: string[] = [];
  // `note={n()}`: a prop binding reads its expression, and fills the attribute it names.
  const filled = ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
  let at: TypeScript.Node = filled ?? (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node) ? node.name : node);
  // `const [doc, setDoc] = …`: a pattern stands for its first name, the value it reads.
  while (ts.isArrayBindingPattern(at) || ts.isObjectBindingPattern(at)) {
    const elements: readonly TypeScript.Node[] = at.elements;
    const first = elements.find((item): item is TypeScript.BindingElement => ts.isBindingElement(item));
    if (!first) return null;
    at = first.name;
  }
  for (;;) {
    if (ts.isParenthesizedExpression(at) || ts.isNonNullExpression(at)) at = at.expression;
    else if (ts.isPropertyAccessExpression(at)) {
      fields.unshift(at.name.text);
      at = at.expression;
    } else if (ts.isCallExpression(at) && at.arguments.length === 0 && ts.isIdentifier(skipWrappers(ts, at.expression))) at = skipWrappers(ts, at.expression);
    else break;
  }
  if (!ts.isIdentifier(at)) return null;
  let symbol: TypeScript.Symbol | undefined;
  try {
    symbol = ts.isShorthandPropertyAssignment(at.parent) && at.parent.name === at ? checker.getShorthandAssignmentValueSymbol(at.parent) : checker.getSymbolAtLocation(at);
  } catch {
    return null;
  }
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (!symbol || !declaration || declaration.getSourceFile().isDeclarationFile) return null;
  if (!(ts.isVariableDeclaration(declaration) || ts.isParameter(declaration) || ts.isBindingElement(declaration))) return null;
  const id = compilerSymbolId(ts, checker, root, at, symbol);
  if (!id) return null;
  const parent = filled ? node : node.parent && ts.isJsxExpression(node.parent) ? node.parent.parent : node.parent;
  const attribute = parent && ts.isJsxAttribute(parent) ? parent.name.getText() : null;
  return { symbol: id, field: fields.length ? fields.join(".") : null, attribute, state: stateOf(ts, checker, declaration) };
}

/** The framework calls that make state, by name, when the callee is declared in a framework package. */
const STATE_CALLS: Record<string, BindingState> = {
  createSignal: "signal",
  useState: "signal",
  createStore: "store",
  createMutable: "store",
  useReducer: "store",
  createResource: "resource",
  createAsync: "resource",
  useQuery: "resource",
  useSWR: "resource",
  createMemo: "memo",
  useMemo: "memo",
  useContext: "context",
};
const FRAMEWORK_PACKAGE = /node_modules\/(solid-js|react|@solidjs\/router|@tanstack\/[^/]+-query|swr)\//;

/** `const [doc] = createResource(…)`: the state the declaration's initializer makes, else null. */
function stateOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.Declaration): BindingState | null {
  let at: TypeScript.Node = declaration;
  while (ts.isBindingElement(at) || ts.isArrayBindingPattern(at) || ts.isObjectBindingPattern(at)) at = at.parent;
  if (!ts.isVariableDeclaration(at) || !at.initializer) return null;
  const init = skipWrappers(ts, at.initializer);
  if (!ts.isCallExpression(init)) return null;
  const callee = skipWrappers(ts, init.expression);
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
  const state = name ? STATE_CALLS[name] : undefined;
  if (!state) return null;
  try {
    let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const file = symbol?.declarations?.[0]?.getSourceFile().fileName ?? "";
    return FRAMEWORK_PACKAGE.test(file) ? state : null;
  } catch {
    return null;
  }
}

function skipWrappers(ts: typeof TypeScript, node: TypeScript.Expression): TypeScript.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}
