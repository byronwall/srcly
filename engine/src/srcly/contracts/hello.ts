import { z } from "zod";

export const helloResultSchema = z.strictObject({
  protocol: z.number().int(),
  engine: z.string(),
  node: z.string(),
  typescript: z.string(),
  typescriptFrom: z.enum(["project", "bundled"]),
  root: z.string(),
  source: z.string(),
});

export type HelloResult = z.infer<typeof helloResultSchema>;
