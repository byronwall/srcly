import path from "node:path";
import * as TypeScript from "typescript";
import { compilerSymbolId, inside } from "./program-evidence-support";

/** AST candidates for a symbol. Checker work starts only when references are requested. */
export class ProgramEvidenceCandidateIndex {
  readonly sourceFiles: readonly TypeScript.SourceFile[];

  private readonly checker: TypeScript.TypeChecker;
  private readonly root: string;
  private readonly files = new Map<string, TypeScript.SourceFile>();
  private readonly nodesByName = new Map<string, TypeScript.Node[]>();
  private readonly aliasesByName = new Map<string, Set<string>>();
  private readonly referencesBySymbol = new Map<string, readonly TypeScript.Node[]>();
  private readonly readsBySymbols = new Map<string, boolean>();
  private readonly symbolsByNode = new WeakMap<TypeScript.Node, string | null>();

  constructor(
    private readonly ts: typeof TypeScript,
    program: TypeScript.Program,
    root: string,
    sourceFiles?: readonly TypeScript.SourceFile[],
  ) {
    this.root = path.resolve(root);
    this.checker = program.getTypeChecker();
    this.sourceFiles = (sourceFiles ?? program.getSourceFiles())
      .filter((file) => inside(this.root, file.fileName) && (sourceFiles !== undefined || !file.isDeclarationFile))
      .slice()
      .sort((left, right) => left.fileName.localeCompare(right.fileName));

    for (const file of this.sourceFiles) {
      this.files.set(relativePath(this.root, file.fileName), file);
      this.indexFile(file);
    }
    const roots = indexesByProgram.get(program) ?? new Map<string, ProgramEvidenceCandidateIndex>();
    if (!roots.has(this.root)) roots.set(this.root, this);
    indexesByProgram.set(program, roots);
  }

  fileFor(relative: string): TypeScript.SourceFile | undefined {
    const normalized = relative.replace(/[\\/]/g, path.sep);
    return this.files.get(relativePath(this.root, path.resolve(this.root, normalized)));
  }

  referencesFor(node: TypeScript.Node): readonly TypeScript.Node[] {
    const symbolId = this.symbolId(node);
    if (!symbolId) return [];
    const cached = this.referencesBySymbol.get(symbolId);
    if (cached) return cached;

    const names = this.namesFor(identifierName(node));
    const candidates = new Set<TypeScript.Node>();
    for (const name of names) {
      for (const candidate of this.nodesByName.get(name) ?? []) candidates.add(candidate);
    }

    const references = [...candidates]
      .filter((candidate) => this.symbolId(candidate) === symbolId)
      .sort((left, right) => compareNodes(left, right));
    this.referencesBySymbol.set(symbolId, references);
    return references;
  }

  /** Whether a same-name AST candidate resolves to one of these symbols as a value read. */
  hasRead(node: TypeScript.Node, symbols: readonly TypeScript.Symbol[] = []): boolean {
    const targets = new Set<string>();
    const own = this.symbolId(node);
    if (own) targets.add(own);
    for (const symbol of symbols) {
      const id = compilerSymbolId(this.ts, this.checker, this.root, node, symbol);
      if (id) targets.add(id);
    }
    if (targets.size === 0) return false;
    const key = [...targets].sort().join("\0");
    const cached = this.readsBySymbols.get(key);
    if (cached !== undefined) return cached;
    for (const name of this.namesFor(identifierName(node))) {
      for (const candidate of this.nodesByName.get(name) ?? []) {
        if (candidate.getSourceFile().fileName.includes(`${path.sep}node_modules${path.sep}`)) continue;
        if (!isValueRead(this.ts, candidate)) continue;
        if (targets.has(this.symbolId(candidate) ?? "")) { this.readsBySymbols.set(key, true); return true; }
      }
    }
    this.readsBySymbols.set(key, false);
    return false;
  }

  private symbolId(node: TypeScript.Node): string | null {
    if (this.symbolsByNode.has(node)) return this.symbolsByNode.get(node) ?? null;
    const id = compilerSymbolId(this.ts, this.checker, this.root, node, symbolAt(this.ts, this.checker, node));
    this.symbolsByNode.set(node, id);
    return id;
  }

  private indexFile(file: TypeScript.SourceFile): void {
    const visit = (node: TypeScript.Node) => {
      const name = identifierName(node);
      if (name !== null) {
        const bucket = this.nodesByName.get(name) ?? [];
        bucket.push(node);
        this.nodesByName.set(name, bucket);
      }
      this.indexAliasSyntax(node);
      this.ts.forEachChild(node, visit);
    };
    visit(file);
  }

  private indexAliasSyntax(node: TypeScript.Node): void {
    if (this.ts.isImportSpecifier(node)) {
      this.addAlias(node.propertyName?.text ?? node.name.text, node.name.text);
      return;
    }
    if (this.ts.isExportSpecifier(node)) {
      this.addAlias(node.propertyName?.text ?? node.name.text, node.name.text);
      return;
    }
    if (this.ts.isImportClause(node) && node.name) this.addAlias("default", node.name.text);
    if (this.ts.isImportEqualsDeclaration(node) && this.ts.isQualifiedName(node.moduleReference)) {
      this.addAlias(node.moduleReference.right.text, node.name.text);
    }
    if (this.ts.isExportAssignment(node) && this.ts.isIdentifier(node.expression)) {
      this.addAlias("default", node.expression.text);
    }
    if ((this.ts.isFunctionDeclaration(node) || this.ts.isClassDeclaration(node))
      && node.name && hasDefaultModifier(this.ts, node)) {
      this.addAlias("default", node.name.text);
    }
    if (this.ts.isBindingElement(node) && this.ts.isIdentifier(node.name)) {
      const property = node.propertyName;
      if (property && identifierName(property) !== null) this.addAlias(identifierName(property)!, node.name.text);
    }
  }

  private addAlias(left: string, right: string): void {
    if (left === right) return;
    const leftNames = this.aliasesByName.get(left) ?? new Set<string>();
    leftNames.add(right);
    this.aliasesByName.set(left, leftNames);
    const rightNames = this.aliasesByName.get(right) ?? new Set<string>();
    rightNames.add(left);
    this.aliasesByName.set(right, rightNames);
  }

  private namesFor(name: string | null): Set<string> {
    if (name === null) return new Set(this.nodesByName.keys());
    const names = new Set([name]);
    const pending = [name];
    while (pending.length) {
      for (const alias of this.aliasesByName.get(pending.pop()!) ?? []) {
        if (names.has(alias)) continue;
        names.add(alias);
        pending.push(alias);
      }
    }
    return names;
  }
}

const indexesByProgram = new WeakMap<TypeScript.Program, Map<string, ProgramEvidenceCandidateIndex>>();

/** Share the provider's AST index with query-time fact classification. */
export function programEvidenceCandidateIndex(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  sourceFiles?: readonly TypeScript.SourceFile[],
): ProgramEvidenceCandidateIndex {
  const key = path.resolve(root);
  const cached = indexesByProgram.get(program)?.get(key);
  return cached ?? new ProgramEvidenceCandidateIndex(ts, program, key, sourceFiles);
}

function hasDefaultModifier(ts: typeof TypeScript, node: TypeScript.Node): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
}

function symbolAt(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Symbol | null | undefined {
  if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
    try {
      return checker.getShorthandAssignmentValueSymbol(node.parent);
    } catch {
      return null;
    }
  }
  try {
    return checker.getSymbolAtLocation(node);
  } catch {
    return null;
  }
}

function identifierName(node: TypeScript.Node): string | null {
  if (TypeScript.isIdentifier(node)) return node.text;
  if (TypeScript.isStringLiteral(node) || TypeScript.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function isValueRead(ts: typeof TypeScript, node: TypeScript.Node): boolean {
  if (!ts.isIdentifier(node)) return false;
  const parent = node.parent;
  return !ts.isExportSpecifier(parent)
    && !ts.isExportAssignment(parent)
    && !ts.isImportSpecifier(parent)
    && !ts.isImportClause(parent)
    && (!(ts.isDeclarationStatement(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent))
      || (parent as { name?: TypeScript.Node }).name !== node);
}

function relativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function compareNodes(left: TypeScript.Node, right: TypeScript.Node): number {
  const leftFile = left.getSourceFile().fileName;
  const rightFile = right.getSourceFile().fileName;
  return leftFile.localeCompare(rightFile) || left.getStart() - right.getStart() || left.end - right.end;
}
