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
    const all = ["app/deps.py", "app/models.py", "app/service.py"].flatMap(definitions);
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
    expect(uses.map((node) => [node.label, node.file, node.line])).toEqual([["Order(…)", "app/service.py", 5]]);
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

  it("names a file that did not parse, and a name that is not on its line", () => {
    expect(() => anchor("app/broken.py", "broken", 1)).toThrow(/No broken on line 1 of broken\.py: the file did not parse \(syntax error on line 1/);
    expect(() => anchor("app/models.py", "Order", 5)).toThrow(/^No Order on line 5 of models\.py$/);
  });
});
