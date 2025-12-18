import { describe, expect, it } from "vitest";
import { reduceCommonIndent } from "./indentation";

describe("reduceCommonIndent", () => {
  it("does nothing when min indent <= keepIndent (default=2)", () => {
    const input = ["  a", "  b"];
    const res = reduceCommonIndent(input);
    expect(res.reduced).toBe(false);
    expect(res.lines).toBe(input);
  });

  it("reduces deep indentation while keeping 2 spaces", () => {
    const input = ["      a", "        b", "", "      c"];
    const res = reduceCommonIndent(input);
    expect(res.reduced).toBe(true);
    expect(res.lines).toEqual(["  a", "    b", "", "  c"]);
  });

  it("supports custom keepIndent", () => {
    const input = ["        a", "        b"];
    const res = reduceCommonIndent(input, { keepIndent: 0 });
    expect(res.reduced).toBe(true);
    expect(res.lines).toEqual(["a", "b"]);
  });
});


