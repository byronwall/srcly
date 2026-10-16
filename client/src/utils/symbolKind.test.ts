import { describe, expect, it } from "vitest";
import { symbolKind } from "./symbolKind";

describe("symbolKind", () => {
  it("unfolds the kind the analyzers put in the name", () => {
    expect(symbolKind({ name: "SortField (type)" })).toEqual({ kind: "type", name: "SortField" });
    expect(symbolKind({ name: "Node (interface)" })).toEqual({ kind: "interface", name: "Node" });
    expect(symbolKind({ name: "value (obj)" })).toEqual({ kind: "object", name: "value" });
    expect(symbolKind({ name: "(class) Walker" })).toEqual({ kind: "class", name: "Walker" });
    expect(symbolKind({ name: "(async) fetch_all" })).toEqual({ kind: "function", name: "fetch_all" });
  });

  it("recognizes imports, JSX, files and plain functions", () => {
    expect(symbolKind({ name: "(imports)" }).kind).toBe("imports");
    expect(symbolKind({ name: "<Popover>" }).kind).toBe("jsx");
    expect(symbolKind({ name: "a.ts", type: "file" }).kind).toBe("file");
    expect(symbolKind({ name: "createMemo(ƒ)" })).toEqual({ kind: "function", name: "createMemo(ƒ)" });
  });
});
