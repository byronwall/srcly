// Library models as data (docs/intent/dataflow-library-models/plan.md): what
// library code does, as rows both collectors read, instead of tables and
// predicates in each. A row names a library member the checker resolves
// (TypeScript: module and symbol; Python: mypy fullname) and one of a small
// fixed set of models. A row only upgrades a call from assumed to modelled;
// a call no row names keeps the assumed fallback.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type * as TypeScript from "typescript";
import { z } from "zod";
import { calleeName, importedCallee } from "./program-evidence-support";

// The bundle (`scripts/bundle.mjs`) is one flat folder: the built-in rows sit in `models/` beside the entry.
declare const __SRCLY_ENGINE_BUNDLE__: boolean | undefined;
const IS_BUNDLE = typeof __SRCLY_ENGINE_BUNDLE__ !== "undefined" && __SRCLY_ENGINE_BUNDLE__;

/** The model types (plan §3), and `wraps`: a call that returns the function it is given. */
export const LIBRARY_MODEL_TYPES = ["origin", "terminal", "state-pair", "passes-through", "consumes", "calls-back", "resource", "wraps"] as const;

export const libraryModelRowSchema = z
  .object({
    language: z.enum(["ts", "py"]).describe("`ts` or `py`."),
    module: z.string().min(1).describe("The import module (`solid-js`, `node:fs`), `lib` for TypeScript's built-in lib.*.d.ts, `global` for a bare global, or a Python package."),
    name: z.string().min(1).optional().describe("An exported name (`createSignal`). A trailing `*` matches a prefix."),
    member: z.string().min(1).optional().describe("`Type.method` for a method on an instance (`Session.get`, `Array.find`). A trailing `*` matches a prefix."),
    model: z.enum(LIBRARY_MODEL_TYPES).describe("What the member does."),
    args: z.string().regex(/^(\*|this|\d+)$/).optional().describe("Which arguments the model is about: `0`, `1`, `*` (the default) or `this` for the receiver."),
    role: z.string().min(1).optional().describe("An origin or terminal role."),
    with: z.enum(["element", "receiver", "awaited"]).optional().describe("What a callback receives."),
    returns: z.enum(["element", "boolean", "same", "callback"]).optional().describe("What the call yields: `callback` is what the callback at `args` returns."),
    source: z.string().regex(/^\d+$/).optional().describe("For `calls-back`: the argument whose value (or return) the callback's first parameter receives."),
    accessor: z.literal(true).optional().describe("For `calls-back`: the call makes an accessor, and calling it yields the callback's return."),
    option: z.string().min(1).optional().describe("For `calls-back`: the options key that holds the callback (`queryFn`)."),
    writes: z.literal("this").optional().describe("For `consumes`: the receiver keeps the arguments (`push`, `set`)."),
    proof: z.string().min(1).optional().describe("The proof kind its relations carry, so existing proof names survive."),
    note: z.string().optional().describe("One line for the code map and the proof detail."),
  })
  .strict()
  .refine((row) => (row.name === undefined) !== (row.member === undefined), { message: "a row names exactly one of `name` or `member`" });

export const libraryModelFileSchema = z
  .object({
    $schema: z.string().optional(),
    rows: z.array(libraryModelRowSchema),
  })
  .strict();

export type LibraryModelRow = z.infer<typeof libraryModelRowSchema>;
type Loaded = { row: LibraryModelRow; source: string };

/** The key a row is found by: language, module and the exported name or member. */
export function libraryModelKey(language: LibraryModelRow["language"], module: string, nameOrMember: string): string {
  return `${language}:${module}#${nameOrMember}`;
}

/** Every loaded row, found by the member a collector resolved: an exact row first, then the longest prefix row. */
export class LibraryModels {
  private readonly exact = new Map<string, Loaded>();
  private readonly prefixes: { key: string; loaded: Loaded }[] = [];

  constructor(rows: readonly Loaded[]) {
    for (const loaded of rows) {
      const { row } = loaded;
      const key = libraryModelKey(row.language, row.module, (row.name ?? row.member)!);
      const prefix = key.endsWith("*");
      const existing = prefix ? this.prefixes.find((item) => item.key === key)?.loaded : this.exact.get(key);
      if (existing) throw new Error(`library model ${key} in ${loaded.source} repeats the one in ${existing.source}`);
      if (prefix) this.prefixes.push({ key: key.slice(0, -1), loaded });
      else this.exact.set(key, loaded);
    }
    this.prefixes.sort((a, b) => b.key.length - a.key.length);
  }

  get size(): number {
    return this.exact.size + this.prefixes.length;
  }

  lookup(language: LibraryModelRow["language"], module: string, nameOrMember: string): LibraryModelRow | null {
    const key = libraryModelKey(language, module, nameOrMember);
    return this.exact.get(key)?.row ?? this.prefixes.find((item) => key.startsWith(item.key))?.loaded.row ?? null;
  }

  /** Every row, exact ones first. */
  rows(): LibraryModelRow[] {
    return [...[...this.exact.values()].map((item) => item.row), ...this.prefixes.map((item) => item.loaded.row)];
  }
}

export const BUILTIN_MODELS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), IS_BUNDLE ? "models" : "../../models");

/** The built-in row files, in name order (the schema file is not one). */
export function builtinModelFiles(): string[] {
  return fs.readdirSync(BUILTIN_MODELS_DIR)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json"))
    .sort()
    .map((file) => path.join(BUILTIN_MODELS_DIR, file));
}

let builtin: LibraryModels | null = null;

/** The built-in rows, read once per process. */
export function builtinLibraryModels(): LibraryModels {
  builtin ??= loadLibraryModels(builtinModelFiles());
  return builtin;
}

/** A TypeScript row's module: the import's module without a `node:` scheme, or `global` for a callee nothing imports. */
export function tsModelModule(module: string | null): string {
  return module === null ? "global" : module.replace(/^node:/, "");
}

/**
 * The row for a TypeScript call or member. An imported callee is found by its
 * module and export name, however the import names it (`readFile as read`,
 * `fs.readFile`); anything else by its module (or `global`) and dotted name as written.
 */
export function tsModel(models: LibraryModels, ts: typeof TypeScript, checker: TypeScript.TypeChecker, module: string | null, expression: TypeScript.Node): LibraryModelRow | null {
  const imported = ts.isExpression(expression) ? importedCallee(ts, checker, expression) : null;
  if (imported) return models.lookup("ts", tsModelModule(imported.module), imported.name);
  return models.lookup("ts", tsModelModule(module), calleeName(ts, expression));
}

/** An origin's or terminal's role, the element kind it marks, else null. */
export function boundaryRole(row: LibraryModelRow | null): string | null {
  return row && (row.model === "origin" || row.model === "terminal") ? row.role ?? null : null;
}

/** The global members a row gives a role to (`process.env`, `process.argv`), for reads matched by the member they name. */
export function globalMembers(models: LibraryModels, role: string): string[] {
  return models.rows().filter((row) => row.language === "ts" && row.module === "global" && row.name && boundaryRole(row) === role).map((row) => row.name!);
}

/** The global members rows give a role to, matched where they are read or assigned (`process.env.X`, `process.exitCode = 1`). */
export type GlobalReads = { environment: string[]; process: string[]; exit: string[] };

export function globalReads(models: LibraryModels): GlobalReads {
  return { environment: globalMembers(models, "environment-input"), process: globalMembers(models, "process-input"), exit: globalMembers(models, "exit-status") };
}

/** Read and check row files, in order. A file that is not valid JSON or does not match the schema is an error naming it, never skipped. */
export function loadLibraryModels(files: readonly string[]): LibraryModels {
  const rows: Loaded[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`library models ${file}: ${(error as Error).message}`);
    }
    const result = libraryModelFileSchema.safeParse(parsed);
    if (!result.success) throw new Error(`library models ${file}: ${z.prettifyError(result.error)}`);
    for (const row of result.data.rows) rows.push({ row, source: file });
  }
  return new LibraryModels(rows);
}
