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

/**
 * The model types (plan §3), `wraps`: a call that returns the function it is
 * given, `cell`: a call that makes one state each time it runs
 * (`createSignal`, zustand's `create`), and `slot`: a JSX component that
 * calls a function it is given with values (`<For each>{(row) => …}</For>`),
 * and `keyed`: a call that writes, reads or clears an entry of a store under
 * a key (a context, the query cache, `localStorage`).
 */
export const LIBRARY_MODEL_TYPES = ["origin", "terminal", "passes-through", "consumes", "calls-back", "wraps", "cell", "slot", "keyed"] as const;

/** The models that say what they do only with `flows` access paths. */
const FLOW_MODELS = new Set<(typeof LIBRARY_MODEL_TYPES)[number]>(["calls-back", "wraps", "passes-through", "slot"]);

/**
 * An access path (CodeQL's models-as-data tokens): a root, then steps.
 * Roots: `Argument[n]`, `Argument[n..]` (argument n and every later one),
 * `Argument[this]` (the receiver), `ReturnValue` (the call's value).
 * Steps: `Parameter[n]` / `Parameter[n..]` (what the function there is called
 * with), `ReturnValue` (what it returns), `Member[name]` (a field or tuple
 * index), `Awaited` (what the promise fulfils with), `Awaited[error]` (what
 * it rejects with), `ArrayElement` (each element).
 */
const STEP = String.raw`(?:Parameter\[\d+(?:\.\.)?\]|ReturnValue|Member\[[A-Za-z0-9_$]+\]|Awaited(?:\[error\])?|ArrayElement)`;
const ROOT = String.raw`(?:Argument\[(?:this|\d+(?:\.\.)?)\]|ReturnValue)`;
const PATH = `${ROOT}(?:\\.${STEP})*`;
export const LIBRARY_PATH_PATTERN = new RegExp(`^${PATH}$`);
export const LIBRARY_FLOW_PATTERN = new RegExp(`^(${PATH}) -> (${PATH})(?: : (test))?$`);

export const libraryPathSchema = z
  .string()
  .regex(LIBRARY_PATH_PATTERN)
  .describe("One access path, as a `flows` entry writes either side: `ReturnValue.Member[1].Parameter[0]`.");

export const libraryFlowSchema = z
  .string()
  .regex(LIBRARY_FLOW_PATTERN)
  .describe(
    "`<input> -> <output>`: the value at the input path reaches the output path. An optional ` : test` says the output holds a test of the input (a boolean), not the input. A path is a root (`Argument[n]`, `Argument[n..]`, `Argument[this]`, `ReturnValue`) and then steps (`Parameter[n]`, `Parameter[n..]`, `ReturnValue`, `Member[name]`, `Awaited`, `Awaited[error]`, `ArrayElement`), as CodeQL's models-as-data write them: `Argument[0].Member[queryFn].ReturnValue -> ReturnValue.Member[data]`.",
  );

export const libraryModelRowSchema = z
  .object({
    language: z.enum(["ts", "py"]).describe("`ts` or `py`."),
    module: z.string().min(1).describe("The import module (`solid-js`, `node:fs`), `lib` for TypeScript's built-in lib.*.d.ts, `global` for a bare global, or a Python package."),
    name: z.string().min(1).optional().describe("An exported name (`createSignal`). A trailing `*` matches a prefix."),
    member: z.string().min(1).optional().describe("`Type.method` for a method on an instance (`Session.get`, `Array.find`). A trailing `*` matches a prefix."),
    model: z.enum(LIBRARY_MODEL_TYPES).describe("What the member does."),
    role: z.string().min(1).optional().describe("An origin or terminal role."),
    result: z.string().regex(/^(call|\d+)$/).optional().describe("For a `terminal`: the terminal is not this call but a call of what it returns (`call`, as `useNavigate`'s `navigate`), or of the tuple element it returns at that index (`1`)."),
    settles: z.literal("reject").optional().describe("For `consumes`: the call makes a promise that only rejects, with its first argument (`Promise.reject`)."),
    flows: z.array(libraryFlowSchema).optional().describe("For `calls-back`, `wraps`, `passes-through` and `slot` (required there, and only there): where the call moves values, as access paths (`framework-flows.ts` reads them; `slots.ts` for a `slot`, whose `Argument[0]` is the props: `Argument[0].Member[each].ArrayElement -> Argument[0].Member[children].Parameter[0]`). A `calls-back` row with no flow that touches `ReturnValue` has no value (`useEffect`)."),
    variant: z.object({
      attribute: z.string().min(1).describe("A boolean attribute (`keyed`)."),
      flows: z.array(libraryFlowSchema).describe("The flows that replace the row's `flows` when the occurrence sets it."),
    }).strict().optional().describe("For a `slot`: other flows when the occurrence sets a boolean attribute (`<Show keyed>` hands its child the value, not an accessor of it). An occurrence that sets it to a value no reader can decide takes neither."),
    makes: z.array(libraryPathSchema).optional().describe("For a `slot`: what the component makes itself and hands a function it calls, which no argument supplies (`Argument[0].Member[children].Parameter[1]` `For`'s index accessor, `Argument[0].Member[fallback].Parameter[0]` the error an `ErrorBoundary` caught)."),
    init: z.array(libraryPathSchema).optional().describe("For a `cell`: the paths whose value seeds the call's one state (`Argument[0]`; `Argument[0].ReturnValue` when a function initial value is called; `Argument[1].ReturnValue.Awaited` for a fetcher)."),
    writes: z.union([z.literal("this"), z.array(libraryPathSchema)]).optional().describe("For `consumes`: `this`, the receiver keeps the arguments (`push`, `set`); a `consumes` row without it keeps nothing (`concat`). For a `keyed` row: the paths whose value becomes the entry under the key (`Argument[1]`, `Argument[1].ReturnValue` an updater's return; for a context, its provider's props: `ReturnValue.Member[Provider].Parameter[0].Member[value]`). For a `cell`: the paths whose value merges into the state, through the handles the call makes or hands its function (`ReturnValue.Member[1].Parameter[0]` a setter's argument, `….Parameter[0].ReturnValue` an updater's return, `Argument[0].Parameter[0].Parameter[0]` what a store's `set` receives, `….Parameter[0..]` a store path's keys and value)."),
    reads: z.array(libraryPathSchema).optional().describe("For a `keyed` row: the paths that see the entry under the key (`ReturnValue`, `Argument[1].Parameter[0]` an updater's old value). For a `cell`: the paths that see the state (`ReturnValue.Member[0].ReturnValue` a getter's call, `ReturnValue.Member[0]` the value itself, `ReturnValue.Parameter[0].Parameter[0]` a selector's parameter, `ReturnValue.Member[getState].ReturnValue`)."),
    yields: z.array(libraryFlowSchema).optional().describe("For a `cell`: other moves, as `flows` write them: what a read returns (`ReturnValue.Parameter[0].ReturnValue -> ReturnValue.ReturnValue`), where a dispatch puts its action (`ReturnValue.Member[1].Parameter[0] -> Argument[0].Parameter[1]`), a watched function's result fields."),
    store: z.enum(["Argument[this]", "providers"]).optional().describe("For a `keyed` row: which store holds the entry. `Argument[this]`: the receiver (`localStorage`, a `QueryClient`), the same store when both receivers name one global or come from one call row (`useQueryClient()`). `providers`: the key is a context object, and a write reaches a read only from a provider above the read in the render tree."),
    key: libraryPathSchema.optional().describe("For a `keyed` row: where the key is (`Argument[0]`, `Argument[0].Member[queryKey]`; `ReturnValue` for the call that makes a context, which is its own key). A constant key (a literal, a `const`, an array of them) joins as proven; any other key joins as assumed."),
    fallback: z.array(libraryPathSchema).optional().describe("For a `keyed` row of a `providers` store: the paths a read sees only when no provider is above it (`createContext`'s `Argument[0]`)."),
    clears: z.literal(true).optional().describe("For a `keyed` row: the call drops or refreshes the entries under the key (`invalidateQueries`, `removeItem`); it moves no value."),
    optional: z.literal("Argument[0]").optional().describe("For a `cell`: the first argument may be left out (`createResource(fetcher)` has no source); a call that leaves it out has every later argument one place earlier."),
    proof: z.string().min(1).optional().describe("The proof kind its relations carry, so existing proof names survive."),
    note: z.string().optional().describe("One line for the code map and the proof detail."),
  })
  .strict()
  .refine((row) => (row.name === undefined) !== (row.member === undefined), { message: "a row names exactly one of `name` or `member`" })
  .refine((row) => (row.flows !== undefined) === FLOW_MODELS.has(row.model), { message: "a `calls-back`, `wraps`, `passes-through` or `slot` row names its `flows`, and no other row does" })
  .refine((row) => row.model === "slot" || (row.variant === undefined && row.makes === undefined), { message: "only a `slot` row names a `variant` or what it `makes`" })
  .refine((row) => row.model === "keyed" || (row.model === "cell") === [row.init, Array.isArray(row.writes) ? row.writes : undefined, row.reads, row.yields, row.optional].some((field) => field !== undefined), { message: "a `cell` row names its paths (`init`, `writes`, `reads`, `yields`), and no other row does" })
  .refine((row) => (row.model === "keyed") === (row.key !== undefined || row.store !== undefined), { message: "a `keyed` row names its `store` and `key`, and no other row does" })
  .refine((row) => row.model !== "keyed" || (row.store !== undefined && [row.init, row.yields, row.optional].every((field) => field === undefined) && row.writes !== "this"), { message: "a `keyed` row names its `store`, and only `key`, `writes`, `reads`, `fallback` and `clears` paths" })
  .refine((row) => row.model === "keyed" || (row.fallback === undefined && row.clears === undefined), { message: "only a `keyed` row names a `fallback` or `clears`" });

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
  return models.lookup("ts", tsModelModule(module), calleeName(ts, expression)) ?? libraryMemberModel(models, ts, checker, expression);
}

/**
 * The row for a method a library's class or interface declares
 * (`client.invalidateQueries`), found by the checker: the declaring type's
 * name and the package that declares it (a `declare module`, or the
 * `node_modules` folder of its `.d.ts`), as a `member` row names them.
 */
export function libraryMemberModel(models: LibraryModels, ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Node): LibraryModelRow | null {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  for (const declaration of checker.getSymbolAtLocation(expression.name)?.declarations ?? []) {
    const owner = declaration.parent;
    if (!declaration.getSourceFile().isDeclarationFile || !(ts.isClassDeclaration(owner) || ts.isInterfaceDeclaration(owner)) || !owner.name) continue;
    const pkg = declaringPackage(ts, owner);
    const row = pkg ? models.lookup("ts", pkg, `${owner.name.text}.${expression.name.text}`) : null;
    if (row) return row;
  }
  return null;
}

function declaringPackage(ts: typeof TypeScript, node: TypeScript.Node): string | null {
  const module = ts.findAncestor(node, ts.isModuleDeclaration);
  if (module && ts.isStringLiteral(module.name)) return module.name.text;
  const file = node.getSourceFile().fileName;
  const at = file.lastIndexOf("/node_modules/");
  if (at < 0) return null;
  const parts = file.slice(at + "/node_modules/".length).split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** The row for a method the standard library declares (`rows.push`), found by its interface (`Array.push`, a `lib` row). */
export function standardMemberModel(models: LibraryModels, member: { owner: string; name: string } | null): LibraryModelRow | null {
  return member ? models.lookup("ts", "lib", `${member.owner}.${member.name}`) : null;
}

/** An origin's or terminal's role, the element kind it marks, else null. */
export function boundaryRole(row: LibraryModelRow | null): string | null {
  // A row with a `result` marks a function the call hands back (`returnedTerminal`), not the call.
  return row && (row.model === "origin" || row.model === "terminal" || row.model === "keyed") && row.result === undefined ? row.role ?? null : null;
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
