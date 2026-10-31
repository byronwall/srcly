import path from "node:path";
import * as TypeScript from "typescript";
import type {
  ProgramElement,
  ProgramEvidenceLocation,
  ProgramOperationKind,
  ProgramProof,
  ProgramProofKind,
  ProgramRelation,
} from "./program-evidence";

export function asFunctionLike(
  ts: typeof TypeScript,
  node: TypeScript.Node,
): TypeScript.FunctionLikeDeclaration | null {
  return ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
    ? node
    : null;
}

export function functionNameNode(ts: typeof TypeScript, node: TypeScript.FunctionLikeDeclaration): TypeScript.Node | null {
  if (node.name) return node.name;
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name;
  // Wrapped where it is declared (`const Card = memo((props) => …)`, `const getDoc = query(async (id) => …)`): the declaration names it.
  const declaration = parent && ts.isCallExpression(parent) && parent.arguments[0] === node ? parent.parent : undefined;
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer === parent && ts.isIdentifier(declaration.name) ? declaration.name : null;
}

export function bindingIdentifiers(ts: typeof TypeScript, name: TypeScript.BindingName): TypeScript.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  const result: TypeScript.Identifier[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) result.push(...bindingIdentifiers(ts, element.name));
  }
  return result;
}

export function firstBindingIdentifier(ts: typeof TypeScript, name: TypeScript.BindingName) {
  return bindingIdentifiers(ts, name)[0] ?? null;
}

export function containsJsx(ts: typeof TypeScript, node: TypeScript.Node) {
  let found = false;
  const visit = (child: TypeScript.Node) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) found = true;
    else ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

export function isHandlerLike(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.FunctionLikeDeclaration,
  name: string,
) {
  if (/^(handle|handler|serve|request|respond|main|run|execute)/i.test(name)) return true;
  const handlerParameter = node.parameters.some(
    (parameter) =>
      /^(request|req|response|res|reply|event|context)$/i.test(
        parameter.name.getText(),
      ) ||
      /Request|Response|IncomingMessage|ServerResponse|Event|Context/.test(
        safeType(checker, parameter),
      ),
  );
  return (
    (/handler$/i.test(name) && handlerParameter) ||
    (handlerParameter &&
      node.parameters.some(
        (parameter) =>
          /^(request|req|response|res|reply)$/i.test(
            parameter.name.getText(),
          ) ||
          /Request|Response|IncomingMessage|ServerResponse/.test(
            safeType(checker, parameter),
          ),
      ))
  );
}

/**
 * A function written as an element's event attribute (`<input onInput={(e) => …}>`,
 * Solid's `on:click`) or given to `addEventListener`: the browser calls it with
 * the event. Only an intrinsic element's: a component's `onChange` is a prop its
 * own code calls.
 */
export function isDomEventHandler(ts: typeof TypeScript, node: TypeScript.FunctionLikeDeclaration): boolean {
  let parent = node.parent;
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
  // `el.addEventListener("input", (event) => …)`: the browser calls it with the event too.
  if (parent && ts.isCallExpression(parent) && parent.arguments[1] === node && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "addEventListener") return true;
  if (!parent || !ts.isJsxExpression(parent) || !ts.isJsxAttribute(parent.parent)) return false;
  const opening = parent.parent.parent.parent;
  const intrinsic = ts.isIdentifier(opening.tagName) && /^[a-z]/.test(opening.tagName.text);
  return intrinsic && /^on(:|[A-Z])/.test(parent.parent.name.getText());
}

export type ParameterOriginRole = "request" | "event" | null;

export function parameterOriginRole(checker: TypeScript.TypeChecker, parameter: TypeScript.ParameterDeclaration, handler: boolean): ParameterOriginRole {
  if (!handler) return null;
  const name = parameter.name.getText();
  const type = safeType(checker, parameter);
  if (/^(response|res|reply)$/i.test(name) || /\bServerResponse\b/.test(type)) return null;
  if (/^(request|req)$/i.test(name) || /\b(?:IncomingMessage|ServerRequest|Request)\b/.test(type)) return "request";
  if (/^event$/i.test(name) || /\b[A-Za-z_$][\w$]*Event\b/.test(type)) return "event";
  return null;
}

export type ExternalServiceCallKind = "external-read" | "external-write" | "message" | null;

export function externalServiceCallKind(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.CallExpression,
): ExternalServiceCallKind {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const declarations = checker.getSymbolAtLocation(node.expression)?.declarations ?? [];
  if (!declarations.some((declaration) => isUnimplementedServiceDeclaration(ts, declaration))) return null;
  const method = node.expression.name.text;
  // Prisma's delegates (`prisma.doc.findUnique`, `.update`) are the common case: a client's method signatures with no body.
  if (/^(query|find|findOne|findMany|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|count|aggregate|groupBy|get|load|read|lookup|scan|select)$/i.test(method)) return "external-read";
  if (/^(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|insert|save)$/.test(method)) return "external-write";
  if (/^(put|publish|send|emit|enqueue|produce|dispatch)$/i.test(method)) return "message";
  return null;
}

function isUnimplementedServiceDeclaration(ts: typeof TypeScript, declaration: TypeScript.Declaration) {
  // The standard library's own methods (`Array.find`, `Map.get`) are collection methods, not a service's contract.
  if (declaration.getSourceFile().hasNoDefaultLib) return false;
  // A function-valued field the project declares in its own source (`props.save` on a component's props) is a callback a caller hands in, not a client's contract.
  return ts.isMethodSignature(declaration)
    || ts.isPropertySignature(declaration) && declaration.getSourceFile().isDeclarationFile
    || ts.isMethodDeclaration(declaration) && !declaration.body
    || ts.isPropertyDeclaration(declaration) && !declaration.initializer;
}

export type ResponseReturnRole = "http-response" | "response" | null;

export function responseReturnRole(ts: typeof TypeScript, node: TypeScript.Expression): ResponseReturnRole {
  const expression = unwrap(ts, node);
  if (ts.isNewExpression(expression) && calleeName(ts, expression.expression) === "Response") return "http-response";
  if (
    ts.isCallExpression(expression) &&
    /(?:response|respond|jsonResponse|sendJson)$/i.test(
      lastName(calleeName(ts, expression.expression)),
    )
  ) {
    return "response";
  }
  if (!ts.isObjectLiteralExpression(expression)) return null;
  const properties = new Set(expression.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return [];
    return [property.name.getText(expression.getSourceFile()).replace(/["']/g, "")];
  }));
  return properties.has("statusCode") && properties.has("body") ? "response" : null;
}

export function functionOperation(name: string): ProgramOperationKind | null {
  if (/^parse/.test(name)) return "parse";
  if (/^(validate|assert|check|is[A-Z])/.test(name)) return "validate";
  if (/^(select|pick|omit|filter|map|find|reduce|aggregate|pack|to[A-Z].*Model)/.test(name)) return "selection";
  if (/^(serialize|encode|stringify)/.test(name)) return "serialize";
  return null;
}

export function callOperation(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.CallExpression,
): ProgramOperationKind | null {
  const name = calleeName(ts, node.expression);
  // A method library code declares (`xs.map`, `schema.safeParse`) is named by its own name, as a bare call is.
  const member = libraryMember(ts, checker, node.expression) ? lastName(name) : null;
  const named = (pattern: RegExp) => pattern.test(name) || (member !== null && pattern.test(member));
  if (name === "JSON.parse" || /(^|\.)parse$/.test(name)) return "parse";
  if (name === "JSON.stringify" || /(^|\.)(serialize|stringify|encode)$/.test(name)) return "serialize";
  if (named(/^(validate|assert|check|safeParse|is[A-Z])/)) return "validate";
  if (named(/^(select|pick|omit|filter|map|flatMap|find|reduce|aggregate|pack)$/)) return "selection";
  if (isResourceFactory(ts, checker, node)) return "resource";
  return null;
}

/** Whether a method callee (`xs.map`) is declared by library code: a declaration file (TypeScript's own lib, a package's types). */
function libraryMember(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): boolean {
  if (!ts.isPropertyAccessExpression(callee)) return false;
  return Boolean(symbolAtNode(checker, callee.name)?.declarations?.some((declaration) => declaration.getSourceFile().isDeclarationFile));
}

/**
 * The library export a callee names, resolved through the checker: its
 * import's module and the export's own name. `readFile` imported by name (or
 * renamed), or `fs.readFile` through a namespace or default import. Null for
 * a callee no import names.
 */
type ImportedCallee = { module: string; name: string } | null;
const importedCallees = new WeakMap<TypeScript.TypeChecker, WeakMap<TypeScript.Expression, ImportedCallee>>();

export function importedCallee(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): ImportedCallee {
  let cache = importedCallees.get(checker);
  if (!cache) { cache = new WeakMap(); importedCallees.set(checker, cache); }
  if (cache.has(callee)) return cache.get(callee)!;
  const imported = resolveImportedCallee(ts, checker, callee);
  cache.set(callee, imported);
  return imported;
}

function resolveImportedCallee(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): ImportedCallee {
  const symbol = symbolAtNode(checker, callee);
  const direct = importModule(ts, checker, callee, symbol);
  if (direct) {
    const specifier = symbol?.declarations?.find((declaration) => ts.isImportSpecifier(declaration));
    const name = specifier && ts.isImportSpecifier(specifier) ? (specifier.propertyName ?? specifier.name).text : lastName(calleeName(ts, callee));
    return { module: direct, name };
  }
  const module = ts.isPropertyAccessExpression(callee) ? importModule(ts, checker, callee.expression) : null;
  return module && ts.isPropertyAccessExpression(callee) ? { module, name: callee.name.text } : null;
}

/** Solid's `createResource`, by the module its import names. */
export function isResourceFactory(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression) {
  if (!ts.isCallExpression(node)) return false;
  const imported = importedCallee(ts, checker, node.expression);
  return imported?.module === "solid-js" && imported.name === "createResource";
}

/** A UI framework's own reactive and routing calls: what they do with a value is the framework's model, never an external effect. */
const FRAMEWORK_CALLS: Record<string, RegExp> = {
  "solid-js": /^(createResource|createEffect|createRenderEffect|createComputed|createMemo|createSignal|createSelector|createContext|useContext|onMount|onCleanup|on|batch|untrack|mergeProps|splitProps|children|lazy|Show|For)$/,
  "solid-js/store": /^(createStore|createMutable|produce|reconcile|unwrap)$/,
  "@solidjs/router": /^(createAsync|createAsyncStore|useNavigate|useAction|useSubmission|useSubmissions|useBeforeLeave|query|cache|action|redirect|revalidate|reload)$/,
  "react": /^(useState|useReducer|useEffect|useLayoutEffect|useMemo|useCallback|useRef|useContext|useId|useTransition|useDeferredValue|createContext|memo|forwardRef)$/,
  "@tanstack/react-query": /^(useQuery|useSuspenseQuery|useInfiniteQuery|useMutation|useQueryClient)$/,
  "@tanstack/solid-query": /^(createQuery|createInfiniteQuery|createMutation|useQuery|useMutation|useQueryClient)$/,
};

export function isFrameworkCall(module: string, name: string) {
  return Boolean(FRAMEWORK_CALLS[module]?.test(name));
}

/** A response method on a receiver named like a server response (`res.json`, `reply.send`): a convention, not a library member. */
export function isHttpResponse(ts: typeof TypeScript, node: TypeScript.CallExpression, checker?: TypeScript.TypeChecker) {
  const receiver = thisReceiver(ts, node.expression);
  const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
  if (!receiver || !/^(end|json|send|write|writeHead|redirect)$/.test(name) || !/^(res|response|reply)$/i.test(receiver.getText())) return false;
  // `response.json()` on a `fetch` result reads the body: the browser's own `Response` is what came back, not what the program sends.
  const type = checker && ts.isPropertyAccessExpression(node.expression) ? checker.getTypeAtLocation(node.expression.expression).getSymbol() : undefined;
  return !(type?.getName() === "Response" && type.declarations?.some((declaration) => declaration.getSourceFile().hasNoDefaultLib));
}

export function isEffectName(name: string) {
  return /^(publish|send|emit|spawn|exec|execFile|close|destroy)$/.test(lastName(name));
}

export function isKnownGlobal(name: string) {
  return new Set(["fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "Promise", "Error", "URL", "Date", "Math"]).has(name);
}

export function lastName(name: string) {
  return name.split(".").at(-1) ?? name;
}

export function propertyBase(ts: typeof TypeScript, node: TypeScript.PropertyAccessExpression, names: string[]) {
  const chain = node.getText(node.getSourceFile());
  if (names.includes(chain)) return node;
  return ts.isPropertyAccessExpression(node.expression) &&
    names.includes(node.expression.getText(node.getSourceFile()))
    ? node.expression
    : null;
}

/** An assignment to a global member a library model row makes an exit-status terminal (`process.exitCode = 1`). */
export function isExitStatusAssignment(ts: typeof TypeScript, node: TypeScript.BinaryExpression, exitMembers: readonly string[]) {
  return (
    ts.isPropertyAccessExpression(node.left) &&
    exitMembers.includes(node.left.getText(node.getSourceFile())) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );
}

export function thisReceiver(ts: typeof TypeScript, node: TypeScript.Node) {
  return ts.isPropertyAccessExpression(node) ? node.expression : null;
}

export function calleeName(ts: typeof TypeScript | null, node: TypeScript.Node): string {
  if (!ts) return node.getText();
  if (ts.isPropertyAccessExpression(node)) return `${calleeName(ts, node.expression)}.${node.name.text}`;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return node.getText(node.getSourceFile()).replace(/\s+/g, " ");
}

export function staticMethod(node: TypeScript.CallExpression) {
  const options = node.arguments[1];
  if (!options || !node.getSourceFile().text) return null;
  const match = options.getText(node.getSourceFile()).match(/method\s*:\s*["']([^"']+)["']/);
  return match?.[1] ?? "GET";
}

export function staticTarget(node: TypeScript.CallExpression) {
  const first = node.arguments[0];
  return first && (TypeScript.isStringLiteral(first) || TypeScript.isNoSubstitutionTemplateLiteral(first)) ? first.text : null;
}

/** The function whose receiver `this` reads here: the nearest enclosing function that is not an arrow (arrows keep their outer `this`), or null outside one. */
export function thisContainer(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.Node | null {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current) && !ts.isArrowFunction(current)) return current;
    if (ts.isClassLike(current) || ts.isSourceFile(current)) return null;
  }
  return null;
}

const thisReaders = new WeakMap<TypeScript.Node, boolean>();

/** Whether this function reads its own receiver (`this`, outside any nested non-arrow function). */
export function readsThis(ts: typeof TypeScript, fn: TypeScript.Node): boolean {
  const known = thisReaders.get(fn);
  if (known !== undefined) return known;
  let found = false;
  const visit = (node: TypeScript.Node) => {
    if (found) return;
    if (node.kind === ts.SyntaxKind.ThisKeyword && thisContainer(ts, node) === fn) found = true;
    else ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  thisReaders.set(fn, found);
  return found;
}

export function isAssignmentOperator(ts: typeof TypeScript, kind: TypeScript.SyntaxKind) {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

export function isSelectionOperator(ts: typeof TypeScript, kind: TypeScript.SyntaxKind) {
  return [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken].includes(kind);
}

/**
 * The operands of an operator expression whose value derives from them (a
 * comparison, arithmetic, `!`, `typeof`, a template), else null. Not an
 * assignment, a comma, a negative number, or `&&`, `||`, `??`, which select.
 */
export function derivedOperands(ts: typeof TypeScript, node: TypeScript.Node): readonly TypeScript.Expression[] | null {
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    const assigns = kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
    return assigns || kind === ts.SyntaxKind.CommaToken || isSelectionOperator(ts, kind) ? null : [node.left, node.right];
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const updates = node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken;
    return updates || ts.isNumericLiteral(node.operand) ? null : [node.operand];
  }
  if (ts.isTypeOfExpression(node)) return [node.expression];
  if (ts.isTemplateExpression(node)) return node.templateSpans.map((span) => span.expression);
  return null;
}

export function jsxOpeningAncestor(ts: typeof TypeScript, node: TypeScript.JsxExpression) {
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) return current.openingElement;
    if (ts.isJsxSelfClosingElement(current)) return current;
    if (asFunctionLike(ts, current)) return null;
    current = current.parent;
  }
  return null;
}

/** Whether a call's value is thrown away: it is a statement of its own (`rows.push(row);`, `await save(x);`, `void run()`). */
export function discardsValue(ts: typeof TypeScript, call: TypeScript.CallExpression, checker?: TypeScript.TypeChecker): boolean {
  let node: TypeScript.Node = call;
  while (ts.isParenthesizedExpression(node.parent) || ts.isAwaitExpression(node.parent) || ts.isVoidExpression(node.parent) || ts.isNonNullExpression(node.parent)) node = node.parent;
  if (ts.isExpressionStatement(node.parent)) return true;
  // An arrow's body whose caller ignores what it returns (`forEach((x) => rows.push(x))`: the callback's contextual return type is void).
  const arrow = node.parent;
  if (!checker || !ts.isArrowFunction(arrow) || arrow.body !== node) return false;
  // An optional handler prop (`onClick?: () => void`) is contextually `handler | undefined`, and Solid's is a handler or a bound `[handler, data]` pair: its signature is the handler's.
  const contextual = checker.getContextualType(arrow);
  const handler = contextual && checker.getNonNullableType(contextual);
  const signature = handler && (handler.isUnion() ? handler.types.flatMap((part) => part.getCallSignatures()) : handler.getCallSignatures())[0];
  return Boolean(signature && checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Void);
}

export function unwrap(ts: typeof TypeScript, node: TypeScript.Expression): TypeScript.Expression {
  // `await p` is what `p` settles to: an async function's return arrives at its call.
  if (
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return unwrap(ts, node.expression);
  }
  return node;
}

/** The checker's symbol at a node, or null where the checker throws; `undefined` where it has none. */
const symbolsByChecker = new WeakMap<TypeScript.TypeChecker, WeakMap<TypeScript.Node, TypeScript.Symbol | null | undefined>>();

export function symbolAtNode(checker: TypeScript.TypeChecker, node: TypeScript.Node): TypeScript.Symbol | null | undefined {
  let symbols = symbolsByChecker.get(checker);
  if (!symbols) { symbols = new WeakMap(); symbolsByChecker.set(checker, symbols); }
  if (symbols.has(node)) return symbols.get(node);
  let symbol: TypeScript.Symbol | null | undefined;
  try { symbol = checker.getSymbolAtLocation(node); } catch { symbol = null; }
  symbols.set(node, symbol);
  return symbol;
}

// A symbol's id is a function of the symbol alone (its qualified name and
// its first in-root declaration), so each symbol is named once per root.
const symbolIdsByRoot = new Map<string, WeakMap<TypeScript.Symbol, string>>();

export function compilerSymbolId(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, node: TypeScript.Node, resolved?: TypeScript.Symbol | null) {
  let symbol = resolved === undefined ? symbolAtNode(checker, node) : resolved;
  if (symbol === null) return null;
  try {
    if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  } catch {
    return null;
  }
  if (!symbol) return null;
  let ids = symbolIdsByRoot.get(root);
  if (!ids) {
    ids = new WeakMap();
    symbolIdsByRoot.set(root, ids);
  }
  const known = ids.get(symbol);
  if (known !== undefined) return known;
  const declaration = symbol.declarations?.find((item) => inside(root, item.getSourceFile().fileName));
  const suffix = declaration ? `@${relative(root, declaration.getSourceFile().fileName)}:${declaration.getStart(declaration.getSourceFile())}` : "";
  // A module symbol's qualified name spells its absolute path (`"/Users/…/src/x".f`): drop the root, so ids (and every order they set) do not depend on where the checkout lives.
  const id = `${checker.getFullyQualifiedName(symbol).split(root).join("")}${suffix}`;
  ids.set(symbol, id);
  return id;
}

export function importModule(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node, resolved?: TypeScript.Symbol | null) {
  const symbol = resolved === undefined ? symbolAtNode(checker, node) : resolved;
  if (symbol === null) return null;
  let current: TypeScript.Node | undefined;
  for (const declaration of symbol?.declarations ?? []) {
    current = declaration;
    while (current) {
      if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)) return current.moduleSpecifier.text;
      current = current.parent;
    }
  }
  return null;
}

export function typeId(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  const text = safeType(checker, node);
  return text === "unknown" ? null : text;
}

// A node's type text is a function of the node within its checker, and the
// declarations pass asks for every parameter's (isHandlerLike) while later
// passes and hydration ask again: remembered per checker (T10). The text is
// read for names (`Request`, `…Event`), never compared whole, so the checker's
// own truncation bounds it: a tRPC router proxy's type spelled out in full
// runs to hundreds of kilobytes per element.
const typeTextByChecker = new WeakMap<TypeScript.TypeChecker, WeakMap<TypeScript.Node, string>>();

export function safeType(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  let byNode = typeTextByChecker.get(checker);
  if (!byNode) {
    byNode = new WeakMap();
    typeTextByChecker.set(checker, byNode);
  }
  const known = byNode.get(node);
  if (known !== undefined) return known;
  let text: string;
  try {
    text = checker.typeToString(checker.getTypeAtLocation(node), node);
  } catch {
    text = "unknown";
  }
  byNode.set(node, text);
  return text;
}

export function locationFor(
  root: string,
  file: TypeScript.SourceFile,
  node: TypeScript.Node,
): ProgramEvidenceLocation {
  const start = file.getLineAndCharacterOfPosition(node.getStart(file));
  const end = file.getLineAndCharacterOfPosition(node.getEnd());
  return {
    file: relative(root, file.fileName),
    line: start.line + 1,
    column: start.character + 1,
    span: {
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    },
  };
}

export function nodeKey(root: string, node: TypeScript.Node) {
  const location = locationFor(root, node.getSourceFile(), node);
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

// Every element location, symbol id and identity point asks for a file's
// path relative to the root; the answer never changes within a process, so
// one map per root remembers it (T10: this was 4.4 s of fact collection on a
// 65K-line app).
const relativeByRoot = new Map<string, Map<string, string>>();
const insideByRoot = new Map<string, Map<string, boolean>>();

function cached<T>(store: Map<string, Map<string, T>>, root: string, file: string, compute: () => T): T {
  let byFile = store.get(root);
  if (!byFile) {
    byFile = new Map();
    store.set(root, byFile);
  }
  const known = byFile.get(file);
  if (known !== undefined) return known;
  const value = compute();
  byFile.set(file, value);
  return value;
}

export function relative(root: string, file: string) {
  return cached(relativeByRoot, root, file, () => path.relative(root, path.resolve(file)).replaceAll(path.sep, "/"));
}

export function inside(root: string, file: string) {
  return cached(insideByRoot, root, file, () => {
    const value = path.relative(root, path.resolve(file));
    return value === "" || !value.startsWith(`..${path.sep}`) && value !== "..";
  });
}

/** Proof for a hand-off through code with no source to read: assumed, never proven. */
/**
 * Whether a callee is the standard library: declared only by TypeScript's own
 * lib files (`trim`, `map`, `JSON.stringify`) or Node's (`URLSearchParams`,
 * `Buffer.from`, which both may declare), or the global `console`. What it
 * does with its receiver and arguments is known.
 */
export function isStandardLibraryCallee(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): boolean {
  const node = unwrap(ts, callee);
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "console") return true;
  const declarations = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node)?.declarations ?? [];
  const standard = (file: TypeScript.SourceFile) => file.hasNoDefaultLib || /[\\/]node_modules[\\/]@types[\\/]node[\\/]/.test(file.fileName);
  return declarations.length > 0 && declarations.every((declaration) => standard(declaration.getSourceFile()));
}

/**
 * The browser's own interface a member belongs to (`Location`, `Storage`,
 * `History`, `Document`, an element's), when TypeScript's DOM lib declares it:
 * `{ owner: "Storage", name: "getItem" }`. Null for anything else.
 */
export function browserMember(ts: typeof TypeScript, checker: TypeScript.TypeChecker, access: TypeScript.Expression): { owner: string; name: string } | null {
  const node = unwrap(ts, access);
  if (!ts.isPropertyAccessExpression(node)) return null;
  const declaration = checker.getSymbolAtLocation(node.name)?.declarations?.[0];
  const owner = declaration?.parent;
  if (!declaration?.getSourceFile().hasNoDefaultLib || !owner || !ts.isInterfaceDeclaration(owner)) return null;
  return { owner: owner.name.text, name: node.name.text };
}

/** What the browser keeps outside the program: the URL and the cookie are read as a page's input; storage, history and navigation are read and written. */
export function browserCall(member: { owner: string; name: string } | null): "read" | "write" | null {
  if (!member) return null;
  if (member.owner === "Storage") return member.name === "getItem" || member.name === "key" ? "read" : "write";
  if (member.owner === "History") return /^(pushState|replaceState)$/.test(member.name) ? "write" : null;
  if (member.owner === "Location") return /^(assign|replace|reload)$/.test(member.name) ? "write" : null;
  return null;
}

/**
 * A call into the page whose value the code drops (`el.classList.add(name);`,
 * `target.dispatchEvent(event);`, `input.focus()`): TypeScript's DOM lib
 * declares the member, and a call made for its effect hands its arguments to
 * the page. A DOM call whose value the code uses is a read, not this.
 */
export function pageEffectCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): boolean {
  const node = unwrap(ts, call.expression);
  if (!ts.isPropertyAccessExpression(node)) return false;
  const declarations = checker.getSymbolAtLocation(node.name)?.declarations ?? [];
  const dom = (file: TypeScript.SourceFile) => file.hasNoDefaultLib && /[\\/]lib\.(dom|webworker)[.\w]*\.d\.ts$/.test(file.fileName);
  return declarations.length > 0 && declarations.every((declaration) => dom(declaration.getSourceFile())) && discardsValue(ts, call, checker);
}

/** A property read of the page's URL (`location.search`) or `document.cookie`: where the browser hands the program a value. */
export function browserPropertyRead(member: { owner: string; name: string } | null): boolean {
  return Boolean(member && (member.owner === "Location" || (member.owner === "Document" && member.name === "cookie")));
}

export function assumedProof(detail: string, locations: ProgramEvidenceLocation[]): ProgramProof {
  return { kind: "external-call", detail, locations };
}

export function proof(kind: ProgramProofKind, detail: string, locations: ProgramEvidenceLocation[]): ProgramProof {
  return { kind, detail, locations };
}

export function stableId(prefix: string, fields: unknown[]) {
  let hash = 2166136261;
  const value = fields.map(stableSerialize).join("|");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}:${(hash >>> 0).toString(36)}`;
}

export function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return String(value);
}

export function groupElements<T extends string>(items: ProgramElement[], key: (item: ProgramElement) => T) {
  const groups = new Map<T, string[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item.id);
    groups.set(key(item), group);
  }
  return groups;
}

export function groupRelations<T extends string>(items: ProgramRelation[], key: (item: ProgramRelation) => T) {
  const groups = new Map<T, string[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item.id);
    groups.set(key(item), group);
  }
  return groups;
}
