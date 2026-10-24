import { z } from "zod";
import { generationFields, outcomeSchema } from "./primitives";

export const routeSummarySchema = z.strictObject({
  key: z.string(),
  pathPattern: z.string(),
  /** Relative to the engine root. */
  file: z.string(),
  absPath: z.string(),
  parameters: z.array(z.strictObject({ name: z.string(), kind: z.enum(["dynamic", "catch-all"]) })),
});

export const routesResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  routes: z.array(routeSummarySchema),
});

export type RoutesResult = z.infer<typeof routesResultSchema>;
