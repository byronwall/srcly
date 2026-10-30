// The evidence facts a selection starts from, and the call sites behind a
// cross-call element: shared by the value-flow ledger and the anchor graph so
// both start from the same seed and stop at the same boundaries (R7).
import path from "node:path";
import type * as TypeScript from "typescript";
import { isStandardLibraryCallee } from "../analysis/program-evidence-support";
import type { ProgramElement } from "../analysis/scope-seam";
import type { CallSiteIndex, CallSites } from "./call-sites";
import { elementTraits, relationTraits, SEED_KINDS } from "./kinds";
import { sameSpan, spanOf, type Span } from "./selection";
import type { BaseTier1, Tier1, TsTier1 } from "./session";

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
  const crossCall = relationTraits(kind).crossCall;
  return crossCall === "unpaired" || (crossCall === "paired" && !pairsCalls);
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

/**
 * The callee of a call element when it resolves outside the program's own
 * source (a library, a global like `Math.min`), else null. Nothing continuing
 * from such a call is external code, not a dead end.
 */
export function externalCallee(tier1: Tier1, element: Pick<ProgramElement, "kind" | "location" | "attributes">): string | null {
  if (element.kind !== "call" && element.kind !== "call-result") return null;
  // The Python helper records the callee mypy resolved outside the program (site-packages, typeshed, the stdlib).
  if (tier1.language !== "typescript") return typeof element.attributes?.externalCallee === "string" ? element.attributes.externalCallee : null;
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

/** Whether a call's callee is declared only by TypeScript's own lib files (`trim`, `map`, `JSON.stringify`, `console.log`). */
export function standardLibraryCall(tier1: Tier1, element: Pick<ProgramElement, "kind" | "location">): boolean {
  if (element.kind !== "call" || tier1.language !== "typescript") return false;
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  const node = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  // A constructor too: `new URLSearchParams(search)`, `new Map(entries)`, `new Date(value)`.
  if (!node || !(ts.isCallExpression(node) || ts.isNewExpression(node))) return false;
  const checker = tier1.program.getTypeChecker();
  if (isStandardLibraryCallee(ts, checker, node.expression)) return true;
  // A function the standard library supplied under a local name (`resolve` in `new Promise((resolve) => …)`): its signature is the lib's.
  return ts.isCallExpression(node) && !!checker.getResolvedSignature(node)?.declaration?.getSourceFile().hasNoDefaultLib;
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
export function naturalEnd(tier1: Tier1, element: Pick<ProgramElement, "kind" | "location" | "module" | "attributes"> & { terminalRoles?: readonly string[] }): "start" | "bookkeeping" | "consumed" | "unrecorded" | null {
  const traits = elementTraits(element.kind);
  if (traits.declaration || traits.bookkeeping || traits.terminal || (element.terminalRoles?.length ?? 0) > 0) return "bookkeeping";
  if (isNaturalStart(tier1, element)) return "start";
  if (endsInPlace(tier1, element)) return "consumed";
  // The callee of a call into first-party code names the function the walk enters; the call's own relations carry on (a callee with no body is related to its call).
  if (namesCallee(tier1, element)) return "bookkeeping";
  // A value that ends in a call to code outside the program is a stop the evidence can name, whatever it marks about dead ends.
  if (!tier1.host.evidence.deadEnds && externalCallee(tier1, element)) return null;
  return tier1.host.evidence.deadEnds ? null : "unrecorded";
}

/**
 * Whether a value concretely begins at the element, as a literal does: an
 * empty `{}` or `[]` the code makes, or a parameter a package fills
 * (`libraryFilledParameter`). A backward walk that reaches one has landed.
 */
export function beginsHere(tier1: Tier1, element: Pick<ProgramElement, "location">): boolean {
  if (tier1.language !== "typescript") return false;
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  const node = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  return !!node && (isEmptyLiteral(ts, node) || libraryFilledParameter(ts, tier1.program.getTypeChecker(), node));
}

function isEmptyLiteral(ts: typeof TypeScript, node: TypeScript.Node): boolean {
  return (ts.isObjectLiteralExpression(node) && node.properties.length === 0) || (ts.isArrayLiteralExpression(node) && node.elements.length === 0);
}

/** Whether a value naturally begins at this element: a literal, a literal constant, an external import or global. */
export function isNaturalStart(tier1: Tier1, element: Pick<ProgramElement, "kind" | "location" | "module"> & { attributes?: ProgramElement["attributes"] }): boolean {
  // A provider may mark a start it found itself (`naturalStart`), as the Python helper does for a module outside the program (`os.path`).
  if (element.kind === "literal" || element.attributes?.naturalStart === true) return true;
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
  if (isLiteral(node) || isEmptyLiteral(ts, node)) return true;
  const declaration = ts.isVariableDeclaration(node) ? node : ts.isVariableDeclaration(node.parent) && node.parent.name === node ? node.parent : null;
  if (declaration?.initializer && isLiteral(declaration.initializer)) {
    const list = declaration.parent;
    return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
  }
  // A parameter of a function written as an argument to a library call (`handleSubmit((values) => …)`) is filled by that library: it begins there.
  if (libraryFilledParameter(ts, tier1.program.getTypeChecker(), node)) return true;
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

/** Whether the identifier names a parameter of a function written as an argument to a call or `new` with no source in the program (`resolve` in `new Promise((resolve) => …)`). */
function suppliedByLibrary(ts: typeof TypeScript, checker: TypeScript.TypeChecker, name: TypeScript.Identifier): boolean {
  const parameter = checker.getSymbolAtLocation(name)?.valueDeclaration;
  if (!parameter || !ts.isParameter(parameter)) return false;
  let fn: TypeScript.Node = parameter.parent;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  while (ts.isParenthesizedExpression(fn.parent)) fn = fn.parent;
  const call = fn.parent;
  if (!(ts.isCallExpression(call) || ts.isNewExpression(call)) || !call.arguments?.includes(fn as TypeScript.Expression)) return false;
  const declaration = ts.isCallExpression(call) ? checker.getResolvedSignature(call)?.declaration : checker.getSymbolAtLocation(call.expression)?.declarations?.[0];
  return !!declaration && declaration.getSourceFile().isDeclarationFile;
}

/**
 * Whether the node is (or names) a parameter of a function written as an
 * argument to a call into a package (declarations with no body), not the
 * standard library, whose callbacks the engine models: the package calls it
 * with values it makes.
 */
function libraryFilledParameter(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  const parameter = ts.isIdentifier(node) && ts.isParameter(node.parent) ? node.parent : node;
  if (!ts.isParameter(parameter)) return false;
  let fn: TypeScript.Node = parameter.parent;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  while (ts.isParenthesizedExpression(fn.parent)) fn = fn.parent;
  const call = fn.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(fn as TypeScript.Expression) || isStandardLibraryCallee(ts, checker, call.expression)) return false;
  const declaration = checker.getResolvedSignature(call)?.declaration;
  return !!declaration && declaration.getSourceFile().isDeclarationFile && !declaration.getSourceFile().hasNoDefaultLib;
}

/** Whether the element is the callee expression of a call or `new`. */
function namesCallee(tier1: Tier1, element: Pick<ProgramElement, "location">): boolean {
  if (tier1.language !== "typescript") return false;
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  let node: TypeScript.Node | null = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  while (node?.parent && (ts.isParenthesizedExpression(node.parent) || ts.isNonNullExpression(node.parent))) node = node.parent;
  const parent = node?.parent;
  return !!parent && (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node;
}

/** The note on a value the code ends in place, by how it ends there. */
const TIMERS = new Set(["setTimeout", "setInterval", "setImmediate", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback"]);

export const IN_PLACE_NOTES = { branch: "ends here · decides a branch", write: "ends here · written, not read", key: "ends here · picks a field", discard: "ends here · its result is not used", schedule: "ends here · the callback runs later", throw: "ends here · thrown", "exported-api": "ends here · exported, and nothing in the program reads it", unused: "ends here · never read", "handed-back": "ends here · handed back to the library" };

/**
 * How the code ends the value at this element where it is used, without
 * carrying it on: `branch` when it is the test of an `if`, loop, `switch` or
 * `case`, consumed by control; `write` when it is written rather than read
 * (an assignment's target, `++`/`--`, a `delete` operand); `key` when it
 * is a computed key, which picks a field without being the value read;
 * `throw` when it is what a `throw` throws, which leaves the code it is in;
 * `exported-api` when it is an exported declaration: a walk that stops there
 * has reached the module's API, which code outside the program may read;
 * `unused` when it is a parameter or local binding nothing reads.
 * Null otherwise.
 */
export function endsInPlace(tier1: Tier1, element: Pick<ProgramElement, "location" | "attributes">): keyof typeof IN_PLACE_NOTES | null {
  // A provider may mark the end it found itself (`endsInPlace`), as the Python helper does for a branch test, a write or a dropped result.
  const marked = element.attributes?.endsInPlace;
  if (typeof marked === "string" && Object.hasOwn(IN_PLACE_NOTES, marked)) return marked as keyof typeof IN_PLACE_NOTES;
  if (tier1.language !== "typescript") return null;
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  let node: TypeScript.Node | null = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  while (node?.parent && (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isNonNullExpression(node.parent) || ts.isSatisfiesExpression(node.parent))) node = node.parent;
  const parent = node?.parent;
  if (!node || !parent) return null;
  // A timer (`setTimeout(() => …)`) runs the function it is given later; what reaches the call is that function, not data it hands on.
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && TIMERS.has(node.expression.text) && isStandardLibraryCallee(ts, tier1.program.getTypeChecker(), node.expression)) return "schedule";
  // A promise chain the code drops (`load().then(show);`) ends there: the standard library's promise carries nothing further. A dropped `map.set(k, v)` does not: its receiver keeps the value.
  if (ts.isCallExpression(node) && (ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) && isStandardLibraryCallee(ts, tier1.program.getTypeChecker(), node.expression) && tier1.program.getTypeChecker().getTypeAtLocation(node).getProperty("then")) return "discard";
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return parent.left === node ? "write" : null;
  const updates = (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken);
  if (updates || ts.isDeleteExpression(parent)) return "write";
  // A computed key picks a field without being the value read or written: `obj[k]`, `{ [k]: v }`, `{ [k]: v } = obj`.
  if ((ts.isElementAccessExpression(parent) && parent.argumentExpression === node) || ts.isComputedPropertyName(parent)) return "key";
  if (ts.isThrowStatement(parent) && parent.expression === node) return "throw";
  if (sourceFile && exportedDeclaration(ts, tier1.program.getTypeChecker(), sourceFile, node, readSymbols(tier1))) return "exported-api";
  if (unreadBinding(ts, tier1.program.getTypeChecker(), node, readSymbols(tier1))) return "unused";
  if (testedOnly(ts, tier1.program.getTypeChecker(), node)) return "branch";
  if (sourceFile && apiCallback(ts, tier1.program.getTypeChecker(), sourceFile, node, readSymbols(tier1))) return "exported-api";
  // A call through a function the library supplied (`resolve(value)` in `new Promise((resolve) => …)`) hands its argument back to that library.
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && suppliedByLibrary(ts, tier1.program.getTypeChecker(), node.expression)) return "handed-back";
  const test = ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent) || ts.isSwitchStatement(parent) || ts.isCaseClause(parent) ? parent.expression : ts.isForStatement(parent) ? parent.condition : undefined;
  return test === node ? "branch" : null;
}

/**
 * Whether the node is (or names) a parameter or a local binding the program
 * never reads (`_level`, `const { isSuccess } = useQuery()`): the checker
 * resolves no read to it, so the value it holds ends there. A parameter
 * property (`constructor(private width: number)`) is read through its member.
 */
function unreadBinding(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node, read: ReadonlySet<TypeScript.Symbol>): boolean {
  const declaration = ts.isIdentifier(node) ? node.parent : node;
  if (!(ts.isParameter(declaration) || ts.isBindingElement(declaration) || (ts.isVariableDeclaration(declaration) && ts.findAncestor(declaration, ts.isFunctionLike)))) return false;
  const name = declaration.name;
  if (!ts.isIdentifier(name) || (ts.isIdentifier(node) && node !== name)) return false;
  const symbol = checker.getSymbolAtLocation(name);
  if (!symbol) return false;
  const symbols = ts.isParameter(declaration) && ts.isParameterPropertyDeclaration(declaration, declaration.parent) ? checker.getSymbolsOfParameterPropertyDeclaration(declaration, name.text) : [symbol];
  return symbols.every((item) => !read.has(item));
}

/**
 * Whether the node is a call through a callback its function was handed
 * (`onSeen(id)`, `props.onPick(label)`), where that function is an export
 * nothing in the program calls or renders: whoever calls it from outside
 * hands the callback in, so the value leaves through the module's API.
 */
function apiCallback(ts: typeof TypeScript, checker: TypeScript.TypeChecker, sourceFile: TypeScript.SourceFile, node: TypeScript.Node, read: ReadonlySet<TypeScript.Symbol>): boolean {
  if (!ts.isCallExpression(node)) return false;
  let callee: TypeScript.Expression = node.expression;
  while (ts.isParenthesizedExpression(callee) || ts.isNonNullExpression(callee)) callee = callee.expression;
  // The callback itself (`onSeen`), or a function-valued field the project declares on the parameter (`props.onPick`), never a method (`items.forEach`).
  if (ts.isPropertyAccessExpression(callee)) {
    const member = checker.getSymbolAtLocation(callee.name)?.valueDeclaration;
    if (!member || !ts.isPropertySignature(member) || member.getSourceFile().isDeclarationFile) return false;
  }
  const holder = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
  const parameter = ts.isIdentifier(holder) ? checker.getSymbolAtLocation(holder)?.valueDeclaration : undefined;
  if (!parameter || !ts.isParameter(parameter)) return false;
  const fn = parameter.parent;
  const name = ts.isFunctionDeclaration(fn) ? fn.name : (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) ? fn.parent.name : undefined;
  return !!name && ts.isIdentifier(name) && exportedDeclaration(ts, checker, sourceFile, name, read);
}

/**
 * Whether the node is (or names) a binding every read of which decides a
 * branch (`if (forgotten)`, `isClient ? a : b`, `ready && <X />`,
 * `<Show when={isVisible()}>`), through `!`, parentheses or an accessor's
 * call: the value ends where it is tested, at its binding.
 */
function testedOnly(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  const declaration = ts.isIdentifier(node) ? node.parent : node;
  if (!(ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration) || ts.isParameter(declaration)) || !ts.isIdentifier(declaration.name)) return false;
  if (ts.isIdentifier(node) && node !== declaration.name) return false;
  const name = declaration.name;
  const symbol = checker.getSymbolAtLocation(name);
  const scope = ts.findAncestor(declaration.parent, ts.isFunctionLike) ?? declaration.getSourceFile();
  if (!symbol) return false;
  let reads = 0;
  let tested = true;
  const decides = (read: TypeScript.Node): boolean => {
    let use = read;
    for (;;) {
      const parent = use.parent;
      if (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent) || (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) || (ts.isCallExpression(parent) && parent.expression === use && parent.arguments.length === 0)) use = parent;
      else break;
    }
    const parent = use.parent;
    if ((ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent)) && parent.expression === use) return true;
    if ((ts.isConditionalExpression(parent) && parent.condition === use) || (ts.isForStatement(parent) && parent.condition === use)) return true;
    if (ts.isBinaryExpression(parent) && parent.left === use && (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || parent.operatorToken.kind === ts.SyntaxKind.BarBarToken)) return decides(parent) || ts.isJsxExpression(parent.parent);
    return ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) && parent.parent.name.getText() === "when";
  };
  const visit = (child: TypeScript.Node) => {
    if (!tested) return;
    if (ts.isIdentifier(child) && child !== name && checker.getSymbolAtLocation(child) === symbol) {
      reads += 1;
      tested = decides(child);
    }
    ts.forEachChild(child, visit);
  };
  visit(scope);
  return tested && reads > 0;
}

/** Whether the node is (or names) a declaration its module exports, by any form (`export const`, `export { x }`, `export default x`), that nothing in the program reads. */
function exportedDeclaration(ts: typeof TypeScript, checker: TypeScript.TypeChecker, sourceFile: TypeScript.SourceFile, node: TypeScript.Node, read: ReadonlySet<TypeScript.Symbol>): boolean {
  const declaration = ts.isIdentifier(node) ? node.parent : node;
  if (!(ts.isVariableDeclaration(declaration) || ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration)) || !declaration.name || !ts.isIdentifier(declaration.name)) return false;
  if (ts.isIdentifier(node) && declaration.name !== node) return false;
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const symbol = checker.getSymbolAtLocation(declaration.name);
  const exported = symbol && checker.getExportSymbolOfSymbol(symbol);
  // Read in the program by its own name, or through the module (`import * as api`, `api.name`).
  if (!moduleSymbol || !symbol || !exported || read.has(symbol) || read.has(exported)) return false;
  return checker.getExportsOfModule(moduleSymbol).some((item) => item === exported || item === symbol || ((item.flags & ts.SymbolFlags.Alias) !== 0 && checker.getAliasedSymbol(item) === symbol));
}

const readCache = new WeakMap<TypeScript.Program, Set<TypeScript.Symbol>>();

/** Every symbol some identifier in the program's own source reads (through an import alias too), once per Program: an export statement and a declaration's own name are not reads. */
function readSymbols(tier1: TsTier1): Set<TypeScript.Symbol> {
  const cached = readCache.get(tier1.program);
  if (cached) return cached;
  const { ts } = tier1;
  const checker = tier1.program.getTypeChecker();
  const root = path.resolve(tier1.args.root) + path.sep;
  const read = new Set<TypeScript.Symbol>();
  const visit = (node: TypeScript.Node) => {
    if (ts.isIdentifier(node) && !ts.isExportSpecifier(node.parent) && !ts.isExportAssignment(node.parent) && !ts.isImportSpecifier(node.parent) && !ts.isImportClause(node.parent) && (!(ts.isDeclarationStatement(node.parent) || ts.isVariableDeclaration(node.parent) || ts.isParameter(node.parent) || ts.isBindingElement(node.parent)) || (node.parent as { name?: TypeScript.Node }).name !== node)) {
      let symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      if (symbol) read.add(symbol);
    }
    ts.forEachChild(node, visit);
  };
  for (const file of tier1.program.getSourceFiles()) if (!file.isDeclarationFile && path.resolve(file.fileName).startsWith(root) && !file.fileName.includes(`${path.sep}node_modules${path.sep}`)) visit(file);
  readCache.set(tier1.program, read);
  return read;
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
  const start = sourceFile.getPositionOfLineAndCharacter(span.startLine - 1, span.startColumn - 1);
  const visit = (node: TypeScript.Node) => {
    // `pos` and `end` are plain fields: a wide JSX list has hundreds of siblings, and only these two checks are cheap enough to run on each.
    if (found || start < node.pos || start > node.end) return;
    const own = spanOf(sourceFile, node);
    if (sameSpan(own, span)) {
      found = node;
      return;
    }
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

/**
 * A function's name as the code says it: `const name = () =>`, `function name`,
 * a method or an object property. An inline function is named by where it is
 * written: `getDoc` for `const getDoc = query(async () => …)`, `<Match> child`,
 * `onClick on <button>`, `createResource callback`, `items.map callback`. Null
 * only when nothing around it names it.
 */
export function functionName(ts: typeof TypeScript, fn: TypeScript.Node, sourceFile: TypeScript.SourceFile): string | null {
  if (ts.isVariableDeclaration(fn.parent)) return fn.parent.name.getText(sourceFile);
  if (ts.isPropertyAssignment(fn.parent)) return fn.parent.name.getText(sourceFile);
  if ("name" in fn && fn.name) return (fn.name as TypeScript.Node).getText(sourceFile);
  let parent = fn.parent;
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
  if (!parent) return null;
  const tagOf = (element: TypeScript.Node) => {
    const opening = ts.isJsxElement(element) ? element.openingElement : ts.isJsxSelfClosingElement(element) ? element : null;
    return opening ? opening.tagName.getText(sourceFile) : null;
  };
  if (ts.isJsxExpression(parent)) {
    if (ts.isJsxAttribute(parent.parent)) {
      const tag = tagOf(parent.parent.parent.parent);
      return `${parent.parent.name.getText(sourceFile)}${tag ? ` on <${tag}>` : ""}`;
    }
    const tag = tagOf(parent.parent);
    return tag ? `<${tag}> child` : null;
  }
  if (ts.isCallExpression(parent) && parent.arguments.includes(fn as TypeScript.Expression)) {
    if (ts.isVariableDeclaration(parent.parent) && ts.isIdentifier(parent.parent.name) && parent.arguments[0] === fn) return parent.parent.name.text;
    const callee = parent.expression.getText(sourceFile).split(".").slice(-2).join(".");
    return callee.length <= 40 ? `${callee} callback` : null;
  }
  return null;
}

/** The call sites of the function a cross-call element belongs to: a call, a parameter or the function itself. */
export function callSitesOfElement(tier1: TsTier1, sites: CallSiteIndex, element: ProgramElement): { sites: CallSites | null; name: string } {
  const { ts } = tier1;
  const sourceFile = tier1.program.getSourceFile(path.resolve(tier1.args.root, element.location.file));
  const node = sourceFile ? nodeAtSpan(ts, sourceFile, element.location.span) : null;
  if (!node || !sourceFile) return { sites: null, name: element.label };
  // A return (an arrow's call body, a `yield f(x)`) spans the call it returns, but its sites are its function's.
  const call = ts.isCallExpression(node) && element.kind !== "return" ? node : null;
  if (call) return { sites: sites.forCall(call), name: call.expression.getText(sourceFile) };
  const fn = enclosingFunction(ts, node);
  const name = (fn && functionName(ts, fn, sourceFile)) ?? element.label;
  return { sites: sites.forFunctionOf(node), name };
}
