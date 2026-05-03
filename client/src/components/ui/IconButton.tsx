import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cx } from "./classes";

type IconButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "xs" | "sm";
};

export function IconButton(props: IconButtonProps) {
  const [local, rest] = splitProps(props, ["label", "size", "class"]);
  const sizeClass = () => (local.size === "xs" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs");

  return (
    <button
      type="button"
      aria-label={local.label}
      title={props.title ?? local.label}
      {...rest}
      class={cx(
        "inline-flex items-center justify-center rounded text-gray-400 transition-colors hover:bg-[#333] hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50",
        sizeClass(),
        local.class
      )}
    />
  );
}
