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
// of its ends is a wanted element kind: landing somewhere else is not. That
// score accepts any wanted end, so it does not show the path was right; the
// exact claims live in the annotated fixtures (`value-flow-basics`, `value-flow-js`).
//
// Every `@trace` counts. One the run cannot try is `skipped` (its root has no
// library types) or `refused` (the engine answered with an error), never left
// out, and each row names its language so actual JavaScript stays apart from
// TypeScript.

type Row = { framework: string; language: "ts" | "js"; id: string; file: string; outcome: string; reason?: string | null; stops: string[]; ends: string[]; want: string[]; correct: boolean };

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const only = flag("--only");
const verbose = args.includes("-v");
const catalog = fileURLToPath(new URL("../examples/pattern-catalog", import.meta.url));
const rows: Row[] = [];
// These roots have no library types to grade against, so they need no `node_modules`.
const NEEDS_NO_LIBRARIES = new Set(["vanilla", "javascript"]);
const SOURCE = /\.[cm]?[jt]sx?$/;
const TRACE = /@trace\s+(\S+)\s+(forward|backward|both)\s+(.*?)(?:\s+@want\s+(\S+))?\s*$/;
const languageOf = (name: string) => (/\.[cm]?jsx?$/.test(name) ? "js" as const : "ts" as const);
const sources = (src: string) => fs.readdirSync(src).filter((item) => SOURCE.test(item) && !/\.d\.[cm]?ts$/.test(item)).sort();

for (const framework of fs.readdirSync(catalog).filter((name) => fs.statSync(path.join(catalog, name)).isDirectory()).sort()) {
  const root = path.join(catalog, framework);
  const src = path.join(root, "src");
  if (!NEEDS_NO_LIBRARIES.has(framework) && !fs.existsSync(path.join(root, "node_modules"))) {
    process.stderr.write(`${framework}: skipped, no node_modules (see examples/pattern-catalog/README.md)\n`);
    for (const name of sources(src)) {
      for (const line of fs.readFileSync(path.join(src, name), "utf8").split("\n")) {
        const match = TRACE.exec(line);
        if (match && (!only || match[1] === only)) rows.push({ framework, language: languageOf(name), id: match[1], file: `src/${name}`, outcome: "skipped", reason: "no node_modules", stops: [], ends: [], want: match[4]?.split("|") ?? [], correct: false });
      }
    }
    continue;
  }
  const session = createEngineSession({ root, source: src, tsconfig: null, typescriptFrom: chooseTypescript(root, src).from });
  for (const name of sources(src)) {
    const file = `src/${name}`;
    const language = languageOf(name);
    const lines = fs.readFileSync(path.join(src, name), "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = TRACE.exec(line);
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
        rows.push({ framework, language, id, file, outcome: "error", reason: error instanceof Error ? error.message : String(error), stops: [], ends: [], want, correct: false });
        return;
      }
      const boxes = graph.nodes.filter((node) => node.kind !== "scope");
      if (verbose) for (const node of boxes) process.stdout.write(`    ${node.kind} ${node.elementKind ?? "-"} ${node.reason ?? ""} ${node.file}:${node.line} ${JSON.stringify(node.label.slice(0, 50))}\n`);
      rows.push({
        framework,
        language,
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
process.stdout.write("\n| Framework | Patterns | Skipped | Refused | ok | assumed | partial | any wanted end |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n");
const line = (name: string, own: Row[]) => {
  const count = (outcome: string) => own.filter((row) => row.outcome === outcome).length;
  const tried = own.length - count("skipped") - count("error");
  process.stdout.write(`| ${name} | ${own.length} | ${count("skipped")} | ${count("error")} | ${count("ok")} | ${count("assumed")} | ${tried - count("ok") - count("assumed")} | ${own.filter((row) => row.correct).length} |\n`);
};
for (const framework of new Set(rows.map((row) => row.framework))) line(framework, rows.filter((row) => row.framework === framework));
line("all", rows);
line("actual JS", rows.filter((row) => row.language === "js"));
const out = flag("--json");
if (out) fs.writeFileSync(out, `${JSON.stringify(rows, null, 1)}\n`);
