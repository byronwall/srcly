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
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-[11px] leading-none",
  sm: "h-7 px-2 text-xs leading-none",
  md: "h-8 px-2.5 text-xs leading-none",
};

function variantClass(variant: ButtonVariant, active: boolean): string {
  if (variant === "primary") {
    return "border-[var(--plc-accent)] bg-[var(--plc-accent)] text-white hover:bg-[var(--plc-accent-hover)]";
  }
  if (variant === "danger") {
    return "border-[var(--plc-error-border)] bg-[var(--plc-error-subtle)] text-[var(--plc-error)] hover:border-[var(--plc-error)]";
  }
  if (variant === "success") {
    return "border-[var(--plc-success-border)] bg-[var(--plc-success-subtle)] text-[var(--plc-success)] hover:border-[var(--plc-success)]";
  }
  if (variant === "ghost") {
    return "border-transparent bg-transparent text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]";
  }
  if (variant === "chip") {
    return active
      ? "border-[var(--plc-accent-border)] bg-[var(--plc-accent-subtle)] text-[var(--plc-accent)]"
      : "border-[var(--plc-border)] bg-[var(--plc-surface-muted)] text-[var(--plc-on-muted)] hover:border-[var(--plc-border-strong)] hover:text-[var(--plc-on-surface)]";
  }
  if (variant === "tab") {
    return active
      ? "border-[var(--plc-accent-border)] bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]"
      : "border-transparent bg-transparent text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]";
  }
  return "border-[var(--plc-border-strong)] bg-[var(--plc-surface)] text-[var(--plc-on-surface)] hover:border-[var(--plc-secondary)] hover:bg-[var(--plc-surface-hover)]";
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
