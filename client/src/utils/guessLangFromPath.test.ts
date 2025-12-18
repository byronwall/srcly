import { describe, expect, it } from "vitest";
import { guessLangFromPath } from "./guessLangFromPath";

describe("guessLangFromPath", () => {
  it("maps common extensions", () => {
    expect(guessLangFromPath("foo.tsx")).toBe("tsx");
    expect(guessLangFromPath("foo.ts")).toBe("ts");
    expect(guessLangFromPath("foo.jsx")).toBe("jsx");
    expect(guessLangFromPath("foo.js")).toBe("js");
    expect(guessLangFromPath("foo.json")).toBe("json");
    expect(guessLangFromPath("foo.py")).toBe("python");
    expect(guessLangFromPath("foo.ipynb")).toBe("python");
    expect(guessLangFromPath("foo.md")).toBe("md");
    expect(guessLangFromPath("foo.html")).toBe("html");
    expect(guessLangFromPath("foo.css")).toBe("css");
    expect(guessLangFromPath("foo.yaml")).toBe("yaml");
    expect(guessLangFromPath("foo.toml")).toBe("toml");
    expect(guessLangFromPath("foo.sh")).toBe("bash");
  });

  it("is case-insensitive and falls back to txt", () => {
    expect(guessLangFromPath("FOO.TS")).toBe("ts");
    expect(guessLangFromPath("noext")).toBe("txt");
  });
});
