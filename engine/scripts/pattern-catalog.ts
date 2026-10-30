import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { createEngineSession } from "../src/srcly/session";
import { chooseTypescript } from "../src/srcly/typescript-choice";

// How many everyday patterns trace to an end? Runs every `@trace` in the
// pattern catalog (`examples/pattern-catalog/<framework>/src`) and prints each
// outcome and stop, then a table per framework. A React or Solid root needs a
// `node_modules` with that library's types (see the catalog's README): the
// patterns are graded against the types a real app has.
//
//   node --import tsx scripts/pattern-catalog.ts [--only <id>] [--json out.json] [-v]
//
// `// @trace <id> <forward|backward|both> <text> @want <kind|kind>` anchors at
// `text` on its own line or one of the next few (`symbol <name>` at a
// declaration). A trace is correct when it lands (`ok` or `assumed`) and one
// of its ends is a wanted element kind: landing somewhere else is not.

type Row = { framework: string; id: string; file: string; outcome: string; reason?: string | null; stops: string[]; ends: string[]; want: string[]; correct: boolean };

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const only = flag("--only");
const verbose = args.includes("-v");
const catalog = fileURLToPath(new URL("../examples/pattern-catalog", import.meta.url));
const rows: Row[] = [];

for (const framework of fs.readdirSync(catalog).filter((name) => fs.statSync(path.join(catalog, name)).isDirectory()).sort()) {
  const root = path.join(catalog, framework);
  const src = path.join(root, "src");
  if (framework !== "vanilla" && !fs.existsSync(path.join(root, "node_modules"))) {
    process.stderr.write(`${framework}: skipped, no node_modules (see examples/pattern-catalog/README.md)\n`);
    continue;
  }
  const session = createEngineSession({ root, source: src, tsconfig: null, typescriptFrom: chooseTypescript(root, src).from });
  for (const name of fs.readdirSync(src).filter((item) => /\.tsx?$/.test(item)).sort()) {
    const file = `src/${name}`;
    const lines = fs.readFileSync(path.join(src, name), "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = /@trace\s+(\S+)\s+(forward|backward|both)\s+(.*?)(?:\s+@want\s+(\S+))?\s*$/.exec(line);
      if (!match || (only && match[1] !== only)) return;
      const [, id, direction, rest, wanted] = match;
      const want = wanted ? wanted.split("|") : [];
      let anchor: Record<string, unknown>;
      if (rest.startsWith("symbol ")) anchor = { file, name: rest.slice(7).trim(), line: index + 1, direction };
      else {
        const at = lines.slice(index, index + 8).findIndex((text) => text.split("//")[0].includes(rest));
        if (at < 0) throw new Error(`${file}:${index + 1} @trace ${id}: \`${rest}\` is not on this line or the next few`);
        const column = lines[index + at].indexOf(rest) + 1;
        anchor = { file, text: rest, span: { startLine: index + at + 1, startColumn: column, endLine: index + at + 1, endColumn: column + rest.length }, direction };
      }
      let graph: ReturnType<typeof anchorGraphOp>;
      try {
        graph = anchorGraphOp(session, anchor);
      } catch (error) {
        // A refused anchor is the engine's answer too: count it, named.
        rows.push({ framework, id, file, outcome: "error", reason: error instanceof Error ? error.message : String(error), stops: [], ends: [], want, correct: false });
        return;
      }
      const boxes = graph.nodes.filter((node) => node.kind !== "scope");
      if (verbose) for (const node of boxes) process.stdout.write(`    ${node.kind} ${node.elementKind ?? "-"} ${node.reason ?? ""} ${node.file}:${node.line} ${JSON.stringify(node.label.slice(0, 50))}\n`);
      rows.push({
        framework,
        id,
        file,
        outcome: graph.outcome,
        reason: graph.reason,
        stops: boxes.filter((node) => node.kind === "frontier" || node.kind === "boundary").map((node) => `${node.kind} ${node.reason}/${node.elementKind ?? "-"} ${node.file}:${node.line} "${node.label.slice(0, 40)}"`),
        // Backward, a literal or a parameter a library fills is where a value begins (R16): it counts as an end.
        ends: boxes.filter((node) => node.kind === "terminal" || node.kind === "origin" || (direction !== "forward" && (node.elementKind === "literal" || node.elementKind === "parameter"))).map((node) => `${node.elementKind}@${node.line}`),
        want,
        correct: false,
      });
      const row = rows[rows.length - 1];
      // Correct: it lands, and at the end the pattern names (`@want kind|kind`).
      row.correct = (row.outcome === "ok" || row.outcome === "assumed") && row.ends.some((end) => want.includes(end.split("@")[0]));
    });
  }
}

for (const row of rows) {
  const mark = row.outcome === "ok" && row.correct ? "✓" : row.correct ? "~" : "✗";
  process.stdout.write(`${mark} ${`${row.framework}/${row.id}`.padEnd(32)} ${row.outcome.padEnd(9)} ends=[${row.ends.join(",")}] want=${row.want.join("|")}${row.reason ? ` (${row.reason})` : ""}\n`);
  if (mark !== "✓") for (const stop of row.stops) process.stdout.write(`      ${stop}\n`);
}
process.stdout.write("\n| Framework | Patterns | ok | assumed | partial | correct end |\n| --- | ---: | ---: | ---: | ---: | ---: |\n");
for (const framework of [...new Set(rows.map((row) => row.framework)), "all"]) {
  const own = rows.filter((row) => framework === "all" || row.framework === framework);
  const count = (outcome: string) => own.filter((row) => row.outcome === outcome).length;
  process.stdout.write(`| ${framework} | ${own.length} | ${count("ok")} | ${count("assumed")} | ${own.length - count("ok") - count("assumed")} | ${own.filter((row) => row.correct).length} |\n`);
}
const out = flag("--json");
if (out) fs.writeFileSync(out, `${JSON.stringify(rows, null, 1)}\n`);
