import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";

export function FlowTooltip(props: {
  isOpen: () => boolean;
  x: () => number;
  y: () => number;
  data: () => {
    text: string;
    snippet?: string;
    defLine?: string;
    scopeSnippet?: string;
    scopeLine?: string;
  } | null;
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
    <Show when={props.isOpen() && props.data()}>
      <Portal>
        <div
          ref={(el) => (contentRef = el)}
          class="rounded border border-gray-700 bg-[#111827] px-3 py-2 text-xs text-gray-100 shadow-xl"
          style={{
            position: "fixed",
            left: `${pos().left}px`,
            top: `${pos().top}px`,
            "z-index": 10000,
            "max-width": "min(600px, calc(100vw - 16px))",
            "pointer-events": "none",
          }}
        >
          <div class="mb-1 font-semibold text-blue-200">
            {props.data()?.text}
          </div>
          <Show when={props.data()?.snippet}>
            <div class="mt-2 rounded bg-gray-900 p-2 font-mono text-[10px] text-gray-300 border border-gray-700 whitespace-pre-wrap">
              {props.data()?.snippet}
            </div>
          </Show>
          <Show when={props.data()?.defLine}>
            <div class="mt-1 text-[10px] text-gray-500">
              Defined at Line {props.data()?.defLine}
            </div>
          </Show>
          <Show when={props.data()?.scopeSnippet}>
            <div class="mt-3 text-[10px] font-semibold text-purple-300">
              Captured from:
            </div>
            <div class="mt-1 rounded bg-gray-900 p-2 font-mono text-[10px] text-gray-300 border border-gray-700 whitespace-pre-wrap">
              {props.data()?.scopeSnippet}
            </div>
          </Show>
          <Show when={props.data()?.scopeLine}>
            <div class="mt-1 text-[10px] text-gray-500">
              Scope Line {props.data()?.scopeLine}
            </div>
          </Show>
        </div>
      </Portal>
    </Show>
  );
}
