import fs from "node:fs";
import path from "node:path";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { MemoryGuard } from "../src/srcly/memory-guard";
import { fileExportsOp } from "../src/srcly/ops/file-exports";
import { createEngineSession } from "../src/srcly/session";

// The heap one engine session keeps across repeated anchor traces, after a
// full GC. Either one anchor traced again and again, or a spread of the
// root's traceable exports traced in turn (what a survey does).
//
//   node --expose-gc --max-old-space-size=4096 --import tsx scripts/memory-probe.ts --root <app>
//     [--anchor file:name:line | --exports 120] [--calls 120] [--every 10]
//     [--direction forward|backward|both]   default: both
//     [--limit MB]   run the engine's memory guard after each call, at this limit
//     [--json dir]   write each result, to diff two engines' answers
//
// Stops itself past 3 GB RSS.
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const root = path.resolve(args.get("root") ?? ".");
const calls = Number(args.get("calls") ?? 20);
const every = Number(args.get("every") ?? 5);
const direction = args.get("direction") ?? "both";
if (!["forward", "backward", "both"].includes(direction)) throw new Error(`Unknown direction: ${direction}`);
const jsonDir = args.get("json");
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with --expose-gc");

const session = createEngineSession({ root, source: ".", tsconfig: null, typescriptFrom: root });
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
const report = (label: string) => {
  gc();
  const memory = process.memoryUsage();
  const checker = session.built() ? (session.tier1() as { program?: { getTypeChecker(): Record<string, () => unknown> } }).program?.getTypeChecker() : undefined;
  const counts = checker ? `\tchecker types ${checker.getTypeCount?.()} symbols ${checker.getSymbolCount?.()} instantiations ${checker.getInstantiationCount?.()}` : "";
  process.stdout.write(`${label}\theap ${mb(memory.heapUsed)} MB\trss ${mb(memory.rss)} MB${counts}\n`);
  if (memory.rss > 3 * 1024 * 1024 * 1024) {
    process.stdout.write("rss over 3 GB; stopping\n");
    process.exit(2);
  }
};

type Anchor = { file: string; name: string; line: number };
let anchors: Anchor[];
if (args.has("anchor")) {
  const [file, name, line] = args.get("anchor")!.split(":");
  anchors = [{ file, name, line: Number(line) }];
} else {
  const limit = Number(args.get("exports") ?? 120);
  const all = fileExportsOp(session, { file: "." }).files.flatMap((file) => file.exports).filter((item) => item.traceable && !item.reexported);
  // Spread the sample across the whole program, not the first folders.
  const stride = Math.max(1, Math.floor(all.length / limit));
  anchors = all
    .filter((_, index) => index % stride === 0)
    .slice(0, limit)
    .map((item) => ({ file: item.file, name: item.name, line: item.line }));
}
report(`start (${anchors.length} anchors)`);

const guard = args.has("limit") ? new MemoryGuard(session, Number(args.get("limit")) * 1024 * 1024) : null;

for (let call = 1; call <= calls; call += 1) {
  const anchor = anchors[(call - 1) % anchors.length];
  const started = Date.now();
  let summary: string;
  try {
    guard?.admit();
    const result = anchorGraphOp(session, { file: anchor.file, name: anchor.name, line: anchor.line, direction });
    summary = `${result.outcome} ${result.nodes.length}n ${result.edges.length}e gen ${result.generation}`;
    if (jsonDir) fs.writeFileSync(path.join(jsonDir, `${anchor.file.replaceAll("/", "_")}.${anchor.name}.${anchor.line}.json`), JSON.stringify(result));
  } catch (error) {
    summary = `error ${(error as { code?: string }).code ?? (error as Error).message}`;
  }
  const settled = guard?.settle();
  if (settled && settled !== "under") process.stdout.write(`call ${call}: guard ${settled}\n`);
  if (call % every === 0 || call === calls) report(`call ${call} ${anchor.name} ${summary} ${Date.now() - started}ms`);
}
