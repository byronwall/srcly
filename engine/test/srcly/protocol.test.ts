import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { solidRoute, startEngine } from "./engine-process";

const temporary: string[] = [];
afterAll(() => {
  for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true });
});

function tempProject(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-engine-"));
  temporary.push(dir);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

describe("srcly-engine stdio protocol", () => {
  it("answers hello and status without building, then lists routes on solid-route", async () => {
    const engine = startEngine(solidRoute);
    const hello = await engine.request(1, "hello", { protocol: 1 });
    expect(hello).toMatchObject({ id: 1, ok: true, result: { protocol: 1, typescriptFrom: "bundled" } });
    const before = await engine.request(2, "status");
    expect(before.result).toMatchObject({ built: false, generation: null, stale: false });

    const routes = await engine.request(3, "routes");
    expect(routes.ok).toBe(true);
    const result = routes.result as { generation: number; programHash: string; routes: { pathPattern: string; file: string; absPath: string }[] };
    expect(result.generation).toBe(1);
    expect(result.routes.map((route) => route.pathPattern)).toEqual(["/records"]);
    expect(result.routes[0].absPath).toBe(path.join(solidRoute, "src/routes/records.tsx"));
    expect(engine.frames.some((frame) => frame.id === 3 && frame.progress !== undefined)).toBe(true);

    const after = await engine.request(4, "status");
    expect(after.result).toMatchObject({ built: true, generation: 1, programHash: result.programHash, currentHash: result.programHash, stale: false });

    const stale = await engine.request(5, "routes", { expectedGeneration: 7 });
    expect(stale).toMatchObject({ ok: false, error: { code: "stale-generation" } });

    // Every stdout line is a protocol frame.
    for (const line of engine.stdoutLines) expect(() => JSON.parse(line)).not.toThrow();
    expect(await engine.close()).toBe(0);
  }, 60_000);

  it("cancels a query while the program builds", async () => {
    const engine = startEngine(solidRoute);
    const reply = engine.request(1, "routes");
    engine.send({ op: "cancel", params: { id: 1 } });
    expect(await reply).toMatchObject({ id: 1, ok: false, error: { code: "cancelled" } });
    expect(await engine.close()).toBe(0);
  }, 60_000);

  it("exits on stdin EOF", async () => {
    const engine = startEngine(solidRoute);
    await engine.request(1, "hello");
    expect(await engine.close()).toBe(0);
  }, 30_000);

  it("names malformed requests and unknown ops", async () => {
    const engine = startEngine(solidRoute);
    engine.child.stdin.write("{\"id\": 9, \"params\": {}}\n");
    const unknown = await engine.request(10, "nope");
    expect(unknown).toMatchObject({ ok: false, error: { code: "invalid-request" } });
    expect(engine.frames.find((frame) => frame.id === 9)).toMatchObject({ ok: false, error: { code: "invalid-request" } });
    await engine.close();
  }, 30_000);

  it("refuses a project whose only tsconfig is not strict", async () => {
    const root = tempProject({
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: false, jsx: "preserve" }, include: ["src"] }),
      "src/index.ts": "export const value: string = \"x\";\n",
    });
    const engine = startEngine(root);
    const reply = await engine.request(1, "routes");
    expect(reply).toMatchObject({ ok: false, error: { code: "non-strict-tsconfig" } });
    await engine.close();
  }, 60_000);

  it("refuses a project with no tsconfig", async () => {
    const root = tempProject({ "src/index.ts": "export const value = 1;\n" });
    const engine = startEngine(root);
    const reply = await engine.request(1, "routes");
    expect(reply).toMatchObject({ ok: false, error: { code: "no-tsconfig" } });
    await engine.close();
  }, 60_000);
});
