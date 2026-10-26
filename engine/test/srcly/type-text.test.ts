import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import TypeScript from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { parameterOriginRole, safeType } from "../../src/analysis/program-evidence-support";

// A type the checker would spell out at length (a tRPC router proxy is one):
// its text is read only for names, so the checker's own truncation bounds it.
const source = `
type Deep<T, N extends unknown[] = []> = N["length"] extends 6 ? T : { [K in "a" | "b" | "c" | "d"]: Deep<{ value: T; key: K }, [...N, 0]> };
declare const huge: Deep<string>;
export const proxy = huge;
export function handle(incoming: Request, flag: boolean) { return [incoming, flag, proxy]; }
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-type-text-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function declarations() {
  const file = path.join(dir, "index.ts");
  fs.writeFileSync(file, source);
  const program = TypeScript.createProgram([file], { strict: true, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], noEmit: true });
  const sourceFile = program.getSourceFile(file)!;
  const found = new Map<string, TypeScript.Node>();
  const visit = (node: TypeScript.Node) => {
    if ((TypeScript.isVariableDeclaration(node) || TypeScript.isParameter(node)) && TypeScript.isIdentifier(node.name)) found.set(node.name.text, node);
    TypeScript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { checker: program.getTypeChecker(), found };
}

describe("type text", () => {
  const { checker, found } = declarations();

  it("stops spelling out a type once the checker's truncation length is reached", () => {
    const text = safeType(checker, found.get("proxy")!);
    expect(text.length).toBeLessThan(400);
    expect(text).toContain("...");
  });

  it("keeps a short type's text whole, so a parameter's role is still read from it", () => {
    expect(safeType(checker, found.get("flag")!)).toBe("boolean");
    expect(safeType(checker, found.get("incoming")!)).toBe("Request");
    expect(parameterOriginRole(checker, found.get("incoming") as TypeScript.ParameterDeclaration, true)).toBe("request");
  });
});
