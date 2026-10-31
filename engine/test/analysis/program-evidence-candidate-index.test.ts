import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import TypeScript from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { ProgramEvidenceCandidateIndex } from "../../src/analysis/program-evidence-candidate-index";

const made: string[] = [];
afterAll(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-candidate-index-"));
  made.push(root);
  const files = {
    "src/a.ts": "export function target() { return 1; }\n",
    "src/default.ts": "export default function defaultTarget() { return 1; }\n",
    "src/default-assignment.ts": "function assignedTarget() { return 1; } export default assignedTarget;\n",
    "src/barrel.ts": 'export { target as forwarded } from "./a";\n',
    "src/types.d.ts": "export interface LocalType { value: string }\n",
    "src/noise.ts": Array.from({ length: 200 }, (_, index) => `const noise${index} = ${index};`).join("\n"),
    "src/use.ts": [
      'import { forwarded as local } from "./barrel";',
      'import * as library from "./a";',
      'import defaultTarget from "./default";',
      'import assigned from "./default-assignment";',
      "local();",
      "library.target();",
      "defaultTarget();",
      "assigned();",
      "namespace source { export function member() { return 1; } }",
      "import memberAlias = source.member;",
      "memberAlias();",
      "function outer(local: number) {",
      "  function inner(local: string) { return local; }",
      "  return local;",
      "}",
      "const source = { value: 1 };",
      "const { value: item } = source;",
      "item;",
    ].join("\n"),
    "src/unique.ts": "export const needle = 1; needle;\n",
  };
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const program = TypeScript.createProgram(Object.keys(files).map((name) => path.join(root, name)), {
    noEmit: true,
    target: TypeScript.ScriptTarget.ESNext,
    module: TypeScript.ModuleKind.ESNext,
    moduleResolution: TypeScript.ModuleResolutionKind.Bundler,
  });
  const index = new ProgramEvidenceCandidateIndex(TypeScript, program, root);
  return { root, program, index };
}

function identifiers(file: TypeScript.SourceFile, name: string): TypeScript.Identifier[] {
  const result: TypeScript.Identifier[] = [];
  const visit = (node: TypeScript.Node) => {
    if (TypeScript.isIdentifier(node) && node.text === name) result.push(node);
    TypeScript.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

function location(root: string, node: TypeScript.Node): string {
  return `${path.relative(root, node.getSourceFile().fileName).split(path.sep).join("/")}:${node.getText()}`;
}

describe("program evidence candidate index", () => {
  it("finds renamed imports and re-exports, then filters candidates by compiler symbol", () => {
    const { root, program, index } = fixture();
    const targetFile = program.getSourceFile(path.join(root, "src/a.ts"))!;
    const target = identifiers(targetFile, "target")[0];
    const references = index.referencesFor(target).map((node) => location(root, node));

    expect(references).toContain("src/a.ts:target");
    expect(references).toContain("src/barrel.ts:target");
    expect(references).toContain("src/use.ts:forwarded");
    expect(references).toContain("src/use.ts:local");
  });

  it("includes namespace property references and separates shadowed locals", () => {
    const { root, program, index } = fixture();
    const targetFile = program.getSourceFile(path.join(root, "src/a.ts"))!;
    const target = identifiers(targetFile, "target")[0];
    expect(index.referencesFor(target).map((node) => location(root, node))).toContain("src/use.ts:target");

    const useFile = program.getSourceFile(path.join(root, "src/use.ts"))!;
    const localDeclarations = identifiers(useFile, "local").filter((node) => TypeScript.isParameter(node.parent));
    const localNodes = identifiers(useFile, "local");
    const outerReferences = index.referencesFor(localDeclarations[0]).map((node) => node.getStart());
    const innerReferences = index.referencesFor(localDeclarations[1]).map((node) => node.getStart());
    expect(outerReferences).toContain(localNodes[2].getStart());
    expect(outerReferences).toContain(localNodes.at(-1)!.getStart());
    expect(outerReferences).not.toContain(localNodes[4].getStart());
    expect(innerReferences).toContain(localNodes[3].getStart());
    expect(innerReferences).toContain(localNodes[4].getStart());
  });

  it("indexes destructured bindings and normalizes relative file lookups", () => {
    const { root, program, index } = fixture();
    const useFile = program.getSourceFile(path.join(root, "src/use.ts"))!;
    const item = identifiers(useFile, "item")[0];
    expect(index.referencesFor(item).map((node) => location(root, node))).toEqual([
      "src/use.ts:item",
      "src/use.ts:item",
    ]);
    expect(index.fileFor("src\\use.ts")).toBe(useFile);
    expect(index.fileFor("missing.ts")).toBeUndefined();
    expect(index.fileFor("src/types.d.ts")).toBeUndefined();
    const declaration = program.getSourceFile(path.join(root, "src/types.d.ts"))!;
    expect(new ProgramEvidenceCandidateIndex(TypeScript, program, root, [declaration]).fileFor("src/types.d.ts")).toBe(declaration);
  });

  it("links default exports and import-equals members", () => {
    const { root, program, index } = fixture();
    const defaultFile = program.getSourceFile(path.join(root, "src/default.ts"))!;
    expect(index.referencesFor(identifiers(defaultFile, "defaultTarget")[0]).map((node) => location(root, node)))
      .toContain("src/use.ts:defaultTarget");

    const assignmentFile = program.getSourceFile(path.join(root, "src/default-assignment.ts"))!;
    expect(index.referencesFor(identifiers(assignmentFile, "assignedTarget")[0]).map((node) => location(root, node)))
      .toContain("src/use.ts:assigned");

    const useFile = program.getSourceFile(path.join(root, "src/use.ts"))!;
    const member = identifiers(useFile, "member").find((node) => TypeScript.isFunctionDeclaration(node.parent))!;
    expect(index.referencesFor(member).map((node) => location(root, node))).toContain("src/use.ts:memberAlias");
  });

  it("checks only same-name candidates when a namespace import exists", () => {
    const { root, program } = fixture();
    const checker = program.getTypeChecker();
    let symbolLookups = 0;
    const measuredChecker = new Proxy(checker, {
      get(target, property) {
        if (property === "getSymbolAtLocation") {
          return (node: TypeScript.Node) => {
            symbolLookups += 1;
            return target.getSymbolAtLocation(node);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    (program as TypeScript.Program & { getTypeChecker: () => TypeScript.TypeChecker }).getTypeChecker = () => measuredChecker;
    const index = new ProgramEvidenceCandidateIndex(TypeScript, program, root);
    expect(symbolLookups).toBe(0);
    const uniqueFile = program.getSourceFile(path.join(root, "src/unique.ts"))!;
    expect(index.referencesFor(identifiers(uniqueFile, "needle")[0])).toHaveLength(2);
    expect(symbolLookups).toBeLessThan(10);
  });
});
