import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { queryEvidenceSlice } from "../../src/analysis/evidence-slice";
import { scopePolicy, type ProgramElement } from "../../src/analysis/scope-seam";
import { createPythonProvider, type PythonFactsOutput, type PythonRelationProvider } from "../../src/srcly/python/facts";
import { probePython, runPythonFacts } from "../../src/srcly/python/run";
import { engineRoot } from "./engine-process";
import { pythonForTests } from "./python-env";

const example = path.join(engineRoot, "examples/python-fastapi");
const server = path.resolve(engineRoot, "../server");
const python = pythonForTests();

function slice(provider: PythonRelationProvider, seed: string, direction: "forward" | "backward") {
  return queryEvidenceSlice(provider, {
    seed: { candidateId: `test:${seed}`, entryElementId: seed, adapter: "test", label: seed, framework: null, proof: [], defaults: scopePolicy({ direction }) },
    direction,
  });
}

function element(provider: PythonRelationProvider, file: string, kind: string, label: string) {
  const found = provider.facts.fileCandidates(file).find((fact) => fact.kind === kind && fact.label === label);
  if (!found) throw new Error(`No ${kind} ${label} in ${file}`);
  return found;
}

describe.skipIf(!python.python)(`Python evidence provider (${python.reason})`, () => {
  let output: PythonFactsOutput;
  let provider: PythonRelationProvider;

  beforeAll(() => {
    output = runPythonFacts({ python: python.python!, root: example, source: example, typesPython: python.python });
    provider = createPythonProvider(output);
  }, 120_000);

  it("probes the interpreter and its checker", () => {
    const probe = probePython(python.python!);
    expect(probe.mypy).toMatch(/^\d+\.\d+/);
    expect(output.checker.status).toBe("ok");
  });

  it("lists every FastAPI handler as a route, with router and mount prefixes", () => {
    expect(output.routes.map((route) => route.key)).toEqual([
      "DELETE /v1/items/{item_id}",
      "GET /v1/items",
      "GET /v1/items/{item_id}",
      "GET /v1/settings",
      "POST /v1/items",
    ]);
    const read = output.routes.find((route) => route.key === "GET /v1/items/{item_id}")!;
    expect(read.handler).toMatchObject({ name: "read_item", line: 19 });
    expect(read.parameters).toEqual([{ name: "item_id", kind: "dynamic" }]);
  });

  it("walks a request body forward to the HTTP response, typed by the checker", () => {
    const body = element(provider, "app/routers/items.py", "parameter", "body");
    const forward = slice(provider, body.id, "forward");
    const labels = forward.elements.map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["body.name", "body.price", "save_item(…)", "return item → POST /v1/items"]));
    const response = forward.elements.find((item) => item.label === "return item → POST /v1/items")!;
    expect(response.terminalRoles).toEqual(["http-response"]);
    const name = forward.elements.find((item) => item.label === "body.name")!;
    expect(name).toMatchObject({ fieldName: "name", attributes: expect.objectContaining({ typeText: "str", typeSource: "mypy" }) });
    expect(name.proof[0]).toMatchObject({ kind: "annotation", detail: expect.stringContaining("ItemIn.name: str (pydantic field") });
    // Into save_item through its parameters, and back out through its return.
    expect(forward.relations.map((relation) => relation.kind)).toEqual(expect.arrayContaining(["field-input", "argument-binding", "return-value"]));
  });

  it("walks the response backward to the request origin", () => {
    const response = element(provider, "app/routers/items.py", "return", "return item → POST /v1/items");
    const backward = slice(provider, response.id, "backward");
    const origin = backward.elements.find((item) => item.originRoles.includes("request"));
    expect(origin).toMatchObject({ label: "POST /v1/items request body → body", attributes: expect.objectContaining({ binding: "body", typeText: "ItemIn" }) });
    expect(origin!.proof[0].detail).toContain("parses the JSON body");
  });

  it("names path and query parameters, environment and file reads, and HTTP errors", () => {
    const facts = provider.facts.facts;
    const labels = (predicate: (fact: (typeof facts)[number]) => boolean) => facts.filter(predicate).map((fact) => fact.label);
    expect(labels((fact) => fact.attributes.originRole === "request")).toEqual(expect.arrayContaining([
      "GET /v1/items/{item_id} path {item_id}",
      "GET /v1/items/{item_id} query ?verbose",
      "GET /v1/items query ?tag",
    ]));
    const elements = facts.map((fact) => provider.facts.getElement(fact.id)!);
    expect(elements.filter((item) => item.kind === "environment-input").map((item) => item.label)).toEqual(['environment: os.environ.get("ITEMS_DIR", "/tmp/items")']);
    expect(elements.filter((item) => item.kind === "file-input").map((item) => item.label)).toEqual(['file read: Path(data_dir, "seed.json").read_text()']);
    expect(elements.filter((item) => item.kind === "http-response")).toHaveLength(2);
  });

  it("counts call sites, so a helper with two callers is not paired with either", () => {
    const find = Object.values(output.callSites).find((sites) => sites.name === "find_item")!;
    expect(find.calls).toEqual(["app/routers/items.py:20", "app/routers/items.py:36"]);
    const save = Object.values(output.callSites).find((sites) => sites.name === "save_item")!;
    expect(save.calls).toEqual(["app/routers/items.py:13"]);
  });

  it("records checked types and declarations for every selectable expression", () => {
    const items = output.expressions["app/routers/items.py"];
    const at = (text: string) => items.find((expression) => expression.t === text);
    expect(at("body.name")).toMatchObject({ k: "Attribute", ty: "str", ts: "mypy" });
    // A parameter's span covers its annotation, as a TypeScript parameter's does.
    expect(items.find((expression) => expression.k === "arg" && expression.n === "body")).toMatchObject({ t: "body: ItemIn", ty: "ItemIn", d: 1 });
    expect(at("create_item")).toMatchObject({ k: "FunctionDef", d: 1, f: [[11, 1, 15, 16]] });
  });
});

describe.skipIf(!python.python || !fs.existsSync(path.join(server, "app/main.py")))("Python evidence on srcly's own server", () => {
  it("finds every router's handlers and their request origins", () => {
    const output = runPythonFacts({ python: python.python!, root: server, source: server });
    const keys = output.routes.map((route) => route.key);
    expect(keys).toEqual(expect.arrayContaining(["POST /api/dataflow/anchor-graph", "GET /api/scans/{job_id}/result", "GET /api/files/content"]));
    expect(output.routes.length).toBeGreaterThanOrEqual(30);
    const provider = createPythonProvider(output);
    const body = provider.facts.fileCandidates("app/routers/dataflow.py").find((fact) => fact.kind === "parameter" && String(fact.attributes.originRole) === "request" && fact.label.startsWith("POST /api/dataflow/anchor-graph"));
    expect(body?.label).toBe("POST /api/dataflow/anchor-graph request body → body");
    const forward = slice(provider, body!.id, "forward");
    const fields = forward.elements.filter((item: ProgramElement) => item.kind === "field-read").map((item) => item.label);
    expect(fields).toEqual(expect.arrayContaining(["body.path", "body.file"]));
  }, 120_000);
});
