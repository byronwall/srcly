import { describe, expect, it } from "vitest";
import { identifierAt } from "./identifier";

describe("identifierAt", () => {
  it("finds the word at or just before the caret", () => {
    expect(identifierAt("  store.bump(n);", 4)).toBe("store");
    expect(identifierAt("  store.bump(n);", 8)).toBe("store"); // on the dot: the word just before
    expect(identifierAt("  store.bump(n);", 9)).toBe("bump");
    expect(identifierAt("  store.bump(n);", 13)).toBe("bump"); // just after `bump`
    expect(identifierAt("self.count += 1", 6)).toBe("count");
    expect(identifierAt("this.#secret", 7)).toBe("#secret");
  });
  it("returns null off a word or on a number", () => {
    expect(identifierAt("  store.bump(n);", 1)).toBeNull();
    expect(identifierAt("x = 42", 5)).toBeNull();
    expect(identifierAt("", 1)).toBeNull();
  });
});
