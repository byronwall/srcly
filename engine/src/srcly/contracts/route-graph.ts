import { z } from "zod";
import {
  evidenceProofSchema,
  evidenceStatusSchema,
  originRoleSchema,
  sourceLocationSchema,
} from "../../api/route-totality-contract-primitives";
import { generationFields, outcomeSchema } from "./primitives";

/**
 * A route's render backbone in srcly's graph vocabulary: the route component,
 * the component occurrences under it, framework boundaries (Show, For, …),
 * render terminals, and the origins a reader can pick. It is reach, not
 * order: nothing here is a step of a value's history.
 */
export const flowNodeKindSchema = z.enum(["route", "occurrence", "control", "origin", "field", "terminal", "frontier"]);

export const flowNodeSchema = z.strictObject({
  id: z.string(),
  kind: flowNodeKindSchema,
  label: z.string(),
  /** A short second line: the component a route renders, a boundary's kind and condition, a terminal's kind. */
  detail: z.string().nullable(),
  /** The node that owns it in the render hierarchy; null only for the route. */
  parent: z.string().nullable(),
  /** Relative to the engine root. */
  file: z.string(),
  absPath: z.string(),
  line: z.number().int().positive(),
  span: sourceLocationSchema.shape.span,
  status: evidenceStatusSchema,
  /** External or hidden-wrapper components: drawn rolled into their parent until opened. */
  collapsedByDefault: z.boolean(),
  repetition: z.enum(["single", "conditional", "collection", "unknown"]).nullable(),
  external: z.boolean(),
  /** Why a frontier stops: the engine's typed frontier or gap reason. */
  reason: z.string().nullable(),
});

export const flowEdgeSchema = z.strictObject({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  /** render: the hierarchy draws it; handoff: an origin proven to reach a render site; field: one field's proven path. */
  kind: z.enum(["render", "handoff", "field"]),
  /** A field edge's field path (`projects[*].name`); null for render and handoff edges. */
  label: z.string().nullable(),
  status: evidenceStatusSchema,
  proof: z.array(evidenceProofSchema),
  pathIds: z.strictObject({ elements: z.array(z.string()), relations: z.array(z.string()) }).nullable(),
});

export const routeGraphResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  route: z.strictObject({ key: z.string(), pathPattern: z.string(), file: z.string(), absPath: z.string() }),
  /** The engine's route totality status. */
  status: z.enum(["complete", "partial", "unavailable"]),
  /** Why the route has no backbone, when status is unavailable. */
  unavailableReason: z.string().nullable(),
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
  origins: z.array(z.strictObject({
    nodeId: z.string(),
    elementId: z.string(),
    roles: z.array(originRoleSchema),
    label: z.string(),
    status: evidenceStatusSchema,
  })),
  /** The origin node whose proven destinations this graph carries (`source` param). */
  selectedSource: z.string().nullable(),
  /**
   * Exact field lineage for the selected origin: complete, partial (some
   * fields stop at frontiers) or unavailable with the engine's reason (it
   * needs a filesystem origin). Null when no origin is selected.
   */
  lineage: z.strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    unavailableReason: z.string().nullable(),
    fields: z.number().int().nonnegative(),
    frontiers: z.number().int().nonnegative(),
  }).nullable(),
  /** Nodes the selected origin is proven to reach: field-edge and handoff targets. Empty without a selection. */
  destinations: z.array(z.string()),
  counts: z.strictObject({
    occurrences: z.number().int().nonnegative(),
    boundaries: z.number().int().nonnegative(),
    terminals: z.number().int().nonnegative(),
    origins: z.number().int().nonnegative(),
    handoffs: z.number().int().nonnegative(),
    /** Items the engine named but did not emit (budget, recursion, unsupported syntax). */
    omittedItems: z.number().int().nonnegative(),
  }),
  gaps: z.array(z.strictObject({ reason: z.string(), label: z.string(), location: sourceLocationSchema.nullable() })),
});

export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
export type RouteGraphResult = z.infer<typeof routeGraphResultSchema>;
