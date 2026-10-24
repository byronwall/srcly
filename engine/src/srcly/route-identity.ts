import type * as TypeScript from "typescript";
import type { RouteRecord } from "../analysis/route-data";

/**
 * Route discovery records `export default Page;` at the span of the `Page`
 * identifier, while the Solid route scope adapter records the component at
 * its declaration (`const Page = () => …`). Route totality matches the two by
 * span, so a route written that way never gets a totality record.
 *
 * This aligns the route's evidence span to the declaration the identifier
 * resolves to, through the checker. It is composition in the session, not a
 * change to the analysis: when the export is anything other than a plain
 * identifier bound in the same file to a function, the record is unchanged.
 */
export function alignDefaultExportEvidence(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  sourceFile: TypeScript.SourceFile,
  route: RouteRecord,
): RouteRecord {
  if (!route.evidence) return route;
  const assignment = sourceFile.statements.find(
    (statement): statement is TypeScript.ExportAssignment => ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (!assignment || !ts.isIdentifier(assignment.expression)) return route;
  const symbol = checker.getSymbolAtLocation(assignment.expression);
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (!declaration || declaration.getSourceFile() !== sourceFile) return route;
  let target: TypeScript.Node | null = null;
  if (ts.isFunctionDeclaration(declaration)) target = declaration;
  else if (ts.isVariableDeclaration(declaration) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
    target = declaration.initializer;
  }
  if (!target) return route;
  const start = sourceFile.getLineAndCharacterOfPosition(target.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(target.getEnd());
  return {
    ...route,
    evidence: {
      ...route.evidence,
      line: start.line + 1,
      column: start.character + 1,
      span: { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 },
    },
  };
}
