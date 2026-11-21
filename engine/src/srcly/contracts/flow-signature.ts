import { z } from "zod";
import { generationFields, outcomeSchema } from "./primitives";

/**
 * A file's functions, each reduced to what a review compares between two
 * refs: where its values come from, where they end, which origin reaches
 * which end, what it reads from its parameters, what it touches, and where
 * the proof stops. Every `key` is made of kinds, names and field paths, never
 * of a line or of an expression's own text, so a function that only moved,
 * or whose local was renamed, has the same keys. Lines are for display.
 */
export const flowItemSchema = z.strictObject({
  /** `${kind}:${label}`: what the two sides are matched by. */
  key: z.string(),
  /**
   * An origin's or end's class (`environment`, `request`, `network`, `file`, `database`, `stdout`,
   * `render`, `effect`, `parameter`, …), an effect's family and kind (`write/module-write`), a stop's reason.
   */
  kind: z.string(),
  /** A callee (`fetch`, `db.note.update`), a field path (`request.body.title`) or a name; no arguments, no locals. */
  label: z.string(),
  /** Relative to the engine root. */
  file: z.string(),
  line: z.number().int().positive(),
  /** The engine's word for the fact or the trace it comes from: `proven`, `assumed`, `partial`, or a trace outcome. */
  status: z.string(),
});

export const flowPairSchema = z.strictObject({
  /** `${origin.key} -> ${end.key}`. */
  key: z.string(),
  origin: flowItemSchema,
  end: flowItemSchema,
  /** The outcome of the backward trace from the end that found the origin: only `ok` is proven. */
  status: outcomeSchema,
});

export const flowScopeSchema = z.strictObject({
  /** The function's name; a second function of the same name in the file is `name#2`. */
  name: z.string(),
  role: z.string().nullable(),
  line: z.number().int().positive(),
  endLine: z.number().int().positive(),
  /** The outcome of the declaration's own trace, both ways; `not-analyzed` when the engine has no anchor at its name. */
  status: outcomeSchema,
  reason: z.string().nullable(),
  /** Where values enter inside the function: environment, network, file and database reads. */
  origins: z.array(flowItemSchema),
  /** Where values leave: the function's own effects and render slots, then what its result reaches elsewhere. */
  ends: z.array(flowItemSchema),
  pairs: z.array(flowPairSchema),
  /** The field paths read from its parameters; null where the language records no bindings (Python): not measured. */
  reads: z.array(flowItemSchema).nullable(),
  /** `functionEffects` facts, promise handling aside; null for Python: not measured. */
  effects: z.array(flowItemSchema).nullable(),
  /** Where the proof cannot follow: frontiers and boundaries of the declaration's trace, and unresolved callees. */
  stops: z.array(flowItemSchema),
  /** Ends past the per-function cap, which no backward trace was run from. */
  untracedEnds: z.number().int().nonnegative(),
});

export const flowSignatureResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  reason: z.string().nullable(),
  /** Relative to the engine root. */
  file: z.string(),
  language: z.enum(["typescript", "python"]),
  scopes: z.array(flowScopeSchema),
  /** Functions in the asked lines past the per-file cap: not measured. */
  skippedScopes: z.number().int().nonnegative(),
});

export type FlowItem = z.infer<typeof flowItemSchema>;
export type FlowPair = z.infer<typeof flowPairSchema>;
export type FlowScope = z.infer<typeof flowScopeSchema>;
export type FlowSignatureResult = z.infer<typeof flowSignatureResultSchema>;
