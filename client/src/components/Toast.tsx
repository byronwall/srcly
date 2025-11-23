import { Show, createSignal, onCleanup } from "solid-js";

export interface ToastProps {
  message: string;
  type?: "success" | "error";
  duration?: number; // milliseconds
}

export default function Toast(props: ToastProps) {
  const [visible, setVisible] = createSignal(true);
  const duration = props.duration ?? 3000;

  const hide = () => setVisible(false);
  const timer = setTimeout(hide, duration);
  onCleanup(() => clearTimeout(timer));

  return (
    <Show when={visible()}>
      <div
        class={`fixed bottom-4 right-4 max-w-xs px-4 py-2 rounded shadow-lg text-white z-50 ${
          props.type === "error" ? "bg-red-600" : "bg-green-600"
        }`}
      >
        {props.message}
      </div>
    </Show>
  );
}
