import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type * as ReportBuilder from "../../src/analysis/report-builder";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
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

describe("project admission", () => {
  const project = (files: Record<string, string>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-admission-"));
    temporary.push(root);
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), text);
    }
    return root;
  };
  const members = (root: string) => requireTypescript(session(root).tier1(), "the test").program.getSourceFiles().filter((file) => !file.isDeclarationFile).map((file) => path.relative(root, file.fileName)).sort();
  const strict = JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] });

  it("reads a jsconfig.json and every JavaScript root, the root-only .mjs included", () => {
    const root = project({ "jsconfig.json": strict, "src/a.js": "export const a = 1;\n", "src/b.mjs": "export const b = 2;\n", "src/c.cjs": "module.exports = 3;\n", "src/d.jsx": "export const d = <i />;\n" });
    expect(members(root)).toEqual(["src/a.js", "src/b.mjs", "src/c.cjs", "src/d.jsx"]);
  }, 60_000);

  it("reads .mts and .cts roots, and no declaration file as a root", () => {
    const root = project({ "tsconfig.json": strict, "src/a.mts": "export const a = 1;\n", "src/b.cts": "export const b = 2;\n", "src/c.d.mts": "export declare const c: number;\n" });
    expect(members(root)).toEqual(["src/a.mts", "src/b.cts"]);
  }, 60_000);

  it("prefers a folder's tsconfig.json to its jsconfig.json", () => {
    const root = project({ "tsconfig.json": strict, "jsconfig.json": JSON.stringify({ include: ["other"] }), "src/a.ts": "export const a = 1;\n", "other/b.js": "export const b = 2;\n" });
    expect(members(root)).toEqual(["src/a.ts"]);
  }, 60_000);

  it("opens a loose jsconfig, and says its types prove nothing about null", () => {
    const root = project({ "jsconfig.json": JSON.stringify({ include: ["src"] }), "src/a.js": "export const a = 1;\n" });
    const built = session(root).tier1();
    expect(members(root)).toEqual(["src/a.js"]);
    expect(built.generation).toMatchObject({ nullProof: false, tsconfig: path.join(root, "jsconfig.json") });
  }, 60_000);

  it("keeps the null proof of a strict config", () => {
    const root = project({ "tsconfig.json": strict, "src/a.ts": "export const a = 1;\n" });
    expect(session(root).tier1().generation.nullProof).toBe(true);
  }, 60_000);

  it("analyzes a folder with no project config, and writes none", () => {
    const root = project({ "src/a.js": "export const a = 1;\n", "src/b.jsx": "export const b = 2;\n", "src/skip.test.js": "export const c = 3;\n", "dist/out.js": "export const d = 4;\n" });
    const before = fs.readdirSync(root).sort();
    expect(members(root)).toEqual(["src/a.js", "src/b.jsx"]);
    expect(session(root).tier1().generation).toMatchObject({ nullProof: false, tsconfig: "" });
    expect(fs.readdirSync(root).sort()).toEqual(before);
  }, 60_000);

  it("still names a config it cannot read: a broken config is not a missing one", () => {
    const root = project({ "jsconfig.json": "{ nope", "src/a.js": "export const a = 1;\n" });
    expect(() => session(root).tier1()).toThrow(expect.objectContaining({ code: "no-tsconfig" }));
  }, 60_000);

  it("names the refusal when a folder has no project and no source", () => {
    const root = project({ "src/notes.md": "hi\n" });
    expect(() => session(root).tier1()).toThrow(expect.objectContaining({ code: "no-tsconfig" }));
  }, 60_000);
});

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

  it("release drops tier 1 and keeps the generation when the sources still hash the same", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-session-"));
    temporary.push(root);
    fs.cpSync(solidRoute, root, { recursive: true });
    const engine = session(root);
    const first = engine.tier1();
    const routes = routesOp(engine, {});

    engine.release();
    expect(engine.built()).toBe(false);
    const rebuilt = engine.tier1();
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.generation).toEqual(first.generation);
    expect(routesOp(engine, {})).toEqual(routes);

    // A file changed while released: the rebuild is a new generation.
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(root, "src/components/MetricCard.tsx"), later, later);
    engine.release();
    expect(engine.tier1().generation.id).toBe(first.generation.id + 1);
  }, 60_000);
});
