import { z } from "zod";
import { generationFields, outcomeSchema } from "./primitives";

export const routeSummarySchema = z.strictObject({
  key: z.string(),
  pathPattern: z.string(),
  /** Relative to the engine root. */
  file: z.string(),
  absPath: z.string(),
  parameters: z.array(z.strictObject({ name: z.string(), kind: z.enum(["dynamic", "catch-all"]) })),
  /**
   * The function that handles the route, when the route is a handler rather
   * than a rendered page (FastAPI, Flask). Such a route has no render backbone;
   * the client opens its handler in anchor mode by name and line instead.
   */
  handler: z.strictObject({ name: z.string(), line: z.number().int().positive() }).nullable(),
});

export const routesResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  routes: z.array(routeSummarySchema),
});

export type RoutesResult = z.infer<typeof routesResultSchema>;
