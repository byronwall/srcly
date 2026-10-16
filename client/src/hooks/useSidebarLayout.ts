import { createSignal, onCleanup, onMount } from "solid-js";

const WIDTH_KEY = "srcly.sidebar.width";
const COLLAPSED_KEY = "srcly.sidebar.collapsed";

export const SIDEBAR_DEFAULT_WIDTH = 320;
export const SIDEBAR_MIN_WIDTH = 240;
/** Dragging the handle left of this collapses the sidebar instead of shrinking it. */
const COLLAPSE_DRAG_WIDTH = 140;

const read = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the layout still works for this session.
  }
};

/** Keep room for the treemap: the sidebar never takes more than half the window. */
const clampWidth = (width: number) =>
  Math.round(Math.max(SIDEBAR_MIN_WIDTH, Math.min(width, window.innerWidth * 0.5)));

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The explorer sidebar's width and collapsed state, both remembered across
 * reloads. Drag the handle to resize (past the minimum collapses it),
 * double-click it to reset, and press `[` to toggle.
 */
export function useSidebarLayout() {
  const storedWidth = Number(read(WIDTH_KEY));
  const [width, setWidth] = createSignal(
    clampWidth(Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : SIDEBAR_DEFAULT_WIDTH)
  );
  const [collapsed, setCollapsedSignal] = createSignal(read(COLLAPSED_KEY) === "1");
  const [dragging, setDragging] = createSignal(false);

  const setCollapsed = (next: boolean) => {
    setCollapsedSignal(next);
    write(COLLAPSED_KEY, next ? "1" : "0");
  };
  const toggle = () => setCollapsed(!collapsed());

  const onPointerMove = (event: PointerEvent) => {
    if (event.clientX < COLLAPSE_DRAG_WIDTH) return;
    setWidth(clampWidth(event.clientX));
  };
  const stopDrag = (event: PointerEvent) => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    document.body.classList.remove("plc-resizing");
    setDragging(false);
    if (event.clientX < COLLAPSE_DRAG_WIDTH) setCollapsed(true);
    else write(WIDTH_KEY, String(width()));
  };
  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragging(true);
    document.body.classList.add("plc-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
  };
  const resetWidth = () => {
    setWidth(clampWidth(SIDEBAR_DEFAULT_WIDTH));
    write(WIDTH_KEY, String(width()));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event.target)) return;
    event.preventDefault();
    toggle();
  };
  const onResize = () => setWidth((w) => clampWidth(w));

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
  });
  onCleanup(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    document.body.classList.remove("plc-resizing");
  });

  return { width, collapsed, setCollapsed, toggle, dragging, startDrag, resetWidth };
}
