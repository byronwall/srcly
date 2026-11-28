// srcly's `copied-type-cast` checker: one tsconfig's casts onto a same-name copy of the operand's type.
// Run by copied_type_casts.py: node copied_type_casts.mjs <tsconfig> <scope dir>
// It loads the project's own `typescript` (resolved from the tsconfig), so the
// checker sees the project the way its tsc does. Prints one JSON object.
import { createRequire } from "node:module";
import path from "node:path";

const [configPath, scopeDir] = process.argv.slice(2);
let ts;
try {
  ts = createRequire(path.resolve(configPath))("typescript");
} catch {
  console.log(JSON.stringify({ error: "the project has no `typescript` package" }));
  process.exit(0);
}

const configError = [];
const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => configError.push(ts.flattenDiagnosticMessageText(d.messageText, " ")),
});
// A broken config (a missing `extends` base) changes what the checker sees: N/A, not a clean 0.
// TS18003 (no inputs) is an empty project, which checks nothing.
const fatal = config?.errors.find((d) => d.code !== 18003);
if (fatal) configError.push(ts.flattenDiagnosticMessageText(fatal.messageText, " "));
if (!config || configError.length) {
  console.log(JSON.stringify({ error: `tsconfig: ${configError[0] ?? "unreadable"}` }));
  process.exit(0);
}
const program = ts.createProgram({
  rootNames: config.fileNames,
  options: { ...config.options, noEmit: true },
  projectReferences: config.projectReferences,
});
const checker = program.getTypeChecker();
// The scan root: a folder, or one file.
const scope = path.resolve(scopeDir);
const inScope = (file) => file === scope || file.startsWith(scope + path.sep);
const inNodeModules = (file) => file.split(/[\\/]/).includes("node_modules");
const isProjectFile = (sf) =>
  !sf.isDeclarationFile && !inNodeModules(sf.fileName) && inScope(path.resolve(sf.fileName));
// A declaration the project wrote, as opposed to one from a library or lib.d.ts.
const isOwn = (sf) =>
  !program.isSourceFileDefaultLibrary(sf) && !program.isSourceFileFromExternalLibrary(sf) && !inNodeModules(sf.fileName);

function unwrapPromise(type) {
  if (type.getSymbol()?.getName() !== "Promise") return null;
  const args = checker.getTypeArguments(type);
  return args?.length === 1 ? args[0] : null;
}

// Only these declare a type with a name another file can copy.
const NAMED = ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.Enum;

// The named declaration behind a type: its alias (`type X = …`) or its
// class/interface/enum symbol. An enum member (`Status.Ready`, or the one
// member of a one-member enum) stands for its enum. Anonymous object types,
// type parameters and anything else are left out.
function named(type) {
  if (type.flags & ts.TypeFlags.TypeParameter) return null;
  let sym = type.aliasSymbol ?? type.getSymbol();
  if (sym && sym.flags & ts.SymbolFlags.EnumMember) sym = sym.parent;
  const decl = sym?.declarations?.[0];
  if (!sym || !decl || !(sym.flags & NAMED)) return null;
  const sf = decl.getSourceFile();
  return {
    sym,
    name: sym.getName(),
    file: path.resolve(sf.fileName),
    line: sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1,
    own: isOwn(sf),
  };
}

const files = [];
const casts = [];
for (const sf of program.getSourceFiles()) {
  if (!isProjectFile(sf)) continue;
  files.push(path.resolve(sf.fileName));
  const visit = (node) => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const typeNode = node.type;
      const isConst = ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText(sf) === "const";
      if (!isConst) check(sf, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function check(sf, node) {
  let src = checker.getTypeAtLocation(node.expression);
  let tgt = checker.getTypeFromTypeNode(node.type);
  // `fetchDoc(id) as Promise<DocDetail>`: the copy hides in the payload.
  const ps = unwrapPromise(src), pt = unwrapPromise(tgt);
  if (ps && pt) [src, tgt] = [ps, pt];
  const a = named(src), b = named(tgt);
  if (!a || !b || a.name !== b.name || a.sym === b.sym) return;
  if (a.file === b.file && a.line === b.line) return;
  // Two library declarations (DOM's and Node's `ReadableStream`) are not the project's copy.
  if (!a.own && !b.own) return;
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const end = sf.getLineAndCharacterOfPosition(node.getEnd());
  casts.push({
    file: path.resolve(sf.fileName),
    line: start.line + 1,
    endLine: end.line + 1,
    column: start.character + 1,
    text: node.getText(sf).replace(/\s+/g, " ").slice(0, 80),
    name: a.name,
    source: { file: a.file, line: a.line },
    target: { file: b.file, line: b.line },
  });
}

console.log(JSON.stringify({ files, casts }));
