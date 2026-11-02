import { z } from "zod";

/** The query outcome, one per reply (plan section 3.4). */
export const outcomeSchema = z.enum(["ok", "assumed", "partial", "not-analyzed", "unsupported", "stale", "cancelled", "budget"]);

/** Every tier-1 result names the Program it was computed from. */
export const generationFields = {
  generation: z.number().int().positive(),
  programHash: z.string(),
  /** The config the Program was read with; empty for a project with no config. */
  tsconfig: z.string(),
  typescript: z.string(),
  /** Whether a type can prove a value is never null. False with `strictNullChecks` off or no config: the trace still holds, but `string` may be undefined. */
  nullProof: z.boolean(),
};

export const progressSchema = z.strictObject({
  phase: z.enum(["queued", "program", "identity", "trace", "summarize", "routes", "project"]),
  message: z.string(),
  completed: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
});
