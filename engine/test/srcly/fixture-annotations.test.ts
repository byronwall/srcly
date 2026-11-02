import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnchorEdge, AnchorGraphResult, AnchorNode } from "../../src/srcly/contracts/anchor-graph";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
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
//   @path <ids> "from" "to"                      the graph has a route from one box to the other
//   @no-path <ids> "from" "to"                   it has none
//
// `@reaches` and `@stop` are exhaustive: a trace's every terminal and origin must be
// claimed by a `@reaches`, and its every frontier and boundary by a `@stop`.
// A trace with neither claims none. A claim about a box takes an optional
// `"label"`, last, the box must carry. In a pattern, `*` matches anything and
// `!x` anything but `x`.
//
// `@path` and `@no-path` catch a wrong route to an end a trace may reach. Each
// label is a box's exact label. A label on several lines is read on the
// claim's own line, and still several lines is a failure, never a guess. The
// `from` box must be drawn, and a label that is not in the fixture's text is a
// failure too, so a typo cannot pass a `@no-path`.

const example = (name: string) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));
// `value-flow-basics` is typed; `value-flow-js` is actual JavaScript, kept apart so a `.ts` twin cannot stand in for a `.js` file.
const ROOTS = ["value-flow-basics", "value-flow-js"];
const KEYWORDS = ["trace", "outcome", "reaches", "stop", "visits", "never-reaches", "edge", "no-edge", "path", "no-path"] as const;
type Keyword = (typeof KEYWORDS)[number];
type Annotation = { keyword: Keyword; args: string[]; label?: string; route?: [string, string]; rest: string; file: string; line: number; code: string };
type Trace = { id: string; file: string; line: number; code: string; direction: string; text: string | null; symbol: string | null; claims: Annotation[] };

const COMMENT = new RegExp(`(?:\\/\\/|\\/\\*)\\s*(@(?:${KEYWORDS.join("|")})\\b.*?)\\s*(?:\\*\\/|$)`, "g");
const SPLIT = new RegExp(`\\s+(?=@(?:${KEYWORDS.join("|")})\\b)`);

function readAnnotations(root: string): Annotation[] {
  const found: Annotation[] = [];
  const src = path.join(root, "src");
  for (const name of fs.readdirSync(src).filter((item) => /\.[cm]?[jt]sx?$/.test(item)).sort()) {
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
      if (item.keyword === "path" || item.keyword === "no-path") {
        const route = /\s"([^"]+)"\s+"([^"]+)"$/.exec(item.rest);
        if (!route) throw new Error(`${item.file}:${item.line} @${item.keyword}: write "from" "to"`);
        trace.claims.push({ ...item, args: [], route: [route[1], route[2]] });
        continue;
      }
      // A label is the claim's last word, quoted, and may hold spaces: `"new Error(text)"`.
      const quoted = /(?:^|\s)"(.*)"$/.exec(item.rest);
      const args = (quoted ? item.rest.slice(0, quoted.index) : item.rest).trim().split(/\s+/).slice(1);
      trace.claims.push({ ...item, args, label: quoted?.[1] });
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

/** The boxes a label names, or why it names none: same-line boxes are one point of the code (a call and the effect it ends at). */
function endpoint(graph: AnchorGraphResult, claim: Annotation, label: string): AnchorNode[] | string {
  const named = boxes(graph).filter((node) => node.label === label);
  const lines = new Set(named.map(at));
  const here = lines.size > 1 ? named.filter((node) => at(node) === where(claim)) : named;
  if (lines.size > 1 && here.length === 0) return `"${label}" is on ${[...lines].join(", ")}, so it names no one box from this line`;
  return here;
}

/** Whether the graph's edges lead from one set of boxes to the other, in the direction the value moves. */
function routeExists(graph: AnchorGraphResult, from: AnchorNode[], to: AnchorNode[]): boolean {
  const ends = new Set(to.map((node) => node.id));
  const seen = new Set(from.map((node) => node.id));
  const queue = [...seen];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (ends.has(id)) return true;
    for (const edge of graph.edges) {
      if (edge.source === id && !seen.has(edge.target)) {
        seen.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return false;
}

function checkRoutes(claims: Annotation[], graph: AnchorGraphResult, source: (file: string) => string): string[] {
  const failures: string[] = [];
  for (const claim of claims) {
    const [from, to] = claim.route!;
    const name = `${where(claim)} @${claim.keyword} "${from}" "${to}"`;
    const missing = [from, to].filter((label) => !source(claim.file).includes(label));
    if (missing.length) {
      failures.push(`${name}: ${missing.map((label) => `"${label}"`).join(", ")} is not in the fixture`);
      continue;
    }
    const start = endpoint(graph, claim, from);
    const end = endpoint(graph, claim, to);
    for (const item of [start, end]) if (typeof item === "string") failures.push(`${name}: ${item}`);
    if (typeof start === "string" || typeof end === "string") continue;
    if (start.length === 0) failures.push(`${name}: no box is labelled "${from}"; the trace draws ${boxes(graph).map(describeNode).join(", ")}`);
    else if (claim.keyword === "path" && end.length === 0) failures.push(`${name}: no box is labelled "${to}"; the trace draws ${boxes(graph).map(describeNode).join(", ")}`);
    else if (routeExists(graph, start, end) !== (claim.keyword === "path")) failures.push(`${name}: ${claim.keyword === "path" ? "no route joins them" : "a route joins them"}; edges: ${graph.edges.map((edge) => `${edge.kind}/${edge.status}`).join(", ")}`);
  }
  return failures;
}

/** Every claim the trace's graph breaks, each naming the fixture line that claims it. */
function check(trace: Trace, graph: AnchorGraphResult, source: (file: string) => string): string[] {
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
  failures.push(...checkRoutes([...claims("path"), ...claims("no-path")], graph, source));
  return failures;
}

function anchorFor(trace: Trace) {
  const direction = trace.direction as "forward";
  if (trace.symbol) return { file: trace.file, name: trace.symbol, line: trace.line, direction };
  const column = trace.code.indexOf(trace.text!) + 1;
  if (column < 1) throw new Error(`${trace.file}:${trace.line} @trace ${trace.id}: \`${trace.text}\` is not on this line`);
  return { file: trace.file, text: trace.text!, span: { startLine: trace.line, startColumn: column, endLine: trace.line, endColumn: column + trace.text!.length }, direction };
}

describe.each(ROOTS)("fixture annotations in %s", (name) => {
  const root = example(name);
  const source = path.join(root, "src");
  const session = createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
  const traces = collectTraces(readAnnotations(root));
  const text = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

  it("declares traces", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  it("has every fixture file in its Program", () => {
    const tier1 = requireTypescript(session.tier1(), "the fixture check");
    const absent = [...new Set(traces.map((trace) => trace.file))].filter((file) => !tier1.program.getSourceFile(path.join(root, file)));
    expect(absent).toEqual([]);
  });

  it.each(traces.map((trace) => [`${trace.file}:${trace.line} ${trace.id} (${trace.direction} ${trace.symbol ?? trace.text})`, trace] as const))("%s", (_name, trace) => {
    const graph = anchorGraphOp(session, anchorFor(trace));
    expect(check(trace, graph, text), `${trace.file}:${trace.line} @trace ${trace.id}`).toEqual([]);
  }, 60_000);
});

// A trace can end where it may and still get there the wrong way: `a → c → end` with `a → b → end` claimed.
describe("route claims", () => {
  const node = (id: string, line: number): AnchorNode => ({ id, label: id, file: "f.ts", line, kind: "value" }) as AnchorNode;
  const graph = (edges: [string, string][]) => ({
    nodes: [node("a", 1), node("b", 2), node("c", 3), node("end", 4)],
    edges: edges.map(([source, target]) => ({ source, target, kind: "references", status: "proven", proof: [], label: null })),
  }) as unknown as AnchorGraphResult;
  const claim = (keyword: "path" | "no-path", from: string, to: string, line = 9): Annotation => ({ keyword, args: [], route: [from, to], rest: "", file: "f.ts", line, code: "" });
  const trace = (...claims: Annotation[]): Trace => ({ id: "t", file: "f.ts", line: 1, code: "", direction: "forward", text: "a", symbol: null, claims });
  const source = () => "a b c end";

  it("passes a route that is there and a forbidden one that is not", () => {
    expect(check(trace(claim("path", "a", "end"), claim("no-path", "c", "end")), graph([["a", "b"], ["b", "end"]]), source)).toEqual([]);
  });

  it("fails a wrong route to an end the trace may reach", () => {
    expect(check(trace(claim("no-path", "c", "end")), graph([["a", "c"], ["c", "end"]]), source)).toEqual([expect.stringContaining("a route joins them")]);
  });

  it("fails a label on several lines rather than guess", () => {
    const twice = graph([]);
    twice.nodes.push({ ...node("x", 5), label: "a" });
    expect(check(trace(claim("no-path", "a", "end")), twice, source)).toEqual([expect.stringContaining("names no one box")]);
  });

  it("fails a label the fixture does not have, so a typo cannot pass", () => {
    expect(check(trace(claim("no-path", "a", "ned")), graph([]), source)).toEqual([expect.stringContaining("not in the fixture")]);
  });
});
