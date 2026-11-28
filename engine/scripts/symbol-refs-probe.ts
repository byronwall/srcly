import fs from "node:fs";
import path from "node:path";
import { symbolRefsOp } from "../src/srcly/ops/symbol-refs";
import { createEngineSession } from "../src/srcly/session";

// The cost of `symbolRefs` on one root: Program build, walk, heap after a full GC
// and result size (docs/intent/checker-symbol-index, M0).
//   node --expose-gc --max-old-space-size=4096 --import tsx scripts/symbol-refs-probe.ts --root <repo> [--json out.json]
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const root = path.resolve(args.get("root") ?? ".");
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with --expose-gc");
const mb = (n: number) => Math.round(n / 1024 / 1024);
const heap = () => {
  gc();
  return mb(process.memoryUsage().heapUsed);
};

const t0 = Date.now();
const session = createEngineSession({ root, source: ".", tsconfig: null, typescriptFrom: root });
session.tier1();
const buildMs = Date.now() - t0;
const heapBuilt = heap();
const t1 = Date.now();
const result = symbolRefsOp(session, {});
const walkMs = Date.now() - t1;
const text = JSON.stringify(result);
if (args.has("json")) fs.writeFileSync(args.get("json")!, text);
console.log(JSON.stringify({ root, buildMs, walkMs, heapBuiltMB: heapBuilt, heapWalkedMB: heap(), rssMB: mb(process.memoryUsage().rss), jsonMB: +(text.length / 1e6).toFixed(1), ...result.counts }));
