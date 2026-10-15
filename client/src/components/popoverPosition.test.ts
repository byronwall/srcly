import { describe, expect, it } from "vitest";
import { placePopover, popoverTransformOrigin } from "./popoverPosition";

const viewport = { width: 1000, height: 800 };
const trigger = (left: number, top: number, width = 100, height = 30) => ({
  left,
  right: left + width,
  top,
  bottom: top + height,
});

describe("placePopover", () => {
  it("sits below the trigger, start-aligned", () => {
    expect(placePopover(trigger(100, 50), { width: 200, height: 300 }, viewport)).toEqual({
      top: 84,
      left: 100,
      side: "bottom",
      align: "start",
    });
  });

  it("aligns to the trigger's right edge for bottom-end", () => {
    const pos = placePopover(trigger(500, 50), { width: 300, height: 200 }, viewport, "bottom-end");
    expect(pos.left).toBe(300);
    expect(pos.align).toBe("end");
  });

  it("flips alignment when start-aligned content would leave the right edge", () => {
    const pos = placePopover(trigger(850, 50), { width: 300, height: 200 }, viewport);
    expect(pos).toMatchObject({ left: 650, align: "end" });
  });

  it("flips alignment when end-aligned content would leave the left edge", () => {
    const pos = placePopover(trigger(20, 50), { width: 300, height: 200 }, viewport, "bottom-end");
    expect(pos).toMatchObject({ left: 20, align: "start" });
  });

  it("flips above the trigger near the bottom edge", () => {
    const pos = placePopover(trigger(100, 700), { width: 200, height: 300 }, viewport);
    expect(pos).toMatchObject({ top: 396, side: "top" });
  });

  it("clamps to the viewport when nothing fits", () => {
    const pos = placePopover(trigger(100, 300), { width: 1200, height: 900 }, viewport);
    expect(pos.left).toBe(8);
    expect(pos.top).toBe(8);
  });
});

describe("popoverTransformOrigin", () => {
  it("scales from the corner touching the trigger", () => {
    expect(popoverTransformOrigin({ side: "bottom", align: "start" })).toBe("top left");
    expect(popoverTransformOrigin({ side: "bottom", align: "end" })).toBe("top right");
    expect(popoverTransformOrigin({ side: "top", align: "end" })).toBe("bottom right");
  });
});
