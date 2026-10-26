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
    const all = ["app/deps.py", "app/models.py", "app/service.py", "app/identity.py", "app/schemas.py"].flatMap(definitions);
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

  it("takes a class's inputs from its fields or its constructor, never another method's parameters", () => {
    // Order's first method is `scaled(factor)`; Ledger's is `describe(prefix)`, before `__init__(self, owner)`.
    for (const [name, line, method, inputs] of [["Order", 4, "factor", ["name", "quantity"]], ["Ledger", 12, "prefix", ["owner"]]] as const) {
      const graph = anchor("app/models.py", name, line);
      expect(boxes(graph).map((node) => node.label), name).not.toContain(method);
      expect(boxes(graph).filter((node) => node.elementKind === "parameter" && node.file === "app/models.py").map((node) => node.label).sort(), name).toEqual([...inputs]);
    }
    // `__init__` anchored by name keeps its own parameter.
    expect(boxes(anchor("app/models.py", "__init__", 16)).filter((node) => node.elementKind === "parameter" && node.file === "app/models.py").map((node) => node.label)).toEqual(["owner"]);
  });

  it("traces a model's fields up to the constructor arguments that set them", () => {
    const graph = anchor("app/schemas.py", "ItemCreate", 8);
    const title = boxes(graph).find((node) => node.elementKind === "parameter" && node.label === "title")!;
    expect(title).toMatchObject({ side: "up", line: 9 });
    // `build(title)` passes its own `title` as `ItemCreate(title=title)`: the walk up reaches build's parameter.
    expect(boxes(graph).filter((node) => node.side === "up" && node.elementKind === "parameter" && node.line === 31).map((node) => node.label)).toContain("title");
    // A dataclass binds positional arguments in declared order.
    const point = anchor("app/schemas.py", "Point", 18);
    expect(boxes(point).filter((node) => node.side === "up" && node.elementKind === "parameter" && node.line === 35).map((node) => node.label)).toContain("a");
  });

  it("counts a parameter annotated with a class as a use of it", () => {
    const graph = anchor("app/schemas.py", "ItemCreate", 8);
    const uses = boxes(graph).filter((node) => node.side === "down" && (node.note === "annotated with it" || node.note === "called here"));
    expect(uses.map((node) => `${node.note}:${node.label}@${node.line}`).sort()).toEqual(["annotated with it:item@23", "annotated with it:item@39", "called here:ItemCreate(…)@32"]);
    expect(graph.outcome).not.toBe("unsupported");
    // `describe(other: Other)` is no use of ItemCreate.
    expect(boxes(graph).some((node) => node.line === 27)).toBe(false);
  });

  it("takes fields declared by assigning a field instance (Django), set by the constructor or a manager's create", () => {
    const graph = anchor("app/orm.py", "Article", 8);
    const up = boxes(graph, "value").filter((node) => node.side === "up" && node.elementKind === "parameter");
    // `status = "draft"` is no field instance, and `Meta`'s `ordering` belongs to Meta.
    expect(up.filter((node) => node.line === 9 || node.line === 10 || node.line === 11 || node.line === 14).map((node) => node.label).sort()).toEqual(["body", "title"]);
    // `publish(title)` passes `Article(title=title)`, `store(body)` passes `Article.objects.create(body=body)`.
    expect(up.filter((node) => node.line === 24 || node.line === 28).map((node) => node.label).sort()).toEqual(["body", "title"]);
    const uses = boxes(graph).filter((node) => node.side === "down" && node.note).map((node) => `${node.note}@${node.line}`);
    expect(uses).toEqual(expect.arrayContaining(["called here@25", "annotated with it@32"]));
    const facts = (session.tier1() as PythonTier1).facts;
    const reads = facts.relations
      .filter((relation) => relation.k === "carrier" && facts.elements[relation.b].k === "field-read" && facts.elements[relation.a].k === "parameter")
      .map((relation) => `${facts.elements[relation.a].l}@${facts.elements[relation.a].s[0]} → ${facts.elements[relation.b].l}`);
    expect(reads).toContain("title@9 → article.title");
  });

  it("begins a value at a constant, an empty collection or a module outside the program", () => {
    const up = (text: string, marker: string) => anchorGraphOp(session, { ...at("app/ends.py", text, marker), direction: "backward" });
    for (const [text, marker] of [["CONFIG[\"a\"]", "return CONFIG[\"a\"]"], ["os.sep", "return os.sep"]]) {
      const graph = up(text, marker);
      expect(boxes(graph, "frontier").map((node) => node.reason), text).toEqual([]);
      expect(graph.outcome, text).toBe("ok");
    }
    // Two reads of one dict share its receiver, never each other: `CONFIG["a"]` does not reach `CONFIG["b"]`'s return.
    const down = anchorGraphOp(session, { ...at("app/ends.py", "CONFIG[\"a\"]", "return CONFIG[\"a\"]"), direction: "forward" });
    expect(boxes(down).some((node) => node.line === 15)).toBe(false);
  });

  it("ends a value at a statement that drops its result, and at an attribute write", () => {
    const graph = anchorGraphOp(session, { ...at("app/ends.py", "text", "def remember"), direction: "forward" });
    expect(boxes(graph).filter((node) => node.side === "down" && node.note?.startsWith("ends here")).map((node) => `${node.note}@${node.line}`).sort())
      .toEqual(["ends here · its result is not used@36", "ends here · written, not read@30"]);
    expect(boxes(graph, "frontier").map((node) => node.reason)).not.toContain("untraced");
  });

  it("reads a settings model's fields from the environment, and no other model's", () => {
    const up = (text: string, marker: string) => anchorGraphOp(session, { ...at("app/settings.py", text, marker), direction: "backward" }).origins.map((origin) => origin.label);
    expect(up("settings.SECRET_KEY", "return settings.SECRET_KEY")).toEqual(["environment SECRET_KEY"]);
    expect(up("p.SECRET_KEY", "return p.SECRET_KEY")).toEqual([]);
  });

  it("binds a constructor's keywords to its own __init__, not to same-named class fields", () => {
    const graph = anchor("app/orm.py", "Draft", 17);
    expect(boxes(graph).filter((node) => node.side === "up" && node.elementKind === "parameter" && node.file === "app/orm.py" && node.line < 24).map((node) => node.label)).toEqual(["heading"]);
  });

  it("relates a field read to the field of its receiver's class, never a same-named field elsewhere", () => {
    const facts = (session.tier1() as PythonTier1).facts;
    const reads = facts.relations
      .filter((relation) => relation.k === "carrier" && facts.elements[relation.b].k === "field-read" && facts.elements[relation.a].k === "parameter")
      .map((relation) => `${facts.elements[relation.a].l}@${facts.elements[relation.a].s[0]} → ${facts.elements[relation.b].l}${relation.st ? ` (${relation.st})` : ""}`);
    // ItemCreate.title (line 9) and Other.title (line 14) share a name; each reaches only its own class's reads.
    expect(reads).toEqual(expect.arrayContaining(["title@9 → item.title (partial)", "title@14 → other.title (partial)", "size@10 → item.size (partial)"]));
    expect(reads).not.toContain("title@9 → other.title (partial)");
    expect(reads).not.toContain("title@14 → item.title (partial)");
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

  it("leaves a helper through every call when the walk starts inside it: each call site is a true destination", () => {
    const graph = anchorGraphOp(session, { ...at("app/identity.py", "value", "return value"), direction: "forward" });
    expect(boxes(graph, "boundary")).toEqual([]);
    expect([...new Set(boxes(graph).filter((node) => node.side === "down").map((node) => node.line))]).toEqual(expect.arrayContaining([14, 15]));
  });

  it("ends a value in place at a branch test, and names where a partial trace stops otherwise", () => {
    // `is_enabled(flag)` is only read by an `if`: the value ends there, deciding the branch.
    const graph = anchor("app/stops.py", "is_enabled", 5);
    expect(boxes(graph, "terminal").filter((node) => node.line === 10).map((node) => [node.label, node.note])).toEqual([["is_enabled(…)", "ends here · decides a branch"]]);
    expect(graph.outcome).toBe("partial");
    const stops = boxes(graph, "frontier");
    // Up, `configure(flag)` is never called, so nothing reaches its parameter.
    expect(stops.map((node) => [node.reason, node.label, node.line])).toEqual([["untraced", "flag", 9]]);
    expect(stops.every((node) => /^not traced further/.test(node.note ?? ""))).toBe(true);
    // Every partial in the fixture names a stop.
    for (const item of ["app/deps.py", "app/models.py", "app/service.py", "app/identity.py", "app/stops.py", "app/schemas.py", "app/external.py", "app/web.py", "app/orm.py", "app/settings.py", "app/ends.py"].flatMap(definitions)) {
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

  it("names a value handed to code outside the program as external code", () => {
    const graph = anchorGraphOp(session, { ...at("app/external.py", "payload", "def save"), direction: "forward" });
    expect(boxes(graph, "frontier").map((node) => [node.reason, node.label, node.line])).toEqual([["external-code", "json.dumps", 8]]);
    const appended = anchorGraphOp(session, { ...at("app/external.py", "item: str", "def remember"), direction: "forward" });
    expect(boxes(appended, "frontier").map((node) => [node.reason, node.label])).toEqual([["external-code", "items.append"]]);
  });

  it("begins a value at a call into code outside the program, walking upstream", () => {
    const graph = anchorGraphOp(session, { ...at("app/external.py", "started", "return started"), direction: "backward" });
    expect(graph.outcome).toBe("ok");
    expect(boxes(graph, "frontier")).toEqual([]);
  });

  it("names a callee external only where the checker resolves it outside the program", () => {
    const facts = (session.tier1() as PythonTier1).facts;
    const external = (label: string) => facts.elements.find((element) => element.l === label)?.a?.externalCallee;
    expect(external("json.dumps(…)")).toBe("json.dumps");
    // `thing` has no annotation, so the checker cannot say where `thing.anything` goes: not named.
    expect(external("thing.anything(…)")).toBeUndefined();
    // A first-party call is entered, never external.
    expect(facts.elements.filter((element) => element.l === "ident(…)").map((element) => element.a?.externalCallee)).toEqual([undefined, undefined]);
    const poked = anchorGraphOp(session, { ...at("app/external.py", "value", "def poke"), direction: "forward" });
    expect(boxes(poked, "frontier").map((node) => node.reason)).not.toContain("external-code");
  });

  it("begins a field at a literal it is built with, and counts a typed return as a use", () => {
    const graph = anchor("app/schemas.py", "Note", 43);
    expect(graph.outcome).toBe("ok");
    const uses = boxes(graph).filter((node) => node.side === "down" && node.line === 49).map((node) => node.note);
    expect(uses.sort()).toEqual(["called here", "returned as it"]);
  });

  it("starts a Flask request at `request` and ends its response at the return or `jsonify`", () => {
    const up = anchorGraphOp(session, { ...at("app/web.py", "payload", "payload = request.json"), direction: "backward" });
    expect(up.outcome).toBe("ok");
    expect(up.origins.map((origin) => origin.label)).toEqual(["the request"]);
    const down = anchorGraphOp(session, { ...at("app/web.py", "payload", "payload = request.json"), direction: "forward" });
    expect(boxes(down, "terminal").map((node) => [node.line, node.elementKind])).toEqual([[14, "http-response"]]);
    expect(anchor("app/web.py", "greet", 18).outcome).toBe("ok");
    // A parameter that happens to be called `request` is not Flask's.
    const local = anchorGraphOp(session, { ...at("app/web.py", "request", "    return request"), direction: "backward" });
    expect(local.origins).toEqual([]);
  });

  it("enters a function a framework decorator registers, and nothing a wrapper decorates", () => {
    const hello = anchor("app/web.py", "hello", 28);
    expect(hello.outcome).toBe("ok");
    expect(hello.origins.map((origin) => [origin.label, origin.roles])).toEqual([["enters from @click.command → name", ["event"]]]);
    // `@functools.cache` wraps `cached` without registering it: nothing enters it from outside.
    const cached = anchor("app/web.py", "cached", 33);
    expect(cached.origins).toEqual([]);
    expect(boxes(cached, "frontier").map((node) => [node.reason, node.label])).toEqual([["untraced", "value"]]);
  });

  it("names a file that did not parse, and a name that is not on its line", () => {
    expect(() => anchor("app/broken.py", "broken", 1)).toThrow(/No broken on line 1 of broken\.py: the file did not parse \(syntax error on line 1/);
    expect(() => anchor("app/models.py", "Order", 5)).toThrow(/^No Order on line 5 of models\.py$/);
  });
});
