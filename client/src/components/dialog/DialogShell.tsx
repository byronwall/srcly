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
        class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(248,250,252,0.72)] backdrop-blur-[1px]"
        onClick={() => local.onClose()}
      >
        <div
          {...rest}
          class={cx(
            "flex flex-col overflow-hidden rounded-lg border border-[var(--plc-border)] bg-[var(--plc-surface)] text-[var(--plc-on-surface)] shadow-[var(--plc-dialog-shadow)]",
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
        "flex min-h-10 items-center justify-between gap-4 border-b border-[var(--plc-border)] bg-[var(--plc-surface)] px-4 py-2 text-sm",
        props.class
      )}
    >
      <div class="min-w-0">
        <div class="truncate font-semibold text-[var(--plc-on-surface)]">
          {props.title}
        </div>
        <Show when={props.subtitle}>
          <div class="truncate text-[11px] text-[var(--plc-on-subtle)]">
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
