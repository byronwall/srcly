import { CircleAlert, CircleCheck, X } from "lucide-solid";
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

  const isError = () => props.type === "error";

  return (
    <Show when={visible()}>
      <div
        role={isError() ? "alert" : "status"}
        aria-live={isError() ? "assertive" : "polite"}
        class="plc-floating plc-toast fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2.5 rounded-lg border py-2.5 pl-3 pr-2 text-[13px]"
      >
        <span
          class={`mt-px shrink-0 ${
            isError() ? "text-[var(--plc-error)]" : "text-[var(--plc-success)]"
          }`}
        >
          {isError() ? (
            <CircleAlert size={16} aria-hidden="true" />
          ) : (
            <CircleCheck size={16} aria-hidden="true" />
          )}
        </span>
        <span class="min-w-0 flex-1 leading-snug text-[var(--plc-on-surface)]">
          {props.message}
        </span>
        <button
          type="button"
          class="-my-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--plc-on-subtle)] hover:bg-[var(--plc-surface-muted)] hover:text-[var(--plc-on-surface)]"
          aria-label="Dismiss"
          onClick={hide}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </Show>
  );
}
