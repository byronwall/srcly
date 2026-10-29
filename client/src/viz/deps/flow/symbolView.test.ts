import { describe, expect, it } from "vitest";
import { edgeLabel, stepWord } from "./symbolView";
import type { AnchorNode } from "./anchorAdapter";

const step = (label: string, elementKind = "call", operation: string | null = null) => ({ label, elementKind, operation }) as AnchorNode;

describe("what a folded step says", () => {
  it("names a call by its callee, a method by its name, a pack and a JSX occurrence", () => {
    expect(stepWord(step("toDetail(row)"))).toBe("toDetail()");
    expect(stepWord(step("raw.map((tag) => tag.trim())"))).toBe(".map()");
    expect(stepWord(step("new Error(`x`)"))).toBe("Error()");
    expect(stepWord(step("{ id }", "object-pack", "object-pack"))).toBe("pack");
    expect(stepWord(step("Match", "jsx-occurrence"))).toBe("<Match>");
  });

  it("labels an edge by its field and at most three steps, each once, without the returns every call has", () => {
    expect(edgeLabel("title", ["return", "toDetail()", "return", ".trim()"])).toBe("title · toDetail() · .trim()");
    expect(edgeLabel(null, ["a()", "b()", "a()", "c()", "d()", "e()"])).toBe("a() · b() · c() · +2");
    expect(edgeLabel(null, ["return"])).toBe("return");
    expect(edgeLabel(null, [])).toBeNull();
  });
});
