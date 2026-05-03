import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cx } from "./classes";

type ButtonVariant =
  | "default"
  | "primary"
  | "danger"
  | "success"
  | "ghost"
  | "chip"
  | "tab";

type ButtonSize = "xs" | "sm" | "md";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
};

const baseClass =
  "inline-flex items-center justify-center gap-1 rounded transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

const sizeClasses: Record<ButtonSize, string> = {
  xs: "px-2 py-0.5 text-[10px]",
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

function variantClass(variant: ButtonVariant, active: boolean): string {
  if (variant === "primary") {
    return "bg-blue-600 text-white hover:bg-blue-700 border border-blue-600";
  }
  if (variant === "danger") {
    return "bg-red-900/50 text-red-200 hover:bg-red-900 border border-red-800";
  }
  if (variant === "success") {
    return "bg-green-700 text-white hover:bg-green-600 border border-green-700";
  }
  if (variant === "ghost") {
    return "text-gray-400 hover:bg-[#333] hover:text-white border border-transparent";
  }
  if (variant === "chip") {
    return active
      ? "bg-red-900/50 border border-red-700 text-red-200"
      : "bg-[#1e1e1e] border border-[#333] text-gray-400 hover:border-gray-500 hover:text-gray-300";
  }
  if (variant === "tab") {
    return active
      ? "bg-blue-900 text-white border border-transparent"
      : "text-gray-400 hover:text-white border border-transparent";
  }
  return "bg-[#252526] border border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]";
}

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "active",
    "class",
  ]);
  const variant = () => local.variant ?? "default";
  const size = () => local.size ?? "sm";

  return (
    <button
      type="button"
      {...rest}
      class={cx(
        baseClass,
        sizeClasses[size()],
        variantClass(variant(), Boolean(local.active)),
        local.class
      )}
    />
  );
}
