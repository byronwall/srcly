import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnchorGraphResult, AnchorNode } from "../../src/srcly/contracts/anchor-graph";
import type { RoutesResult } from "../../src/srcly/contracts/routes";
import type { SelectExpressionResult, ValueFlowResult } from "../../src/srcly/contracts/value-flow";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { routeGraphOp } from "../../src/srcly/ops/route-graph";
import { selectExpressionOp, valueFlowOp } from "../../src/srcly/ops/value-flow";
import { createEngineSession } from "../../src/srcly/session";
import { engineRoot, startEngine } from "./engine-process";
import { pythonForTests } from "./python-env";

const example = path.join(engineRoot, "examples/python-fastapi");
const python = pythonForTests();

/** The span of `text` on the first line of `file` that contains `marker`. */
function find(file: string, text: string, marker = text) {
  const lines = fs.readFileSync(path.join(example, file), "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes(marker));
  if (index < 0) throw new Error(`${marker} is not in ${file}`);
  const column = lines[index].indexOf(text) + 1;
  return { file, text, span: { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length } };
}

const boxes = (graph: AnchorGraphResult, kind?: AnchorNode["kind"]) => graph.nodes.filter((node) => node.kind !== "scope" && (!kind || node.kind === kind));

describe.skipIf(!python.python)(`Python session and ops (${python.reason})`, () => {
  const session = createEngineSession({ root: example, source: example, tsconfig: null, typescriptFrom: engineRoot, language: "python", python: python.python });

  it("builds tier 1 from the helper, named by its checker", () => {
    const tier1 = session.tier1();
    expect(tier1.language).toBe("python");
    expect(tier1.generation).toMatchObject({ id: 1, tsconfig: "pyproject.toml", typescript: expect.stringMatching(/^mypy \d+\.\d+.* · Python 3\./) });
  }, 120_000);

  it("anchors at a request body and walks forward to the HTTP response, with checked types on the boxes", () => {
    const graph = anchorGraphOp(session, { ...find("app/routers/items.py", "body", "def create_item"), direction: "forward" });
    expect(graph.outcome).toBe("ok");
    expect(graph.anchor).toMatchObject({ kind: "arg", typeText: "ItemIn" });
    const anchor = graph.nodes.find((node) => node.kind === "anchor")!;
    expect(anchor).toMatchObject({ detail: "parameter", elementKind: "parameter", parent: "scope:app/routers/items.py:11:1" });
    expect(graph.terminals.map((terminal) => [terminal.label, terminal.roles])).toEqual(expect.arrayContaining([["return item → POST /v1/items", ["http-response"]]]));
    const typed = Object.fromEntries(boxes(graph).map((node) => [node.label, node.typeText]));
    expect(typed).toMatchObject({ "body.name": "str", "body.price": "float", "save_item(…)": "Item", "Item(…)": "Item" });
    // save_item has one call site, so the walk goes in through its parameters and out through its return.
    const scopes = graph.nodes.filter((node) => node.kind === "scope").map((node) => node.label);
    expect(scopes).toEqual(expect.arrayContaining(["create_item", "save_item"]));
    expect(boxes(graph, "boundary")).toEqual([]);
    // Plain reads of a name repeat its binding and get no box of their own.
    expect(boxes(graph).filter((node) => node.label === "body")).toEqual([]);
  });

  it("walks the response backward to the request origin", () => {
    const graph = anchorGraphOp(session, { ...find("app/routers/items.py", "item", "return item"), direction: "backward" });
    expect(graph.outcome).toBe("ok");
    expect(graph.origins.map((origin) => [origin.label, origin.roles])).toEqual([["POST /v1/items request body → body", ["request"]]]);
    const origin = boxes(graph, "origin")[0];
    expect(origin).toMatchObject({ typeText: "ItemIn", side: "up" });
  });

  it("pairs a helper with two call sites with the call it was entered by (T13)", () => {
    const graph = anchorGraphOp(session, { ...find("app/routers/items.py", "item_id", "def read_item"), direction: "forward" });
    expect(boxes(graph, "boundary")).toEqual([]);
    // find_item's result comes back to read_item's call (line 20), never to delete_item's (line 36).
    expect(boxes(graph).filter((node) => node.label === "find_item(…)").map((node) => node.line)).toEqual([20]);
    expect(graph.nodes.some((node) => node.file === "app/routers/items.py" && node.line >= 35 && node.kind !== "scope")).toBe(false);
  });

  it("leaves a helper through both of its calls when the walk starts inside it: each call site is a true destination", () => {
    const graph = anchorGraphOp(session, { ...find("app/store.py", "item_id", "def find_item"), direction: "forward" });
    expect(boxes(graph, "boundary").filter((node) => node.reason === "unproven-handoff")).toEqual([]);
    expect(boxes(graph).filter((node) => node.label === "find_item(…)").map((node) => node.line).sort()).toEqual([20, 36]);
  });

  it("anchors a handler by name from the import graph: its parameters in, its response out", () => {
    const graph = anchorGraphOp(session, { file: "app/routers/items.py", name: "create_item", line: 11, direction: "both" });
    expect(graph.anchor).toMatchObject({ kind: "FunctionDef" });
    expect(graph.nodes.find((node) => node.kind === "anchor")?.elementKind).toBe("function-entry");
    expect(graph.origins.map((origin) => origin.label)).toEqual(["POST /v1/items request body → body"]);
    expect(graph.terminals.map((terminal) => terminal.label)).toEqual(expect.arrayContaining(["return item → POST /v1/items"]));
  });

  it("fills a request body model's fields from the request, and counts a typed return as a use of its class", () => {
    const body = anchorGraphOp(session, { file: "app/models.py", name: "ItemIn", line: 6, direction: "both" });
    expect(body.outcome).toBe("ok");
    expect(body.origins.map((origin) => origin.label)).toEqual(["POST /v1/items request body → body"]);
    expect(boxes(body).filter((node) => node.side === "up" && node.elementKind === "parameter" && node.file === "app/models.py").map((node) => node.label).sort()).toEqual(["name", "price", "tags"]);
    const item = anchorGraphOp(session, { file: "app/models.py", name: "Item", line: 12, direction: "forward" });
    const returned = boxes(item).filter((node) => node.note === "returned as it").map((node) => `${node.file}:${node.line}`);
    expect(returned).toEqual(expect.arrayContaining(["app/routers/items.py:15", "app/store.py:12"]));
  });

  it("selects Python expressions innermost first and builds a ledger to the response", () => {
    const at = find("app/routers/items.py", "body.name", "name = body.name.strip()");
    const caret = { ...at.span, endColumn: at.span.startColumn + 6 };
    const select: SelectExpressionResult = selectExpressionOp(session, { file: at.file, span: { ...caret, startColumn: caret.endColumn } });
    expect(select.candidates.map((candidate) => candidate.text)).toEqual(["body.name", "body.name.strip()"]);
    const flow: ValueFlowResult = valueFlowOp(session, { file: at.file, span: at.span, text: "body.name" });
    expect(flow.rows[0]).toMatchObject({ kind: "input", typeText: "str", status: "proven" });
    expect(flow.rows.filter((row) => row.kind === "terminal").map((row) => row.note)).toContain("HTTP response");
  });

  it("refuses the route graph by name: it is TypeScript's render backbone", () => {
    expect(() => routeGraphOp(session, { route: "POST /v1/items" })).toThrow(/TypeScript-only/);
  });
});

describe.skipIf(!python.python)("Python root through the real engine process", () => {
  let engine: ReturnType<typeof startEngine>;
  beforeAll(() => {
    engine = startEngine(example, ["--language", "python", "--python", python.python!]);
  });
  afterAll(async () => {
    await engine.close();
  });

  it("lists the handlers as routes over the protocol", async () => {
    const reply = await engine.request(1, "routes");
    expect(reply.ok).toBe(true);
    const result = reply.result as RoutesResult;
    expect(result.routes.map((route) => route.pathPattern)).toEqual(["DELETE /v1/items/{item_id}", "GET /v1/items", "GET /v1/items/{item_id}", "GET /v1/settings", "POST /v1/items"]);
    expect(result.routes[2]).toMatchObject({
      file: "app/routers/items.py",
      absPath: path.join(example, "app/routers/items.py"),
      parameters: [{ name: "item_id", kind: "dynamic" }],
      // A handler route names its function, so the client opens it in anchor mode.
      handler: { name: "read_item", line: 19 },
    });
  }, 120_000);

  it("names a missing interpreter", async () => {
    const missing = startEngine(example, ["--language", "python", "--python", "/nonexistent/python3"]);
    const reply = await missing.request(1, "routes");
    expect(reply.error?.code).toBe("python-not-found");
    await missing.close();
  }, 60_000);
});
