// The language host over a TypeScript Program: nodes found by span, types
// from the checker, call sites from the Program's own references.
import path from "node:path";
import type * as TypeScript from "typescript";
import { createCallSiteIndex, type CallSiteIndex } from "./call-sites";
import { compilerSymbolId } from "../analysis/program-evidence-support";
import { builtinTsModel } from "../analysis/library-models";
import { cellCall } from "../analysis/cells";
import { scopeRole } from "./scope-roles";
import { callSitesOfElement, enclosingFunction, functionName, nodeAtSpan } from "./facts";
import type { BindingState, HostCandidate, LanguageHost } from "./host";
import { candidatesAt, sliceWhole, sourceFileFor, spanOf, type Span } from "./selection";
import type { TsTier1 } from "./session";

export function createTypescriptHost(tier1: TsTier1): LanguageHost {
  const { ts, program } = tier1;
  const checker = program.getTypeChecker();
  const root = path.resolve(tier1.args.root);
  let sites: CallSiteIndex | null = null;
  const typeTexts = new WeakMap<TypeScript.Node, string | null>();
  const scopes = new WeakMap<TypeScript.SignatureDeclaration, NonNullable<ReturnType<LanguageHost["scopeAt"]>>>();
  const sourceFile = (file: string) => program.getSourceFile(path.resolve(root, file));
  const nodeAt = (file: string, span: Span) => {
    const found = sourceFile(file);
    const node = found ? nodeAtSpan(ts, found, span) : null;
    return node && found ? { node, sourceFile: found } : null;
  };
  /**
   * Whether the code changes the object a binding names after it is bound:
   * written through any access chain (`=`, compound, `++`, `delete`), passed
   * as `Object.assign`'s target, handed whole to another name, or exported.
   */
  /** A target inside a destructuring assignment's pattern (`[doc.note.title] = …`). */
  const destructuredTarget = (target: TypeScript.Node) => {
    let node = target;
    while (ts.isArrayLiteralExpression(node.parent) || ts.isObjectLiteralExpression(node.parent) || ts.isPropertyAssignment(node.parent) || ts.isShorthandPropertyAssignment(node.parent) || ts.isSpreadElement(node.parent) || ts.isSpreadAssignment(node.parent)) node = node.parent;
    return node !== target && ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  };
  /** Whether running every statement in order always returns or throws. */
  const endsAlways = (statement: TypeScript.Statement | undefined): boolean => {
    if (!statement) return false;
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
    if (ts.isBlock(statement)) return endsAlways(statement.statements.at(-1));
    if (ts.isIfStatement(statement)) return !!statement.elseStatement && endsAlways(statement.thenStatement) && endsAlways(statement.elseStatement);
    return false;
  };
  const changedBinding = (declaration: TypeScript.VariableDeclaration | TypeScript.ParameterDeclaration): boolean => {
    if (!ts.isIdentifier(declaration.name)) return true;
    const name = declaration.name;
    const symbol = checker.getSymbolAtLocation(name);
    if (!symbol) return true;
    if (ts.isVariableDeclaration(declaration) && (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0) return true;
    const unwrap = (node: TypeScript.Node) => {
      let top = node;
      while (ts.isAsExpression(top.parent) || ts.isSatisfiesExpression(top.parent) || ts.isParenthesizedExpression(top.parent) || ts.isNonNullExpression(top.parent)) top = top.parent;
      return top;
    };
    const changes = (use: TypeScript.Identifier) => {
      if (ts.isExportAssignment(use.parent)) return true;
      // `x.a.b`, `x["a"]`: the access chain that starts at this use.
      let top: TypeScript.Node = unwrap(use);
      while ((ts.isPropertyAccessExpression(top.parent) || ts.isElementAccessExpression(top.parent)) && top.parent.expression === top) top = unwrap(top.parent);
      const up = top.parent;
      const assigned = ts.isBinaryExpression(up) && up.left === top && up.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && up.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
      const stepped = (ts.isPrefixUnaryExpression(up) || ts.isPostfixUnaryExpression(up)) && (up.operator === ts.SyntaxKind.PlusPlusToken || up.operator === ts.SyntaxKind.MinusMinusToken);
      const whole = top === unwrap(use);
      if (!whole && (assigned || stepped || ts.isDeleteExpression(up) || destructuredTarget(top))) return true;
      // Handed to a function (which may write it: `rename(note)`, `Object.assign(note, …)`), or to another name (`const sub = doc.note`).
      if ((ts.isCallExpression(up) || ts.isNewExpression(up)) && up.arguments?.includes(top as TypeScript.Expression)) return true;
      if (ts.isVariableDeclaration(up) && up.initializer === top) return true;
      return ts.isBinaryExpression(up) && up.right === top && up.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    };
    let found = false;
    const visit = (node: TypeScript.Node) => {
      if (found) return;
      // `export { state }` hands it to every importer, which may change it.
      if (ts.isExportSpecifier(node) && checker.getExportSpecifierLocalTargetSymbol(node) === symbol) found = true;
      else if (ts.isIdentifier(node) && node !== name && node.text === name.text && checker.getSymbolAtLocation(node) === symbol && changes(node)) found = true;
      else ts.forEachChild(node, visit);
    };
    // A local binding is used only in its own file; an exported one may be changed anywhere.
    visit(declaration.getSourceFile());
    return found;
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
    unsureBinding(file, span) {
      const at = nodeAt(file, span);
      if (!at) return true;
      // The element may sit on the name or on its whole declaration.
      const node = ts.isIdentifier(at.node) ? at.node.parent : at.node;
      // An argument at or after a spread (`f(...pair, x)`) is not at the position the binding names; the evidence may sit inside `x as T`.
      let argument: TypeScript.Node = at.node;
      while (ts.isAsExpression(argument.parent) || ts.isSatisfiesExpression(argument.parent) || ts.isParenthesizedExpression(argument.parent) || ts.isNonNullExpression(argument.parent) || ts.isTypeAssertionExpression(argument.parent)) argument = argument.parent;
      const call = argument.parent;
      if ((ts.isCallExpression(call) || ts.isNewExpression(call)) && call.arguments) {
        const index = call.arguments.indexOf(argument as TypeScript.Expression);
        if (index >= 0 && call.arguments.slice(0, index + 1).some((argument) => ts.isSpreadElement(argument))) return true;
      }
      // A function that declares `this` binds its arguments one place over.
      if (ts.isParameter(node) && node.parent.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === "this")) return true;
      // A state pair's `[value, setter]` is modelled; an object pattern, a rest or a default is not one value the evidence names.
      if (ts.isBindingElement(node)) return ts.isObjectBindingPattern(node.parent) || !!node.initializer || !!node.dotDotDotToken;
      if (ts.isParameter(node)) return !!node.initializer || !!node.dotDotDotToken || !ts.isIdentifier(node.name);
      if (ts.isVariableDeclaration(node)) return ts.isObjectBindingPattern(node.name);
      return false;
    },
    callable(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      if (checker.getTypeAtLocation(at.node).getCallSignatures().length > 0) return true;
      // Untyped, the model still says it: a pair's first handle that is read by calling it (`ReturnValue.Member[0].ReturnValue`).
      const element = ts.isIdentifier(at.node) ? at.node.parent : at.node;
      const pattern = ts.isBindingElement(element) ? element.parent : undefined;
      const declaration = pattern && ts.isArrayBindingPattern(pattern) && pattern.elements[0] === element ? pattern.parent : undefined;
      const cell = declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? cellCall(ts, checker, declaration.initializer) : null;
      return !!cell && (cell.row.reads ?? []).some((path) => path === "ReturnValue.Member[0].ReturnValue");
    },
    returnUnsure(file, span) {
      const at = nodeAt(file, span);
      if (!at) return true;
      let node: TypeScript.Node | undefined = at.node;
      while (node && !ts.isFunctionLike(node)) {
        if (ts.isYieldExpression(node)) return true;
        node = node.parent;
      }
      if (!node) return false;
      const fn = node as TypeScript.SignatureDeclaration & { body?: TypeScript.Node; asteriskToken?: TypeScript.AsteriskToken };
      // A generator's value is an iterator, not what it returns; a block body whose end can be reached also returns undefined.
      if (fn.asteriskToken) return true;
      // An async function's call is a promise: what it returns is the field only once awaited.
      if (ts.getCombinedModifierFlags(fn as unknown as TypeScript.Declaration) & ts.ModifierFlags.Async) return "async";
      if (!fn.body || !ts.isBlock(fn.body)) return false;
      return !endsAlways(fn.body);
    },
    awaited(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      let node: TypeScript.Node = at.node;
      while (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isNonNullExpression(node.parent)) node = node.parent;
      return ts.isAwaitExpression(node.parent);
    },
    mutable(file, span) {
      const at = nodeAt(file, span);
      if (!at || !ts.isObjectLiteralExpression(at.node)) return false;
      // Up through the object literals (and `as`/`satisfies`) that hold it, to the binding that names the outermost one.
      let holder: TypeScript.Node = at.node;
      for (;;) {
        if (ts.isPropertyAssignment(holder.parent) && ts.isObjectLiteralExpression(holder.parent.parent)) holder = holder.parent.parent;
        else if (ts.isAsExpression(holder.parent) || ts.isSatisfiesExpression(holder.parent) || ts.isParenthesizedExpression(holder.parent)) holder = holder.parent;
        else break;
      }
      const parent = holder.parent;
      if (!ts.isVariableDeclaration(parent) || parent.initializer !== holder) return false;
      return changedBinding(parent);
    },
    mutatedBinding(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      const declaration = ts.isIdentifier(at.node) ? at.node.parent : at.node;
      return (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) && changedBinding(declaration);
    },
    stateFactory(file, span) {
      const at = nodeAt(file, span);
      return !!at && ts.isCallExpression(at.node) && cellCall(ts, checker, at.node) !== null;
    },
    objectMembers(file, span) {
      const at = nodeAt(file, span);
      if (!at || !ts.isObjectLiteralExpression(at.node)) return null;
      return at.node.properties.map((member) => {
        if (ts.isSpreadAssignment(member) || !member.name || ts.isComputedPropertyName(member.name)) return null;
        return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) || ts.isNumericLiteral(member.name) || ts.isPrivateIdentifier(member.name) ? member.name.text : null;
      });
    },
    typeTextAt(file, span) {
      const at = nodeAt(file, span);
      if (!at) return null;
      if (typeTexts.has(at.node)) return typeTexts.get(at.node)!;
      try {
        const text = checker.typeToString(checker.getTypeAtLocation(at.node));
        const clipped = text.length > 160 ? `${sliceWhole(text, 159)}…` : text;
        typeTexts.set(at.node, clipped);
        return clipped;
      } catch {
        typeTexts.set(at.node, null);
        return null;
      }
    },
    linksOf(file, span) {
      const at = nodeAt(file, span);
      return at && ts.isFunctionLike(at.node) ? linksOf(ts, checker, root, at.node) : { calls: [], reads: [], writes: [] };
    },
    bindingAt(file, span) {
      const at = nodeAt(file, span);
      return at ? bindingOf(ts, checker, root, at.node) : null;
    },
    scopeAt(file, span) {
      const at = nodeAt(file, span);
      const fn = at ? enclosingFunction(ts, at.node) : null;
      if (!fn || !at) return null;
      let scope = scopes.get(fn);
      if (!scope) {
        scope = { span: spanOf(at.sourceFile, fn), name: functionName(ts, fn, at.sourceFile), role: scopeRole(ts, checker, fn, at.sourceFile) };
        scopes.set(fn, scope);
      }
      return scope;
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

/** `const [doc] = createResource(…)`: the state the declaration's initializer makes, else null. */
function stateOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.Declaration): BindingState | null {
  let at: TypeScript.Node = declaration;
  while (ts.isBindingElement(at) || ts.isArrayBindingPattern(at) || ts.isObjectBindingPattern(at)) at = at.parent;
  if (!ts.isVariableDeclaration(at) || !at.initializer) return null;
  const init = skipWrappers(ts, at.initializer);
  if (!ts.isCallExpression(init)) return null;
  const callee = skipWrappers(ts, init.expression);
  // The callee's row names the state it makes (`state`).
  try {
    return builtinTsModel(ts, checker, callee)?.state ?? null;
  } catch {
    return null;
  }
}

function skipWrappers(ts: typeof TypeScript, node: TypeScript.Expression): TypeScript.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}

/** A function's calls into the root and the outer bindings it reads and writes; nested functions are their own. */
function linksOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, fn: TypeScript.SignatureDeclaration) {
  const calls = new Map<string, { file: string; span: Span }>();
  const reads = new Set<string>();
  const writes = new Set<string>();
  const outer = (id: TypeScript.Identifier): { symbol: TypeScript.Symbol; declaration: TypeScript.Declaration } | null => {
    let symbol: TypeScript.Symbol | undefined;
    try {
      symbol = checker.getSymbolAtLocation(id);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    } catch {
      return null;
    }
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (!symbol || !declaration || declaration.getSourceFile().isDeclarationFile) return null;
    // Declared inside this function: its own, not something it reaches out to.
    if (declaration.pos >= fn.pos && declaration.end <= fn.end && declaration.getSourceFile() === fn.getSourceFile()) return null;
    return { symbol, declaration };
  };
  const idOf = (node: TypeScript.Identifier, symbol: TypeScript.Symbol) => compilerSymbolId(ts, checker, root, node, symbol);
  const visit = (node: TypeScript.Node) => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = skipWrappers(ts, node.expression);
      const name = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) ? callee.name : null;
      const target = name ? outer(name) : null;
      const decl = target?.declaration;
      const body = decl && (ts.isFunctionLike(decl) ? decl : ts.isVariableDeclaration(decl) && decl.initializer && ts.isFunctionLike(skipWrappers(ts, decl.initializer)) ? skipWrappers(ts, decl.initializer) : null);
      if (body && path.resolve(body.getSourceFile().fileName).startsWith(root)) {
        const sf = body.getSourceFile();
        const file = path.relative(root, sf.fileName).split(path.sep).join("/");
        const span = spanOf(sf, body);
        calls.set(`${file}:${span.startLine}:${span.startColumn}`, { file, span });
      }
      // `setDoc(…)`: a state setter writes the value its pair reads.
      if (target && ts.isIdentifier(callee) && ts.isBindingElement(target.declaration) && ts.isArrayBindingPattern(target.declaration.parent)) {
        const pair = target.declaration.parent.elements;
        const first = pair[0];
        if (pair.indexOf(target.declaration) === 1 && first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
          const read = checker.getSymbolAtLocation(first.name);
          const id = read ? idOf(first.name, read) : null;
          if (id) writes.add(id);
        }
      }
    }
    if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
      const found = outer(node);
      const d = found?.declaration;
      if (found && d && (ts.isVariableDeclaration(d) || ts.isBindingElement(d) || ts.isParameter(d))) {
        const id = idOf(node, found.symbol);
        const assigned = ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        if (id) (assigned ? writes : reads).add(id);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return { calls: [...calls.values()], reads: [...reads], writes: [...writes] };
}
