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
  const source = [
    `import A, { Store } from "./m";`,
    `import * as m from "./m";`,
    ``,
    `declare function pick<T>(): T;`,
    `declare function C<T>(props: { row?: T }): null;`,
    ``,
    `export const value = pick<typeof import("./m").Row>();`,
    `export let typed: import("./m").Row | undefined;`,
    `export const tag = <C<import("./m").Row> />;`,
    ``,
    `export function run(store: Store, loose: any) {`,
    `  store.bump();`,
    `  loose.bump();`,
    `  const made = new m.Store();`,
    `  const n: A = A();`,
    `  return { made, n };`,
    `}`,
    ``,
    `export function outer() {`,
    `  function inner(): Local {`,
    `    return { ok: true };`,
    `  }`,
    `  type Local = { ok: boolean };`,
    `  return inner;`,
    `}`,
  ];

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

  it("binds a forward reference to a block-local alias", () => {
    expect(at(20, "Local").to).toMatchObject({ file: "src/use.tsx", name: "Local", line: 23, meaning: "type", scope: "local" });
  });
});
