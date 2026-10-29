import { z } from "zod";
import {
  evidenceProofSchema,
  evidenceStatusSchema,
  originRoleSchema,
  sourceLocationSchema,
} from "../../api/route-totality-contract-primitives";
import { generationFields, outcomeSchema } from "./primitives";

/**
 * A value's neighbourhood from any expression, not from a route: the
 * engine's bounded evidence slice walked backward (where the value comes
 * from), forward (where it goes) or both, projected into boxes grouped by
 * the function that owns them. Like the route graph it is reach, not order.
 */
export const anchorDirectionSchema = z.enum(["forward", "backward", "both"]);

export const anchorNodeKindSchema = z.enum([
  /** The selected expression. */
  "anchor",
  /** A function (or module) that owns boxes: drawn as a frame, never as a step. */
  "scope",
  /** A plain carrier: a variable, alias, parameter, field read or call result. */
  "value",
  /** A reshaping step: map, filter, find, pack, parse, select, a call with one call site. */
  "transform",
  /** A branch or narrowing: Show, a ternary, a type guard. */
  "control",
  /** Where the value enters the program. */
  "origin",
  /** Where the value leaves: a render slot, a DOM attribute, a side effect, a return. */
  "terminal",
  /** Where the proof cannot follow: external code, or a callee with many call sites. */
  "boundary",
  /** A gap the engine reported: unsupported syntax, dynamic dispatch, a budget. */
  "frontier",
]);

export const anchorNodeSchema = z.strictObject({
  id: z.string(),
  kind: anchorNodeKindSchema,
  label: z.string(),
  /** A short second line: the element's kind in words, a scope's file. */
  detail: z.string().nullable(),
  /** The scope that owns it; null for a scope. */
  parent: z.string().nullable(),
  /** Relative to the engine root. */
  file: z.string(),
  absPath: z.string(),
  line: z.number().int().positive(),
  span: sourceLocationSchema.shape.span,
  status: evidenceStatusSchema,
  /** Which side of the anchor it sits on: `up` is where the value comes from, `down` where it goes. */
  side: z.enum(["seed", "up", "down", "both"]),
  /** The engine's element kind (`field-read`, `call-result`, …); null for a scope, and for a frontier other than a dead end, which names the kind of element nothing continues from. */
  elementKind: z.string().nullable(),
  /** The checked TypeScript type at the element, when it has one. */
  typeText: z.string().nullable(),
  /** Why a boundary or frontier stops: `unproven-handoff`, `external-code`, `budget-exhausted`, …. */
  reason: z.string().nullable(),
  /**
   * The local binding this box reads, by the checker's symbol (`doc@src/x.tsx:120`): a variable,
   * parameter or destructured name, read as is (`doc`), called as an accessor (`doc()`) or through
   * fields (`doc().title`). Boxes of one symbol in one frame are one value; null for anything else.
   */
  symbol: z.string().nullable(),
  /** The field path read from `symbol` (`title`, `note.tags`); null for the binding itself. */
  field: z.string().nullable(),
  /** A boundary's or frontier's words: which call sites, what the gap was. */
  note: z.string().nullable(),
});

/**
 * An edge's status: the engine's proof status, or `structural` for a link the
 * projection found by syntax (a declaration's own parameter or return) with
 * nothing traced along it. A structural edge never counts as proven reach.
 */
export const anchorEdgeStatusSchema = evidenceStatusSchema.or(z.literal("structural"));

export const anchorEdgeSchema = z.strictObject({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  /** The engine's relation kind (`field-input`, `argument`, `render-terminal`, …), or `parameter` / `returns` / `used-by` / `prop-read` for a declaration anchor's own links. */
  kind: z.string(),
  status: anchorEdgeStatusSchema,
  proof: z.array(evidenceProofSchema),
  /** A field read's or pack's field name, when the relation carries one. */
  label: z.string().nullable(),
});

export const anchorGraphResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  /** Why there is no slice, when outcome is unsupported. */
  reason: z.string().nullable(),
  anchor: z.strictObject({
    file: z.string(),
    absPath: z.string(),
    span: sourceLocationSchema.shape.span,
    text: z.string(),
    /** The TypeScript syntax kind of the selected expression. */
    kind: z.string(),
    /** The evidence element the slice starts from; null when the engine has none at this expression. */
    elementId: z.string().nullable(),
    typeText: z.string().nullable(),
  }),
  direction: anchorDirectionSchema,
  nodes: z.array(anchorNodeSchema),
  edges: z.array(anchorEdgeSchema),
  origins: z.array(z.strictObject({ nodeId: z.string(), label: z.string(), roles: z.array(originRoleSchema), status: evidenceStatusSchema })),
  terminals: z.array(z.strictObject({ nodeId: z.string(), label: z.string(), roles: z.array(z.string()), status: evidenceStatusSchema })),
  counts: z.strictObject({
    up: z.number().int().nonnegative(),
    down: z.number().int().nonnegative(),
    scopes: z.number().int().nonnegative(),
    origins: z.number().int().nonnegative(),
    terminals: z.number().int().nonnegative(),
    boundaries: z.number().int().nonnegative(),
    frontiers: z.number().int().nonnegative(),
  }),
  coverage: z.strictObject({
    elements: z.number().int().nonnegative(),
    relations: z.number().int().nonnegative(),
    budget: z.strictObject({ limit: z.number().int().nonnegative(), used: z.number().int().nonnegative(), exhausted: z.boolean() }),
  }),
});

export type AnchorDirection = z.infer<typeof anchorDirectionSchema>;
export type AnchorNode = z.infer<typeof anchorNodeSchema>;
export type AnchorEdge = z.infer<typeof anchorEdgeSchema>;
export type AnchorEdgeStatus = z.infer<typeof anchorEdgeStatusSchema>;
export type AnchorGraphResult = z.infer<typeof anchorGraphResultSchema>;
