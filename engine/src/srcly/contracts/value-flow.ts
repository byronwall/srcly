import { z } from "zod";
import { evidenceProofSchema, evidenceStatusSchema } from "../../api/route-totality-contract-primitives";
import { generationFields, outcomeSchema } from "./primitives";

const spanSchema = z.strictObject({
  startLine: z.number().int().positive(),
  startColumn: z.number().int().positive(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().positive(),
});

export const selectExpressionResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  file: z.string(),
  /** Why nothing was selectable, when outcome is unsupported. */
  reason: z.string().nullable(),
  /** Supported expressions at the span, innermost first. */
  candidates: z.array(z.strictObject({
    kind: z.string(),
    text: z.string(),
    span: spanSchema,
    /** The engine has an evidence element at exactly this span. */
    evidence: z.boolean(),
  })),
});

/**
 * One step of a value's history, in operation order. Value properties stay
 * separate from connectivity: a fallback row says what `??` keeps, an
 * assertion row says it is not a check.
 */
export const ledgerRowSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(["input", "transfer", "fallback", "branch", "transform", "terminal", "boundary"]),
  label: z.string(),
  file: z.string(),
  absPath: z.string(),
  line: z.number().int().positive(),
  span: spanSchema,
  status: evidenceStatusSchema,
  elementId: z.string().nullable(),
  relationId: z.string().nullable(),
  proof: z.array(evidenceProofSchema),
  typeText: z.string().nullable(),
  note: z.string().nullable(),
  /** Why a boundary row stops the walk (`unproven-handoff`, `external-code`, …). */
  reason: z.string().nullable(),
});

export const valueFlowResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  reason: z.string().nullable(),
  selection: z.strictObject({ file: z.string(), span: spanSchema, text: z.string(), kind: z.string() }),
  rows: z.array(ledgerRowSchema),
  frontiers: z.array(z.strictObject({ rowId: z.string(), reason: z.string(), label: z.string() })),
  /** Row ids of terminal rows. */
  terminals: z.array(z.string()),
  coverage: z.strictObject({
    elements: z.number().int().nonnegative(),
    relations: z.number().int().nonnegative(),
    budget: z.strictObject({ limit: z.number().int().nonnegative(), used: z.number().int().nonnegative(), exhausted: z.boolean() }),
  }),
  bindings: z.strictObject({
    tsconfig: z.string(),
    typescript: z.string(),
    sourceFingerprints: z.array(z.strictObject({ file: z.string(), size: z.number().int().nonnegative(), mtimeMs: z.number() })),
  }),
});

export type LedgerRow = z.infer<typeof ledgerRowSchema>;
export type ValueFlowResult = z.infer<typeof valueFlowResultSchema>;
export type SelectExpressionResult = z.infer<typeof selectExpressionResultSchema>;
