import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Cold `hello` → first ledger, then warm `valueFlow` p95 over 20 queries, on
// srcly's own client through the real protocol. Prints JSON.
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.resolve(engineRoot, "../client");
const started = performance.now();
const child = spawn(process.execPath, ["--import", "tsx", path.join(engineRoot, "bin/srcly-engine.ts"), "--root", client, "--tsconfig", "tsconfig.app.json"], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map<number, (frame: { result?: Record<string, unknown> }) => void>();
createInterface({ input: child.stdout }).on("line", (line) => {
  const frame = JSON.parse(line) as { id: number; progress?: unknown; result?: Record<string, unknown> };
  if (frame.progress === undefined) pending.get(frame.id)?.(frame);
});
let next = 1;
const request = (op: string, params: Record<string, unknown>) => new Promise<{ result?: Record<string, unknown> }>((resolve) => {
  const id = next++;
  pending.set(id, resolve);
  child.stdin.write(`${JSON.stringify({ id, op, params })}\n`);
});
function anchor(file: string, text: string, whole = false) {
  const lines = fs.readFileSync(path.join(client, file), "utf8").split("\n");
  const index = lines.findIndex((line) => (whole ? line.trim() === `{${text}}` : line.includes(text)));
  const column = lines[index].indexOf(text) + 1;
  return { file, text, span: { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length } };
}
const anchors = [
  anchor("src/components/HotSpotItem.tsx", "props.node.name", true),
  anchor("src/components/HotSpotItem.tsx", "props.rank ?? \"–\""),
  anchor("src/components/HotSpotList.tsx", "item.node"),
  anchor("src/components/HotSpotItem.tsx", "props.valueText ?? (value() === null ? \"N/A\" : formatMetricWithUnit(props.metric, value()!))"),
];
await request("hello", {});
const first = await request("valueFlow", anchors[0]);
const coldMs = performance.now() - started;
const rows = Array.isArray(first.result?.rows) ? first.result.rows.length : 0;
const warm: number[] = [];
for (let i = 0; i < 20; i++) {
  const t = performance.now();
  await request("valueFlow", anchors[i % anchors.length]);
  warm.push(performance.now() - t);
}
const status = await request("status", {});
child.stdin.end();
warm.sort((a, b) => a - b);
process.stdout.write(`${JSON.stringify({
  coldHelloToFirstLedgerMs: Math.round(coldMs),
  firstLedgerRows: rows,
  warmP50Ms: Math.round(warm[9]),
  warmP95Ms: Math.round(warm[18]),
  warmMaxMs: Math.round(warm[19]),
  rssMb: Math.round(Number(status.result?.rssBytes ?? 0) / 1024 / 1024),
})}\n`);
