// The ledger and the anchor graph must give one answer for every expression a
// user can select. This walks every selectable expression in a fixture root
// (each word start of each line, as a click would select it) and compares the
// two: the outcome, each stop's reason and line, and that every ledger step is
// an edge the graph drew. The fixture annotations test only the anchors they
// name; on 2026-11-23 those all agreed while 145 of 6,032 selections did not.
//
//   pnpm parity-probe                          # value-flow-basics and python-anchors
//   pnpm parity-probe --root examples/value-flow-js
//
// Exits 1 when any selection differs, and lists the first 40.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { selectExpressionOp, valueFlowOp } from "../src/srcly/ops/value-flow";
import { createEngineSession } from "../src/srcly/session";
import { chooseTypescript } from "../src/srcly/typescript-choice";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--root");
const roots = at > 0 ? [process.argv[at + 1]] : ["examples/value-flow-basics", "examples/python-anchors"];

/** An interpreter with mypy for a Python root: SRCLY_PYTHON, else the server's venv. */
function python(): string | null {
  const venv = path.resolve(ENGINE, "../server/.venv/bin/python");
  return process.env.SRCLY_PYTHON ?? (fs.existsSync(venv) ? venv : null);
}

function answer(run: () => { outcome: string; stops: string[]; strays?: number }): string {
  try {
    const { outcome, stops, strays } = run();
    return `${outcome} ${stops.sort().join(",")}${strays ? ` +${strays} steps the graph did not draw` : ""}`;
  } catch (error) {
    // Both refuse the same selections (no expression there, over the byte bound): compare the refusal, not its words.
    return `refused ${(error as { code?: string }).code ?? "error"}`;
  }
}

let failed = false;
for (const name of roots) {
  const root = path.resolve(ENGINE, name);
  const isPython = fs.existsSync(path.join(root, "pyproject.toml")) && !fs.existsSync(path.join(root, "tsconfig.json"));
  const source = isPython || !fs.existsSync(path.join(root, "src")) ? root : path.join(root, "src");
  if (isPython && !python()) {
    console.log(`${name}: skipped, no Python with mypy (set SRCLY_PYTHON or run \`uv sync\` in server/)`);
    continue;
  }
  const session = isPython
    ? createEngineSession({ root, source, tsconfig: null, typescriptFrom: ENGINE, language: "python", python: python()! })
    : createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
  const files = fs.readdirSync(source, { recursive: true }).map(String)
    .filter((file) => (isPython ? file.endsWith(".py") : /\.(tsx?|jsx?)$/.test(file) && !file.endsWith(".d.ts")) && !file.includes("node_modules"))
    .map((file) => path.relative(root, path.join(source, file)).split(path.sep).join("/"));
  let count = 0;
  const differ: string[] = [];
  for (const file of files) {
    fs.readFileSync(path.join(root, file), "utf8").split("\n").forEach((code, index) => {
      const line = index + 1;
      const seen = new Set<string>();
      for (const word of code.matchAll(/[A-Za-z_$][\w$]*/g)) {
        const span = { startLine: line, startColumn: word.index! + 1, endLine: line, endColumn: word.index! + 2 };
        for (const candidate of selectExpressionOp(session, { file, span }).candidates) {
          const key = JSON.stringify(candidate.span);
          if (seen.has(key)) continue;
          seen.add(key);
          count += 1;
          const selection = { file, span: candidate.span, text: candidate.text };
          let edges = new Set<string>();
          const graph = answer(() => {
            const result = anchorGraphOp(session, { ...selection, direction: "forward" });
            edges = new Set(result.edges.map((edge) => edge.id));
            return { outcome: result.outcome, stops: result.nodes.filter((node) => node.kind === "frontier" || (node.kind === "boundary" && node.status !== "proven")).map((node) => `${node.reason}@${node.line}`) };
          });
          const ledger = answer(() => {
            const result = valueFlowOp(session, selection);
            const rows = new Map(result.rows.map((row) => [row.id, row]));
            return {
              outcome: result.outcome,
              stops: result.frontiers.map((stop) => `${stop.reason}@${rows.get(stop.rowId)!.line}`),
              strays: result.rows.filter((row) => row.relationId && !edges.has(row.relationId)).length,
            };
          });
          if (ledger !== graph) differ.push(`${file}:${line} ${candidate.text.slice(0, 50)}\n    ledger ${ledger}\n    graph  ${graph}`);
        }
      }
    });
  }
  console.log(`${name}: ${count} selections, ${differ.length} differ`);
  if (differ.length) console.log(differ.slice(0, 40).join("\n"));
  failed ||= differ.length > 0;
}
process.exit(failed ? 1 : 0);
