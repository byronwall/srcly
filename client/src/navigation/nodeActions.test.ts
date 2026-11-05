import { describe, expect, it } from "vitest";
import { folderOf } from "./location";
import { addAnchorPatch, nodeActions, refsPatch, tracePatch } from "./nodeActions";

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
    expect(enabled({ at: "a/b.ts", kind: "file", currentAt: "elsewhere" })).toEqual(["focus", "open", "folder", "refs", "traceTo", "traceFrom"]);
    expect(enabled({ at: "a/b.ts#X", kind: "symbol", currentAt: "elsewhere" })).toEqual(["focus", "open", "folder", "refs"]);
  });

  it("has no code for folders and nothing above the root", () => {
    expect(enabled({ at: "a", kind: "folder", currentAt: "elsewhere" })).toEqual(["focus", "folder", "traceTo", "traceFrom"]);
    expect(enabled({ at: "", kind: "folder", currentAt: "" })).toEqual([]);
  });

  it("disables Show folder when that folder is already shown", () => {
    expect(enabled({ at: "a/b.ts#X", kind: "symbol", currentAt: "a" })).toEqual(["focus", "open", "refs"]);
    expect(enabled({ at: "a/b.ts", kind: "file", currentAt: "a/b.ts" })).toEqual(["open", "folder", "refs", "traceTo", "traceFrom"]);
  });

  it("only focuses external packages", () => {
    expect(enabled({ at: "ext:react", kind: "external", currentAt: "elsewhere" })).toEqual(["focus"]);
  });

  it("calls focusing a symbol Isolate", () => {
    expect(nodeActions({ at: "a/b.ts#X", kind: "symbol", currentAt: "a/b.ts" })[0]).toMatchObject({ id: "focus", label: "Isolate" });
    expect(nodeActions({ at: "a/b.ts", kind: "file", currentAt: "a" })[0].label).toBe("Focus");
  });

  it("keeps the order stable so the menu never reflows", () => {
    expect(nodeActions({ at: "", kind: "folder", currentAt: "" }).map((a) => a.id)).toEqual(["focus", "open", "folder", "refs", "traceTo", "traceFrom"]);
  });
});

describe("Show references", () => {
  it("opens Symbols mode on the symbol or file, and is disabled where there is nothing to look up or it is already shown", () => {
    expect(refsPatch({ at: "a/b.ts#X" })).toMatchObject({ view: "graph", symbols: "a/b.ts#X", flow: undefined, anchor: undefined, open: undefined });
    expect(refsPatch({ at: "a.py#Foo (class)::run" }).symbols).toBe("a.py#Foo.run");
    expect(refsPatch({ at: "a/b.ts" }).symbols).toBe("a/b.ts");
    const reason = (target: Parameters<typeof nodeActions>[0]) => nodeActions(target).find((a) => a.id === "refs")?.disabledReason;
    expect(reason({ at: "a", kind: "folder", currentAt: "" })).toBe("Pick a file or symbol");
    expect(reason({ at: "ext:react", kind: "external", currentAt: "" })).toBe("Outside this repo");
    expect(reason({ at: "a/b.tsx#<Panel>", kind: "symbol", currentAt: "" })).toBe("No name to look up");
    expect(reason({ at: "a/b.ts#X", kind: "symbol", currentAt: "", current: { repo: "/r", at: "a/b.ts#X", view: "graph", symbols: "a/b.ts#X" } })).toBe("Already showing them");
    expect(reason({ at: "a/b.ts#X", kind: "symbol", currentAt: "", current: { repo: "/r", at: "", view: "graph", symbols: "a/b.ts#Y" } })).toBeUndefined();
  });
});

describe("trace actions", () => {
  it("traces only a symbol with a known declaration line", () => {
    expect(enabled({ at: "a/b.ts#X", kind: "symbol", currentAt: "", line: 12 })).toEqual(["focus", "open", "folder", "refs", "traceTo", "traceFrom"]);
    expect(nodeActions({ at: "a/b.ts#X", kind: "symbol", currentAt: "" }).find((a) => a.id === "traceTo")?.disabledReason).toBe("No line for it");
    // A file (or folder) traces through its exports (T19): no line needed.
    expect(nodeActions({ at: "a/b.ts", kind: "file", currentAt: "", line: 1 }).find((a) => a.id === "traceFrom")?.disabledReason).toBeUndefined();
    expect(tracePatch({ at: "a/b.ts" }, "traceTo")).toMatchObject({ anchor: "a/b.ts@*", dir: "forward" });
    expect(tracePatch({ at: "a" }, "traceFrom")).toMatchObject({ anchor: "a@*", dir: "backward" });
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

describe("adding to the trace (T20)", () => {
  const graph = { repo: "/r", at: "", view: "graph" as const };
  it("joins a symbol to the anchors in anchor mode, up to three, never twice", () => {
    const one = { ...graph, anchor: "src/a.tsx@A:3", dir: "forward" as const };
    expect(addAnchorPatch({ at: "src/b.tsx#B", line: 7 }, one)).toEqual({ anchor: "src/a.tsx@A:3|src/b.tsx@B:7" });
    expect(addAnchorPatch({ at: "src/a.tsx#A", line: 3 }, one)).toBeNull();
    expect(addAnchorPatch({ at: "src/b.tsx", line: 7 }, one)).toBeNull();
    expect(addAnchorPatch({ at: "src/b.tsx#B" }, one)).toBeNull();
    expect(addAnchorPatch({ at: "src/b.tsx#B", line: 7 }, graph)).toBeNull();
    const full = { ...graph, anchor: "src/a.tsx@A:3|src/b.tsx@B:7|src/c.ts@c:1" };
    expect(addAnchorPatch({ at: "src/d.ts#d", line: 2 }, full)).toBeNull();
    expect(addAnchorPatch({ at: "src/d.ts#d", line: 2 }, { ...graph, anchor: "src/utils@*" })).toBeNull();
  });

  it("offers Add to the trace only in anchor mode, with the count", () => {
    const one = { ...graph, anchor: "src/a.tsx@A:3" };
    const add = nodeActions({ at: "src/b.tsx#B", kind: "symbol", currentAt: "", line: 7, current: one }).find((a) => a.id === "traceAdd");
    expect(add).toMatchObject({ label: "Add to the trace (1 of 3)", disabledReason: undefined });
    expect(nodeActions({ at: "src/b.tsx#B", kind: "symbol", currentAt: "", line: 7, current: graph }).some((a) => a.id === "traceAdd")).toBe(false);
    expect(nodeActions({ at: "src/b.tsx", kind: "file", currentAt: "", current: one }).find((a) => a.id === "traceAdd")?.disabledReason).toBe("Needs a symbol");
    expect(nodeActions({ at: "src/a.tsx#A", kind: "symbol", currentAt: "", line: 3, current: one }).find((a) => a.id === "traceAdd")?.disabledReason).toBe("Already an anchor");
  });
});
