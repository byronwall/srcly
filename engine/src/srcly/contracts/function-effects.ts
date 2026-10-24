import { z } from "zod";
import { sourceLocationSchema } from "../../api/route-totality-contract-primitives";
import { generationFields, outcomeSchema } from "./primitives";

/**
 * What one function touches (M6): its known effects as facts, each with a
 * witness, and the places the analysis could not follow as frontiers. Known
 * and partial sit together; there is no score.
 */
export const effectFamilySchema = z.enum([
  /** Behaviour that leaves the program: network, filesystem, host output, exit, a library call. */
  "external",
  /** Reads of what the function did not receive: module-level state, environment, time, randomness. */
  "input",
  /** Mutation of something that outlives the call: a parameter, `this`, module-level state. */
  "write",
  /** A `throw`. */
  "throw",
  /** Work scheduled for later: a timer, a promise executor. */
  "timer",
  /** An `await`, or a promise created or handled. */
  "promise",
]);

/**
 * When the effect runs relative to the call: `direct` on the call, `after-await`
 * once the function has yielded, `timer` from a scheduled callback, `latent`
 * inside a function the callable returns or hands out, which may never run.
 */
export const effectActivationSchema = z.enum(["direct", "after-await", "timer", "latent"]);

export const effectWitnessSchema = z.strictObject({
  file: z.string(),
  absPath: z.string(),
  line: z.number().int().positive(),
  span: sourceLocationSchema.shape.span,
  /** The source text at the witness, clipped. */
  text: z.string(),
});

/** One step of the call chain from the selected function to where a fact was found. */
export const effectViaSchema = z.strictObject({
  callable: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
});

export const effectFactSchema = z.strictObject({
  id: z.string(),
  family: effectFamilySchema,
  /** `network-request`, `filesystem-write`, `stdout`, `exit-status`, `external-call`, `module-read`, `parameter-write`, `throw`, `timer`, `promise-executor`, `await`, …. */
  kind: z.string(),
  label: z.string(),
  detail: z.string(),
  /** proven: the callee identity is compiler-resolved; partial: named by syntax only. */
  status: z.enum(["proven", "partial"]),
  activation: effectActivationSchema,
  /** The callables between the selected function and the witness; empty for a direct fact. */
  via: z.array(effectViaSchema),
  witness: effectWitnessSchema,
});

export const effectFrontierSchema = z.strictObject({
  id: z.string(),
  /** `unresolved-callee`, `callback-parameter`, `dynamic-dispatch`, `external-library`, `recursion`, `budget`. */
  reason: z.string(),
  label: z.string(),
  detail: z.string(),
  via: z.array(effectViaSchema),
  witness: effectWitnessSchema,
});

/** How a call that yields a promise is handled where it is made. */
export const resultHandlingSchema = z.strictObject({
  callee: z.string(),
  handling: z.enum(["awaited", "returned", "assigned", "passed", "discarded"]),
  witness: effectWitnessSchema,
});

export const functionEffectsResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  reason: z.string().nullable(),
  callable: z.strictObject({
    name: z.string(),
    kind: z.enum(["function", "arrow", "method", "getter", "setter", "constructor"]),
    async: z.boolean(),
    file: z.string(),
    absPath: z.string(),
    line: z.number().int().positive(),
    span: sourceLocationSchema.shape.span,
  }),
  facts: z.array(effectFactSchema),
  frontiers: z.array(effectFrontierSchema),
  resultHandling: z.array(resultHandlingSchema),
  /** complete-for-supported-scope: no frontier; partial: at least one; not-analyzed: no callable at the position. */
  coverage: z.enum(["complete-for-supported-scope", "partial", "not-analyzed"]),
  counts: z.strictObject({
    facts: z.number().int().nonnegative(),
    frontiers: z.number().int().nonnegative(),
    callables: z.number().int().nonnegative(),
  }),
  /** What the analysis takes as given, always shown beside the facts. */
  assumptions: z.array(z.string()),
});

export type EffectFact = z.infer<typeof effectFactSchema>;
export type EffectFrontier = z.infer<typeof effectFrontierSchema>;
export type EffectWitness = z.infer<typeof effectWitnessSchema>;
export type EffectVia = z.infer<typeof effectViaSchema>;
export type ResultHandling = z.infer<typeof resultHandlingSchema>;
export type FunctionEffectsResult = z.infer<typeof functionEffectsResultSchema>;
