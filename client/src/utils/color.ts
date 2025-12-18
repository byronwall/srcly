import * as d3 from "d3";

export function getContrastingTextColor(bgColor: string, alpha = 1) {
  const base = d3.hsl(bgColor);

  // Drive text toward near-black or near-white while preserving hue for subtle color harmony.
  // This strongly increases contrast versus the background.
  const lightBackground = base.l >= 0.5;
  const targetLightness = lightBackground ? 0.12 : 0.9;

  const textColor = d3.hsl(base.h, base.s * 0.9, targetLightness).rgb();
  return `rgba(${Math.round(textColor.r)}, ${Math.round(
    textColor.g
  )}, ${Math.round(textColor.b)}, ${alpha})`;
}
