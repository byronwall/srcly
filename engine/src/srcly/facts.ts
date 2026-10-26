// The evidence facts a selection starts from, and the call sites behind a
// cross-call element: shared by the value-flow ledger and the anchor graph so
// both start from the same seed and stop at the same boundaries (R7).
import path from "node:path";
import type * as TypeScript from "typescript";
import type { ProgramElement } from "../analysis/scope-seam";
import type { CallSiteIndex, CallSites } from "./call-sites";
import { sameSpan, spanOf, type Span } from "./selection";
import type { BaseTier1, Tier1, TsTier1 } from "./session";

/** Evidence elements a selection may start from, most specific first. */
export const SEED_KINDS = ["field-read", "index-read", "selection", "call-result", "call", "value", "alias", "parameter", "jsx-occurrence", "literal"];

/** Relations between a call and its callee. */
export const CROSS_CALL = new Set(["invokes", "argument", "argument-binding", "function-call", "function-return", "return-value", "callback-parameter"]);

/** Cross-calls that never leave the caller (an argument reaches its own call; `invokes` names the callee and carries no value), and those the slice pairs by its invocation stack (T13). */
const LOCAL_CROSS_CALL = new Set(["argument", "invokes"]);
const PAIRED_CROSS_CALL = new Set(["argument-binding", "return-value"]);

/**
 * Whether following this relation needs R7's one-call-site rule. A walk
 * that entered a callee through a call leaves it only through that call,
 * and one that entered none (it started inside the callee) leaves through
 * every call, each a true source or destination: where the evidence pairs
 * calls, the slice's invocation stack already holds a binding or a return
 * to that, so neither is a handoff to prove. An `argument` never leaves
 * the caller: it reaches its own call, whether or not the callee has a body
 * to enter (`JSON.stringify(x)` has no call sites to pair). Only the
 * cross-calls the slice does not pair (callbacks, accessors) keep the rule.
 */
export function needsOneCallSite(kind: string, pairsCalls: boolean): boolean {
  return CROSS_CALL.has(kind) && !LOCAL_CROSS_CALL.has(kind) && !(pairsCalls && PAIRED_CROSS_CALL.has(kind));
}

/**
 * Whether the slice has already paired a callee with one of its call sites
 * (T13): among the function's call sites, exactly one is a call element the
 * slice walked, and the function never escapes as a value. The slice's
 * invocation stack keeps the other calls' returns out, so the walk may pass
 * where R7's one-call-site rule would stop it.
 */
export function pairedInSlice(sites: CallSites | null, elements: readonly Pick<ProgramElement, "kind" | "location">[]): boolean {
  if (!sites || sites.escapes || sites.calls.length < 2) return false;
  // A call site is a `call` element (TypeScript) or the `call-result` that is the call (Python).
  const walked = new Set(elements.filter((element) => element.kind === "call" || element.kind === "call-result").map((element) => `${element.location.file}:${element.location.line}`));
  return sites.calls.filter((site) => walked.has(site)).length === 1;
}

/** Element kinds where a value leaves the program's own data flow. */
export const TERMINAL_KINDS = new Set(["render-terminal", "dom-terminal", "component-occurrence", "side-effect", "return"]);

/** Declaration elements: they place a walk inside a function, they never carry a value of their own. */
export const DECLARATION_KINDS = new Set(["component-definition", "function-entry", "handler-entry"]);

/** Bookkeeping elements beside a carrier (a field consumer, a JSX tag name): a walk ending at one has not lost the value. */
const BOOKKEEPING_KINDS = new Set(["field-consumer", "jsx-occurrence"]);

/**
 * The callee of a call element when it resolves outside the program's own
 * source (a library, a global like `Math.min`), else null. Nothing continuing
 * from such a call is external code, not a dead end.
 */
export function externalCallee(tier1: Tier1, element: Pick<ProgramElement, "kind" | "location">): string | null {
  // Only the TypeScript Program resolves a callee's declaration; a Python call is never named external.
  if (tier1.language !== "typescript") return null;
  if (element.kind !== "call" && element.kind !== "call-result") return null;
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  const node = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  if (!node || !sourceFile || !ts.isCallExpression(node)) return null;
  const checker = tier1.program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression);
  const target = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  const targetFile = target?.getSourceFile();
  const firstParty = targetFile && !targetFile.isDeclarationFile && !targetFile.fileName.includes(`${path.sep}node_modules${path.sep}`);
  return firstParty ? null : node.expression.getText(sourceFile);
}

/**
 * What a `disconnected` gap at this element means (R16). A `start` is where a
 * value naturally begins: a literal; a constant whose initializer is a
 * literal or a template literal without substitutions; an import whose
 * module resolves outside the root, or a global the program does not
 * declare. Neither a frontier nor a dead end, and a backward walk that
 * reaches one has landed. `bookkeeping` is an element that is not a value (a
 * declaration, a field consumer, a JSX tag name) or a terminal, where a
 * value ends: no frontier, and no landing either. `consumed` is a value the
 * code ends in place (a branch test, a write: `endsInPlace`): no frontier,
 * and a forward walk that reaches one has landed. `unrecorded` is where
 * evidence that cannot tell a dead end from the end of what it records
 * (`LanguageHost.evidence.deadEnds` false) stops: not a dead end on its own,
 * but the place to name when the walk lands nowhere else. Null is a dead end.
 */
export function naturalEnd(tier1: Tier1, element: Pick<ProgramElement, "kind" | "location" | "module"> & { terminalRoles?: readonly string[] }): "start" | "bookkeeping" | "consumed" | "unrecorded" | null {
  if (DECLARATION_KINDS.has(element.kind) || BOOKKEEPING_KINDS.has(element.kind) || TERMINAL_KINDS.has(element.kind) || (element.terminalRoles?.length ?? 0) > 0) return "bookkeeping";
  if (isNaturalStart(tier1, element)) return "start";
  if (endsInPlace(tier1, element)) return "consumed";
  return tier1.host.evidence.deadEnds ? null : "unrecorded";
}

/** Whether a value naturally begins at this element: a literal, a literal constant, an external import or global. */
export function isNaturalStart(tier1: Tier1, element: Pick<ProgramElement, "kind" | "location" | "module">): boolean {
  if (element.kind === "literal") return true;
  // A Python program has no TypeScript nodes to read: only its literal elements are natural starts.
  if (tier1.language !== "typescript") return false;
  const { ts } = tier1;
  const root = path.resolve(tier1.args.root);
  const sourceFile = tier1.program.getSourceFile(path.resolve(root, element.location.file));
  if (!sourceFile) return false;
  // Outside the program's own source: another package, outside the root, or declarations with no body to read.
  const outside = (file: string | undefined) => !file || /\.d\.[cm]?ts$/.test(file) || file.includes(`${path.sep}node_modules${path.sep}`) || !path.resolve(file).startsWith(root + path.sep);
  const outsideModule = (spec: string) => {
    const resolved = ts.resolveModuleName(spec, sourceFile.fileName, tier1.program.getCompilerOptions(), ts.sys).resolvedModule;
    return !!resolved?.isExternalLibraryImport || outside(resolved?.resolvedFileName);
  };
  if (element.module && outsideModule(element.module)) return true;
  const node = nodeAtSpan(ts, sourceFile, element.location.span);
  if (!node) return false;
  const isLiteral = (n: TypeScript.Node) =>
    ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword
    || (ts.isPrefixUnaryExpression(n) && ts.isNumericLiteral(n.operand));
  if (isLiteral(node)) return true;
  const declaration = ts.isVariableDeclaration(node) ? node : ts.isVariableDeclaration(node.parent) && node.parent.name === node ? node.parent : null;
  if (declaration?.initializer && isLiteral(declaration.initializer)) {
    const list = declaration.parent;
    return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
  }
  // A global the program does not declare (`JSON`, `document`, `window`) begins outside it, as an external import does.
  if (ts.isIdentifier(node)) {
    const declarations = tier1.program.getTypeChecker().getSymbolAtLocation(node)?.declarations ?? [];
    if (declarations.length > 0 && declarations.every((item) => outside(item.getSourceFile().fileName))) return true;
  }
  if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) {
    const declaration = ts.findAncestor(node, ts.isImportDeclaration);
    if (declaration && ts.isStringLiteral(declaration.moduleSpecifier)) return outsideModule(declaration.moduleSpecifier.text);
  }
  return false;
}

/**
 * How the code ends the value at this element where it is used, without
 * carrying it on: `branch` when it is the test of an `if`, loop, `switch` or
 * `case`, consumed by control; `write` when it is written rather than read
 * (an assignment's target, `++`/`--`, a `delete` operand). Null otherwise.
 */
export function endsInPlace(tier1: Tier1, element: Pick<ProgramElement, "location">): "branch" | "write" | null {
  if (tier1.language !== "typescript") return null;
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  let node: TypeScript.Node | null = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  while (node?.parent && (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isNonNullExpression(node.parent) || ts.isSatisfiesExpression(node.parent))) node = node.parent;
  const parent = node?.parent;
  if (!node || !parent) return null;
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return parent.left === node ? "write" : null;
  const updates = (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken);
  if (updates || ts.isDeleteExpression(parent)) return "write";
  const test = ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent) || ts.isSwitchStatement(parent) || ts.isCaseClause(parent) ? parent.expression : ts.isForStatement(parent) ? parent.condition : undefined;
  return test === node ? "branch" : null;
}

/** Facts at exactly this span in this file. */
export function elementsAt(tier1: BaseTier1, file: string, span: Span) {
  return tier1.provider().facts.fileCandidates(file).filter((fact) => sameSpan(fact.location.span, span));
}

/** The evidence element a selection starts from: the most specific fact at exactly its span. */
export function seedFor(tier1: BaseTier1, file: string, span: Span): string | null {
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
export function callSitesOfElement(tier1: TsTier1, sites: CallSiteIndex, element: ProgramElement): { sites: CallSites | null; name: string } {
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
