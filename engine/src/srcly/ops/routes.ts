import path from "node:path";
import { routesResultSchema, type RoutesResult } from "../contracts/routes";
import { checkGeneration, type EngineSession } from "../session";

/**
 * The routes discovery found, straight from `discoverRoute`. This must not
 * call `buildRouteDataInventory`: that builds an exhaustive path graph per
 * route and costs seconds on a real app.
 */
export function routesOp(session: EngineSession, params: { expectedGeneration?: unknown }): RoutesResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const root = path.resolve(tier1.args.root);
  return routesResultSchema.parse({
    outcome: "ok",
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    routes: tier1.routes
      .map((route) => ({
        key: route.key,
        pathPattern: route.pathPattern,
        file: route.file,
        absPath: path.resolve(root, route.file),
        parameters: route.parameters.map((parameter) => ({ name: parameter.name, kind: parameter.kind })),
      }))
      .sort((left, right) => left.pathPattern.localeCompare(right.pathPattern)),
  });
}
