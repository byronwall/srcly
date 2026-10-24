import { z } from "zod";
import { progressSchema } from "./primitives";

export const statusResultSchema = z.strictObject({
  protocol: z.number().int(),
  /** Tier 1 (Program, identity index, routes) has been built. */
  built: z.boolean(),
  generation: z.number().int().positive().nullable(),
  /** The hash tier 1 was built from. */
  programHash: z.string().nullable(),
  /** The hash recomputed now with one `stat` per file; differs from programHash when source changed. */
  currentHash: z.string().nullable(),
  stale: z.boolean(),
  rssBytes: z.number().int().nonnegative(),
  /** The latest progress frame of the running request, if any. */
  progress: progressSchema.nullable(),
});

export type StatusResult = z.infer<typeof statusResultSchema>;
