import path from "node:path";
import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { fileExportsResultSchema, type FileExport, type FileExportsResult } from "../contracts/file-exports";
import { EngineError } from "../protocol";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";

/**
 * The exported declarations of a file, or of every program file under a
 * folder (T19). Each export names the declaration it resolves to, through
 * re-exports, with the line the client anchors at; type-only exports are
 * listed as not traceable. Files are in path order and exports in source
 * order, so the result is stable for the cache.
 */
export function fileExportsOp(session: EngineSession, params: { file?: unknown; expectedGeneration?: unknown }, cancellation?: AnalysisCancellationToken): FileExportsResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  if (typeof params.file !== "string" || !params.file) throw new EngineError("invalid-request", "fileExports needs params.file");
  const root = path.resolve(tier1.args.root);
  const absolute = path.resolve(root, params.file);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new EngineError("invalid-request", `${params.file} is outside the engine root`);
  const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const sources = tier1.program.getSourceFiles().filter((source) => firstParty(source, root) && (source.fileName === absolute || source.fileName.startsWith(absolute + path.sep)));
  const single = sources.find((source) => source.fileName === absolute);
  const kind = single ? "file" : "folder";
  if (!sources.length) throw new EngineError("not-found", `${relative || "."} has no TypeScript program file`);
  const files = (single ? [single] : sources)
    .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
    .map((source) => {
      cancellation?.throwIfCancelled();
      return { file: rel(source.fileName), absPath: source.fileName, exports: exportsOf(tier1, source, rel) };
    });
  const exports = files.flatMap((item) => item.exports);
  return fileExportsResultSchema.parse({
    outcome: "ok",
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    reason: null,
    target: { path: relative.split(path.sep).join("/") || ".", absPath: absolute, kind },
    files,
    counts: { files: files.length, exports: exports.length, traceable: exports.filter((item) => item.traceable).length },
  });
}

function firstParty(source: TypeScript.SourceFile, root: string): boolean {
  return source.fileName.startsWith(root + path.sep) && !source.fileName.includes(`${path.sep}node_modules${path.sep}`) && !source.isDeclarationFile;
}

function exportsOf(tier1: Tier1, source: TypeScript.SourceFile, rel: (file: string) => string): FileExport[] {
  const { ts } = tier1;
  const checker = tier1.program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return [];
  const out: FileExport[] = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declaration = pickDeclaration(ts, resolved, source) ?? pickDeclaration(ts, symbol, source);
    if (!declaration) continue;
    const file = declaration.getSourceFile();
    const nameNode = (declaration as { name?: TypeScript.Node }).name ?? declaration;
    const at = file.getLineAndCharacterOfPosition(nameNode.getStart(file));
    const kind = kindOf(ts, checker, resolved, declaration);
    const name = symbol.escapedName === "default" ? `default (${resolved.name})` : symbol.name;
    const line = at.line + 1;
    out.push({
      id: `${rel(file.fileName)}@${resolved.name}:${line}`,
      name,
      kind,
      file: rel(file.fileName),
      absPath: file.fileName,
      line,
      column: at.character + 1,
      traceable: kind !== "type" && kind !== "interface" && kind !== "namespace" && /^[A-Za-z_$][\w$]*$/.test(resolved.name),
      reexported: file !== source,
    });
  }
  // Source order within the file; re-exports after, by name.
  return out.sort((a, b) => (a.reexported !== b.reexported ? Number(a.reexported) - Number(b.reexported) : a.file !== b.file ? a.file.localeCompare(b.file) : a.line - b.line || a.column - b.column));
}

/** The declaration to anchor at: a value declaration in this file first, else any, else nothing usable. */
function pickDeclaration(ts: typeof TypeScript, symbol: TypeScript.Symbol, source: TypeScript.SourceFile): TypeScript.Declaration | null {
  const declarations = (symbol.declarations ?? []).filter((d) => !ts.isExportSpecifier(d) && !ts.isExportAssignment(d) && !ts.isNamespaceExport(d) && !ts.isSourceFile(d));
  if (!declarations.length) return null;
  const valueLike = (d: TypeScript.Declaration) => ts.isFunctionDeclaration(d) || ts.isClassDeclaration(d) || ts.isVariableDeclaration(d) || ts.isEnumDeclaration(d) || ts.isBindingElement(d);
  return declarations.find((d) => d.getSourceFile() === source && valueLike(d)) ?? declarations.find(valueLike) ?? declarations.find((d) => d.getSourceFile() === source) ?? declarations[0];
}

function kindOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, symbol: TypeScript.Symbol, declaration: TypeScript.Declaration): FileExport["kind"] {
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  if (ts.isTypeAliasDeclaration(declaration)) return "type";
  if (ts.isEnumDeclaration(declaration)) return "enum";
  if (ts.isModuleDeclaration(declaration)) return "namespace";
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isFunctionDeclaration(declaration) || ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const callable = type.getCallSignatures().length > 0 || (ts.isVariableDeclaration(declaration) && !!declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)));
    if (!callable) return "variable";
    return /^[A-Z]/.test(symbol.name) && componentLike(checker, type) ? "component" : "function";
  }
  return symbol.flags & ts.SymbolFlags.Value ? "variable" : "other";
}

/** A capitalized callable whose return type mentions JSX: a component. */
function componentLike(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return type.getCallSignatures().some((signature) => /JSX|Element/.test(checker.typeToString(checker.getReturnTypeOfSignature(signature))));
}
