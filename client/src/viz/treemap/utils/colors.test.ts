import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { applyDepthEffect, rampColor, TREEMAP_RAMP, treemapFillColor, treemapLabelColor } from "./colors";

function luminance(color: string): number {
  const c = d3.rgb(color);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SAMPLES = d3.range(0, 1.0001, 0.05);

describe("treemap ramp", () => {
  it("starts and ends on the named stops", () => {
    expect(rampColor(0)).toBe(TREEMAP_RAMP[0]);
    expect(rampColor(1)).toBe(TREEMAP_RAMP[TREEMAP_RAMP.length - 1]);
    expect(rampColor(-1)).toBe(TREEMAP_RAMP[0]);
    expect(rampColor(Number.NaN)).toBe(TREEMAP_RAMP[0]);
  });

  it("keeps tile labels at WCAG AA (4.5:1) on every ramp color and depth", () => {
    for (const depth of [0, 1, 2, 4]) {
      for (const t of SAMPLES) {
        const bg = applyDepthEffect(rampColor(t), depth);
        const label = d3.rgb(treemapLabelColor("complexity", { complexity: t * 50 }, depth)).formatHex();
        expect(contrast(label, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the folder label token readable on every ramp color", () => {
    const onSurface = "#0f172a";
    for (const t of SAMPLES) expect(contrast(onSurface, rampColor(t))).toBeGreaterThanOrEqual(4.5);
  });

  it("maps a metric's midpoint to the amber stop", () => {
    expect(treemapFillColor("complexity", { complexity: 10 }, 0)).toBe(rampColor(0.5));
  });
});
