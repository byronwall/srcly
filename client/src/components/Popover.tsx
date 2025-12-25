import {
  createSignal,
  Show,
  onMount,
  onCleanup,
  type JSX,
  mergeProps,
  createEffect,
} from "solid-js";
import { Portal } from "solid-js/web";

interface PopoverProps {
  trigger: (props: {
    onClick: (e: MouseEvent) => void;
    isOpen: boolean;
    ref: (el: HTMLElement) => void;
  }) => JSX.Element;
  children: JSX.Element;
  placement?: "bottom-start" | "bottom-end";
  offset?: { x: number; y: number };
  onClose?: () => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export default function Popover(props: PopoverProps) {
  const merged = mergeProps(
    { placement: "bottom-start", offset: { x: 0, y: 4 } },
    props
  );

  const [internalIsOpen, setInternalIsOpen] = createSignal(false);
  // Mirror `props.isOpen` into a local signal so event listeners (scroll/resize/click)
  // don't evaluate parent JSX prop getters outside a reactive owner.
  const [controlledIsOpen, setControlledIsOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ top: 0, left: 0 });
  let triggerRef: HTMLElement | undefined;
  let contentRef: HTMLDivElement | undefined;

  // Treat controlled/uncontrolled as stable for the lifetime of this component.
  // (This avoids reading a reactive prop getter from event handlers.)
  const isControlled = props.isOpen !== undefined;

  createEffect(() => {
    if (isControlled) setControlledIsOpen(props.isOpen as boolean);
  });

  const isOpen = () => (isControlled ? controlledIsOpen() : internalIsOpen());

  const toggle = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent immediate close by document listener
    const nextState = !isOpen();
    if (props.onOpenChange) {
      props.onOpenChange(nextState);
    } else {
      setInternalIsOpen(nextState);
    }
  };

  const close = () => {
    if (props.onClose) props.onClose();
    if (props.onOpenChange) {
      props.onOpenChange(false);
    } else {
      setInternalIsOpen(false);
    }
  };

  const updatePosition = () => {
    if (!triggerRef || !isOpen()) return;

    const rect = triggerRef.getBoundingClientRect();
    let top = rect.bottom + merged.offset.y;
    let left = rect.left + merged.offset.x;

    if (merged.placement === "bottom-end") {
      left = rect.right - (contentRef?.offsetWidth || 0) + merged.offset.x;
    }

    // Basic viewport boundary check (optional, can be expanded)
    // For now, just ensure it doesn't go off-screen left
    if (left < 0) left = 0;

    setPosition({ top, left });
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

    const handleResize = () => {
      if (isOpen()) updatePosition();
    };

    const handleScroll = () => {
      if (isOpen()) updatePosition();
    };

    document.addEventListener("click", handleDocumentClick, true); // Use capture phase
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true); // Capture phase for scrolling containers

    onCleanup(() => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    });
  });

  // We need to update position AFTER render when it opens
  createEffect(() => {
    if (isOpen()) {
      // Small timeout to allow render
      requestAnimationFrame(() => updatePosition());
    }
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
            ref={(el) => (contentRef = el)}
            style={{
              position: "fixed",
              top: `${position().top}px`,
              left: `${position().left}px`,
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
