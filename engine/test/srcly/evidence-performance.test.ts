import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";

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
