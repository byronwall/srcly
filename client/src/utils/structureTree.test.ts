import { describe, expect, it } from "vitest";
import { computeBreadcrumbPath, getEffectiveChildren, isSyntheticBodyNode } from "./structureTree";

describe("structureTree helpers", () => {
  it("detects synthetic body nodes", () => {
    expect(isSyntheticBodyNode({ name: "(body)" })).toBe(true);
    expect(isSyntheticBodyNode({ type: "function_body" })).toBe(true);
    expect(isSyntheticBodyNode({ type: "file_body" })).toBe(true);
    expect(isSyntheticBodyNode({ name: "real" })).toBe(false);
  });

  it("getEffectiveChildren hides synthetic (body) leaves", () => {
    const node = { children: [{ name: "(body)" }, { name: "x" }] };
    expect(getEffectiveChildren(node).map((c) => c.name)).toEqual(["x"]);
  });

  it("computeBreadcrumbPath picks smallest containing node", () => {
    const root = {
      name: "root",
      children: [
        { name: "big", start_line: 1, end_line: 100, children: [] },
        {
          name: "mid",
          start_line: 10,
          end_line: 50,
          children: [{ name: "small", start_line: 20, end_line: 30, children: [] }],
        },
      ],
    };

    const path = computeBreadcrumbPath(root, { start: 22, end: 24 });
    expect(path.map((n) => n.name)).toEqual(["root", "mid", "small"]);
  });
});


