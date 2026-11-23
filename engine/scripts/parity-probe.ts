// The ledger and the anchor graph must give one answer for every expression a
// user can select. This walks every selectable expression in a fixture root
// (each caret position on each line, sent as the client sends it: the span and
// the candidate's text) and compares the two: the outcome, each stop's reason
// and line, the ends, and that every ledger step is an edge the graph drew,
// into the box the row names. A refusal must be a named engine error on both
// sides; a crash is a failure. The fixture annotations test only the anchors they
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
import type { Span } from "../src/srcly/selection";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--root");
const roots = at > 0 ? [process.argv[at + 1]] : ["examples/value-flow-basics", "examples/python-anchors"];

/** An interpreter with mypy for a Python root: SRCLY_PYTHON, else the server's venv. */
function python(): string | null {
  const venv = path.resolve(ENGINE, "../server/.venv/bin/python");
  return process.env.SRCLY_PYTHON ?? (fs.existsSync(venv) ? venv : null);
}

type Answer = { outcome: string; stops: string[]; ends: string[]; problems?: string[] };

function answer(run: () => Answer): string {
  try {
    const { outcome, stops, ends, problems } = run();
    return `${outcome} stops ${stops.sort().join(",") || "-"} ends ${ends.sort().join(",") || "-"}${problems?.length ? ` PROBLEMS ${problems.join("; ")}` : ""}`;
  } catch (error) {
    // Both refuse the same selections (no expression there, over the byte bound): compare the refusal, not its words.
    const code = (error as { code?: string }).code;
    return code ? `refused ${code}` : `CRASH ${(error as Error).message.slice(0, 120)}`;
  }
}

const inside = (inner: Span, outer: Span) =>
  (inner.startLine > outer.startLine || (inner.startLine === outer.startLine && inner.startColumn >= outer.startColumn)) &&
  (inner.endLine < outer.endLine || (inner.endLine === outer.endLine && inner.endColumn <= outer.endColumn));

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
    const seen = new Set<string>();
    fs.readFileSync(path.join(root, file), "utf8").split("\n").forEach((code, index) => {
      const line = index + 1;
      // Every caret position a click can land on, the end of the line included.
      for (let column = 1; column <= code.length + 1; column += 1) {
        const caret = { startLine: line, startColumn: column, endLine: line, endColumn: column };
        for (const candidate of selectExpressionOp(session, { file, span: caret }).candidates) {
          const key = JSON.stringify(candidate.span);
          if (seen.has(key)) continue;
          seen.add(key);
          count += 1;
          const selection = { file, span: candidate.span, text: candidate.text };
          let edges = new Map<string, { source: string; target: string }>();
          const graph = answer(() => {
            const result = anchorGraphOp(session, { ...selection, direction: "forward" });
            edges = new Map(result.edges.map((edge) => [edge.id, edge]));
            const anchor = result.nodes.find((node) => node.kind === "anchor");
            return {
              outcome: result.outcome,
              stops: result.nodes.filter((node) => node.kind === "frontier" || (node.kind === "boundary" && node.status !== "proven")).map((node) => `${node.reason}@${node.line}`),
              // A value that ends where it is selected also lands at the anchor.
              ends: [...result.nodes.filter((node) => node.kind === "terminal").map((node) => node.id), ...(anchor?.note?.startsWith("ends here") ? [anchor.id] : [])],
            };
          });
          const ledger = answer(() => {
            const result = valueFlowOp(session, selection);
            const rows = new Map(result.rows.map((row) => [row.id, row]));
            const problems: string[] = [];
            for (const row of result.rows.slice(1)) {
              const edge = row.relationId ? edges.get(row.relationId) : undefined;
              if (row.relationId && !edge) problems.push(`row ${row.label} has an edge the graph did not draw`);
              else if (edge && edge.target !== row.elementId) problems.push(`row ${row.label} names a box its edge does not reach`);
              // Without an edge: a stop, an end at the input, or a part of the selection itself.
              else if (!edge && row.kind !== "boundary" && !(row.kind === "terminal" && row.elementId === result.rows[0].elementId) && !inside(row.span, result.selection.span)) problems.push(`row ${row.label} is a step with no edge`);
            }
            return {
              outcome: result.outcome,
              stops: result.frontiers.map((stop) => `${stop.reason}@${rows.get(stop.rowId)!.line}`),
              ends: result.rows.filter((row) => row.kind === "terminal").map((row) => row.elementId ?? "?"),
              problems,
            };
          });
          if (ledger !== graph || graph.startsWith("CRASH")) differ.push(`${file}:${line} ${candidate.text.slice(0, 50)}\n    ledger ${ledger}\n    graph  ${graph}`);
        }
      }
    });
  }
  console.log(`${name}: ${count} selections, ${differ.length} differ`);
  if (differ.length) console.log(differ.slice(0, 40).join("\n"));
  failed ||= differ.length > 0;
}
process.exit(failed ? 1 : 0);
