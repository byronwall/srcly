import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnchorEdge, AnchorGraphResult, AnchorNode } from "../../src/srcly/contracts/anchor-graph";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";

// Fixture annotations: a fixture states what its traces must do in comments,
// on the lines they are about, and this one test checks every claim. A
// comment after code is about its own line; a comment alone on its line (in
// JSX, `{/* … */}`) is about the next line of code. Ids are unique across the
// fixture folder; `<ids>` is one id or several joined by commas.
//
//   @trace <id> <forward|backward|both> <text>   anchor at `text` on this line
//   @trace <id> <direction> symbol <name>        anchor at the symbol `name` declared on this line
//   @outcome <ids> <ok|assumed|partial|unsupported>
//   @reaches <ids> [elementKind]                 a terminal (or origin) on this line
//   @stop <ids> <reason> [elementKind]           a frontier or boundary on this line
//   @visits <ids> [elementKind] [status]         some box on this line
//   @never-reaches <ids> [elementKind]           no box on this line
//   @edge <ids> <kind|*> <status|*> [proofKind]  some edge matches (anywhere)
//   @no-edge <ids> <kind|*> <status|*> [proofKind]  no edge matches
//
// `@reaches` and `@stop` are exhaustive: a trace's every terminal and origin must be
// claimed by a `@reaches`, and its every frontier and boundary by a `@stop`.
// A trace with neither claims none. A claim about a box takes an optional
// `"label"` (no spaces) the box must carry. In a pattern, `*` matches anything and
// `!x` anything but `x`.

const FIXTURES = fileURLToPath(new URL("../../examples/value-flow-basics", import.meta.url));
const KEYWORDS = ["trace", "outcome", "reaches", "stop", "visits", "never-reaches", "edge", "no-edge"] as const;
type Keyword = (typeof KEYWORDS)[number];
type Annotation = { keyword: Keyword; args: string[]; label?: string; rest: string; file: string; line: number; code: string };
type Trace = { id: string; file: string; line: number; code: string; direction: string; text: string | null; symbol: string | null; claims: Annotation[] };

const COMMENT = new RegExp(`(?:\\/\\/|\\/\\*)\\s*(@(?:${KEYWORDS.join("|")})\\b.*?)\\s*(?:\\*\\/|$)`, "g");
const SPLIT = new RegExp(`\\s+(?=@(?:${KEYWORDS.join("|")})\\b)`);

function readAnnotations(root: string): Annotation[] {
  const found: Annotation[] = [];
  const src = path.join(root, "src");
  for (const name of fs.readdirSync(src).filter((item) => /\.tsx?$/.test(item)).sort()) {
    const file = `src/${name}`;
    const lines = fs.readFileSync(path.join(src, name), "utf8").split("\n");
    const code = (text: string) => text.slice(0, text.search(COMMENT) < 0 ? text.length : text.search(COMMENT));
    // A line with only annotations (or `{` before one) is about the next line that has code.
    const alone = (text: string) => code(text).trim() === "" || code(text).trim() === "{";
    lines.forEach((text, index) => {
      COMMENT.lastIndex = 0;
      for (const match of text.matchAll(COMMENT)) {
        let target = index;
        if (alone(text)) {
          target = index + 1;
          while (target < lines.length && (alone(lines[target]) || !lines[target].trim())) target++;
        }
        for (const part of match[1].split(SPLIT)) {
          const [head, ...args] = part.trim().split(/\s+/);
          const keyword = head.slice(1) as Keyword;
          found.push({ keyword, args, rest: part.trim().slice(head.length).trim(), file, line: target + 1, code: code(lines[target] ?? "") });
        }
      }
    });
  }
  return found;
}

function collectTraces(annotations: Annotation[]): Trace[] {
  const traces = new Map<string, Trace>();
  for (const item of annotations.filter((a) => a.keyword === "trace")) {
    const [id, direction, ...rest] = item.args;
    if (traces.has(id)) throw new Error(`${item.file}:${item.line} @trace ${id}: the id is already used at ${traces.get(id)!.file}:${traces.get(id)!.line}`);
    if (!["forward", "backward", "both"].includes(direction)) throw new Error(`${item.file}:${item.line} @trace ${id}: unknown direction ${direction}`);
    const symbol = rest[0] === "symbol" && rest.length === 2 ? rest[1] : null;
    const text = symbol ? null : item.rest.slice(item.rest.indexOf(direction) + direction.length).trim();
    traces.set(id, { id, file: item.file, line: item.line, code: item.code, direction, text, symbol, claims: [] });
  }
  for (const item of annotations.filter((a) => a.keyword !== "trace")) {
    for (const id of (item.args[0] ?? "").split(",")) {
      const trace = traces.get(id);
      if (!trace) throw new Error(`${item.file}:${item.line} @${item.keyword} names ${id || "no trace"}, which no @trace declares`);
      const args = item.args.slice(1);
      const label = args.find((arg) => /^".*"$/.test(arg));
      trace.claims.push({ ...item, args: args.filter((arg) => arg !== label), label: label?.slice(1, -1) });
    }
  }
  return [...traces.values()];
}

const boxes = (graph: AnchorGraphResult) => graph.nodes.filter((node) => node.kind !== "scope");
const at = (node: AnchorNode) => `${node.file}:${node.line}`;
const where = (claim: Annotation) => `${claim.file}:${claim.line}`;
const describeNode = (node: AnchorNode) => `${at(node)} ${node.kind}${node.reason ? ` ${node.reason}` : ""} ${node.elementKind ?? "-"} "${node.label}"`;
/** `*` matches anything; `!x` anything but `x`. */
const fits = (value: string | null | undefined, pattern: string | undefined) =>
  !pattern || pattern === "*" || (pattern.startsWith("!") ? value !== pattern.slice(1) : value === pattern);
const edgeMatches = (edge: AnchorEdge, [kind, status, proof]: string[]) => fits(edge.kind, kind) && fits(edge.status, status) && (!proof || edge.proof.some((item) => item?.kind === proof));

/** Every claim the trace's graph breaks, each naming the fixture line that claims it. */
function check(trace: Trace, graph: AnchorGraphResult): string[] {
  const failures: string[] = [];
  const claims = (keyword: Keyword) => trace.claims.filter((claim) => claim.keyword === keyword);
  for (const claim of claims("outcome")) {
    if (graph.outcome !== claim.args[0]) failures.push(`${where(claim)} @outcome ${claim.args[0]}: the trace is ${graph.outcome}${graph.reason ? ` (${graph.reason})` : ""}`);
  }
  const exhaustive = (keyword: "reaches" | "stop", nodes: AnchorNode[], matches: (node: AnchorNode, claim: Annotation) => boolean) => {
    const own = claims(keyword);
    for (const claim of own) {
      if (!nodes.some((node) => matches(node, claim))) failures.push(`${where(claim)} @${keyword} ${claim.args.join(" ")}: nothing matches here; the trace has ${nodes.map(describeNode).join(", ") || "none"}`);
    }
    for (const node of nodes) {
      if (!own.some((claim) => matches(node, claim))) failures.push(`${describeNode(node)}: no @${keyword} claims it`);
    }
  };
  const sameLine = (node: AnchorNode, claim: Annotation) => node.file === claim.file && node.line === claim.line && (claim.label === undefined || node.label === claim.label);
  exhaustive("reaches", boxes(graph).filter((node) => node.kind === "terminal" || node.kind === "origin"), (node, claim) => sameLine(node, claim) && fits(node.elementKind, claim.args[0]));
  exhaustive(
    "stop",
    boxes(graph).filter((node) => node.kind === "frontier" || node.kind === "boundary"),
    (node, claim) => sameLine(node, claim) && fits(node.reason, claim.args[0]) && fits(node.elementKind, claim.args[1]),
  );
  for (const claim of claims("visits")) {
    if (!boxes(graph).some((node) => sameLine(node, claim) && fits(node.elementKind, claim.args[0]) && fits(node.status, claim.args[1]))) {
      failures.push(`${where(claim)} @visits ${claim.args.join(" ")}: no box here; on this line: ${boxes(graph).filter((node) => sameLine(node, claim)).map(describeNode).join(", ") || "none"}`);
    }
  }
  for (const claim of claims("never-reaches")) {
    const here = boxes(graph).filter((node) => sameLine(node, claim) && fits(node.elementKind, claim.args[0]));
    if (here.length) failures.push(`${where(claim)} @never-reaches: the trace draws ${here.map(describeNode).join(", ")}`);
  }
  for (const claim of claims("edge")) {
    if (!graph.edges.some((edge) => edgeMatches(edge, claim.args))) failures.push(`${where(claim)} @edge ${claim.args.join(" ")}: no edge matches; edges: ${[...new Set(graph.edges.map((edge) => `${edge.kind}/${edge.status}`))].join(", ")}`);
  }
  for (const claim of claims("no-edge")) {
    const hit = graph.edges.filter((edge) => edgeMatches(edge, claim.args));
    if (hit.length) failures.push(`${where(claim)} @no-edge ${claim.args.join(" ")}: ${hit.map((edge) => `${edge.kind}/${edge.status}`).join(", ")} matches`);
  }
  return failures;
}

function anchorFor(trace: Trace) {
  const direction = trace.direction as "forward";
  if (trace.symbol) return { file: trace.file, name: trace.symbol, line: trace.line, direction };
  const column = trace.code.indexOf(trace.text!) + 1;
  if (column < 1) throw new Error(`${trace.file}:${trace.line} @trace ${trace.id}: \`${trace.text}\` is not on this line`);
  return { file: trace.file, text: trace.text!, span: { startLine: trace.line, startColumn: column, endLine: trace.line, endColumn: column + trace.text!.length }, direction };
}

describe("fixture annotations in value-flow-basics", () => {
  const source = path.join(FIXTURES, "src");
  const session = createEngineSession({ root: FIXTURES, source, tsconfig: null, typescriptFrom: chooseTypescript(FIXTURES, source).from });
  const traces = collectTraces(readAnnotations(FIXTURES));

  it("declares traces", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  it.each(traces.map((trace) => [`${trace.file}:${trace.line} ${trace.id} (${trace.direction} ${trace.symbol ?? trace.text})`, trace] as const))("%s", (_name, trace) => {
    const graph = anchorGraphOp(session, anchorFor(trace));
    expect(check(trace, graph), `${trace.file}:${trace.line} @trace ${trace.id}`).toEqual([]);
  }, 60_000);
});
