import { For } from "solid-js";
import { HOTSPOT_METRICS } from "../../utils/metricsStore";
import { MetricItem } from "./MetricItem";

export function MetricsSection(props: { title: string; node: any }) {
  return (
    <div class="mb-6">
      <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
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


