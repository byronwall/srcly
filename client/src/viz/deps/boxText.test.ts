import { describe, expect, it } from "vitest";
import { FULL_DETAIL_ZOOM, inkForZoom, MAX_INK, wrapName } from "./boxText";

// Without a canvas the measurer estimates 6px per character.
const FONT = "600 12px Inter";

describe("inkForZoom", () => {
  it("keeps full detail at readable zoom", () => {
    expect(inkForZoom(FULL_DETAIL_ZOOM)).toBe(1);
    expect(inkForZoom(1.25)).toBe(1);
  });

  it("scales text up about 1 / zoom, in tenths, up to the cap", () => {
    expect(inkForZoom(0.66)).toBe(1.5);
    expect(inkForZoom(0.5)).toBe(2);
    expect(inkForZoom(0.2)).toBe(MAX_INK);
  });
});

describe("wrapName", () => {
  it("keeps a name that fits on one line", () => {
    expect(wrapName("App.tsx", 120, FONT, 2)).toEqual(["App.tsx"]);
  });

  it("breaks at camelCase humps", () => {
    expect(wrapName("useAutoScrollSelection", 80, FONT, 2)).toEqual(["useAutoScroll", "Selection"]);
  });

  it("drops a file extension before wrapping", () => {
    expect(wrapName("CompareApp.tsx", 72, FONT, 2)).toEqual(["CompareApp"]);
    expect(wrapName("FilePickerWithExternal.tsx", 90, FONT, 2)).toEqual(["FilePickerWith", "External"]);
  });

  it("cuts the last line with an ellipsis", () => {
    const lines = wrapName("rehypeWrapSelectionAndMoreStuff", 60, FONT, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });

  it("hard-breaks a single word wider than the box", () => {
    const lines = wrapName("abcdefghijklmnopqrstuvwxyz", 60, FONT, 3);
    expect(lines[0]).toBe("abcdefghij");
    expect(lines.length).toBeGreaterThan(1);
  });
});
