import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import TypeScript from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { compilerSymbolId } from "../../src/analysis/program-evidence-support";

// Element ids hash a symbol's id, and the walk's limits keep elements in id
// order: an id that spelled the checkout's absolute path would make the same
// code trace differently from another folder (a CI runner's).
const files = { "src/a.ts": "export function shout(value: string) { return value; }\nexport function whisper(value: string) { return value; }\n" };
const made: string[] = [];
afterAll(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function idsAt(folder: string): Record<string, string | null> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), folder));
  made.push(root);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  const program = TypeScript.createProgram([path.join(root, "src/a.ts")], { noEmit: true });
  const checker = program.getTypeChecker();
  const ids: Record<string, string | null> = {};
  TypeScript.forEachChild(program.getSourceFile(path.join(root, "src/a.ts"))!, (node) => {
    if (TypeScript.isFunctionDeclaration(node) && node.name) ids[node.name.text] = compilerSymbolId(TypeScript, checker, root, node.name);
  });
  return ids;
}

describe("compiler symbol ids", () => {
  it("name a symbol the same from any checkout folder, and never spell the folder", () => {
    const here = idsAt("srcly-ids-one-");
    const there = idsAt("srcly-ids-other-folder-");
    expect(here.shout).toBe(there.shout);
    expect(here.shout).not.toContain(os.tmpdir());
  });

  it("still tell two symbols apart", () => {
    const ids = idsAt("srcly-ids-two-");
    expect(ids.shout).not.toBe(ids.whisper);
  });
});
