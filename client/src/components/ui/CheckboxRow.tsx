import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cx } from "./classes";

type CheckboxRowProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> & {
  label: JSX.Element;
  onChange: (checked: boolean) => void;
};

export function CheckboxRow(props: CheckboxRowProps) {
  const [local, rest] = splitProps(props, ["label", "class", "onChange"]);

  return (
    <label
      class={cx(
        "flex cursor-pointer select-none items-center gap-2 text-xs text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)]",
        props.disabled && "cursor-not-allowed opacity-60",
        local.class
      )}
    >
      <input
        type="checkbox"
        {...rest}
        onChange={(e) => local.onChange(e.currentTarget.checked)}
        class="accent-[var(--plc-accent)]"
      />
      <span>{local.label}</span>
    </label>
  );
}
