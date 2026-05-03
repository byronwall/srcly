export function MetricItem(props: {
  label: string;
  value: any;
  colorClass: string;
}) {
  return (
    <div class="flex items-center justify-between border-b border-[var(--plc-divider)] py-1 text-xs last:border-0">
      <span class="text-[var(--plc-on-muted)]">{props.label}</span>
      <span class={`${props.colorClass} font-mono`}>
        {typeof props.value === "number" && !Number.isInteger(props.value)
          ? props.value.toFixed(2)
          : props.value}
      </span>
    </div>
  );
}

