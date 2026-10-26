import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AnchorGraphResult, AnchorNode } from "../../src/srcly/contracts/anchor-graph";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import type { PythonTier1 } from "../../src/srcly/python/session";
import { createEngineSession } from "../../src/srcly/session";
import { engineRoot } from "./engine-process";
import { pythonForTests } from "./python-env";

const example = path.join(engineRoot, "examples/python-anchors");
const python = pythonForTests();

const boxes = (graph: AnchorGraphResult, kind?: AnchorNode["kind"]) => graph.nodes.filter((node) => node.kind !== "scope" && node.kind !== "anchor" && (!kind || node.kind === kind));

/** The span of `text` on the first line of `file` that contains `marker`. */
function at(file: string, text: string, marker: string) {
  const lines = fs.readFileSync(path.join(example, file), "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes(marker));
  if (index < 0) throw new Error(`${marker} is not in ${file}`);
  const column = lines[index].indexOf(text) + 1;
  return { file, text, span: { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length } };
}

/** Every top-level and nested `def` / `class` line, as the import graph and the survey name them. */
function definitions(file: string) {
  return fs.readFileSync(path.join(example, file), "utf8").split("\n").flatMap((text, index) => {
    const match = /^\s*(?:async\s+)?(?:def|class)\s+(\w+)/.exec(text);
    return match ? [{ file, name: match[1], line: index + 1 }] : [];
  });
}

describe.skipIf(!python.python)(`Python anchors by name (${python.reason})`, () => {
  const session = createEngineSession({ root: example, source: example, tsconfig: null, typescriptFrom: engineRoot, language: "python", python: python.python });
  const anchor = (file: string, name: string, line: number) => anchorGraphOp(session, { file, name, line, direction: "both" });

  it("anchors every def and class by name, whatever its shape", () => {
    const all = ["app/deps.py", "app/models.py", "app/service.py", "app/identity.py"].flatMap(definitions);
    expect(all.map((item) => item.name)).toEqual(expect.arrayContaining(["get_ledger", "parse_count", "load_count", "made_in_loop", "Order", "Ledger", "__init__", "Unused"]));
    for (const item of all) {
      const graph = anchor(item.file, item.name, item.line);
      expect(graph.anchor.kind, `${item.name} on line ${item.line}`).toMatch(/^(FunctionDef|ClassDef)$/);
      expect(graph.nodes.find((node) => node.kind === "anchor")?.elementKind, item.name).toBe("function-entry");
    }
  }, 120_000);

  it("reads a file with Python 3.14's unparenthesized except, typed by the checker", () => {
    const tier1 = session.tier1() as PythonTier1;
    expect(tier1.facts.fileGaps.map((gap) => gap.file)).toEqual(["app/broken.py"]);
    const deps = tier1.facts.expressions["app/deps.py"];
    // mypy checked the same rewritten text: the call inside the try has its checked type.
    expect(deps.find((entry) => entry.t === "int(text)")).toMatchObject({ ty: "int", ts: "mypy" });
    // Columns before the rewritten parenthesis are the file's own.
    expect(deps.find((entry) => entry.k === "FunctionDef" && entry.n === "parse_count")?.s).toEqual([13, 5, 13, 16]);
    // A string that looks like the clause is left alone.
    expect(deps.find((entry) => entry.t.startsWith("f\"{kind}"))).toBeUndefined();
    expect(fs.readFileSync(path.join(example, "app/deps.py"), "utf8")).toContain('message = "except ValueError, TypeError:"');
  });

  it("anchors a class: its constructor calls are where it is used, and instances flow on from them", () => {
    const graph = anchor("app/models.py", "Order", 4);
    expect(graph.anchor).toMatchObject({ kind: "ClassDef", text: "Order", typeText: "type[Order]" });
    expect(graph.nodes.find((node) => node.kind === "anchor")).toMatchObject({ detail: "class", elementKind: "function-entry" });
    const uses = boxes(graph).filter((node) => node.note === "called here");
    expect(uses.map((node) => `${node.label} ${node.file}:${node.line}`).sort()).toEqual(["Order(…) app/service.py:15", "Order(…) app/service.py:5"]);
    // The instance is returned from `place`, which nothing calls: it leaves the program there.
    expect(graph.terminals.map((terminal) => terminal.label)).toContain("return order");
  });

  it("never takes a method's parameters for a class's inputs", () => {
    // Order's first method is `scaled(factor)`; Ledger's is `describe(prefix)`, before `__init__`.
    for (const [name, line, method] of [["Order", 4, "factor"], ["Ledger", 12, "prefix"]] as const) {
      const graph = anchor("app/models.py", name, line);
      expect(boxes(graph).map((node) => node.label), name).not.toContain(method);
      expect(boxes(graph).filter((node) => node.elementKind === "parameter"), name).toEqual([]);
    }
  });

  it("relates each constructor call to its class, and nothing else", () => {
    const graph = anchor("app/models.py", "Ledger", 12);
    const uses = boxes(graph).filter((node) => node.note === "called here");
    expect(uses.map((node) => `${node.file}:${node.line}`).sort()).toEqual(["app/deps.py:8", "app/service.py:10"]);
    expect(boxes(anchor("app/models.py", "Unused", 20)).filter((node) => node.note === "called here")).toEqual([]);
  });

  it("anchors a generator and a decorated def from the rewritten file", () => {
    const parse = anchor("app/deps.py", "parse_count", 13);
    expect(parse.anchor).toMatchObject({ kind: "FunctionDef", text: "parse_count" });
    // `load_count` is its one caller.
    expect(boxes(parse).filter((node) => node.note === "called here").map((node) => `${node.file}:${node.line}`)).toEqual(["app/deps.py:21"]);
    expect(anchor("app/deps.py", "get_ledger", 7).anchor).toMatchObject({ kind: "FunctionDef", text: "get_ledger" });
  });

  it("keeps two calls of one helper apart: each argument reaches its own call's print (T13)", () => {
    const first = anchorGraphOp(session, { ...at("app/identity.py", "first", "def shout_both"), direction: "forward" });
    expect(first.outcome).toBe("ok");
    expect(boxes(first, "terminal").map((node) => node.line)).toEqual([14]);
    expect(boxes(first, "boundary")).toEqual([]);
    expect(first.nodes.some((node) => node.line === 15 && node.kind !== "scope")).toBe(false);
    const second = anchorGraphOp(session, { ...at("app/identity.py", "second", "def shout_both"), direction: "forward" });
    expect(boxes(second, "terminal").map((node) => node.line)).toEqual([15]);
    expect(second.nodes.some((node) => node.line === 14 && node.kind !== "scope")).toBe(false);
  });

  it("records a call's arguments only where the callee returns a value to it", () => {
    const facts = (session.tier1() as PythonTier1).facts;
    const args = facts.relations.filter((relation) => relation.k === "argument").map((relation) => `${facts.elements[relation.a].l}@${facts.elements[relation.a].s[0]} → ${facts.elements[relation.b].l}`);
    expect(args).toEqual(expect.arrayContaining(["first@14 → ident(…)", "second@15 → ident(…)", "first@19 → pick(…)", "second@19 → pick(…)"]));
    // `Ledger.__init__` returns nothing, so its constructor's argument binds `owner` and is no argument of a result.
    expect(args.filter((item) => item.includes("Ledger"))).toEqual([]);
  });

  it("never lets an argument the callee does not return reach that call's result (T13)", () => {
    // `first` is pick's `a` at line 19, which pick never returns, and its `b` at line 20, which it does.
    const graph = anchorGraphOp(session, { ...at("app/identity.py", "first", "def pick_twice"), direction: "forward" });
    expect(boxes(graph, "terminal").map((node) => node.line)).toEqual([20]);
    expect(boxes(graph, "boundary")).toEqual([]);
    expect(graph.nodes.some((node) => node.line === 19 && node.kind !== "scope")).toBe(false);
  });

  it("still stops at a boundary when the walk starts inside the helper and leaves through its return (R7)", () => {
    const graph = anchorGraphOp(session, { ...at("app/identity.py", "value", "return value"), direction: "forward" });
    expect(graph.outcome).toBe("partial");
    const boundary = boxes(graph, "boundary");
    expect(boundary.map((node) => node.line).sort()).toEqual([14, 15]);
    expect(boundary.every((node) => node.reason === "unproven-handoff" && /ident has 2 call sites/.test(node.note ?? ""))).toBe(true);
    expect(graph.counts.terminals).toBe(0);
  });

  it("names where a partial trace stops when the evidence cannot call it a dead end", () => {
    // `is_enabled(flag)` is only read by an `if`: the conditions the Python evidence leaves unrelated.
    const graph = anchor("app/stops.py", "is_enabled", 5);
    expect(graph.outcome).toBe("partial");
    const stops = boxes(graph, "frontier");
    // Up, `configure(flag)` is never called, so nothing reaches its parameter.
    expect(stops.map((node) => [node.reason, node.label, node.line])).toEqual([["untraced", "flag", 9], ["untraced", "is_enabled(…)", 10]]);
    expect(stops.every((node) => /^not traced further/.test(node.note ?? ""))).toBe(true);
    // Every partial in the fixture names a stop.
    for (const item of ["app/deps.py", "app/models.py", "app/service.py", "app/identity.py", "app/stops.py"].flatMap(definitions)) {
      const traced = anchor(item.file, item.name, item.line);
      if (traced.outcome === "partial") expect(boxes(traced).some((node) => node.kind === "frontier" || node.kind === "boundary"), `${item.name} on line ${item.line}`).toBe(true);
    }
  });

  it("says a def or class with nothing to trace has nothing to trace", () => {
    for (const [file, name, line] of [["app/stops.py", "migrate", 14], ["app/models.py", "Unused", 20]] as const) {
      const graph = anchor(file, name, line);
      expect([graph.outcome, graph.reason], name).toEqual(["unsupported", "nothing-to-trace"]);
    }
  });

  it("names no stop where every path lands", () => {
    // `default_order` builds its Order from literals and nothing calls it: the return leaves the program.
    const graph = anchor("app/service.py", "default_order", 14);
    expect(graph.outcome).toBe("ok");
    expect(boxes(graph, "frontier")).toEqual([]);
  });

  it("names a file that did not parse, and a name that is not on its line", () => {
    expect(() => anchor("app/broken.py", "broken", 1)).toThrow(/No broken on line 1 of broken\.py: the file did not parse \(syntax error on line 1/);
    expect(() => anchor("app/models.py", "Order", 5)).toThrow(/^No Order on line 5 of models\.py$/);
  });
});
