import path from "node:path";
import { describe, expect, it } from "vitest";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { fileExportsOp } from "../../src/srcly/ops/file-exports";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";
import { solidRoute } from "./engine-process";

function sessionFor(root: string) {
  const source = path.join(root, "src");
  return createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
}

describe("fileExports lists what a file or folder anchor fans out to (T19)", () => {
  it("names a file's exports with the line to anchor at, and says which are traceable", () => {
    const session = sessionFor(solidRoute);
    const result = fileExportsOp(session, { file: "src/components/ViewerCard.tsx" });
    expect(result.outcome).toBe("ok");
    expect(result.target).toMatchObject({ path: "src/components/ViewerCard.tsx", kind: "file" });
    expect(result.files.map((f) => f.file)).toEqual(["src/components/ViewerCard.tsx"]);
    const card = result.files[0].exports.find((e) => e.name === "ViewerCard")!;
    expect(card).toMatchObject({ kind: "component", traceable: true, reexported: false, file: "src/components/ViewerCard.tsx" });
    expect(card.id).toBe(`src/components/ViewerCard.tsx@ViewerCard:${card.line}`);
    expect(result.counts.exports).toBe(result.files[0].exports.length);
  });

  it("names a default-exported function by its own name, so its id anchors", () => {
    const session = sessionFor(solidRoute);
    const route = fileExportsOp(session, { file: "src/routes/records.tsx" }).files[0].exports.find((e) => e.name.startsWith("default"))!;
    expect(route).toMatchObject({ name: "default (RecordsRoute)", traceable: true });
    expect(route.id).toBe(`src/routes/records.tsx@RecordsRoute:${route.line}`);
    // The UI anchors an export by its id's name and line.
    const graph = anchorGraphOp(session, { file: route.file, name: "RecordsRoute", line: route.line, direction: "both" });
    expect(graph.anchor.text).toBe("RecordsRoute");
  });

  it("walks a folder in path order, counts types as not traceable, and refuses a path outside the root or without program files", () => {
    const session = sessionFor(solidRoute);
    const result = fileExportsOp(session, { file: "src/data" });
    expect(result.target.kind).toBe("folder");
    expect(result.files.map((f) => f.file)).toEqual(["src/data/records.ts", "src/data/selectors.ts", "src/data/types.ts", "src/data/viewer.ts"]);
    const types = result.files.find((f) => f.file === "src/data/types.ts")!;
    expect(types.exports.length).toBeGreaterThan(0);
    expect(types.exports.every((e) => !e.traceable && (e.kind === "type" || e.kind === "interface"))).toBe(true);
    expect(result.counts.traceable).toBeLessThan(result.counts.exports);
    expect(result.counts.files).toBe(4);
    expect(() => fileExportsOp(session, { file: "../elsewhere" })).toThrowError(expect.objectContaining({ code: "invalid-request" }));
    expect(() => fileExportsOp(session, { file: "src/nothing-here" })).toThrowError(expect.objectContaining({ code: "not-found" }));
  }, 60_000);
});
