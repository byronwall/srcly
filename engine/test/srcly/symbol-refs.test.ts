import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { symbolRefsOp } from "../../src/srcly/ops/symbol-refs";
import { createEngineSession } from "../../src/srcly/session";

const root = path.join(__dirname, "__fixtures__", "symbol-refs");

describe("symbolRefs binds every identifier with the checker", () => {
  const result = symbolRefsOp(createEngineSession({ root, source: ".", tsconfig: null, typescriptFrom: root }), { files: ["src/use.tsx"] });
  const use = result.files[0];
  const lines = use.refs.map((ref) => ({ ...ref, to: ref.target === null ? null : result.targets[ref.target] }));
  const at = (line: number, text: string) => {
    const column = (source[line - 1].indexOf(text) ?? -1) + 1;
    const hit = lines.find((ref) => ref.line === line && ref.column === column);
    if (!hit) throw new Error(`no ref at ${line}:${column} (${text})`);
    return hit;
  };
  const source = fs.readFileSync(path.join(root, "src/use.tsx"), "utf8").split("\n");

  it("answers ok for the files asked, with no import clause as a reference", () => {
    expect(result.outcome).toBe("ok");
    expect(result.files.map((f) => f.file)).toEqual(["src/use.tsx"]);
    expect(lines.filter((ref) => ref.line <= 2)).toEqual([]);
  });

  it("splits a name's type and value by position, typeof included", () => {
    expect(at(7, "Row").to).toMatchObject({ file: "src/m.ts", name: "Row", line: 2, meaning: "value", scope: "module" });
    expect(at(7, "Row").kind).toBe("type");
    expect(at(8, "Row").to).toMatchObject({ name: "Row", line: 1, meaning: "type" });
    expect(at(9, "Row").to).toMatchObject({ name: "Row", line: 1, meaning: "type" });
  });

  it("binds a member call through a parameter's type, and leaves an any receiver unbound", () => {
    expect(at(12, "bump")).toMatchObject({ kind: "call", to: { name: "bump", line: 6, meaning: "value", scope: "member" } });
    expect(at(13, "bump")).toMatchObject({ kind: "call", target: null, unbound: "any" });
    expect(at(14, "Store")).toMatchObject({ kind: "instantiate", to: { name: "Store", line: 4 } });
    expect(at(14, "m.Store").to).toMatchObject({ file: "src/m.ts", name: "*" });
  });

  it("follows a default import to the function by its own name, and never to the type of the same name", () => {
    expect(at(15, "A()")).toMatchObject({ kind: "call", to: { name: "A", line: 11, meaning: "value" } });
    // `import A` imports the default export, a function: as a type it binds nothing (#486 bound it to `A@type`).
    expect(at(15, "A =")).toMatchObject({ kind: "type", target: null, unbound: "unresolved" });
  });

  it("binds `implements` and an interface's `extends` to the type side of a split name", () => {
    expect(at(27, "Model")).toMatchObject({ kind: "implements", to: { name: "Model", line: 16, meaning: "type" } });
    expect(at(30, "Model")).toMatchObject({ kind: "extends", to: { name: "Model", line: 16, meaning: "type" } });
  });

  it("binds a forward reference to a block-local alias", () => {
    expect(at(20, "Local").to).toMatchObject({ file: "src/use.tsx", name: "Local", line: 23, meaning: "type", scope: "local" });
  });
});

describe("symbolRefs follows a workspace package's built .d.ts to its source", () => {
  const workspace = path.join(__dirname, "__fixtures__", "symbol-refs-workspace");
  const result = symbolRefsOp(createEngineSession({ root: workspace, source: ".", tsconfig: null, typescriptFrom: workspace }), { files: ["app/src/use.ts"] });
  const text = fs.readFileSync(path.join(workspace, "app/src/use.ts"), "utf8").split("\n");
  const at = (line: number, needle: string, offset = 0) => {
    const column = text[line - 1].indexOf(needle) + 1 + offset;
    const ref = result.files[0]?.refs.find((r) => r.line === line && r.column === column);
    if (!ref) throw new Error(`no ref at ${line}:${column} (${needle})`);
    return { ...ref, to: ref.target === null ? null : result.targets[ref.target] };
  };
  const lib = "packages/lib/src/index.ts";

  it("binds named, namespace, class-member, bracket and default uses to the source", () => {
    expect(at(5, "tick")).toMatchObject({ kind: "call", to: { file: lib, name: "tick", line: 1 } });
    expect(at(6, "tick")).toMatchObject({ kind: "call", to: { file: lib, name: "tick", line: 1 } });
    expect(at(7, "Runner")).toMatchObject({ kind: "instantiate", to: { file: lib, name: "Runner", line: 5 } });
    expect(at(7, "run")).toMatchObject({ kind: "call", to: { file: lib, name: "run", line: 6, scope: "member" } });
    expect(at(8, '"run"')).toMatchObject({ kind: "call", to: { file: lib, name: "run", line: 6 } });
    expect(at(9, "main")).toMatchObject({ kind: "call", to: { file: lib, name: "main", line: 11 } });
  });
});
