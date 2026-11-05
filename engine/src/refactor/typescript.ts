import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { symbolOperations, type SymbolAction } from "./symbols";
import { editType, type TypeAction } from "./type-edits";

export type Change = { path: string; before: string | null; after: string | null };
export type MoveFile = { kind: "move-file"; file: string; to: string };
export type Graph = { files: string[]; edges: { from: string; to: string }[] };
export type Compiler = {
  root: string; config: string; program: ts.Program; service: ts.LanguageService; files: ts.SourceFile[];
  inside: (name: string) => { absolute: string; relative: string };
  changes: (edits: readonly ts.FileTextChanges[]) => Change[];
  stage: (changes: Change[]) => void;
};

/** Compiler edits are proposals. Only the journal executor writes them, inside its own worktree. */
export function project(root: string, config: string) {
  const inside = (name: string) => {
    const absolute = path.resolve(root, name);
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    if (!relative || relative.startsWith("../") || path.isAbsolute(relative) || relative.split("/").some((p) => p === ".git" || p === "node_modules")) {
      throw new Error(`Outside project: ${name}`);
    }
    return { absolute, relative };
  };
  const configPath = inside(config).absolute;
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath), { noEmit: true }, configPath);
  if (parsed.errors.length) throw new Error(parsed.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
  if (parsed.projectReferences?.length) throw new Error("Choose one leaf tsconfig; project references are not supported yet.");
  const snapshots = new Map<string, string | null>();
  let revision = 0;
  const readFile = (file: string) => snapshots.has(path.resolve(file)) ? snapshots.get(path.resolve(file)) ?? undefined : ts.sys.readFile(file);
  const host: ts.LanguageServiceHost = {
    ...ts.sys,
    readFile,
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => String(revision),
    getProjectVersion: () => String(revision),
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getScriptSnapshot: (file) => { const text = readFile(file); return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text); },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
  };
  const service = ts.createLanguageService(host);
  const program = service.getProgram();
  if (!program) throw new Error("TypeScript could not build this project.");
  const files = program.getSourceFiles().filter((f) => !f.isDeclarationFile && !path.relative(root, f.fileName).startsWith("..") && !f.fileName.includes("/node_modules/"));
  const graph = (): Graph => {
    const names = new Set(files.map((f) => path.resolve(f.fileName)));
    const edges: Graph["edges"] = [];
    for (const file of files) {
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const resolved = ts.resolveModuleName(node.moduleSpecifier.text, file.fileName, parsed.options, ts.sys).resolvedModule;
          if (resolved && names.has(path.resolve(resolved.resolvedFileName))) edges.push({ from: inside(file.fileName).relative, to: inside(resolved.resolvedFileName).relative });
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    return { files: files.map((f) => inside(f.fileName).relative).sort(), edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)) };
  };
  const diagnosticKey = (d: ts.Diagnostic) => `${d.file?.fileName}:${d.start}:${d.code}`;
  const syntax = new Set(program.getSyntacticDiagnostics().map(diagnosticKey));
  const diagnostics = () => ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error).map((d) => ({
    phase: syntax.has(diagnosticKey(d)) ? "syntax" : d.file ? "type" : "config",
    code: d.code,
    file: d.file ? path.relative(root, d.file.fileName).replaceAll(path.sep, "/") : config,
    line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));

  function moveFile(action: MoveFile): Change[] {
    const from = inside(action.file);
    const to = inside(action.to);
    if (!files.some((f) => path.resolve(f.fileName) === from.absolute)) throw new Error(`Not a source file in this tsconfig: ${from.relative}`);
    if (fs.existsSync(to.absolute)) throw new Error(`Destination already exists: ${to.relative}`);
    if (path.extname(from.absolute) !== path.extname(to.absolute)) throw new Error("A file move must preserve its extension.");
    const source = program!.getSourceFile(from.absolute)!;
    // These expressions observe the file location. Import rewrites alone cannot preserve them.
    if (/\b(?:__dirname|__filename)\b|import\s*\.\s*meta/.test(source.text)) throw new Error("This file observes its own location (__dirname, __filename or import.meta); moving it needs an explicit resource strategy.");
    for (const file of files) {
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]))) throw new Error(`Computed dynamic import in ${inside(file.fileName).relative}; its target cannot be updated deterministically.`);
        if (file === source && (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")) {
          if (!ts.resolveModuleName(node.moduleSpecifier.text, file.fileName, parsed.options, ts.sys).resolvedModule) throw new Error(`Unresolved relative import ${node.moduleSpecifier.text}; moving assets needs an explicit resource strategy.`);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    const edits = service.getEditsForFileRename(from.absolute, to.absolute, { indentSize: 2, convertTabsToSpaces: true }, { importModuleSpecifierPreference: "shortest" });
    const changes = editsToChanges(edits, inside);
    const moved = changes.find((c) => c.path === from.relative);
    const before = fs.readFileSync(from.absolute, "utf8");
    return [
      ...changes.filter((c) => c.path !== from.relative),
      { path: from.relative, before, after: null },
      { path: to.relative, before: null, after: moved?.after ?? before },
    ].sort((a, b) => a.path.localeCompare(b.path));
  }
  const context: Compiler = { root, config, program, service, files, inside,
    changes: (edits) => editsToChanges(edits, inside, readFile),
    stage: (changes) => { for (const change of changes) snapshots.set(inside(change.path).absolute, change.after); revision++; },
  };
  const operations = symbolOperations(context);
  return { graph, diagnostics, symbols: operations.catalog,
    transform: (action: MoveFile | SymbolAction | TypeAction) => {
      if (action.kind === "move-file") return { changes: moveFile(action) };
      if (["add-member", "update-member", "remove-member", "add-type", "update-type", "remove-type"].includes(action.kind)) return editType(context, action as TypeAction);
      return operations.transform(action as SymbolAction);
    },
    dispose: () => service.dispose() };
}

function editsToChanges(edits: readonly ts.FileTextChanges[], inside: (name: string) => { absolute: string; relative: string }, readFile: (file: string) => string | undefined = ts.sys.readFile): Change[] {
  return edits.map((edit) => {
    const file = inside(edit.fileName);
    const before = readFile(file.absolute) ?? null;
    let after = before ?? "";
    let boundary = after.length;
    for (const { change } of edit.textChanges.map((change, index) => ({ change, index })).sort((a, b) => b.change.span.start - a.change.span.start || b.change.span.length - a.change.span.length || b.index - a.index)) {
      const end = change.span.start + change.span.length;
      if (end > boundary) throw new Error(`Overlapping compiler edits: ${file.relative}`);
      after = after.slice(0, change.span.start) + change.newText + after.slice(end);
      boundary = change.span.start;
    }
    return { path: file.relative, before, after };
  });
}
