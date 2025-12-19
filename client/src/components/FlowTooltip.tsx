import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

export function FlowTooltip(props: {
  isOpen: () => boolean;
  x: () => number;
  y: () => number;
  text: () => string;
}) {
  const [pos, setPos] = createSignal({ left: 0, top: 0 });
  let contentRef: HTMLDivElement | undefined;

  const desired = createMemo(() => ({ x: props.x(), y: props.y() }));

  const clampToViewport = (left: number, top: number) => {
    const w = contentRef?.offsetWidth ?? 0;
    const h = contentRef?.offsetHeight ?? 0;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - w - margin);
    const maxTop = Math.max(margin, window.innerHeight - h - margin);
    return {
      left: Math.min(Math.max(margin, left), maxLeft),
      top: Math.min(Math.max(margin, top), maxTop),
    };
  };

  const updatePosition = () => {
    if (!props.isOpen()) return;
    const { x, y } = desired();
    setPos(clampToViewport(x, y));
  };

  onMount(() => {
    const onResize = () => updatePosition();
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  createEffect(() => {
    if (props.isOpen()) {
      requestAnimationFrame(() => updatePosition());
    }
  });

  return (
    <Show when={props.isOpen()}>
      <Portal>
        <div
          ref={(el) => (contentRef = el)}
          class="rounded border border-gray-700 bg-[#111827] px-2 py-1 text-[11px] text-gray-100 shadow-xl"
          style={{
            position: "fixed",
            left: `${pos().left}px`,
            top: `${pos().top}px`,
            "z-index": 10000,
            "max-width": "min(420px, calc(100vw - 16px))",
            "pointer-events": "none",
            "white-space": "pre-wrap",
          }}
        >
          {props.text()}
        </div>
      </Portal>
    </Show>
  );
}


