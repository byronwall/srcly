import { z } from "zod";
import { generationFields, outcomeSchema } from "./primitives";

/**
 * Every identifier of the Program's own files, bound by the checker
 * (docs/intent/checker-symbol-index). srcly's symbol index keeps its own ids
 * and joins each target to one of them by file, name, line and meaning, so
 * no id is built here. Positions are 1-based lines and 1-based UTF-16
 * columns with an exclusive end, like every contract.
 */
export const symbolRefKindSchema = z.enum(["call", "instantiate", "read", "write", "type", "extends", "implements"]);

export const symbolRefTargetSchema = z.strictObject({
  /** Relative to the engine root. */
  file: z.string(),
  /** The declaration's own name: `A` for `import { A as B }`, `default` for an anonymous default export. */
  name: z.string(),
  /** The line of the declaration's name. */
  line: z.number().int().positive(),
  /** `type` for an interface or type alias; everything else is `value`. */
  meaning: z.enum(["value", "type"]),
  /** `module`: declared at the top of its file; `member`: a class, interface or object member; `local`: inside a body. */
  scope: z.enum(["module", "member", "local"]),
});

export const symbolRefSchema = z.strictObject({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  endColumn: z.number().int().positive(),
  kind: symbolRefKindSchema,
  /** The nearest named declaration around the ref, an index into `targets`; null for module code. */
  source: z.number().int().nonnegative().nullable(),
  /** An index into `targets`; null when the checker binds nothing here (`unbound` says why). */
  target: z.number().int().nonnegative().nullable(),
  unbound: z.enum(["unresolved", "any"]).nullable(),
});

export const symbolRefsResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  reason: z.string().nullable(),
  /** Each declaration that some ref binds to or sits in, once. */
  targets: z.array(symbolRefTargetSchema),
  files: z.array(z.strictObject({ file: z.string(), refs: z.array(symbolRefSchema) })),
  counts: z.strictObject({
    files: z.number().int().nonnegative(),
    bound: z.number().int().nonnegative(),
    unbound: z.number().int().nonnegative(),
    /** Bound to a declaration outside the root, in `node_modules` or in a `.d.ts`: left out of `files`. */
    external: z.number().int().nonnegative(),
  }),
});

export type SymbolRef = z.infer<typeof symbolRefSchema>;
export type SymbolRefTarget = z.infer<typeof symbolRefTargetSchema>;
export type SymbolRefsResult = z.infer<typeof symbolRefsResultSchema>;
