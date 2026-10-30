import fs from "node:fs";
import path from "node:path";
import { createAnalysisCancellationToken } from "../src/analysis/cancellation";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { fileExportsOp } from "../src/srcly/ops/file-exports";
import { EngineError } from "../src/srcly/protocol";
import { createEngineSession } from "../src/srcly/session";
import { chooseTypescript } from "../src/srcly/typescript-choice";

// Where does data flow stop, across a real repo? Traces a spread of one
// repo's exports in both directions and writes every outcome and every stop
// (frontier or boundary) as JSON, so `survey-report.ts` can rank the stops
// by how many traces they cut short. One repo per process: a Program is big,
// and a crash or hang stays with its repo.
//
//   node --import tsx scripts/survey-blockers.ts --root ~/Projects/app/app --out tmp/survey [--source src] [--traces 120 | --every 6] [--deadline 20000] [--language python --python .venv/bin/python]

const args = parseFlags(process.argv.slice(2));
const root = path.resolve(required("root"));
const source = args.source ?? ".";
const traces = Number(args.traces ?? 120);
const deadlineMs = Number(args.deadline ?? 20_000);
const out = path.resolve(required("out"));
const name = args.name ?? path.relative(path.dirname(path.dirname(root)), root).replaceAll(path.sep, "__");
fs.mkdirSync(out, { recursive: true });

const report: Record<string, unknown> = { repo: name, root, source };
const write = () => fs.writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify(report, null, 1)}\n`);

const started = performance.now();
// A folder with a pyproject and no tsconfig is a Python root, read with its own venv's interpreter when it has one.
const language = (args.language ?? (fs.existsSync(path.join(root, "pyproject.toml")) && !fs.existsSync(path.join(root, "tsconfig.json")) ? "python" : "typescript")) as "python" | "typescript";
const venv = path.join(root, ".venv/bin/python");
const session = createEngineSession({
  root,
  source,
  tsconfig: null,
  // As the server does (decision D4): the project's own typescript only when its major.minor matches the engine's (TypeScript 7 has no JS API).
  typescriptFrom: chooseTypescript(root, path.resolve(root, source)).from,
  language,
  python: args.python ?? (fs.existsSync(venv) ? venv : null),
});
try {
  const tier1 = session.tier1();
  report.tier1 = { ok: true, ms: Math.round(performance.now() - started), files: tier1.inputs?.files?.length ?? null };
} catch (error) {
  report.tier1 = { ok: false, ms: Math.round(performance.now() - started), ...describe(error) };
  write();
  process.exit(0);
}

type Candidate = { id?: string; file: string; name: string; kind: string; line: number; traceable: boolean };
const all: Candidate[] = language === "python" ? pythonDefinitions() : fileExportsOp(session, { file: "." }).files.flatMap((file) => file.exports).filter((item) => !item.reexported);
report.exports = {
  files: new Set(all.map((item) => item.file)).size,
  total: all.length,
  traceable: all.filter((item) => item.traceable).length,
  untraceableByKind: countBy(all.filter((item) => !item.traceable), (item) => item.kind),
};
// An even spread over files, so one big module does not dominate. `--every N`
// keeps the exports whose `file#name` hashes to 0 mod N instead: adding or
// removing one export then changes only that export's place in the sample,
// so `survey-gate.ts` can diff a base and a head sample export by export.
const candidates = all.filter((item) => item.traceable).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));
const every = args.every ? Number(args.every) : null;
const step = Math.max(1, candidates.length / traces);
const picked = every
  ? candidates.filter((item) => fnv1a(`${item.file}#${item.name}`) % every === 0)
  : Array.from({ length: Math.min(traces, candidates.length) }, (_, i) => candidates[Math.floor(i * step)]);

const results: unknown[] = [];
report.traces = results;
for (const item of picked) {
  const begin = performance.now();
  const deadline = Date.now() + deadlineMs;
  const entry: Record<string, unknown> = { file: item.file, name: item.name, kind: item.kind, line: item.line };
  try {
    // An export's id names its declaration (`file@name:line`); a default export's display name does not.
    const declared = item.id ? item.id.slice(item.id.lastIndexOf("@") + 1, item.id.lastIndexOf(":")) : item.name;
    const graph = anchorGraphOp(session, { file: item.file, name: declared, line: item.line, direction: "both" }, createAnalysisCancellationToken(() => Date.now() > deadline));
    Object.assign(entry, {
      outcome: graph.outcome,
      reason: graph.reason,
      counts: graph.counts,
      budget: graph.coverage.budget,
      stops: graph.nodes
        .filter((node) => node.kind === "frontier" || node.kind === "boundary")
        .map((node) => ({ kind: node.kind, reason: node.reason, elementKind: node.elementKind, detail: node.detail, side: node.side, label: node.label, note: node.note, at: `${node.file}:${node.line}` })),
    });
  } catch (error) {
    Object.assign(entry, { outcome: "error", ...describe(error) });
  }
  entry.ms = Math.round(performance.now() - begin);
  results.push(entry);
  write();
}
report.totalMs = Math.round(performance.now() - started);
write();
process.stdout.write(`${name}: ${results.length} traces in ${report.totalMs} ms\n`);

/** `fileExports` is TypeScript-only: a Python root's top-level functions and classes stand in for its exports. */
function pythonDefinitions(): Candidate[] {
  const found: Candidate[] = [];
  for (const absolute of session.tier1().inputs?.files ?? []) {
    const file = path.relative(root, absolute);
    fs.readFileSync(absolute, "utf8").split("\n").forEach((text, index) => {
      const match = /^(?:async\s+)?(def|class)\s+(\w+)/.exec(text);
      if (match) found.push({ file, name: match[2], kind: match[1] === "def" ? "function" : "class", line: index + 1, traceable: true });
    });
  }
  return found;
}

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof EngineError) return { code: error.code, message: error.message };
  const err = error as Error;
  return { code: err?.name ?? "Error", message: `${err?.message ?? String(error)}`.slice(0, 400) + (err?.stack ? `\n${err.stack.split("\n").slice(1, 4).join("\n")}` : "") };
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) flags[argv[i].replace(/^--/, "")] = argv[i + 1];
  return flags;
}

function required(flag: string): string {
  if (!args[flag]) throw new Error(`--${flag} is required`);
  return args[flag];
}
