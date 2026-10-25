// The evidence facts a selection starts from, and the call sites behind a
// cross-call element: shared by the value-flow ledger and the anchor graph so
// both start from the same seed and stop at the same boundaries (R7).
import path from "node:path";
import type * as TypeScript from "typescript";
import type { ProgramElement } from "../analysis/scope-seam";
import type { CallSiteIndex, CallSites } from "./call-sites";
import { sameSpan, spanOf, type Span } from "./selection";
import type { Tier1 } from "./session";

/** Evidence elements a selection may start from, most specific first. */
export const SEED_KINDS = ["field-read", "selection", "call-result", "call", "value", "alias", "parameter", "jsx-occurrence", "literal"];

/** Followed only when the callee has exactly one call site (R7; M5 replaces this with invocation pairing). */
export const CROSS_CALL = new Set(["invokes", "argument", "argument-binding", "function-call", "function-return", "return-value", "callback-parameter"]);

/** Element kinds where a value leaves the program's own data flow. */
export const TERMINAL_KINDS = new Set(["render-terminal", "dom-terminal", "component-occurrence", "side-effect", "return"]);

/** Facts at exactly this span in this file. */
export function elementsAt(tier1: Tier1, file: string, span: Span) {
  return tier1.provider().facts.fileCandidates(file).filter((fact) => sameSpan(fact.location.span, span));
}

/** The evidence element a selection starts from: the most specific fact at exactly its span. */
export function seedFor(tier1: Tier1, file: string, span: Span): string | null {
  const facts = elementsAt(tier1, file, span);
  for (const kind of SEED_KINDS) {
    const match = facts.find((fact) => fact.kind === kind);
    if (match) return match.id;
  }
  return null;
}

/** The node whose span is exactly `span` (the outermost one when several share it). */
export function nodeAtSpan(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, span: Span): TypeScript.Node | null {
  let found: TypeScript.Node | null = null;
  const visit = (node: TypeScript.Node) => {
    if (found) return;
    const own = spanOf(sourceFile, node);
    if (sameSpan(own, span)) {
      found = node;
      return;
    }
    const start = sourceFile.getPositionOfLineAndCharacter(span.startLine - 1, span.startColumn - 1);
    if (node.getStart(sourceFile) <= start && start < node.getEnd()) ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

/** The nearest function-like ancestor of a node (the node itself when it is one), or null at module level. */
export function enclosingFunction(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.SignatureDeclaration | null {
  let fn: TypeScript.Node | undefined = node;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  return fn && ts.isFunctionLike(fn) ? fn : null;
}

/** A function's name as the code says it: `const name = () =>`, `function name`, a method, or null for an anonymous one. */
export function functionName(ts: typeof TypeScript, fn: TypeScript.Node, sourceFile: TypeScript.SourceFile): string | null {
  if (ts.isVariableDeclaration(fn.parent)) return fn.parent.name.getText(sourceFile);
  if (ts.isPropertyAssignment(fn.parent)) return fn.parent.name.getText(sourceFile);
  if ("name" in fn && fn.name) return (fn.name as TypeScript.Node).getText(sourceFile);
  return null;
}

/** The call sites of the function a cross-call element belongs to: a call, a parameter or the function itself. */
export function callSitesOfElement(tier1: Tier1, sites: CallSiteIndex, element: ProgramElement): { sites: CallSites | null; name: string } {
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  const node = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  if (!node || !sourceFile) return { sites: null, name: element.label };
  const call = ts.isCallExpression(node) ? node : null;
  if (call) return { sites: sites.forCall(call), name: call.expression.getText(sourceFile) };
  const fn = enclosingFunction(ts, node);
  const name = (fn && functionName(ts, fn, sourceFile)) ?? element.label;
  return { sites: sites.forFunctionOf(node), name };
}
