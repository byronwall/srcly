import { describe, expect, it } from "vitest";
import { compactText, FULL_DETAIL_ZOOM, inkForZoom, MAX_INK, viewInk, wrapName, type CompactBox } from "./boxText";

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

  it("never breaks inside a word", () => {
    for (const [word, width] of [["markdown", 30], ["navigation", 40]] as const) {
      const lines = wrapName(word, width, FONT, 3);
      expect(lines).toHaveLength(1);
      expect(lines[0].endsWith("…")).toBe(true);
    }
  });
});

// 6px per character at 12px; text scales with `k` through the font size only in a real canvas,
// so these boxes are sized in characters at the fallback estimate.
const box = (label: string, over: Partial<CompactBox> = {}): CompactBox => ({
  label,
  width: 120,
  fixedInset: 0,
  inkInset: 0,
  height: 64,
  hasStats: true,
  ...over,
});

describe("compactText", () => {
  it("keeps the stats line when the whole name fits with it", () => {
    expect(compactText(box("Toast.tsx"), 1.5)).toMatchObject({ lines: ["Toast.tsx"], stats: true });
  });

  it("drops the stats line before cutting the name", () => {
    const t = compactText(box("useAutoScrollSelection", { width: 80, height: 40 }), 1);
    expect(t.stats).toBe(false);
    expect(t.lines).toEqual(["useAutoScroll", "Selection"]);
  });
});

describe("viewInk", () => {
  it("uses the full ink when every name fits", () => {
    expect(viewInk([box("App"), box("Toast")], 1.5)).toBe(1.5);
  });

  it("shrinks every box together, not past the floor", () => {
    const k = viewInk([box("App"), box("averyveryverylongsinglewordname", { width: 100 })], 2);
    expect(k).toBeGreaterThanOrEqual(1.4);
    expect(k).toBeLessThan(2);
  });
});
