export type PopoverPlacement = "bottom-start" | "bottom-end";

export interface PopoverPosition {
  top: number;
  left: number;
  /** Which side of the trigger the content ended up on (drives transform-origin). */
  side: "top" | "bottom";
  align: "start" | "end";
}

type Rect = { top: number; bottom: number; left: number; right: number };
type Size = { width: number; height: number };

/**
 * Place popover content against its trigger: below it, aligned to the
 * requested edge. Flip above when it doesn't fit below and there's more room
 * above, flip alignment when it would leave the viewport sideways, then clamp
 * to the viewport on all four edges.
 */
export function placePopover(
  trigger: Rect,
  content: Size,
  viewport: Size,
  placement: PopoverPlacement = "bottom-start",
  offset = { x: 0, y: 4 },
  margin = 8
): PopoverPosition {
  const startLeft = trigger.left + offset.x;
  const endLeft = trigger.right - content.width + offset.x;
  const fitsX = (left: number) => left >= margin && left + content.width <= viewport.width - margin;

  let align: PopoverPosition["align"] = placement === "bottom-end" ? "end" : "start";
  let left = align === "end" ? endLeft : startLeft;
  if (!fitsX(left)) {
    const other = align === "end" ? startLeft : endLeft;
    if (fitsX(other)) {
      left = other;
      align = align === "end" ? "start" : "end";
    }
  }

  let side: PopoverPosition["side"] = "bottom";
  let top = trigger.bottom + offset.y;
  const spaceBelow = viewport.height - margin - trigger.bottom - offset.y;
  const spaceAbove = trigger.top - offset.y - margin;
  if (content.height > spaceBelow && spaceAbove > spaceBelow) {
    side = "top";
    top = trigger.top - offset.y - content.height;
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  left = clamp(left, margin, viewport.width - margin - content.width);
  top = clamp(top, margin, viewport.height - margin - content.height);
  return { top, left, side, align };
}

/** Scale from the corner nearest the trigger. */
export function popoverTransformOrigin(pos: Pick<PopoverPosition, "side" | "align">): string {
  return `${pos.side === "bottom" ? "top" : "bottom"} ${pos.align === "start" ? "left" : "right"}`;
}
