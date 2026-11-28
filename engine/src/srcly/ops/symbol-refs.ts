import path from "node:path";
import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { symbolRefsResultSchema, type SymbolRef, type SymbolRefTarget, type SymbolRefsResult } from "../contracts/symbol-refs";
import { EngineError } from "../protocol";
import { checkGeneration, requireTypescript, type EngineSession, type TsTier1 } from "../session";

type Ts = typeof TypeScript;
type Kind = SymbolRef["kind"];

/**
 * Every identifier of the Program's own files under the root, with the
 * declaration the checker binds it to (docs/intent/checker-symbol-index).
 * srcly's symbol index joins each target to its own ids, so this op answers
 * binding only: no ids, no source symbol. `params.files` narrows it to some
 * files (relative to the root); absent means all of them.
 */
export function symbolRefsOp(session: EngineSession, params: { files?: unknown; expectedGeneration?: unknown }, cancellation?: AnalysisCancellationToken): SymbolRefsResult {
  const tier1 = requireTypescript(session.tier1(), "symbolRefs");
  checkGeneration(tier1, params.expectedGeneration);
  if (params.files !== undefined && !(Array.isArray(params.files) && params.files.every((f) => typeof f === "string"))) {
    throw new EngineError("invalid-request", "symbolRefs params.files must be a list of paths");
  }
  const { ts, program } = tier1;
  const primaryChecker = program.getTypeChecker();
  const root = path.resolve(tier1.root);
  const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const own = (source: TypeScript.SourceFile) => source.fileName.startsWith(root + path.sep) && !source.fileName.includes(`${path.sep}node_modules${path.sep}`) && !source.isDeclarationFile;
  const wanted = params.files ? new Set((params.files as string[]).map((f) => f.split(path.sep).join("/"))) : null;
  const sources = program
    .getSourceFiles()
    .filter((source) => own(source) && (!wanted || wanted.has(rel(source.fileName))))
    .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));

  const counts = { files: sources.length, bound: 0, unbound: 0, external: 0 };
  const targets: SymbolRefTarget[] = [];
  const indexOf = new Map<TypeScript.Node, number>();
  const intern = (decl: TypeScript.Declaration, home: TypeScript.SourceFile) => {
    let index = indexOf.get(decl);
    if (index === undefined) {
      index = targets.push(targetOf(ts, decl, home, rel)) - 1;
      indexOf.set(decl, index);
    }
    return index;
  };
  const ownerOf = owners(tier1);
  const toSource = builtSources(tier1, root);
  const files = sources.map((primary) => {
    cancellation?.throwIfCancelled();
    // A file whose own tsconfig resolves imports differently binds in that config's Program.
    const routed = ownerOf(primary.fileName);
    const source: TypeScript.SourceFile = routed?.program.getSourceFile(primary.fileName) ?? primary;
    const checker: TypeScript.TypeChecker = routed?.checker ?? primaryChecker;
    const refs: SymbolRef[] = [];
    const visit = (node: TypeScript.Node) => {
      // `x["run"]()` names a member as a string: the same reference as `x.run()`.
      const keyed = ts.isStringLiteralLike(node) && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node;
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || keyed) {
        const ref = bind(ts, checker, source, node, own, intern, toSource);
        if (ref === "skip") return;
        if (ref !== "external") ref.source = enclosing(ts, node, source, intern);
        if (ref === "external") counts.external += 1;
        else {
          if (ref.target) counts.bound += 1;
          else counts.unbound += 1;
          refs.push(ref);
        }
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return { file: rel(primary.fileName), refs };
  });

  return symbolRefsResultSchema.parse({
    outcome: "ok",
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    nullProof: tier1.generation.nullProof,
    reason: null,
    targets,
    files,
    counts,
  });
}

type Routed = { program: TypeScript.Program; checker: TypeScript.TypeChecker };
const routedByTier = new WeakMap<TsTier1, Map<string, Routed>>();

/**
 * The Program a file binds in, when it is not the primary. The primary Program uses one
 * config's options, so a file whose nearest config resolves modules differently (other
 * `paths`, `baseUrl`, `moduleResolution`, conditions; a monorepo app beside the package)
 * would resolve `@/x` or `pkg` against the wrong target.
 * Such a config gets its own Program, built on first use and kept with the tier.
 */
function owners(tier1: TsTier1): (file: string) => Routed | undefined {
  const { ts, resolution } = tier1;
  const primary = resolution.primary;
  // Every option that changes where an import resolves, or which JSX runtime a tag binds to.
  const resolves = (o: TypeScript.CompilerOptions) =>
    JSON.stringify([
      o.paths ?? null,
      o.paths ? (o.pathsBasePath ?? o.baseUrl ?? null) : (o.baseUrl ?? null),
      o.moduleResolution ?? null,
      o.module ?? null,
      o.customConditions ?? null,
      o.resolvePackageJsonExports ?? null,
      o.resolvePackageJsonImports ?? null,
      o.rootDirs ?? null,
      o.allowJs ?? null,
      o.jsx ?? null,
      o.jsxImportSource ?? null,
      o.types ?? null,
    ]);
  const differs = resolution.configs.filter((c) => c.file !== primary.file && c.fileNames.length > 0 && resolves(c.options) !== resolves(primary.options));
  if (!differs.length) return () => undefined;
  const nearest = new Map<string, (typeof differs)[number]>();
  for (const config of [primary, ...differs]) {
    const dir = path.dirname(config.file);
    for (const file of config.fileNames) {
      const seen = nearest.get(file);
      if (!seen || dir.length > path.dirname(seen.file).length) nearest.set(file, config);
    }
  }
  let built = routedByTier.get(tier1);
  if (!built) routedByTier.set(tier1, (built = new Map()));
  const cache = built;
  return (file) => {
    const config = nearest.get(file);
    if (!config || config.file === primary.file) return undefined;
    let routed = cache.get(config.file);
    if (!routed) {
      const program = ts.createProgram(config.fileNames, config.options);
      routed = { program, checker: program.getTypeChecker() };
      cache.set(config.file, routed);
    }
    return routed;
  };
}

/**
 * A declaration in a built `.d.ts` under the root (a workspace package another project imports
 * through its `dist`), followed to its source: the declaration file the checker resolved, with
 * its output folder swapped for `src` (`dist/readers.d.ts` → `src/readers.ts`), and the same
 * export path looked up there by the checker (`tick`, `Runner.run`, `default`). Each alias hop
 * is tried first, so a named import reaches the module it was imported from, not a bundle chunk.
 * Nothing found means the reference stays external: no guessed module.
 */
const OUTPUT_FOLDERS = new Set(["dist", "build", "lib", "out", "types"]);

function builtSources(tier1: TsTier1, root: string) {
  const { ts, program } = tier1;
  // The package's source is in the primary Program, whichever Program bound the reference.
  const checker = program.getTypeChecker();
  const built = (file: TypeScript.SourceFile) => file.isDeclarationFile && file.fileName.startsWith(root + path.sep) && !file.fileName.includes(`${path.sep}node_modules${path.sep}`);
  const sourceOf = (file: TypeScript.SourceFile): TypeScript.SourceFile | undefined => {
    const stem = file.fileName.replace(/\.d\.[mc]?ts$/, "");
    // The last output folder in the path is the one the build wrote (`packages/lib/dist/x`: `dist`).
    const parts = stem.split("/");
    let out = parts.length - 2;
    while (out >= 0 && !OUTPUT_FOLDERS.has(parts[out])) out -= 1;
    if (out < 0) return undefined;
    const swapped = [...parts.slice(0, out), "src", ...parts.slice(out + 1)].join("/");
    for (const ext of [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"]) {
      const hit = program.getSourceFile(swapped + ext);
      if (hit && !hit.isDeclarationFile) return hit;
    }
    return undefined;
  };
  /** The names from the module down to the declaration: `["Runner", "run"]`; undefined inside a body. */
  const pathOf = (decl: TypeScript.Declaration): string[] | undefined => {
    const own = ts.isExportAssignment(decl) ? "default" : ts.isExportSpecifier(decl) ? decl.name.text : (() => {
      const name = ts.getNameOfDeclaration(decl);
      return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
    })();
    if (!own) return undefined;
    const names = [own];
    for (let at = decl.parent; at && !ts.isSourceFile(at); at = at.parent) {
      if (ts.isClassDeclaration(at) || ts.isInterfaceDeclaration(at) || ts.isEnumDeclaration(at) || ts.isModuleDeclaration(at)) {
        if (!at.name || !ts.isIdentifier(at.name)) return undefined;
        names.unshift(at.name.text);
      } else if (ts.isModuleBlock(at) || ts.isVariableDeclaration(at) || ts.isVariableDeclarationList(at) || ts.isVariableStatement(at) || ts.isExportDeclaration(at) || ts.isNamedExports(at)) {
        continue;
      } else if (!ts.isClassElement(decl) && !ts.isTypeElement(decl) && !ts.isEnumMember(decl)) {
        return undefined;
      }
    }
    return names;
  };
  const follow = (symbol: TypeScript.Symbol | undefined) => (symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const lookup = (module: TypeScript.SourceFile, names: string[]): TypeScript.Symbol | undefined => {
    const moduleSymbol = checker.getSymbolAtLocation(module);
    if (!moduleSymbol) return undefined;
    let found = follow(checker.tryGetMemberInModuleExports(names[0], moduleSymbol));
    for (const name of names.slice(1)) {
      const key = ts.escapeLeadingUnderscores(name);
      found = found && (found.members?.get(key) ?? found.exports?.get(key));
    }
    return found;
  };
  return (bound: TypeScript.TypeChecker, symbol: TypeScript.Symbol, alias: TypeScript.Symbol | undefined): TypeScript.Symbol | undefined => {
    const hops: TypeScript.Declaration[] = [];
    for (let at: TypeScript.Symbol | undefined = alias; at && at.flags & ts.SymbolFlags.Alias; ) {
      const next = bound.getImmediateAliasedSymbol(at);
      if (next?.declarations?.[0]) hops.push(next.declarations[0]);
      at = next;
    }
    hops.push(...(symbol.declarations ?? []));
    for (const decl of hops) {
      const file = decl.getSourceFile();
      if (!built(file)) continue;
      const module = sourceOf(file);
      const names = module && pathOf(decl);
      const found = module && names ? lookup(module, names) : undefined;
      if (found?.declarations?.length) return found;
    }
    return undefined;
  };
}

function bind(
  ts: Ts,
  checker: TypeScript.TypeChecker,
  source: TypeScript.SourceFile,
  node: TypeScript.Identifier | TypeScript.PrivateIdentifier | TypeScript.StringLiteralLike,
  own: (source: TypeScript.SourceFile) => boolean,
  intern: (decl: TypeScript.Declaration, home: TypeScript.SourceFile) => number,
  toSource: (bound: TypeScript.TypeChecker, symbol: TypeScript.Symbol, alias: TypeScript.Symbol | undefined) => TypeScript.Symbol | undefined,
): SymbolRef | "external" | "skip" {
  const parent = node.parent;
  if (!parent || skipped(ts, node, parent)) return "skip";
  const shorthand = ts.isShorthandPropertyAssignment(parent) && parent.name === node;
  // A declaration's own name is not a reference; `{ action }` is the one name that is both.
  if (!shorthand && (parent as { name?: TypeScript.Node }).name === node && isDeclaration(ts, parent)) return "skip";
  const position = typePosition(ts, node);
  const inType = position !== "code";
  let symbol = shorthand ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node);
  const alias = symbol && symbol.flags & ts.SymbolFlags.Alias ? symbol : undefined;
  if (alias) symbol = checker.getAliasedSymbol(alias);
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const syntactic = kindOf(ts, node);
  // A heritage clause keeps its own kind, whichever side of a name it binds.
  const kind: Kind = syntactic === "extends" || syntactic === "implements" ? syntactic : inType ? "type" : syntactic;
  const ref = { source: null as number | null, line: start.line + 1, column: start.character + 1, endColumn: start.character + 1 + node.getWidth(source), kind };
  // `typeof x` in a type names the value x.
  let decl = symbol ? pick(ts, symbol, position === "type") : undefined;
  // A workspace package imported through its built `.d.ts`: the same declaration in its source.
  if (symbol && decl?.getSourceFile().isDeclarationFile) {
    const fromSource = toSource(checker, symbol, alias);
    const sourceDecl = fromSource ? pick(ts, fromSource, position === "type") : undefined;
    if (sourceDecl) decl = sourceDecl;
  }
  if (!decl) {
    const receiver = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) ? parent.expression : null;
    const any = receiver ? (checker.getTypeAtLocation(receiver).flags & ts.TypeFlags.Any) !== 0 : false;
    return { ...ref, target: null, unbound: any ? "any" : "unresolved" };
  }
  const home = decl.getSourceFile();
  if (!own(home)) return "external";
  return { ...ref, target: intern(decl, home), unbound: null };
}

/** Identifiers that are syntax, not a use: import and export clauses, labels, a JSX closing tag. */
function skipped(ts: Ts, node: TypeScript.Node, parent: TypeScript.Node): boolean {
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isExportSpecifier(parent) || ts.isNamespaceExport(parent)) return true;
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return true;
  if (ts.isJsxClosingElement(parent)) return true;
  if (ts.isMetaProperty(parent)) return true;
  // `as const` is a keyword written as a type name; `undefined` is a value with no declaration.
  if (ts.isTypeReferenceNode(parent) && ts.isConstTypeReference(parent)) return true;
  if (ts.isIdentifier(node) && node.text === "undefined" && !ts.isPropertyAccessExpression(parent)) return true;
  // The tag name's right side in `<a.b>` is still a use; a JSX attribute name is a prop declaration.
  return ts.isJsxAttribute(parent) && parent.name === node;
}

/**
 * Where the identifier sits: in code, in a type (an annotation, a type argument, `import("…").T`),
 * or in `typeof x` inside a type, which names a value.
 */
function typePosition(ts: Ts, node: TypeScript.Node): "code" | "type" | "typeof" {
  let typeofSeen = false;
  for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent) {
    // `class A extends B<T>`: B is a value; `implements B` and an interface's `extends B` name a type.
    // T was a type node on the way up.
    if (ts.isExpressionWithTypeArguments(at) && ts.isHeritageClause(at.parent)) {
      return at.parent.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(at.parent.parent) ? "type" : "code";
    }
    if (ts.isExpressionWithTypeArguments(at) && !ts.isTypeNode(at.parent)) return "code";
    if (ts.isTypeQueryNode(at) || (ts.isImportTypeNode(at) && at.isTypeOf)) typeofSeen = true;
    if (ts.isTypeNode(at) && !ts.isExpressionWithTypeArguments(at)) return typeofSeen ? "typeof" : "type";
    if (ts.isStatement(at) || ts.isBlock(at) || ts.isPropertyAccessExpression(at) || ts.isCallExpression(at) || ts.isNewExpression(at) || ts.isBinaryExpression(at)) return "code";
  }
  return "code";
}

function kindOf(ts: Ts, node: TypeScript.Node): Kind {
  let expr: TypeScript.Node = node;
  const parent = node.parent;
  // `a.b`: the member name stands for the whole access; the receiver `a` is a read.
  if ((ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isQualifiedName(parent) && parent.right === node) || (ts.isElementAccessExpression(parent) && parent.argumentExpression === node)) expr = parent;
  while (ts.isParenthesizedExpression(expr.parent) || ts.isNonNullExpression(expr.parent) || ts.isAsExpression(expr.parent)) expr = expr.parent;
  const up = expr.parent;
  if (ts.isExpressionWithTypeArguments(up) && ts.isHeritageClause(up.parent)) return up.parent.token === ts.SyntaxKind.ImplementsKeyword ? "implements" : "extends";
  if ((ts.isCallExpression(up) || ts.isDecorator(up) || ts.isTaggedTemplateExpression(up)) && (up as { expression?: TypeScript.Node; tag?: TypeScript.Node }).expression === expr) return "call";
  if (ts.isTaggedTemplateExpression(up) && up.tag === expr) return "call";
  if (ts.isNewExpression(up) && up.expression === expr) return "instantiate";
  if ((ts.isJsxOpeningElement(up) || ts.isJsxSelfClosingElement(up)) && up.tagName === expr) return "call";
  if (ts.isBinaryExpression(up) && up.left === expr && up.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && up.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return "write";
  if ((ts.isPrefixUnaryExpression(up) || ts.isPostfixUnaryExpression(up)) && (up.operator === ts.SyntaxKind.PlusPlusToken || up.operator === ts.SyntaxKind.MinusMinusToken)) return "write";
  return "read";
}

/** `ts.isDeclaration` is internal to TypeScript; it is on the runtime object of every supported version. */
const isDeclaration = (ts: Ts, node: TypeScript.Node) => (ts as unknown as { isDeclaration(n: TypeScript.Node): boolean }).isDeclaration(node);

/** The nearest named declaration a node sits in: a function, class, member, variable or type. */
function enclosing(ts: Ts, node: TypeScript.Node, home: TypeScript.SourceFile, intern: (decl: TypeScript.Declaration, home: TypeScript.SourceFile) => number): number | null {
  for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent) {
    const named =
      // An overload signature has no body; the implementation is the declaration.
      (ts.isFunctionDeclaration(at) && at.body !== undefined) ||
      ts.isClassDeclaration(at) ||
      ts.isMethodDeclaration(at) ||
      ts.isGetAccessorDeclaration(at) ||
      ts.isSetAccessorDeclaration(at) ||
      ts.isPropertyDeclaration(at) ||
      ts.isPropertyAssignment(at) ||
      ts.isInterfaceDeclaration(at) ||
      ts.isTypeAliasDeclaration(at) ||
      ts.isEnumDeclaration(at) ||
      (ts.isVariableDeclaration(at) && ts.isIdentifier(at.name));
    // `node` itself may be the declaration's name (`{ action }`); the name is in its declaration.
    if (named && (at as TypeScript.NamedDeclaration).name) return intern(at as TypeScript.Declaration, home);
    if (ts.isConstructorDeclaration(at)) return intern(at, home);
  }
  return null;
}

const isTypeDecl = (ts: Ts, d: TypeScript.Declaration) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d);

/** The declaration the location means: in a type, a type-side one; in code, a value-side one. */
function pick(ts: Ts, symbol: TypeScript.Symbol, inType: boolean): TypeScript.Declaration | undefined {
  const decls = symbol.declarations ?? [];
  if (decls.length < 2) return decls[0];
  // Overload signatures, then the body: the body is the declaration.
  const body = decls.find((d) => ts.isFunctionLike(d) && (d as { body?: TypeScript.Node }).body !== undefined);
  if (body && decls.every((d) => ts.isFunctionLike(d))) return body;
  const typeSide = decls.find((d) => isTypeDecl(ts, d) || ts.isClassDeclaration(d) || ts.isEnumDeclaration(d));
  const valueSide = decls.find((d) => !isTypeDecl(ts, d));
  return (inType ? typeSide : valueSide) ?? decls[0];
}

function targetOf(ts: Ts, decl: TypeScript.Declaration, home: TypeScript.SourceFile, rel: (file: string) => string): SymbolRefTarget {
  const file = rel(home.fileName);
  if (ts.isSourceFile(decl)) return { file, name: "*", line: 1, meaning: "value", scope: "module" };
  const name = ts.getNameOfDeclaration(decl);
  const text = ts.isConstructorDeclaration(decl) ? "constructor" : ts.isExportAssignment(decl) && !decl.isExportEquals ? "default" : name && (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) ? name.text : "default";
  const at = home.getLineAndCharacterOfPosition((name ?? decl).getStart(home));
  return { file, name: text, line: at.line + 1, meaning: ts.isTypeParameterDeclaration(decl) || isTypeDecl(ts, decl) ? "type" : "value", scope: scopeOf(ts, decl) };
}

function scopeOf(ts: Ts, decl: TypeScript.Node): SymbolRefTarget["scope"] {
  if (ts.isClassElement(decl) || ts.isTypeElement(decl) || ts.isEnumMember(decl) || ts.isObjectLiteralElementLike(decl)) return "member";
  let at = decl.parent;
  while (at && (ts.isVariableDeclaration(at) || ts.isVariableDeclarationList(at) || ts.isVariableStatement(at) || ts.isBindingElement(at) || ts.isObjectBindingPattern(at) || ts.isArrayBindingPattern(at))) at = at.parent;
  return at && ts.isSourceFile(at) ? "module" : "local";
}
