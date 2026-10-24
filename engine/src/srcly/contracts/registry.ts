import type { z } from "zod";
import { helloResultSchema } from "./hello";
import { routeGraphResultSchema } from "./route-graph";
import { routesResultSchema } from "./routes";
import { statusResultSchema } from "./status";

/**
 * Every op result the server and client read, by op name. `pnpm
 * emit-contracts` turns each into a JSON Schema for Python and a TypeScript
 * type for the client; `test/srcly/contracts-current.test.ts` keeps them current.
 */
export const CONTRACTS: { op: string; typeName: string; schema: z.ZodType }[] = [
  { op: "hello", typeName: "HelloResult", schema: helloResultSchema },
  { op: "status", typeName: "StatusResult", schema: statusResultSchema },
  { op: "routes", typeName: "RoutesResult", schema: routesResultSchema },
  { op: "routeGraph", typeName: "RouteGraphResult", schema: routeGraphResultSchema },
];
