import type { z } from "zod";
import { anchorGraphResultSchema } from "./anchor-graph";
import { functionEffectsResultSchema } from "./function-effects";
import { helloResultSchema } from "./hello";
import { routeGraphResultSchema } from "./route-graph";
import { routesResultSchema } from "./routes";
import { selectExpressionResultSchema, valueFlowResultSchema } from "./value-flow";
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
  { op: "selectExpression", typeName: "SelectExpressionResult", schema: selectExpressionResultSchema },
  { op: "valueFlow", typeName: "ValueFlowResult", schema: valueFlowResultSchema },
  { op: "anchorGraph", typeName: "AnchorGraphResult", schema: anchorGraphResultSchema },
  { op: "functionEffects", typeName: "FunctionEffectsResult", schema: functionEffectsResultSchema },
];
