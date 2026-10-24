import path from "node:path";
import { routesResultSchema, type RoutesResult } from "../contracts/routes";
import { checkGeneration, type EngineSession } from "../session";

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
    ? tier1.routes.map((route) => ({ key: route.key, pathPattern: route.pathPattern, file: route.file, parameters: route.parameters }))
    : tier1.routes;
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
      }))
      .sort((left, right) => left.pathPattern.localeCompare(right.pathPattern)),
  });
}
