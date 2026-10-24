import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { solidRoute, startEngine } from "./engine-process";

// T11: a second process with the same Program answers from disk before it builds.
describe("the result cache across engine processes", () => {
  it("serves routes and graphs before tier 1 builds, keeps generations consistent, and misses once a source changes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-result-cache-"));
    const env = { SRCLY_DATAFLOW_CACHE_DIR: dir };
    // First process: builds, and writes what it answers.
    const first = startEngine(solidRoute, [], env);
    await first.request(1, "hello", { protocol: 1 });
    const routes = (await first.request(2, "routes")).result as { programHash: string; generation: number };
    const graph = (await first.request(3, "routeGraph", { route: "/records" })).result as { nodes: unknown[]; generation: number };
    await first.request(4, "routeSurface", { route: "/records" });
    await first.close();
    expect(fs.existsSync(path.join(dir))).toBe(true);

    // Second process: ready at once, and the same answers, as generation 1 of this process.
    const second = startEngine(solidRoute, [], env);
    await second.request(1, "hello", { protocol: 1 });
    const status = (await second.request(2, "status")).result as { built: boolean; generation: number; programHash: string; stale: boolean };
    expect(status).toMatchObject({ built: true, generation: 1, programHash: routes.programHash, stale: false });
    const started = performance.now();
    const served = (await second.request(3, "routeGraph", { route: "/records" })).result as { nodes: unknown[]; generation: number; programHash: string };
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(served.nodes).toEqual(graph.nodes);
    expect(served).toMatchObject({ generation: 1, programHash: routes.programHash });
    const stale = await second.request(4, "routeGraph", { route: "/records", expectedGeneration: 7 });
    expect(stale).toMatchObject({ ok: false, error: { code: "stale-generation" } });
    // A query the cache never saw builds tier 1 and answers live, still generation 1.
    const live = (await second.request(5, "anchorGraph", { file: "src/components/ViewerCard.tsx", name: "ViewerCard", line: 3, direction: "forward" })).result as { generation: number };
    expect(live.generation).toBe(1);
    await second.close();

    // A changed source: the hash differs, so nothing is served before the build.
    const file = path.join(solidRoute, "src/components/MetricCard.tsx");
    const original = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, `${original}\n// touched\n`);
    try {
      const third = startEngine(solidRoute, [], env);
      await third.request(1, "hello", { protocol: 1 });
      const cold = (await third.request(2, "status")).result as { built: boolean };
      expect(cold.built).toBe(false);
      await third.close();
    } finally {
      fs.writeFileSync(file, original);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120_000);
});
