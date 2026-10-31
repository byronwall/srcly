import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";

it("reports cumulative lazy collection time and phase work", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-demand-instrumentation-"));
  const previousProfile = process.env.TSX_DATA_FLOW_COLLECTOR_PROFILE;
  try {
    process.env.TSX_DATA_FLOW_COLLECTOR_PROFILE = "1";
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { strict: true, target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext" },
      include: ["*.ts"],
    }));
    fs.writeFileSync(path.join(root, "index.ts"), `export function clean(input: string) { return input.trim(); }\n`);
    const session = createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
    const tier = requireTypescript(session.tier1(), "demand instrumentation test");
    const result = anchorGraphOp(session, { file: "index.ts", name: "clean", line: 1, direction: "forward" });
    expect(result.outcome).toBe("ok");

    const stats = tier.provider().getInstrumentation();
    expect(stats.collectionElapsedMs).toBeGreaterThan(0);
    expect(stats.deferredCollection.sourceFilesVisited).toBeGreaterThan(0);
    expect(stats.deferredCollection.astUnitsVisited).toBeGreaterThan(0);
    expect(stats.deferredCollection.phases.nodes.calls).toBeGreaterThan(0);
    expect(stats.totalExpansionPartitionsVisited).toBeGreaterThan(0);
  } finally {
    if (previousProfile === undefined) delete process.env.TSX_DATA_FLOW_COLLECTOR_PROFILE;
    else process.env.TSX_DATA_FLOW_COLLECTOR_PROFILE = previousProfile;
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
