import { describe, expect, it } from "vitest";
import { resolveMarkdownImageSrc } from "./markdownImageSrc";

describe("resolveMarkdownImageSrc", () => {
  it("leaves external and absolute URLs untouched", () => {
    expect(resolveMarkdownImageSrc("https://x/y.png", "a/b.md")).toBe(
      "https://x/y.png"
    );
    expect(resolveMarkdownImageSrc("/img/y.png", "a/b.md")).toBe("/img/y.png");
    expect(resolveMarkdownImageSrc("data:image/png;base64,abc", "a/b.md")).toBe(
      "data:image/png;base64,abc"
    );
  });

  it("resolves relative paths against the markdown file path", () => {
    const out = resolveMarkdownImageSrc("./img/p.png", "docs/readme.md");
    expect(out).toBe(
      `/api/files/content?path=${encodeURIComponent("docs/img/p.png")}`
    );
  });

  it("handles .. traversal", () => {
    const out = resolveMarkdownImageSrc("../assets/a.png", "docs/readme.md");
    expect(out).toBe(
      `/api/files/content?path=${encodeURIComponent("assets/a.png")}`
    );
  });
});


