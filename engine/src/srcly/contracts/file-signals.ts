import { z } from "zod";
import { generationFields, outcomeSchema } from "./primitives";

/**
 * Tier-2 evidence for srcly's pipelines (M7): per-file data-flow metrics,
 * finding spans for the code viewer and `srcly report`, and the work-packet
 * Markdown that `srcly report --dataflow` writes as `dataflow.md`. All of it
 * comes from one legacy report (`fullReport()`), so it is slow: minutes on a
 * big app. Only a batch caller asks for it.
 */
export const dataflowRuleSchema = z.enum(["impossible-defense", "repeated-fork"]);

export const dataflowFindingSchema = z.strictObject({
  rule: dataflowRuleSchema,
  /** Relative to the engine root. */
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  endLine: z.number().int().positive(),
  message: z.string(),
});

/** The worst render path in a file, or the dead guards in it. Each is a count, never a score. */
export const fileMetricsSchema = z.strictObject({
  /** `??` and `?.` in the file whose guarded value the types say is never null or undefined. */
  impossibleDefenses: z.number().int().nonnegative(),
  /** The most component boundaries one of the file's render sinks crosses (prop relay). */
  relayHops: z.number().int().nonnegative(),
  /** The most render sinks one of the file's sinks' sources also feeds. */
  fanOut: z.number().int().nonnegative(),
  /** The most representation-only steps (alias, pack, spread) on one of the file's render paths. */
  representationChanges: z.number().int().nonnegative(),
  /** The most steps from a source to one of the file's JSX sinks. */
  pathDepth: z.number().int().nonnegative(),
});

export const fileSignalsResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  reason: z.string().nullable(),
  /** Every first-party program file, sinks or not: a file listed here was analyzed. */
  files: z.array(z.strictObject({ file: z.string(), metrics: fileMetricsSchema })),
  findings: z.array(dataflowFindingSchema),
  /** Impossible defenses whose file the report did not name and srcly could not place: counted here, never guessed. */
  unplacedDefenses: z.number().int().nonnegative(),
  /** `dataflow.md`: work packets, defensive ledger, repeated forks, prop and context relay, fan-out. */
  markdown: z.string(),
});

export type DataflowFinding = z.infer<typeof dataflowFindingSchema>;
export type FileMetrics = z.infer<typeof fileMetricsSchema>;
export type FileSignalsResult = z.infer<typeof fileSignalsResultSchema>;
