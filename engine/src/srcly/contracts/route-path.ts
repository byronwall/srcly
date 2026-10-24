import { z } from "zod";
import { evidenceProofSchema, evidenceStatusSchema } from "../../api/route-totality-contract-primitives";
import { generationFields, outcomeSchema } from "./primitives";
import { ledgerRowSchema } from "./value-flow";

/**
 * One lit edge of a route graph, explained in order (M4, T16): the steps of
 * the field attachment, frontier or handoff behind it, as ledger rows from
 * the origin to where the edge ends. Steps come only from the engine's own
 * path ids; a missing edge is `not-found`, never a guessed path.
 */
export const routePathResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  reason: z.string().nullable(),
  route: z.strictObject({ key: z.string(), pathPattern: z.string() }),
  /** The edge as the route graph drew it. */
  edge: z.strictObject({
    id: z.string(),
    kind: z.enum(["field", "handoff"]),
    label: z.string().nullable(),
    status: evidenceStatusSchema,
    source: z.string(),
    target: z.string(),
  }),
  rows: z.array(ledgerRowSchema),
  /** The engine's proof for the edge as a whole. */
  proof: z.array(evidenceProofSchema),
  /** Where the lineage stops, when the edge ends at a frontier. */
  frontier: z.strictObject({ reason: z.string(), label: z.string() }).nullable(),
});

export type RoutePathResult = z.infer<typeof routePathResultSchema>;
