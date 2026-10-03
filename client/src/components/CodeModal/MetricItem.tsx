import { formatMetricValue } from "../../utils/metricsStore";

export function MetricItem(props: { id: string; label: string; value: unknown }) {
  return (
    <div class="flex items-center justify-between gap-3 border-b border-[var(--plc-divider)] py-1 text-xs last:border-0">
      <span class="text-[var(--plc-on-muted)]">{props.label}</span>
      <span class="plc-data-md text-[var(--plc-on-surface)]">
        {formatMetricValue(props.id, props.value)}
      </span>
    </div>
  );
}
