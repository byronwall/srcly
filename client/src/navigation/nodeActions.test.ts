import { describe, expect, it } from "vitest";
import { folderOf } from "./location";
import { nodeActions, tracePatch } from "./nodeActions";

const enabled = (t: Parameters<typeof nodeActions>[0]) =>
  nodeActions(t).filter((a) => !a.disabledReason).map((a) => a.id);

describe("folderOf", () => {
  it("returns the containing folder", () => {
    expect(folderOf("a/b/c.ts")).toBe("a/b");
    expect(folderOf("a/b/c.ts#Foo::bar")).toBe("a/b");
    expect(folderOf("a/b")).toBe("a");
    expect(folderOf("top.ts")).toBe("");
    expect(folderOf("")).toBe("");
    expect(folderOf("ext:react")).toBe("");
  });
});

describe("nodeActions", () => {
  it("offers all three for files and symbols", () => {
    expect(enabled({ at: "a/b.ts", kind: "file", currentAt: "elsewhere" })).toEqual(["focus", "open", "folder"]);
    expect(enabled({ at: "a/b.ts#X", kind: "symbol", currentAt: "elsewhere" })).toEqual(["focus", "open", "folder"]);
  });

  it("has no code for folders and nothing above the root", () => {
    expect(enabled({ at: "a", kind: "folder", currentAt: "elsewhere" })).toEqual(["focus", "folder"]);
    expect(enabled({ at: "", kind: "folder", currentAt: "" })).toEqual([]);
  });

  it("disables Show folder when that folder is already shown", () => {
    expect(enabled({ at: "a/b.ts#X", kind: "symbol", currentAt: "a" })).toEqual(["focus", "open"]);
    expect(enabled({ at: "a/b.ts", kind: "file", currentAt: "a/b.ts" })).toEqual(["open", "folder"]);
  });

  it("only focuses external packages", () => {
    expect(enabled({ at: "ext:react", kind: "external", currentAt: "elsewhere" })).toEqual(["focus"]);
  });

  it("calls focusing a symbol Isolate", () => {
    expect(nodeActions({ at: "a/b.ts#X", kind: "symbol", currentAt: "a/b.ts" })[0]).toMatchObject({ id: "focus", label: "Isolate" });
    expect(nodeActions({ at: "a/b.ts", kind: "file", currentAt: "a" })[0].label).toBe("Focus");
  });

  it("keeps the order stable so the menu never reflows", () => {
    expect(nodeActions({ at: "", kind: "folder", currentAt: "" }).map((a) => a.id)).toEqual(["focus", "open", "folder", "traceTo", "traceFrom"]);
  });
});

describe("trace actions", () => {
  it("traces only a symbol with a known declaration line", () => {
    expect(enabled({ at: "a/b.ts#X", kind: "symbol", currentAt: "", line: 12 })).toEqual(["focus", "open", "folder", "traceTo", "traceFrom"]);
    expect(nodeActions({ at: "a/b.ts#X", kind: "symbol", currentAt: "" }).find((a) => a.id === "traceTo")?.disabledReason).toBe("No line for it");
    expect(nodeActions({ at: "a/b.ts", kind: "file", currentAt: "", line: 1 }).find((a) => a.id === "traceFrom")?.disabledReason).toBe("Needs a symbol");
    expect(nodeActions({ at: "ext:react", kind: "external", currentAt: "" }).find((a) => a.id === "traceTo")?.disabledReason).toBe("Outside this repo");
  });

  it("anchors the graph at the symbol by its bare name on its line, in the chosen direction", () => {
    expect(tracePatch({ at: "src/a.tsx#Foo (class)::run", line: 12 }, "traceTo")).toEqual({
      view: "graph",
      flow: undefined,
      field: undefined,
      dest: undefined,
      open: undefined,
      anchor: "src/a.tsx@run:12",
      dir: "forward",
    });
    expect(tracePatch({ at: "src/a.tsx#Foo", line: 3 }, "traceFrom")).toMatchObject({ anchor: "src/a.tsx@Foo:3", dir: "backward" });
    // A JSX scope anchors at its tag's component; an anonymous scope has nothing to anchor at.
    expect(tracePatch({ at: "src/a.tsx#Page::<RouteFrame>", line: 29 }, "traceTo")).toMatchObject({ anchor: "src/a.tsx@RouteFrame:29" });
    expect(nodeActions({ at: "src/a.tsx#Page::(anonymous)", kind: "symbol", currentAt: "", line: 4 }).find((a) => a.id === "traceTo")?.disabledReason).toBe("No name to anchor at");
  });
});
