import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";
import { createTypescriptHost } from "../../src/srcly/typescript-host";
import { spanOf } from "../../src/srcly/selection";

it("keeps symbol lookups linear for repeated writes, without treating a shadowed name as a module read", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-write-cost-"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ESNext" }, include: ["*.ts"] }));
  const measure = (writes: number) => {
    fs.writeFileSync(path.join(root, "index.ts"), [
      "const log: string[] = [];",
      "export function record(entry: string) {",
      ...Array.from({ length: writes }, () => "  log.push(entry);"),
      "}",
      "export function readOther(log: string[]) { return log[0]; }",
    ].join("\n"));
    const session = createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
    const checker = requireTypescript(session.tier1(), "performance test").program.getTypeChecker();
    const lookup = vi.spyOn(checker, "getSymbolAtLocation");
    try {
      const graph = anchorGraphOp(session, { file: "index.ts", name: "record", line: 2, direction: "forward" });
      expect(graph.outcome).toBe("partial");
      expect(graph.nodes.some((node) => node.kind === "frontier" && node.reason === "external-code")).toBe(true);
      expect(graph.nodes.some((node) => node.kind !== "scope" && node.line === 1)).toBe(false);
      return lookup.mock.calls.length;
    } finally {
      lookup.mockRestore();
    }
  };
  try {
    const small = measure(16);
    const large = measure(64);
    // Four times the writes must not cause a whole-file scan per write.
    expect(large).toBeLessThan(small * 6);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

it("does not rescan a file to classify every value in the same function", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-scope-cost-"));
  try {
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, jsx: "preserve" }, include: ["*.tsx"] }));
    fs.writeFileSync(path.join(root, "index.tsx"), [
      "function save(value: string) { return value.trim(); }",
      ...Array.from({ length: 100 }, (_, i) => `const unused${i} = ${i};`),
      "const button = <button onClick={save} />;",
    ].join("\n"));
    const session = createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
    const tier = requireTypescript(session.tier1(), "scope performance test");
    let visits = 0;
    const ts = new Proxy(tier.ts, {
      get(target, key) {
        if (key === "forEachChild") return (...args: Parameters<typeof target.forEachChild>) => {
          visits++;
          return target.forEachChild(...args);
        };
        return Reflect.get(target, key);
      },
    });
    const host = createTypescriptHost({ ...tier, ts });
    const source = tier.program.getSourceFile(path.join(root, "index.tsx"))!;
    const fn = source.statements[0];
    if (!ts.isFunctionDeclaration(fn) || !fn.body) throw new Error("Missing test function");
    const locations = [fn.parameters[0].name, fn.body.statements[0]].map((node) => spanOf(source, node));
    expect(host.scopeAt("index.tsx", locations[0])).toMatchObject({ name: "save", role: "handler" });
    const first = visits;
    visits = 0;
    for (let i = 0; i < 20; i++) expect(host.scopeAt("index.tsx", locations[i % locations.length])).toMatchObject({ name: "save", role: "handler" });
    // The first classification scans the file. Later values only locate their own scope.
    expect(visits).toBeLessThan(first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
