// Pure pointer-interaction helpers for the dependency canvas.

/**
 * A hovered id only counts while the layout still contains it. Refocusing
 * replaces the hovered element, so its `mouseleave` never fires and the id
 * would otherwise keep dimming every other node.
 */
export function liveHover(ids: ReadonlySet<string>, id: string | null): string | null {
  return id !== null && ids.has(id) ? id : null;
}

/** How long a single click waits for a second one before it focuses. */
export const DOUBLE_CLICK_WINDOW_MS = 220;

export interface ClickIntentOptions<T> {
  onFocus: (target: T) => void;
  onOpen: (target: T) => void;
  windowMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface ClickIntent<T> {
  /** A primary-button click. ⌘/Ctrl opens at once. */
  click: (target: T, modifiers?: { metaKey?: boolean; ctrlKey?: boolean }) => void;
  /** An `auxclick`; the middle button (1) opens at once. */
  auxClick: (target: T, button: number) => void;
  /** Drop a pending focus (unmount, or the view changed under it). */
  cancel: () => void;
}

/**
 * Click → focus after the double-click window; a second click on the same
 * target inside the window → open instead. Delaying focus keeps the node
 * under the pointer until the second click lands.
 */
export function createClickIntent<T>(opts: ClickIntentOptions<T>): ClickIntent<T> {
  const windowMs = opts.windowMs ?? DOUBLE_CLICK_WINDOW_MS;
  const schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelTimer = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let pending: { target: T; handle: unknown } | null = null;

  const cancel = () => {
    if (pending) cancelTimer(pending.handle);
    pending = null;
  };

  const open = (target: T) => {
    cancel();
    opts.onOpen(target);
  };

  return {
    click(target, modifiers) {
      if (modifiers?.metaKey || modifiers?.ctrlKey) return open(target);
      if (pending && pending.target === target) return open(target);
      cancel();
      const handle = schedule(() => {
        pending = null;
        opts.onFocus(target);
      }, windowMs);
      pending = { target, handle };
    },
    auxClick(target, button) {
      if (button === 1) open(target);
    },
    cancel,
  };
}

export type Direction = "left" | "right" | "up" | "down";
export interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Arrow-key movement between boxes: the nearest box whose center lies in
 * `dir` from the current one, preferring boxes in line with it (the sideways
 * gap between their edges counts five times). Null at the edge of the graph.
 */
export function nextInDirection(rects: Rect[], fromId: string, dir: Direction): string | null {
  const from = rects.find((r) => r.id === fromId);
  if (!from) return null;
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  let best: { id: string; score: number } | null = null;
  for (const r of rects) {
    if (r.id === fromId) continue;
    const dx = r.x + r.width / 2 - cx;
    const dy = r.y + r.height / 2 - cy;
    const across = dir === "left" || dir === "right";
    const ahead = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
    if (ahead <= 1) continue;
    // Sideways gap between the two boxes' edges: 0 when they share a row (or column).
    const side = across
      ? Math.max(0, Math.abs(dy) - (r.height + from.height) / 2)
      : Math.max(0, Math.abs(dx) - (r.width + from.width) / 2);
    const score = ahead + 5 * side;
    if (!best || score < best.score) best = { id: r.id, score };
  }
  return best?.id ?? null;
}

export type ClickActionKind = "focus" | "isolate" | "expand" | "collapse" | "none";

/**
 * What a click on a box does: a plain click focuses it (isolates a symbol);
 * Shift-click opens it in place, or closes the opened folder around it. The
 * canvas cursor and the status line both read this, so they always agree.
 */
export function clickAction(
  n: { graphId: string; kind: string; expandable?: boolean; group?: { id: string; label: string } },
  opts: { shift: boolean; focusId: string | null; collapsible: (groupId: string) => boolean },
): { kind: ClickActionKind; frame?: string } {
  if (opts.shift) {
    if (n.expandable) return { kind: "expand" };
    if (n.group && opts.collapsible(n.group.id)) return { kind: "collapse", frame: n.group.label };
    return { kind: "none" };
  }
  if (n.graphId === opts.focusId) return { kind: "none" };
  return { kind: n.kind === "symbol" ? "isolate" : "focus" };
}

/** The canvas cursor for each click action. */
export const CLICK_CURSOR: Record<ClickActionKind, string> = {
  focus: "zoom-in",
  isolate: "zoom-in",
  expand: "cell",
  collapse: "zoom-out",
  none: "default",
};
