import { describe, expect, it } from "vitest";
import { isSameOrAncestor, linkedPathFor, nearestLinked, setHoverFrom } from "./hoverLink";

describe("isSameOrAncestor", () => {
  it("matches the path, its folders and its containing file, but not name prefixes", () => {
    expect(isSameOrAncestor("/r/src", "/r/src")).toBe(true);
    expect(isSameOrAncestor("/r/src", "/r/src/a.ts")).toBe(true);
    expect(isSameOrAncestor("/r/src/a.ts", "/r/src/a.ts::f::g")).toBe(true);
    expect(isSameOrAncestor("/r/src", "/r/srcly/a.ts")).toBe(false);
  });
});

describe("nearestLinked", () => {
  const paths = ["/r", "/r/src", "/r/src/a.ts", "/r/docs"];
  it("prefers the exact path, then the deepest ancestor", () => {
    expect(nearestLinked(paths, "/r/src/a.ts", (p) => p)).toBe("/r/src/a.ts");
    expect(nearestLinked(paths, "/r/src/b.ts", (p) => p)).toBe("/r/src");
    expect(nearestLinked(paths, "/r/src/a.ts::fn", (p) => p)).toBe("/r/src/a.ts");
    expect(nearestLinked(paths, "/other", (p) => p)).toBeNull();
    expect(nearestLinked(paths, null, (p) => p)).toBeNull();
  });
});

describe("setHoverFrom", () => {
  it("shows a hover only to the other panel, and a stale leave can't clear it", () => {
    setHoverFrom("treemap", "/r/a.ts");
    expect(linkedPathFor("explorer")).toBe("/r/a.ts");
    expect(linkedPathFor("treemap")).toBeNull();

    setHoverFrom("explorer", "/r/b.ts");
    setHoverFrom("treemap", null); // late leave from the treemap
    expect(linkedPathFor("treemap")).toBe("/r/b.ts");

    setHoverFrom("explorer", null);
    expect(linkedPathFor("treemap")).toBeNull();
  });
});
