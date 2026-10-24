import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Cold `hello` and tier 1 (`routes`) through the real protocol, plus RSS after.
// Usage: node --import tsx scripts/time-tier1.ts --root <dir> [--source <dir>] [--tsconfig <file>]
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const started = performance.now();
const child = spawn(process.execPath, ["--import", "tsx", path.join(engineRoot, "bin/srcly-engine.ts"), ...process.argv.slice(2)], {
  stdio: ["pipe", "pipe", "inherit"],
});
const pending = new Map<number, (frame: { result?: Record<string, unknown>; error?: unknown }) => void>();
createInterface({ input: child.stdout }).on("line", (line) => {
  const frame = JSON.parse(line) as { id: number; progress?: unknown; result?: Record<string, unknown>; error?: unknown };
  if (frame.progress === undefined) pending.get(frame.id)?.(frame);
});
let next = 1;
const request = (op: string) => new Promise<{ result?: Record<string, unknown>; error?: unknown }>((resolve) => {
  const id = next++;
  pending.set(id, resolve);
  child.stdin.write(`${JSON.stringify({ id, op, params: {} })}\n`);
});

const hello = await request("hello");
const helloMs = performance.now() - started;
const routesStart = performance.now();
const routes = await request("routes");
const tier1Ms = performance.now() - routesStart;
const status = await request("status");
child.stdin.end();
const count = Array.isArray(routes.result?.routes) ? routes.result.routes.length : null;
process.stdout.write(`${JSON.stringify({
  helloMs: Math.round(helloMs),
  tier1Ms: Math.round(tier1Ms),
  routes: count,
  error: routes.error ?? null,
  typescript: hello.result?.typescript,
  typescriptFrom: hello.result?.typescriptFrom,
  rssMb: Math.round(Number(status.result?.rssBytes ?? 0) / 1024 / 1024),
})}\n`);
