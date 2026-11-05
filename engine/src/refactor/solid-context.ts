import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { Compiler } from "./typescript";
import { identifier, locate, Refusal } from "./symbols";

export type ContextAction = { kind: "solid-context"; file: string; to: string; provider: string; hook: string; owner: { file: string; name: string } };

function modulePath(from: string, to: string) {
  let relative = path.posix.relative(path.posix.dirname(from), to).replace(/\.(tsx?|mts|cts)$/, "");
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return relative;
}

function isRoot(node: ts.Declaration): node is ts.FunctionDeclaration & { name: ts.Identifier; body: ts.Block } {
  return ts.isFunctionDeclaration(node) && !!node.name && !!node.body && ts.isSourceFile(node.parent) && node.parameters.length <= 1 && !node.typeParameters && !node.asteriskToken && !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

/** A whole-module ownership change, with every known consumer underneath one root. */
export function solidContext(ctx: Compiler, action: ContextAction) {
  const fail = (message: string): never => { throw new Refusal("context-proof-required", message); };
  identifier(action.provider); identifier(action.hook);
  if (!/^[A-Z]/.test(action.provider) || !/^use[A-Z]/.test(action.hook) || action.provider === action.hook) return fail("Use an uppercase provider name and a useX hook name.");
  const source = ctx.program.getSourceFile(ctx.inside(action.file).absolute);
  if (!source || !action.to.endsWith(".tsx") || fs.existsSync(ctx.inside(action.to).absolute)) return fail("Choose a source module and a new .tsx destination.");
  const rootTarget = locate(ctx, action.owner.file, action.owner.name);
  const root = rootTarget.declaration;
  const ownerFunction = (node: ts.Node): ts.FunctionDeclaration | undefined => {
    while (node.parent && !ts.isSourceFile(node.parent)) node = node.parent;
    return ts.isFunctionDeclaration(node) && node.body && node.name ? node : undefined;
  };
  if (!isRoot(root)) return fail("The provider root must be a named top-level synchronous function component with zero or one props parameter.");
  if (root.parameters.some((p) => !ts.isIdentifier(p.name) || p.initializer || p.dotDotDotToken || p.questionToken)) return fail("Use a plain required props parameter at the provider root; defaults and destructuring need an explicit adapter.");
  if (rootTarget.source === source) return fail("The provider root must live outside the state module.");
  const checker = ctx.program.getTypeChecker();
  const unalias = (symbol: ts.Symbol | undefined): ts.Symbol | undefined => symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const exported = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  const values = exported.filter((symbol) => symbol.flags & ts.SymbolFlags.Value).map((symbol) => symbol.name);
  if (!values.length || values.includes("default")) return fail("The state module needs named value exports; default exports need an explicit adapter.");
  const generated = [action.provider, action.hook, "SrclyStateContext", "createSrclyState", "srclyCreateContext", "srclyUseContext", "SrclyParentProps"];
  const hasName = (file: ts.SourceFile, name: string) => {
    let found = false;
    const visit = (node: ts.Node) => { if (ts.isIdentifier(node) && node.text === name) found = true; else ts.forEachChild(node, visit); };
    visit(file); return found;
  };
  for (const name of generated) if (hasName(source, name)) return fail(`Generated binding ${name} already occurs in the state module. Choose different names or rename that binding first.`);
  const imports: string[] = [], types: string[] = [], setup: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      let text = statement.getFullText(source);
      if (statement.moduleSpecifier.text.startsWith(".")) {
        const resolved = ts.resolveModuleName(statement.moduleSpecifier.text, source.fileName, ctx.program.getCompilerOptions(), ts.sys).resolvedModule;
        if (!resolved || !ctx.files.some((file) => file.fileName === resolved.resolvedFileName)) return fail("Relative asset or external imports need an explicit resource strategy before moving state.");
        text = text.slice(0, statement.moduleSpecifier.getStart(source) - statement.pos) + JSON.stringify(modulePath(action.to, ctx.inside(resolved.resolvedFileName).relative)) + text.slice(statement.moduleSpecifier.end - statement.pos);
      }
      imports.push(text);
    } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      types.push(statement.getFullText(source));
    } else if (ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement) || ts.isExpressionStatement(statement)) {
      if (ts.isVariableStatement(statement) && !(statement.declarationList.flags & ts.NodeFlags.Const)) return fail("Mutable exported bindings require an accessor migration. Start with const signals/stores and functions.");
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      if (modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword || m.kind === ts.SyntaxKind.DeclareKeyword)) return fail("Ambient and default declarations cannot become owned state.");
      let text = statement.getFullText(source);
      for (const modifier of [...(modifiers ?? [])].reverse()) if (modifier.kind === ts.SyntaxKind.ExportKeyword) text = text.slice(0, modifier.getStart(source) - statement.pos) + text.slice(modifier.end - statement.pos);
      setup.push(text);
    } else return fail("The state module must contain imports, types, const declarations, functions and setup expressions. Re-exports need to be resolved first.");
  }
  // Location-sensitive and escaping module initialization cannot be certified by an owner migration.
  let reactive = false;
  const inspectSetup = (node: ts.Node) => {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) return fail("Runtime module loading needs an explicit resource/import strategy before relocating state.");
    if (ts.isAwaitExpression(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node) || node.kind === ts.SyntaxKind.ThisKeyword || ts.isMetaProperty(node) || (ts.isIdentifier(node) && ["__dirname", "__filename", "arguments"].includes(node.text))) return fail("The state module contains JSX or location/call-context-sensitive code. Separate it from state setup first.");
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const declaration = unalias(checker.getSymbolAtLocation(node.expression))?.declarations?.[0];
      if (["createSignal", "createStore"].includes(declaration && "name" in declaration ? (declaration.name as ts.Node | undefined)?.getText() ?? "" : "") && declaration?.getSourceFile().fileName.includes("/solid-js/")) reactive = true;
    }
    ts.forEachChild(node, inspectSetup);
  };
  inspectSetup(source);
  if (!reactive) return fail("No compiler-resolved Solid createSignal/createStore was found in this module.");

  const edits = new Map<string, ts.TextChange[]>();
  const edit = (file: ts.SourceFile, start: number, length: number, newText: string) => { const items = edits.get(file.fileName) ?? []; items.push({ span: { start, length }, newText }); edits.set(file.fileName, items); };
  const consumers = new Map<ts.FunctionDeclaration, Map<string, string>>();
  const resolvesState = (specifier: ts.Expression, file: ts.SourceFile) => ts.isStringLiteral(specifier) && ts.resolveModuleName(specifier.text, file.fileName, ctx.program.getCompilerOptions(), ts.sys).resolvedModule?.resolvedFileName === source.fileName;
  for (const file of ctx.files) {
    if (file === source) continue;
    const inspectImports = (node: ts.Node) => {
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && resolvesState(node.moduleSpecifier, file)) return fail(`Resolve the state re-export in ${ctx.inside(file.fileName).relative} before changing its ownership.`);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(file) === "require") && (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]) || resolvesState(node.arguments[0], file))) return fail("Dynamic/require imports cannot establish provider coverage for state consumers.");
      ts.forEachChild(node, inspectImports);
    };
    inspectImports(file);
    let needsHook = false;
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !resolvesState(statement.moduleSpecifier, file)) continue;
      const clause = statement.importClause;
      if (!clause || clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return fail("State consumers must use named imports; namespace, default and side-effect imports need explicit adapters.");
      const typeBindings: string[] = [];
      for (const binding of clause.namedBindings.elements) {
        const exportedName = (binding.propertyName ?? binding.name).text;
        if (clause.isTypeOnly || binding.isTypeOnly || !values.includes(exportedName)) { typeBindings.push(`type ${exportedName}${exportedName === binding.name.text ? "" : ` as ${binding.name.text}`}`); continue; }
        const symbol = checker.getSymbolAtLocation(binding.name);
        const visit = (node: ts.Node) => {
          if (node === statement) return;
          if (ts.isIdentifier(node)) {
            const referenced = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
            if (referenced === symbol) {
              const owner = ownerFunction(node);
              if (!owner || !owner.name || !/^(?:[A-Z]|use[A-Z])/.test(owner.name.text)) return fail(`State ${binding.name.text} is used outside a named component/hook in ${ctx.inside(file.fileName).relative}. Move that use under the selected provider first.`);
              const bindings = consumers.get(owner) ?? new Map<string, string>();
              bindings.set(binding.name.text, exportedName); consumers.set(owner, bindings); needsHook = true;
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
      }
      edit(file, statement.getStart(file), statement.getWidth(file), typeBindings.length ? `import { ${typeBindings.join(", ")} } from ${JSON.stringify(modulePath(ctx.inside(file.fileName).relative, action.to))};` : "");
    }
    if (needsHook) {
      if (hasName(file, action.hook)) return fail(`Hook ${action.hook} already occurs in ${ctx.inside(file.fileName).relative}. Choose another hook name.`);
      edit(file, 0, 0, `import { ${action.hook} } from ${JSON.stringify(modulePath(ctx.inside(file.fileName).relative, action.to))};\n`);
    }
  }
  // Check direct component/hook edges for provider coverage and outside callers.
  const calls = new Map<ts.FunctionDeclaration, Set<ts.FunctionDeclaration>>();
  const outside = new Set<ts.FunctionDeclaration>();
  for (const file of ctx.files) {
    if (file === source) continue;
    const visit = (node: ts.Node) => {
      const expression = ts.isCallExpression(node) ? node.expression : ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node.tagName : undefined;
      if (expression) {
        const callee = unalias(checker.getSymbolAtLocation(expression))?.declarations?.find(ts.isFunctionDeclaration);
        if (callee) {
          const caller = ownerFunction(node);
          if (caller) { const edges = calls.get(caller) ?? new Set(); edges.add(callee); calls.set(caller, edges); }
          else outside.add(callee);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const reachable = new Set<ts.FunctionDeclaration>();
  const walk = (fn: ts.FunctionDeclaration) => { if (reachable.has(fn)) return; reachable.add(fn); for (const callee of calls.get(fn) ?? []) walk(callee); };
  walk(root);
  for (const owner of consumers.keys()) if (!reachable.has(owner)) return fail(`Consumer ${owner.name!.text} is not statically reachable below ${root.name.text}. Select a common provider root.`);
  const ownedPath = new Set(consumers.keys());
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const [caller, children] of calls) if (reachable.has(caller) && !ownedPath.has(caller) && [...children].some((callee) => ownedPath.has(callee))) { ownedPath.add(caller); expanded = true; }
  }
  for (const fn of ownedPath) {
    if (fn === root) continue;
    if (outside.has(fn) || [...calls].some(([caller, children]) => !reachable.has(caller) && children.has(fn))) return fail(`${fn.name?.text} also has callers outside the selected provider root.`);
  }
  const owned = new Set([...ownedPath].filter((fn) => fn !== root).map((fn) => checker.getSymbolAtLocation(fn.name!)));
  for (const file of ctx.files) {
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isIdentifier(node) && owned.has(unalias(checker.getSymbolAtLocation(node)))) {
        const parent = node.parent;
        const isDeclaration = ts.isFunctionDeclaration(parent) && parent.name === node;
        const isDirectCall = ts.isCallExpression(parent) && parent.expression === node;
        const isTag = (ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === node;
        if (!isDeclaration && !isDirectCall && !isTag) return fail(`Consumer ${node.text} escapes as a callback or value. Provider coverage requires direct component/hook calls.`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  if (calls.get(root)?.has(root)) return fail("A recursive provider root needs an explicit ownership strategy.");
  for (const [owner, bindings] of consumers) {
    if (owner === root) continue;
    edit(owner.getSourceFile(), owner.body!.getStart() + 1, 0, `\n  const { ${[...bindings].map(([local, exportedName]) => local === exportedName ? local : `${exportedName}: ${local}`).join(", ")} } = ${action.hook}();\n`);
  }
  const contentName = `${root.name.text}Content`;
  if (hasName(rootTarget.source, contentName) || hasName(rootTarget.source, action.provider)) return fail("The provider or generated content-component name collides in the root module.");
  const bindings = consumers.get(root);
  const inject = bindings ? `\n  const { ${[...bindings].map(([local, exportedName]) => local === exportedName ? local : `${exportedName}: ${local}`).join(", ")} } = ${action.hook}();\n` : "";
  const parameters = root.parameters.map((p) => p.getText()).join(", ");
  const returnType = root.type ? `: ${root.type.getText()}` : "";
  const modifiers = root.modifiers?.map((m) => m.getText()).join(" ") ?? "";
  const props = root.parameters[0]?.name.getText();
  const replacement = `function ${contentName}(${parameters})${returnType} {${inject}${root.body.getText().slice(1)}\n\n${modifiers} function ${root.name.text}(${parameters})${returnType} {\n  return <${action.provider}><${contentName}${props ? ` {...${props}}` : ""} /></${action.provider}>;\n}`;
  edit(rootTarget.source, root.getStart(), root.getWidth(), replacement);
  edit(rootTarget.source, 0, 0, `import { ${action.provider} } from ${JSON.stringify(modulePath(action.owner.file, action.to))};\n`);
  const destination = `${imports.join("\n")}\nimport { createContext as srclyCreateContext, useContext as srclyUseContext, type ParentProps as SrclyParentProps } from "solid-js";\n${types.join("\n")}\nfunction createSrclyState() {\n${setup.join("\n")}\n  return { ${values.join(", ")} };\n}\n\nconst SrclyStateContext = srclyCreateContext<ReturnType<typeof createSrclyState>>();\n\nexport function ${action.provider}(props: SrclyParentProps) {\n  const value = createSrclyState();\n  return <SrclyStateContext.Provider value={value}>{props.children}</SrclyStateContext.Provider>;\n}\n\nexport function ${action.hook}() {\n  const value = srclyUseContext(SrclyStateContext);\n  if (value === undefined) throw new Error(${JSON.stringify(`${action.hook} requires ${action.provider}`)});\n  return value;\n}\n`;
  return { ownership: { provider: action.provider, hook: action.hook, root: action.owner, consumers: [...consumers.keys()].map((fn) => ({ file: ctx.inside(fn.getSourceFile().fileName).relative, name: fn.name!.text })), values, scope: "One state instance per provider; setup, effects and cleanup run under that provider's owner." }, changes: [
    ...ctx.changes([...edits].map(([fileName, textChanges]) => ({ fileName, textChanges }))),
    { path: action.file, before: source.text, after: "// State now belongs to the provider. Consumers use its hook.\nexport {};\n" },
    { path: action.to, before: null, after: destination },
  ] };
}
