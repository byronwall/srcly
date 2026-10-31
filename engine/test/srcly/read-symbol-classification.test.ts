import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as TypeScript from "typescript";
import { describe, expect, it, vi } from "vitest";
import { endsInPlace } from "../../src/srcly/facts";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";
import type { ProgramElement } from "../../src/analysis/scope-seam";
import { spanOf } from "../../src/srcly/selection";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-read-symbols-"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext" },
    include: ["*.ts"],
  }));
  fs.writeFileSync(path.join(root, "api.ts"), [
    `export function unusedApi(value: string) { return value; }`,
    `export function usedApi() { return 1; }`,
    `export function namespaceApi() { return 2; }`,
    `export default function defaultApi() { return 3; }`,
    `export const token = "token";`,
    `export function callbackApi(onItem: (value: string) => void) { onItem("value"); }`,
    `export class Box { constructor(public value: string) {} read() { return this.value; } }`,
    `function internal(ignored: number) { return 1; }`,
  ].join("\n"));
  fs.writeFileSync(path.join(root, "consumer.ts"), [
    `import { usedApi as localApi, token as localToken } from "./api.js";`,
    `import * as api from "./api.js";`,
    `import defaultValue from "./api.js";`,
    `localApi(); api.namespaceApi(); defaultValue();`,
    `export const packed = { localToken };`,
    `export { unusedApi as forwarded } from "./api.js";`,
  ].join("\n"));
  return root;
}

function exactNode(tier: ReturnType<typeof requireTypescript>, file: string, match: (node: TypeScript.Node) => boolean) {
  const source = tier.program.getSourceFile(path.join(tier.root, file));
  if (!source) throw new Error(`Missing ${file}`);
  let found: TypeScript.Node | null = null;
  const visit = (node: TypeScript.Node) => {
    if (!found && match(node)) found = node;
    if (!found) tier.ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error(`No matching node in ${file}`);
  const { line, character } = source.getLineAndCharacterOfPosition(found.getStart(source));
  return {
    location: { file, line: line + 1, column: character + 1, span: spanOf(source, found) },
    node: found,
    source,
  } as { location: ProgramElement["location"]; node: TypeScript.Node; source: TypeScript.SourceFile };
}

function namedDeclaration(tier: ReturnType<typeof requireTypescript>, file: string, name: string, kind: "function" | "variable" | "parameter") {
  return exactNode(tier, file, (node) => {
    if (!tier.ts.isIdentifier(node) || node.text !== name) return false;
    const parent = node.parent;
    return kind === "function" ? tier.ts.isFunctionDeclaration(parent) && parent.name === node
      : kind === "variable" ? tier.ts.isVariableDeclaration(parent) && parent.name === node
        : tier.ts.isParameter(parent) && parent.name === node;
  });
}

describe("read-symbol classification", () => {
  it("preserves API, alias, shorthand, callback, and parameter-property decisions", () => {
    const root = fixture();
    try {
      const tier = requireTypescript(createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR }).tier1(), "classification test");
      const classify = (node: ReturnType<typeof namedDeclaration> | ReturnType<typeof exactNode>) => endsInPlace(tier, { location: node.location });
      expect(classify(namedDeclaration(tier, "api.ts", "unusedApi", "function"))).toBe("exported-api");
      expect(classify(namedDeclaration(tier, "api.ts", "usedApi", "function"))).toBeNull();
      expect(classify(namedDeclaration(tier, "api.ts", "namespaceApi", "function"))).toBeNull();
      expect(classify(namedDeclaration(tier, "api.ts", "defaultApi", "function"))).toBeNull();
      expect(classify(namedDeclaration(tier, "api.ts", "token", "variable"))).toBeNull();
      const callback = exactNode(tier, "api.ts", (node) => tier.ts.isCallExpression(node) && node.expression.getText() === "onItem");
      expect(classify(callback)).toBe("exported-api");
      expect(classify(namedDeclaration(tier, "api.ts", "value", "parameter"))).toBeNull();
      expect(classify(namedDeclaration(tier, "api.ts", "ignored", "parameter"))).toBe("unused");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("checks only same-name candidates instead of asking the checker about every project identifier", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-read-symbol-cost-"));
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { strict: true, target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext" },
      include: ["*.ts"],
    }));
    fs.writeFileSync(path.join(root, "index.ts"), [
      `export function rareApi() { return 1; }`,
      ...Array.from({ length: 40 }, (_, i) => `function unrelated${i}(value${i}: number) { return value${i}; }`),
    ].join("\n"));
    try {
      const tier = requireTypescript(createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR }).tier1(), "classification cost test");
      const checker = tier.program.getTypeChecker();
      const symbolLookup = vi.spyOn(checker, "getSymbolAtLocation");
      const source = tier.program.getSourceFile(path.join(root, "index.ts"))!;
      const identifiers: TypeScript.Identifier[] = [];
      const visit = (node: TypeScript.Node) => {
        if (tier.ts.isIdentifier(node)) identifiers.push(node);
        tier.ts.forEachChild(node, visit);
      };
      visit(source);
      expect(endsInPlace(tier, { location: namedDeclaration(tier, "index.ts", "rareApi", "function").location })).toBe("exported-api");
      expect(symbolLookup.mock.calls.length).toBeLessThan(identifiers.length / 4);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
