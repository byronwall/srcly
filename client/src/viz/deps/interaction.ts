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
