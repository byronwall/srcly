import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { spanOf } from "../../src/srcly/selection";
import { runRoot, spanKey } from "../helpers/oracle-runtime";

// The producer oracle is only as good as the runtime under it: these cases
// pin the behaviours a false pass would hide (`producer-oracle.test.ts`).
const SOURCE = `
import { useEffect, useState } from "react";
import { createStore } from "solid-js/store";

let shared = "FIRST";
export function Writer() { shared = "LEAKED"; }
export function Reader() { return /*r1*/shared; }

export function MountOnce() {
  const [n, setN] = useState(0);
  useEffect(() => { setN((/*r2*/n) + 1); }, []);
  return /*r3*/n;
}

export function Selector() {
  const [store, setStore] = createStore({ items: [{ id: 1, label: "a" }, { id: 2, label: "b" }] });
  setStore("items", (item) => item.id === 2, "label", "z");
  return /*r4*/store.items[1].label;
}

export const handlers = { run: Stored };
export function Stored() { return /*r5*/"stored ran"; }
`;

describe("oracle runtime", () => {
  it("isolates calls, runs effects once, re-renders, runs Solid paths and stored exports", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-oracle-"));
    fs.mkdirSync(path.join(root, "src"));
    const file = path.join(root, "src", "cases.tsx");
    fs.writeFileSync(file, SOURCE);
    const program = ts.createProgram([file], { jsx: ts.JsxEmit.Preserve, strict: false, noEmit: true });
    const source = program.getSourceFile(file)!;
    // Each `/*rN*/` marks the expression right after it.
    const keys: Record<string, string> = {};
    for (const mark of SOURCE.match(/\/\*r\d\*\//g)!) {
      const start = SOURCE.indexOf(mark) + mark.length;
      const visit = (node: ts.Node) => {
        if (!keys[mark] && ts.isExpression(node) && node.getStart(source) === start) keys[mark] = spanKey("src/cases.tsx", spanOf(source, node));
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    const { recorded } = await runRoot(root, program, new Set(Object.values(keys)));
    const values = (mark: string) => (recorded.get(keys[mark]) ?? []).map((item) => item.value);

    // Writer's call never shows in Reader's: each call starts from fresh modules.
    expect(values("/*r1*/")).toEqual(["FIRST", "FIRST", "FIRST"]);
    // A mount-only effect runs once per call; its update shows on the next render.
    expect(values("/*r2*/")).toEqual([0, 0, 0]);
    expect(values("/*r3*/")).toEqual([0, 1, 0, 1, 0, 1]);
    // A predicate path writes the matching item, as the real store does.
    expect(values("/*r4*/")).toEqual(["z", "z", "z"]);
    // An export the program only stores, never calls, is still run.
    expect(values("/*r5*/").length).toBe(3);
  });
});
