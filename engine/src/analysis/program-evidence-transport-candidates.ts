import * as TypeScript from "typescript";

/** AST-only superset of statements that can participate in HTTP transport proof. */
export function transportCandidates(
  ts: typeof TypeScript,
  sourceFiles: readonly TypeScript.SourceFile[],
): readonly TypeScript.Node[] {
  const resourceNames = new Set(["createResource"]);
  const resourceNamespaces = new Set<string>();
  const handlerNames = new Set<string>();
  const aliases = new Map<string, Set<string>>();

  const addAlias = (left: string, right: string) => {
    if (!left || !right || left === right) return;
    const leftAliases = aliases.get(left) ?? new Set<string>();
    const rightAliases = aliases.get(right) ?? new Set<string>();
    leftAliases.add(right);
    rightAliases.add(left);
    aliases.set(left, leftAliases);
    aliases.set(right, rightAliases);
  };

  const visitNames = (node: TypeScript.Node) => {
    if (ts.isFunctionLike(node)) {
      const name = "name" in node && node.name ? node.name : undefined;
      if (name && ts.isIdentifier(name) && /^[A-Z]+$/.test(name.text)) handlerNames.add(name.text);
    }
    if (ts.isImportSpecifier(node)) addAlias(node.propertyName?.text ?? node.name.text, node.name.text);
    if (ts.isExportSpecifier(node)) addAlias(node.propertyName?.text ?? node.name.text, node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrap(ts, node.initializer);
      if (ts.isIdentifier(initializer)) addAlias(node.name.text, initializer.text);
      if (ts.isPropertyAccessExpression(initializer)) addAlias(node.name.text, initializer.name.text);
    }
    ts.forEachChild(node, visitNames);
  };

  for (const file of sourceFiles) {
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "solid-js") continue;
      const clause = statement.importClause;
      if (clause?.name) resourceNamespaces.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        resourceNamespaces.add(clause.namedBindings.name.text);
      } else if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const specifier of clause.namedBindings.elements) {
          if ((specifier.propertyName?.text ?? specifier.name.text) === "createResource") resourceNames.add(specifier.name.text);
        }
      }
    }
    visitNames(file);
  }

  const handlerNamesAndAliases = new Set(handlerNames);
  const pendingNames = [...handlerNames];
  while (pendingNames.length) {
    for (const alias of aliases.get(pendingNames.pop()!) ?? []) {
      if (handlerNamesAndAliases.has(alias)) continue;
      handlerNamesAndAliases.add(alias);
      pendingNames.push(alias);
    }
  }

  const candidates = new Set<TypeScript.Node>();
  const add = (node: TypeScript.Node) => {
    let statement = node;
    while (statement.parent && !ts.isSourceFile(statement.parent)) statement = statement.parent;
    candidates.add(statement);
  };
  const isResourceCallee = (node: TypeScript.Expression): boolean => {
    if (ts.isIdentifier(node)) return resourceNames.has(node.text);
    return ts.isPropertyAccessExpression(node)
      && node.name.text === "createResource"
      && ts.isIdentifier(node.expression)
      && resourceNamespaces.has(node.expression.text);
  };

  for (const file of sourceFiles) {
    const visit = (node: TypeScript.Node) => {
      if (ts.isFunctionLike(node)) {
        const name = "name" in node && node.name ? node.name : undefined;
        if (name && ts.isIdentifier(name) && /^[A-Z]+$/.test(name.text)) add(node);
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
        if (name === "fetch" || name === "json" || name === "end" || handlerNamesAndAliases.has(name) || isResourceCallee(callee)) add(node);
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Response") add(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  return [...candidates].sort((left, right) =>
    left.getSourceFile().fileName.localeCompare(right.getSourceFile().fileName) || left.pos - right.pos,
  );
}

function unwrap(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Expression {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) return unwrap(ts, expression.expression);
  return expression;
}
