import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cx } from "./classes";

type TextInputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  size?: "sm" | "md";
};

export function TextInput(props: TextInputProps) {
  const [local, rest] = splitProps(props, ["class", "size"]);
  const sizeClass = () =>
    local.size === "sm" ? "px-2 py-1 text-[11px]" : "px-2 py-1.5 text-sm";

  return (
    <input
      {...rest}
      class={cx(
        "w-full rounded border border-[#3e3e42] bg-[#1e1e1e] text-gray-200 placeholder:text-gray-500 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
        sizeClass(),
        local.class
      )}
    />
  );
}
