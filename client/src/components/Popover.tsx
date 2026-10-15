import {
  createSignal,
  Show,
  onMount,
  onCleanup,
  type JSX,
  mergeProps,
  createEffect,
  on,
} from "solid-js";
import { Portal } from "solid-js/web";
import { placePopover, popoverTransformOrigin, type PopoverPlacement } from "./popoverPosition";

interface PopoverProps {
  trigger: (props: {
    onClick: (e: MouseEvent) => void;
    isOpen: boolean;
    ref: (el: HTMLElement) => void;
  }) => JSX.Element;
  children: JSX.Element;
  placement?: PopoverPlacement;
  offset?: { x: number; y: number };
  onClose?: () => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

// Only one popover is open at a time: opening one claims this id, and every
// other open popover closes when it changes. This doesn't depend on how the
// outside-click handlers of the two popovers race.
const [openPopoverId, setOpenPopoverId] = createSignal<symbol | null>(null);

/** True while any popover is open (hover cards can stand down meanwhile). */
export const isAnyPopoverOpen = () => openPopoverId() !== null;

const ENTER_MS = 120;
const ENTER_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";

export default function Popover(props: PopoverProps) {
  const merged = mergeProps(
    { placement: "bottom-start" as PopoverPlacement, offset: { x: 0, y: 4 } },
    props
  );
  const id = Symbol("popover");

  const [internalIsOpen, setInternalIsOpen] = createSignal(false);
  // Mirror `props.isOpen` into a local signal so event listeners (scroll/resize/click)
  // don't evaluate parent JSX prop getters outside a reactive owner.
  const [controlledIsOpen, setControlledIsOpen] = createSignal(false);
  let triggerRef: HTMLElement | undefined;
  let contentRef: HTMLDivElement | undefined;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  // Treat controlled/uncontrolled as stable for the lifetime of this component.
  // (This avoids reading a reactive prop getter from event handlers.)
  const isControlled = props.isOpen !== undefined;

  createEffect(() => {
    if (isControlled) setControlledIsOpen(props.isOpen as boolean);
  });

  const isOpen = () => (isControlled ? controlledIsOpen() : internalIsOpen());

  const setOpen = (next: boolean) => {
    if (props.onOpenChange) props.onOpenChange(next);
    else setInternalIsOpen(next);
  };

  const toggle = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent immediate close by document listener
    setOpen(!isOpen());
  };

  const close = () => {
    if (props.onClose) props.onClose();
    setOpen(false);
  };

  // Claim the single open slot on open; release it on close or unmount.
  createEffect(
    on(isOpen, (open) => {
      if (open) setOpenPopoverId(id);
      else if (openPopoverId() === id) setOpenPopoverId(null);
    })
  );
  createEffect(
    on(openPopoverId, (current) => {
      if (current !== null && current !== id && isOpen()) close();
    })
  );
  onCleanup(() => {
    if (openPopoverId() === id) setOpenPopoverId(null);
  });

  /** Measure the rendered content and place it; returns false if not ready. */
  const updatePosition = (): boolean => {
    if (!triggerRef || !contentRef || !isOpen()) return false;
    const pos = placePopover(
      triggerRef.getBoundingClientRect(),
      { width: contentRef.offsetWidth, height: contentRef.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      merged.placement,
      merged.offset
    );
    contentRef.style.top = `${pos.top}px`;
    contentRef.style.left = `${pos.left}px`;
    contentRef.style.transformOrigin = popoverTransformOrigin(pos);
    return true;
  };

  // The content mounts hidden; it is measured and placed in a microtask
  // (before the browser paints), then shown. No frame at 0,0.
  const mountContent = (el: HTMLDivElement) => {
    contentRef = el;
    queueMicrotask(() => {
      if (contentRef !== el || !updatePosition()) return;
      el.style.visibility = "visible";
      if (!reducedMotion?.matches) {
        el.animate(
          [
            { opacity: 0, transform: "scale(0.97)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: ENTER_MS, easing: ENTER_EASING }
        );
      }
    });
  };

  onMount(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!isOpen()) return;

      // If click is inside content, don't close
      if (contentRef && contentRef.contains(e.target as Node)) {
        return;
      }

      // If click is inside trigger, ignore it (toggle handles it)
      if (triggerRef && triggerRef.contains(e.target as Node)) {
        return;
      }

      close();
    };

    const handleReposition = () => {
      if (isOpen()) updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen() || e.key !== "Escape") return;
      e.stopPropagation();
      close();
      triggerRef?.focus();
    };

    document.addEventListener("click", handleDocumentClick, true); // Use capture phase
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true); // Capture phase for scrolling containers

    onCleanup(() => {
      document.removeEventListener("click", handleDocumentClick, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    });
  });

  return (
    <>
      {merged.trigger({
        onClick: toggle,
        isOpen: isOpen(),
        ref: (el) => (triggerRef = el),
      })}
      <Show when={isOpen()}>
        <Portal>
          <div
            ref={mountContent}
            style={{
              position: "fixed",
              top: "0px",
              left: "0px",
              visibility: "hidden",
              "z-index": 9999,
            }}
          >
            {merged.children}
          </div>
        </Portal>
      </Show>
    </>
  );
}
