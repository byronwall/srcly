import path from "node:path";
import ts from "typescript";
import type { Change, Compiler } from "./typescript";

export type SymbolAction = { kind: "move-symbol" | "rename" | "extract-function" | "extract-component"; file: string; name?: string; text?: string; to: string; reexport?: boolean };
export class Refusal extends Error {
  constructor(public code: string, message: string, public details: unknown = null, public suggestions: string[] = []) { super(message); }
}
const format = { ...ts.getDefaultFormatCodeSettings(), indentSize: 2, convertTabsToSpaces: true, newLineCharacter: "\n" };
const preferences: ts.UserPreferences = { allowTextChangesInNewFiles: true, provideRefactorNotApplicableReason: true, importModuleSpecifierPreference: "shortest", quotePreference: "double" };

export function identifier(name: string) {
  if (!/^[$A-Z_a-z][$\w]*$/.test(name)) throw new Refusal("invalid-name", `Expected an identifier, got ${name}.`);
  const parsed = ts.createSourceFile("name.ts", `const ${name} = 0;`, ts.ScriptTarget.Latest, true);
  const statement = parsed.statements[0];
  if (!statement || !ts.isVariableStatement(statement) || statement.declarationList.declarations[0]?.name.getText(parsed) !== name) throw new Refusal("invalid-name", `Not a valid TypeScript binding: ${name}.`);
}

type Named = { name: ts.Identifier; declaration: ts.Declaration; statement: ts.Statement };
function bindingNames(name: ts.BindingName): ts.Identifier[] {
  return ts.isIdentifier(name) ? [name] : name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}
export function topNames(source: ts.SourceFile | ts.Block): Named[] {
  return source.statements.flatMap<Named>((statement) => {
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap((declaration) => bindingNames(declaration.name).map((name) => ({ name, declaration, statement })));
    if ((ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) return [{ name: statement.name, declaration: statement as ts.Declaration, statement }];
    return [];
  });
}

export function locate(ctx: Compiler, file: string, name: string) {
  const source = ctx.program.getSourceFile(ctx.inside(file).absolute);
  if (!source) throw new Refusal("target-not-found", `Not a source file in this project: ${file}.`);
  const parts = name.split(".");
  let scope: ts.SourceFile | ts.Block = source;
  for (let index = 0; index < parts.length; index++) {
    const targets: Named[] = topNames(scope).filter((candidate) => candidate.name.text === parts[index]);
    if (targets.length !== 1) throw new Refusal("target-not-found", `Expected one declaration of ${name} in ${file}; found ${targets.length}.`);
    const target: Named = targets[0];
    if (index === parts.length - 1) return { source, ...target };
    if (ts.isInterfaceDeclaration(target.declaration) && index === parts.length - 2) {
      const properties = target.declaration.members.filter((item) => item.name && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === parts[index + 1]);
      if (properties.length !== 1 || !properties[0].name) throw new Refusal("target-not-found", `Expected one interface member ${name}.`);
      return { source, statement: target.statement, declaration: properties[0] as ts.Declaration, name: properties[0].name };
    }
    const callable: ts.Node | undefined = ts.isVariableDeclaration(target.declaration) ? target.declaration.initializer : target.declaration;
    if (!callable || (!ts.isFunctionDeclaration(callable) && !ts.isArrowFunction(callable) && !ts.isFunctionExpression(callable)) || !callable.body || !ts.isBlock(callable.body)) throw new Refusal("unsupported-target", `Cannot resolve a nested declaration in ${parts[index]}.`);
    scope = callable.body;
  }
  throw new Refusal("target-not-found", `No declaration named ${name}.`);
}

function mergeChanges(first: Change[], second: Change[]) {
  const changes = new Map(first.map((change) => [change.path, change]));
  for (const change of second) changes.set(change.path, { ...change, before: changes.has(change.path) ? changes.get(change.path)!.before : change.before });
  return [...changes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function renameAt(ctx: Compiler, file: string, position: number, name: string) {
  identifier(name);
  const info = ctx.service.getRenameInfo(file, position, { allowRenameOfImportPath: false });
  if (!info.canRename) throw new Refusal("rename-unavailable", info.localizedErrorMessage);
  const locations = ctx.service.findRenameLocations(file, position, false, false, { providePrefixAndSuffixTextForRename: true });
  if (!locations?.length) throw new Refusal("rename-unavailable", "The compiler found no references to rename.");
  const files = new Map<string, ts.TextChange[]>();
  for (const location of locations) {
    const changes = files.get(location.fileName) ?? [];
    changes.push({ span: location.textSpan, newText: (location.prefixText ?? "") + name + (location.suffixText ?? "") });
    files.set(location.fileName, changes);
  }
  return ctx.changes([...files].map(([fileName, textChanges]) => ({ fileName, textChanges })));
}

function requiredLocals(ctx: Compiler, source: ts.SourceFile, statement: ts.Statement) {
  const checker = ctx.program.getTypeChecker();
  const dependencies = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      for (const declaration of symbol?.declarations ?? []) {
        if (declaration.getSourceFile() !== source || (declaration.pos >= statement.pos && declaration.end <= statement.end)) continue;
        if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration) || ts.isNamespaceImport(declaration)) continue;
        if (topNames(source).some((top) => top.declaration === declaration)) dependencies.add(symbol!.name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return [...dependencies].sort();
}

function declarationCanMove(statement: ts.Statement) {
  if (ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true;
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1 || !(statement.declarationList.flags & ts.NodeFlags.Const)) return false;
  const init = statement.declarationList.declarations[0].initializer;
  return !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isStringLiteral(init) || ts.isNumericLiteral(init) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(init.kind));
}

export function symbolOperations(ctx: Compiler) {
  const catalog = () => ctx.files.flatMap((source) => topNames(source).flatMap((target) => {
    const item = { file: ctx.inside(source.fileName).relative, name: target.name.text, kind: ts.SyntaxKind[target.declaration.kind], line: source.getLineAndCharacterOfPosition(target.name.getStart(source)).line + 1 };
    return [item, ...(ts.isInterfaceDeclaration(target.declaration) ? target.declaration.members.flatMap((member) => member.name && ts.isIdentifier(member.name) ? [{ ...item, name: `${item.name}.${member.name.text}`, kind: "PropertySignature" }] : []) : [])];
  }));

  function move(action: SymbolAction): Change[] {
    const target = locate(ctx, action.file, action.name!);
    if (target.statement.parent !== target.source) throw new Refusal("closure-dependencies", "Moving a nested closure requires an explicit interface for its captured bindings. Extract a top-level function first.");
    if (ts.isPropertySignature(target.declaration) || ts.isMethodSignature(target.declaration)) throw new Refusal("unsupported-target", "Move a whole top-level declaration; interface members can be renamed.");
    if (!declarationCanMove(target.statement)) throw new Refusal("initializer-effects", "Move supports functions, types, components and literal constants. State initializers need an explicit ownership operation.");
    const checkLocation = (node: ts.Node) => {
      if (ts.isMetaProperty(node) || (ts.isIdentifier(node) && ["__dirname", "__filename"].includes(node.text)) ||
          (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")))) {
        throw new Refusal("location-dependent-symbol", "This declaration observes its module location or loads modules at runtime. Supply an explicit resource/import strategy before moving it.");
      }
      ts.forEachChild(node, checkLocation);
    };
    checkLocation(target.statement);
    if (action.file === action.to) throw new Refusal("same-destination", "Choose a different module for this symbol.");
    const dependencies = requiredLocals(ctx, target.source, target.statement);
    if (dependencies.length) throw new Refusal("dependencies-required", `Move the required local dependencies first: ${dependencies.join(", ")}.`, { dependencies: dependencies.map((name) => ({ file: action.file, name })) }, dependencies.map((name) => `let ${name} = symbol ${JSON.stringify(action.file)} ${JSON.stringify(name)}\nmove-symbol $${name} -> ${JSON.stringify(action.to)}`));
    const result = ctx.service.getEditsForRefactor(target.source.fileName, format, { pos: target.statement.getStart(target.source), end: target.statement.end }, "Move to file", "Move to file", preferences, { targetFile: ctx.inside(action.to).absolute });
    if (!result?.edits.length || result.notApplicableReason) throw new Refusal("move-unavailable", result?.notApplicableReason ?? "The compiler could not move this declaration.");
    const changes = ctx.changes(result.edits);
    if (action.reexport) {
      const modifiers = ts.canHaveModifiers(target.statement) ? ts.getModifiers(target.statement) ?? [] : [];
      if (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) || modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) throw new Refusal("compatibility-unavailable", "Compatibility re-exports currently require a named export.");
      const source = changes.find((change) => change.path === action.file)!;
      let specifier = path.posix.relative(path.posix.dirname(action.file), action.to).replace(/\.(tsx?|mts|cts)$/, "");
      if (!specifier.startsWith(".")) specifier = `./${specifier}`;
      const typeOnly = ts.isTypeAliasDeclaration(target.statement) || ts.isInterfaceDeclaration(target.statement);
      source.after = `${source.after ?? ""}\nexport ${typeOnly ? "type " : ""}{ ${action.name} } from ${JSON.stringify(specifier)};\n`;
    }
    return changes;
  }

  function selection(action: SymbolAction) {
    const source = ctx.program.getSourceFile(ctx.inside(action.file).absolute);
    if (!source || !action.text) throw new Refusal("selection-not-found", "Extract operations require a nonempty selection handle.");
    const pos = source.text.indexOf(action.text);
    if (pos < 0 || source.text.indexOf(action.text, pos + 1) >= 0) throw new Refusal("selection-ambiguous", "The selection text must occur exactly once in the current file. Use a more specific snippet.");
    return { source, pos, end: pos + action.text.length };
  }

  function extractFunction(action: SymbolAction): Change[] {
    identifier(action.to);
    const selected = selection(action);
    const actions = ctx.service.getApplicableRefactors(selected.source.fileName, selected, preferences, "invoked", "refactor.extract.function").flatMap((refactor) => refactor.actions.map((item) => ({ ...item, refactor: refactor.name })));
    const available = actions.filter((item) => !item.notApplicableReason && item.name.startsWith("function_scope_"));
    const chosen = available.at(-1);
    if (!chosen) throw new Refusal("extract-unavailable", actions[0]?.notApplicableReason ?? "The compiler cannot extract this selection into a function.");
    // No framework calls or JSX can be lifted through this generic operation.
    // Their owner/tracking semantics require the component/context operations.
    if (/\b(createSignal|createMemo|createEffect|createResource|createStore|onCleanup|onMount|useContext)\s*\(|<[A-Za-z]/.test(action.text!)) throw new Refusal("reactive-owner-required", "Use a component/context operation for reactive setup or JSX; generic extraction cannot certify its ownership.");
    const result = ctx.service.getEditsForRefactor(selected.source.fileName, format, selected, chosen.refactor, chosen.name, preferences);
    if (!result?.edits.length || result.renameLocation === undefined || !result.renameFilename) throw new Refusal("extract-unavailable", "The compiler did not return a renameable extracted function.");
    const initial = ctx.changes(result.edits);
    ctx.stage(initial);
    const renamed = renameAt(ctx, result.renameFilename, result.renameLocation, action.to);
    return mergeChanges(initial, renamed);
  }

  function extractComponent(action: SymbolAction) {
    identifier(action.to);
    if (!/^[A-Z]/.test(action.to)) throw new Refusal("invalid-name", "A JSX component name must begin with an uppercase letter.");
    const selected = selection(action);
    let jsx: ts.Node | undefined;
    const visit = (node: ts.Node) => { if (node.getStart(selected.source) === selected.pos && node.end === selected.end) jsx = node; else ts.forEachChild(node, visit); };
    visit(selected.source);
    if (!jsx || (!ts.isJsxElement(jsx) && !ts.isJsxSelfClosingElement(jsx) && !ts.isJsxFragment(jsx))) throw new Refusal("jsx-selection-required", "Select exactly one JSX element or fragment.");
    let parent: ts.Node | undefined = jsx.parent;
    while (parent && !ts.isFunctionDeclaration(parent) && !ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent)) parent = parent.parent;
    if (!parent?.body || !ts.isBlock(parent.body)) throw new Refusal("block-component-required", "The containing component needs a block body before extracting a nested component.");
    const owner = ts.isArrowFunction(parent) || ts.isFunctionExpression(parent) ? parent.parent : parent;
    if ((!ts.isFunctionDeclaration(owner) && !ts.isVariableDeclaration(owner)) || !owner.name || !ts.isIdentifier(owner.name)) throw new Refusal("named-owner-required", "Extract inside a named component so the result has a stable handle.");
    const ownerStatement = ts.isVariableDeclaration(owner) ? owner.parent.parent : owner;
    if (ownerStatement.parent !== selected.source) throw new Refusal("named-owner-required", "This component extraction currently requires a top-level owner.");
    // A closure retains the same signal/accessor bindings. Additional owners and
    // effectful JSX are not inferred: the first operation accepts display-only markup.
    const check = (node: ts.Node) => {
      if (ts.isCallExpression(node) || ts.isJsxSpreadAttribute(node) || (ts.isJsxExpression(node) && node.dotDotDotToken) || ts.isJsxNamespacedName(node) || (ts.isJsxAttribute(node) && ["ref", "children"].includes(node.name.getText(selected.source))) || ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && !/^[a-z][a-z0-9-]*$/.test(node.tagName.getText(selected.source)))) throw new Refusal("effectful-jsx", "This extraction supports intrinsic display-only JSX with lexical reads. Calls, child components, directives, spreads and refs need explicit ownership evidence.");
      ts.forEachChild(node, check);
    };
    check(jsx);
    return { name: `${owner.name.text}.${action.to}`, changes: ctx.changes([{ fileName: selected.source.fileName, textChanges: [
      { span: { start: selected.pos, length: selected.end - selected.pos }, newText: `<${action.to} />` },
      { span: { start: parent.body.getStart(selected.source) + 1, length: 0 }, newText: `\n  function ${action.to}() { return (${action.text}); }\n` },
    ] }]) };
  }

  return { catalog, transform: (action: SymbolAction) => {
    if (action.kind === "move-symbol") return { changes: move(action) };
    if (action.kind === "extract-function") return { changes: extractFunction(action) };
    if (action.kind === "extract-component") return extractComponent(action);
    const target = locate(ctx, action.file, action.name!);
    return { changes: renameAt(ctx, target.source.fileName, target.name.getStart(target.source), action.to) };
  } };
}
