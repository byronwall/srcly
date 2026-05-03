import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { cx } from "../ui/classes";

type DialogSize = "md" | "lg" | "xl" | "fullscreen";

type DialogShellProps = JSX.HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  onClose: () => void;
  size?: DialogSize;
  children: JSX.Element;
};

const sizeClasses: Record<DialogSize, string> = {
  md: "h-auto max-h-[90vh] w-[min(32rem,calc(100vw-2rem))]",
  lg: "h-[90vh] w-[min(72rem,96vw)]",
  xl: "h-[92vh] w-[96vw] max-w-[1600px]",
  fullscreen: "h-[95vh] w-[95vw]",
};

export function DialogShell(props: DialogShellProps) {
  const [local, rest] = splitProps(props, [
    "open",
    "onClose",
    "size",
    "children",
    "class",
  ]);

  return (
    <Show when={local.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={() => local.onClose()}
      >
        <div
          {...rest}
          class={cx(
            "flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#1e1e1e] text-gray-100 shadow-2xl",
            sizeClasses[local.size ?? "lg"],
            local.class
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {local.children}
        </div>
      </div>
    </Show>
  );
}

export function DialogHeader(props: {
  title: JSX.Element;
  subtitle?: JSX.Element;
  actions?: JSX.Element;
  class?: string;
}) {
  return (
    <header
      class={cx(
        "flex items-center justify-between gap-4 border-b border-gray-700 bg-[#252526] px-4 py-2 text-sm",
        props.class
      )}
    >
      <div class="min-w-0">
        <div class="truncate font-semibold text-gray-100">{props.title}</div>
        <Show when={props.subtitle}>
          <div class="truncate text-[11px] text-gray-400">
            {props.subtitle}
          </div>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex shrink-0 items-center gap-2">{props.actions}</div>
      </Show>
    </header>
  );
}
