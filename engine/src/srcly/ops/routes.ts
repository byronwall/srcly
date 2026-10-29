import path from "node:path";
import type * as TypeScript from "typescript";
import { routesResultSchema, type RoutesResult } from "../contracts/routes";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";

/**
 * The component a page route renders: its file's default export, by name and
 * the line its declaration names it on (`const DocView = () => …` then
 * `export default DocView`, or `export default function Page()`).
 */
function routeComponent(tier1: Tier1, file: string): { name: string; line: number } | null {
  if (tier1.language !== "typescript") return null;
  const { ts } = tier1;
  const source = tier1.program.getSourceFile(path.resolve(tier1.root, file));
  if (!source) return null;
  const lineOf = (node: TypeScript.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.modifiers?.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword)) return { name: statement.name.text, line: lineOf(statement.name) };
    if (!ts.isExportAssignment(statement) || statement.isExportEquals || !ts.isIdentifier(statement.expression)) continue;
    const name = statement.expression.text;
    for (const other of source.statements) {
      if (ts.isFunctionDeclaration(other) && other.name?.text === name) return { name, line: lineOf(other.name) };
      if (!ts.isVariableStatement(other)) continue;
      const declaration = other.declarationList.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === name);
      if (declaration) return { name, line: lineOf(declaration.name) };
    }
  }
  return null;
}

/**
 * The routes discovery found: TypeScript's from `discoverRoute`, Python's
 * from the helper's FastAPI / Flask handlers. This must not call
 * `buildRouteDataInventory`: that builds an exhaustive path graph per route
 * and costs seconds on a real app.
 */
export function routesOp(session: EngineSession, params: { expectedGeneration?: unknown }): RoutesResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const routes = tier1.language === "python"
    ? tier1.routes.map((route) => ({ key: route.key, pathPattern: route.pathPattern, file: route.file, parameters: route.parameters, handler: { name: route.handler.name, line: route.handler.line }, component: null }))
    : tier1.routes.map((route) => ({ ...route, handler: null, component: routeComponent(tier1, route.file) }));
  return routesResultSchema.parse({
    outcome: "ok",
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    routes: routes
      .map((route) => ({
        key: route.key,
        pathPattern: route.pathPattern,
        file: route.file,
        absPath: path.resolve(tier1.root, route.file),
        parameters: route.parameters.map((parameter) => ({ name: parameter.name, kind: parameter.kind })),
        handler: route.handler,
        component: route.component,
      }))
      .sort((left, right) => left.pathPattern.localeCompare(right.pathPattern)),
  });
}
