import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LibraryModels, loadLibraryModels } from "../../src/analysis/library-models";
import { builtinLibraryModels, builtinModelFiles } from "../../src/srcly/library-models";

function rowsFile(rows: unknown[], name = "rows.json"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-models-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify({ rows }));
  return file;
}

describe("library models", () => {
  it("loads the built-in row files, which match the schema", () => {
    expect(builtinModelFiles().map((file) => path.basename(file))).toContain("ecmascript.json");
    expect(builtinLibraryModels()).toBeInstanceOf(LibraryModels);
  });

  it("finds a row by language, module and member: an exact row before the longest prefix", () => {
    const models = loadLibraryModels([rowsFile([
      { language: "py", module: "requests", member: "Session.*", model: "origin", role: "fetch-input" },
      { language: "py", module: "requests", member: "Session.close", model: "consumes" },
      { language: "ts", module: "solid-js", name: "createSignal", model: "state-pair", args: "0" },
    ])]);
    expect(models.size).toBe(3);
    expect(models.lookup("ts", "solid-js", "createSignal")?.model).toBe("state-pair");
    expect(models.lookup("py", "requests", "Session.get")?.model).toBe("origin");
    expect(models.lookup("py", "requests", "Session.close")?.model).toBe("consumes");
    // Never across languages or modules.
    expect(models.lookup("py", "solid-js", "createSignal")).toBeNull();
    expect(models.lookup("ts", "solid-js/store", "createSignal")).toBeNull();
  });

  it("names a file whose rows break the schema or repeat a key, never skipping it", () => {
    expect(() => loadLibraryModels([rowsFile([{ language: "ts", module: "x", model: "origin" }])])).toThrow(/exactly one of `name` or `member`/);
    expect(() => loadLibraryModels([rowsFile([{ language: "ts", module: "x", name: "y", model: "teleports" }])])).toThrow(/rows\.json/);
    expect(() => loadLibraryModels([rowsFile([{ language: "ts", module: "x", name: "y", model: "origin", extra: 1 }])])).toThrow(/rows\.json/);
    const row = { language: "ts", module: "x", name: "y", model: "origin" };
    expect(() => loadLibraryModels([rowsFile([row]), rowsFile([row], "again.json")])).toThrow(/again\.json repeats/);
  });
});
