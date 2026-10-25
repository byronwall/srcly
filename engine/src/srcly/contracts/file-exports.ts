import { z } from "zod";
import { generationFields, outcomeSchema } from "./primitives";

/**
 * A file's or folder's exported declarations (T19): what a file or folder
 * anchor fans out to, one box per export. Listing only; each export is then
 * its own `anchorGraph` by name and line. A type-only export is listed but
 * not traceable: there is no value to follow.
 */
export const exportKindSchema = z.enum(["function", "class", "variable", "component", "enum", "type", "interface", "namespace", "other"]);

export const fileExportSchema = z.strictObject({
  /** `${file}@${name}:${line}`, the anchor encoding the client uses. */
  id: z.string(),
  name: z.string(),
  kind: exportKindSchema,
  /** Where the declaration is, which may be another file for a re-export. */
  file: z.string(),
  absPath: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  /** False for a type-only export, which has no value flow. */
  traceable: z.boolean(),
  /** True when the file re-exports it from elsewhere. */
  reexported: z.boolean(),
});

export const fileExportsResultSchema = z.strictObject({
  outcome: outcomeSchema,
  ...generationFields,
  reason: z.string().nullable(),
  target: z.strictObject({
    /** Relative to the engine root. */
    path: z.string(),
    absPath: z.string(),
    kind: z.enum(["file", "folder"]),
  }),
  files: z.array(
    z.strictObject({
      file: z.string(),
      absPath: z.string(),
      exports: z.array(fileExportSchema),
    }),
  ),
  counts: z.strictObject({ files: z.number().int().nonnegative(), exports: z.number().int().nonnegative(), traceable: z.number().int().nonnegative() }),
});

export type FileExport = z.infer<typeof fileExportSchema>;
export type FileExportsResult = z.infer<typeof fileExportsResultSchema>;
