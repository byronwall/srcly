import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cx } from "./classes";

type TextInputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  size?: "sm" | "md";
};

export function TextInput(props: TextInputProps) {
  const [local, rest] = splitProps(props, ["class", "size"]);
  const sizeClass = () =>
    local.size === "sm" ? "h-7 px-2 text-[12px]" : "h-8 px-2 text-[13px]";

  return (
    <input
      {...rest}
      class={cx(
        "w-full rounded-md border border-[var(--plc-border-strong)] bg-[var(--plc-surface)] text-[var(--plc-on-surface)] placeholder:text-[var(--plc-on-disabled)] outline-none transition-colors focus:border-[var(--plc-border-focus)] focus:ring-2 focus:ring-[var(--plc-border-focus)]/15",
        sizeClass(),
        local.class
      )}
    />
  );
}
