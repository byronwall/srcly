import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emitContracts } from "../../src/srcly/contracts/emit";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("generated contracts", () => {
  it("match the committed JSON Schemas and client types (run `pnpm emit-contracts`)", () => {
    for (const [relative, text] of emitContracts()) {
      const committed = fs.readFileSync(path.join(repositoryRoot, relative), "utf8");
      expect(committed, relative).toBe(text);
    }
  });
});
