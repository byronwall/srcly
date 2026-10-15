import { describe, expect, it } from "vitest";
import { findScopeForSymbol } from "./dataProcessing";

const scope = (name: string, start: number, end: number, children: any[] = []) => ({
  name,
  type: "function",
  path: `/repo/f::${name}`,
  start_line: start,
  end_line: end,
  children,
});

const pyFile = {
  name: "pipeline.py",
  path: "/repo/pipeline.py",
  type: "file",
  children: [
    scope("(imports)", 1, 4),
    scope("(class) Runner", 10, 40, [scope("__init__", 11, 14), scope("run", 16, 40)]),
    // Decorated function: the scope starts on the decorator, the graph symbol on `def`.
    scope("(async) run_pipeline", 43, 60),
    scope("helper", 62, 70),
  ],
};

const tsFile = {
  name: "view.tsx",
  path: "/repo/view.tsx",
  type: "file",
  children: [
    scope("Props (interface)", 3, 8),
    scope("View", 10, 30, [scope("<div>", 12, 28)]),
    scope("render", 32, 40),
    scope("Other", 42, 60, [scope("render", 44, 50)]),
    scope("(anonymous)", 80, 90, [scope("inner", 80, 85)]),
  ],
};

describe("findScopeForSymbol", () => {
  it("matches a Python class by line and bare name", () => {
    expect(findScopeForSymbol(pyFile, "Runner", 10)?.name).toBe("(class) Runner");
  });

  it("matches a decorated function whose scope starts a line or two earlier", () => {
    expect(findScopeForSymbol(pyFile, "run_pipeline", 45)?.name).toBe("(async) run_pipeline");
  });

  it("matches a TS const arrow function and an interface", () => {
    expect(findScopeForSymbol(tsFile, "View", 10)?.name).toBe("View");
    expect(findScopeForSymbol(tsFile, "Props", 3)?.name).toBe("Props (interface)");
  });

  it("prefers a name match over a closer scope", () => {
    expect(findScopeForSymbol(pyFile, "Runner", 11)?.name).toBe("(class) Runner");
  });

  it("prefers the outer scope when nothing matches by name", () => {
    expect(findScopeForSymbol(tsFile, "default", 80)?.start_line).toBe(80);
    expect(findScopeForSymbol(tsFile, "default", 80)?.name).toBe("(anonymous)");
  });

  it("picks the duplicate name nearest the symbol line", () => {
    expect(findScopeForSymbol(tsFile, "render", 32)?.start_line).toBe(32);
    expect(findScopeForSymbol(tsFile, "render", 44)?.start_line).toBe(44);
  });

  it("returns null when nothing starts near the line", () => {
    expect(findScopeForSymbol(pyFile, "CONSTANT", 100)).toBeNull();
    expect(findScopeForSymbol(pyFile, "Runner", undefined)).toBeNull();
    expect(findScopeForSymbol(null, "Runner", 10)).toBeNull();
  });
});
