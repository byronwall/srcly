import { For } from "solid-js";
import { HOTSPOT_METRICS } from "../../utils/metricsStore";
import { MetricItem } from "./MetricItem";

export function MetricsSection(props: { title: string; node: any }) {
  return (
    <div class="mb-6">
      <h3 class="plc-label-caps mb-3 border-b border-[var(--plc-border)] pb-1 text-[var(--plc-on-muted)]">
        {props.title}
      </h3>
      <div class="space-y-1">
        <For each={HOTSPOT_METRICS}>
          {(metric) => {
            const m = () => metric;
            const val = props.node.metrics?.[m().id];
            if (val === undefined || val === null) return null;
            return (
              <MetricItem
                label={m().label}
                value={val}
                colorClass={m().color}
              />
            );
          }}
        </For>
      </div>
    </div>
  );
}

