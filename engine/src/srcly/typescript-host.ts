// The language host over a TypeScript Program: nodes found by span, types
// from the checker, call sites from the Program's own references.
import path from "node:path";
import type * as TypeScript from "typescript";
import { createCallSiteIndex, type CallSiteIndex } from "./call-sites";
import { callSitesOfElement, enclosingFunction, functionName, nodeAtSpan } from "./facts";
import type { HostCandidate, LanguageHost } from "./host";
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
    scopeAt(file, span) {
      const at = nodeAt(file, span);
      const fn = at ? enclosingFunction(ts, at.node) : null;
      if (!fn || !at) return null;
      return { span: spanOf(at.sourceFile, fn), name: functionName(ts, fn, at.sourceFile) };
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
