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
        "rounded border border-[#3e3e42] bg-[#252526] p-2 text-xs text-gray-300 shadow-xl",
        widthClasses[local.width ?? "md"],
        local.class
      )}
    />
  );
}

export function PopoverSectionTitle(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={cx("mb-2 text-xs font-bold text-gray-400", props.class)}>
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
        "w-full rounded px-2 py-1 text-left text-[11px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500",
        local.selected
          ? "bg-blue-900/60 text-blue-100"
          : "text-gray-300 hover:bg-[#333]",
        local.class
      )}
    />
  );
}
