export function MetricItem(props: {
  label: string;
  value: any;
  colorClass: string;
}) {
  return (
    <div class="flex items-center justify-between text-xs py-1 border-b border-gray-800 last:border-0">
      <span class="text-gray-400">{props.label}</span>
      <span class={`${props.colorClass} font-mono`}>
        {typeof props.value === "number" && !Number.isInteger(props.value)
          ? props.value.toFixed(2)
          : props.value}
      </span>
    </div>
  );
}


