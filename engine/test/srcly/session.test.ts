import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type * as ReportBuilder from "../../src/analysis/report-builder";
import { createEngineSession } from "../../src/srcly/session";
import { routesOp } from "../../src/srcly/ops/routes";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";
import { solidRoute } from "./engine-process";

const buildReport = vi.hoisted(() => vi.fn());
vi.mock("../../src/analysis/report-builder", async (importOriginal) => {
  const original = await importOriginal<typeof ReportBuilder>();
  buildReport.mockImplementation(original.buildReport);
  return { ...original, buildReport };
});

const temporary: string[] = [];
afterAll(() => {
  for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true });
});

function session(root: string) {
  return createEngineSession({ root, source: path.join(root, "src"), tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
}

describe("engine session", () => {
  it("answers routes from tier 1 without building the legacy report", () => {
    const engine = session(solidRoute);
    const result = routesOp(engine, {});
    expect(result.routes.map((route) => route.pathPattern)).toEqual(["/records"]);
    expect(buildReport).not.toHaveBeenCalled();
    engine.tier1().fullReport();
    expect(buildReport).toHaveBeenCalledTimes(1);
  }, 60_000);

  it("changes programHash when a source file's mtime changes, and refresh bumps the generation", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-session-"));
    temporary.push(root);
    fs.cpSync(solidRoute, root, { recursive: true });
    const engine = session(root);
    const first = engine.tier1();
    expect(engine.currentHash()).toBe(first.generation.programHash);

    const file = path.join(root, "src/components/MetricCard.tsx");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(file, later, later);
    expect(engine.currentHash()).not.toBe(first.generation.programHash);

    engine.refresh();
    const second = engine.tier1();
    expect(second.generation.id).toBe(first.generation.id + 1);
    expect(second.generation.programHash).toBe(engine.currentHash());
  }, 60_000);
});
