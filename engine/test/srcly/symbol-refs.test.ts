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

  it("answers ok for the files asked, with import clauses marked as names, not uses", () => {
    expect(result.outcome).toBe("ok");
    expect(result.files.map((f) => f.file)).toEqual(["src/use.tsx"]);
    // Import clause names only locate a symbol: each is marked, none is a use.
    expect(lines.filter((ref) => ref.line <= 2).every((ref) => ref.clause)).toBe(true);
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

  it("binds a union member to every class's own member, and a call through `satisfies` stays a call", () => {
    const union = at(36, "bump");
    expect(union).toMatchObject({ kind: "call", to: { name: "bump", line: 6 } });
    expect((union.also ?? []).map((i) => result.targets[i])).toMatchObject([{ name: "bump", line: 21 }]);
    expect(at(36, "bump()")).toMatchObject({ kind: "call" });
  });

  it("locates an import clause's name without making it a use", () => {
    expect(at(34, "Other")).toMatchObject({ clause: true, to: { name: "Other", line: 20, column: 14 } });
    expect(at(36, "bump()").clause).toBeUndefined();
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
  const lib = "packages/kit/src/index.ts";

  it("binds named, namespace, class-member, bracket and default uses to the source", () => {
    expect(at(5, "tick")).toMatchObject({ kind: "call", to: { file: lib, name: "tick", line: 1 } });
    expect(at(6, "tick")).toMatchObject({ kind: "call", to: { file: lib, name: "tick", line: 1 } });
    expect(at(7, "Runner")).toMatchObject({ kind: "instantiate", to: { file: lib, name: "Runner", line: 5 } });
    expect(at(7, "run")).toMatchObject({ kind: "call", to: { file: lib, name: "run", line: 6, scope: "member" } });
    expect(at(8, '"run"')).toMatchObject({ kind: "call", to: { file: lib, name: "run", line: 6 } });
    expect(at(9, "main")).toMatchObject({ kind: "call", to: { file: lib, name: "main", line: 11 } });
  });

  it("follows a declaration map over the conventional path", () => {
    expect(at(12, "run")).toMatchObject({ kind: "call", to: { file: "packages/kit/src/real.ts", name: "run", line: 1 } });
  });
});
