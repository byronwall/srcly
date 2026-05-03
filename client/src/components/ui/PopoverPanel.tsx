import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cx } from "./classes";

type PanelWidth = "sm" | "md" | "lg" | "xl";

type PopoverPanelProps = JSX.HTMLAttributes<HTMLDivElement> & {
  width?: PanelWidth;
};

const widthClasses: Record<PanelWidth, string> = {
  sm: "w-40",
  md: "w-56",
  lg: "min-w-[16rem]",
  xl: "w-[450px]",
};

export function PopoverPanel(props: PopoverPanelProps) {
  const [local, rest] = splitProps(props, ["class", "width"]);

  return (
    <div
      {...rest}
      class={cx(
        "plc-floating rounded-lg border p-2 text-xs",
        widthClasses[local.width ?? "md"],
        local.class
      )}
    />
  );
}

export function PopoverSectionTitle(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      class={cx(
        "plc-label-caps mb-2 text-[var(--plc-on-subtle)]",
        props.class
      )}
    >
      {props.children}
    </div>
  );
}

export function OptionRow(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }
) {
  const [local, rest] = splitProps(props, ["class", "selected"]);

  return (
    <button
      type="button"
      {...rest}
      class={cx(
        "w-full rounded-md px-2 py-1 text-left text-[12px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]",
        local.selected
          ? "bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]"
          : "text-[var(--plc-on-surface)] hover:bg-[var(--plc-surface-hover)]",
        local.class
      )}
    />
  );
}
