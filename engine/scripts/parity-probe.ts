// The ledger and the anchor graph must give one answer for every expression a
// user can select. This walks every selectable expression in a fixture root
// (each caret position on each line, sent as the client sends it: the graph
// gets the URL's file and span, the ledger also the candidate's text) and compares the two: the outcome, each stop's reason
// and line, the ends, and that every ledger step is an edge the graph drew,
// into the box the row names. A refusal must be a named engine error on both
// sides; a crash is a failure. The fixture annotations test only the anchors they
// name; on 2026-11-23 those all agreed while 145 of 6,032 selections did not.
//
//   pnpm parity-probe                          # value-flow-basics and python-anchors
//   pnpm parity-probe --root examples/value-flow-js
//   pnpm parity-probe --root ../server --language python
//
// Exits 1 when any selection differs, and lists the first 40.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { selectExpressionOp, valueFlowOp } from "../src/srcly/ops/value-flow";
import { createEngineSession, requireTypescript } from "../src/srcly/session";
import { chooseTypescript } from "../src/srcly/typescript-choice";
import type { Span } from "../src/srcly/selection";
import { EngineError } from "../src/srcly/protocol";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flag = (name: string) => (process.argv.indexOf(name) > 0 ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const roots = flag("--root") ? [flag("--root")!] : ["examples/value-flow-basics", "examples/value-flow-js", "examples/python-anchors"];

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
    // Only a refusal a client is told to expect counts as agreement; anything else is a crash.
    return error instanceof EngineError && REFUSALS.has(error.code) ? `refused ${error.code}` : `CRASH ${(error as Error).message.slice(0, 120)}`;
  }
}

/** A proof list as a client reads it: each proof's kind, words and status. */
const witness = (proofs: readonly ({ kind: string; detail?: string; status?: string } | null)[]) => JSON.stringify(proofs.filter(Boolean).map((proof) => [proof!.kind, proof!.detail, proof!.status]));

const REFUSALS = new Set(["unsupported-selection", "budget-exhausted", "not-found"]);

const inside = (inner: Span, outer: Span) =>
  (inner.startLine > outer.startLine || (inner.startLine === outer.startLine && inner.startColumn >= outer.startColumn)) &&
  (inner.endLine < outer.endLine || (inner.endLine === outer.endLine && inner.endColumn <= outer.endColumn));

let failed = false;
for (const name of roots) {
  const root = path.resolve(ENGINE, name);
  // --language python for a Python folder with no pyproject.toml.
  const isPython = flag("--language") ? flag("--language") === "python" : fs.existsSync(path.join(root, "pyproject.toml")) && !fs.existsSync(path.join(root, "tsconfig.json"));
  const source = isPython || !fs.existsSync(path.join(root, "src")) ? root : path.join(root, "src");
  if (isPython && !python()) {
    console.log(`${name}: skipped, no Python with mypy (set SRCLY_PYTHON or run \`uv sync\` in server/)`);
    // A root asked for by name must run.
    failed ||= Boolean(flag("--root"));
    continue;
  }
  const session = isPython
    ? createEngineSession({ root, source, tsconfig: null, typescriptFrom: ENGINE, language: "python", python: python()! })
    : createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
  // Every file a selection can land in: the Program's own files under the root (declarations outside `src` included), or the Python sources.
  const tier1 = session.tier1();
  const inRoot = (absolute: string) => !path.relative(root, absolute).startsWith("..") && !absolute.includes(`${path.sep}node_modules${path.sep}`);
  const files = (tier1.language === "typescript"
    ? requireTypescript(tier1, "the parity probe").program.getSourceFiles().map((sourceFile) => path.resolve(sourceFile.fileName)).filter(inRoot)
    : fs.readdirSync(source, { recursive: true }).map(String).filter((file) => file.endsWith(".py")).map((file) => path.join(source, file)).filter(inRoot)
  ).map((absolute) => path.relative(root, absolute).split(path.sep).join("/"));
  let count = 0;
  const differ: string[] = [];
  for (const file of files) {
    const seen = new Set<string>();
    // The compiler drops a byte-order mark, so columns count from after it.
    fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "").split("\n").forEach((code, index) => {
      const line = index + 1;
      // Every caret position a click can land on, the end of the line included.
      for (let column = 1; column <= code.length + 1; column += 1) {
        const caret = { startLine: line, startColumn: column, endLine: line, endColumn: column };
        let candidates: ReturnType<typeof selectExpressionOp>["candidates"];
        try {
          candidates = selectExpressionOp(session, { file, span: caret }).candidates;
        } catch (error) {
          // A file the session does not hold (a declaration file outside the Program) has nothing to select.
          if (error instanceof EngineError && error.code === "not-found") break;
          throw error;
        }
        for (const candidate of candidates) {
          const key = JSON.stringify(candidate.span);
          if (seen.has(key)) continue;
          seen.add(key);
          count += 1;
          const selection = { file, span: candidate.span, text: candidate.text };
          let boxes = new Map<string, { file: string; span: Span }>();
          let edges = new Map<string, { source: string; target: string; status: string; proof: ({ kind: string; detail?: string; status?: string } | null)[] }>();
          const graph = answer(() => {
            const result = anchorGraphOp(session, { file, span: candidate.span, direction: "forward" });
            edges = new Map(result.edges.map((edge) => [edge.id, edge]));
            boxes = new Map(result.nodes.map((node) => [node.id, node]));
            const anchor = result.nodes.find((node) => node.kind === "anchor");
            return {
              outcome: result.outcome,
              stops: result.nodes.filter((node) => node.kind === "frontier" || (node.kind === "boundary" && node.status !== "proven")).map((node) => `${node.reason}@${node.file}:${node.line}`),
              // A value that ends where it is selected also lands at the anchor.
              ends: [...result.nodes.filter((node) => node.kind === "terminal").map((node) => node.id), ...(anchor?.note?.startsWith("ends here") ? [anchor.id] : [])],
            };
          });
          const ledger = answer(() => {
            const result = valueFlowOp(session, selection);
            const rows = new Map(result.rows.map((row) => [row.id, row]));
            const problems: string[] = [];
            // The selection's own parts come right after the input, inside its span, before any step.
            let parts = true;
            for (const row of result.rows.slice(1)) {
              const edge = row.relationId ? edges.get(row.relationId) : undefined;
              // A part's proof is the syntax itself (or none, where an evidence element sits at its span); a step carries a relation's proof.
              // A part with no proof stands on an evidence element at its own span.
              const element = row.elementId ? tier1.provider().factIndex.getElement(row.elementId) : undefined;
              const part = !row.relationId && ["fallback", "branch", "transform", "transfer"].includes(row.kind) && row.file === result.selection.file && inside(row.span, result.selection.span) &&
                (row.proof.length ? row.proof.every((proof) => proof.kind === "syntax") : !!element && element.location.file === row.file && JSON.stringify(element.location.span) === JSON.stringify(row.span));
              if (!part) parts = false;
              if (row.relationId && !edge) problems.push(`row ${row.label} has an edge the graph did not draw`);
              else if (edge && edge.target !== row.elementId) problems.push(`row ${row.label} names a box its edge does not reach`);
              else if (edge && row.kind !== "boundary" && (boxes.get(edge.target)?.file !== row.file || JSON.stringify(boxes.get(edge.target)?.span) !== JSON.stringify(row.span))) problems.push(`row ${row.label} is not where its box is`);
              // A step says what its edge proves: the same status (structural reads as partial) and the same proofs.
              else if (edge && row.kind !== "boundary" && (row.status !== (edge.status === "proven" ? "proven" : edge.status === "unsupported" ? "unsupported" : "partial") || witness(row.proof) !== witness(edge.proof))) problems.push(`row ${row.label} does not say what its edge proves`);
              // Without an edge: a stop, an end at the input, or a part of the selection listed before any step.
              else if (!edge && row.kind !== "boundary" && !(row.kind === "terminal" && row.elementId === result.rows[0].elementId) && !(part && parts)) problems.push(`row ${row.label} is a step with no edge`);
            }
            const stopRows = new Set(result.rows.filter((row) => row.kind === "boundary").map((row) => row.id));
            if (result.frontiers.length !== stopRows.size || result.frontiers.some((stop) => !stopRows.has(stop.rowId))) problems.push("the frontiers list is not the stop rows");
            // The ends the client counts are the terminal rows.
            const terminalRows = new Set(result.rows.filter((row) => row.kind === "terminal").map((row) => row.id));
            if (result.terminals.length !== terminalRows.size || result.terminals.some((id) => !terminalRows.has(id))) problems.push("the terminals list is not the terminal rows");
            return {
              outcome: result.outcome,
              // Every stop row, one for one with the graph's stops; the frontiers list must name exactly those rows.
              stops: result.rows.filter((row) => row.kind === "boundary").map((row) => `${row.reason}@${row.file}:${row.line}`),
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
