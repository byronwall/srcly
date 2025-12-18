import { createSignal } from "solid-js";
import * as d3 from "d3";
import { HOTSPOT_METRICS, type HotSpotMetricId } from "../../../utils/metricsStore";

export type TooltipLine = {
  label: string;
  value: string;
};

export type TreemapTooltipModel =
  | { visible: false }
  | {
      visible: true;
      x: number;
      y: number;
      title: string;
      lines: TooltipLine[];
    };

function formatNumberMaybe(val: unknown): string {
  if (typeof val === "number" && Number.isFinite(val) && !Number.isInteger(val)) {
    return val.toFixed(2);
  }
  return String(val);
}

export function useTreemapTooltip(opts: { primaryMetricId: () => HotSpotMetricId }) {
  const [tooltip, setTooltip] = createSignal<TreemapTooltipModel>({ visible: false });

  function hide() {
    setTooltip({ visible: false });
  }

  function show(e: MouseEvent, d: d3.HierarchyNode<any>) {
    const offset = 10;

    // Use fixed positioning based on viewport coordinates.
    let x = (e as MouseEvent).clientX + offset;
    let y = (e as MouseEvent).clientY + offset;

    // Clamp to viewport with a conservative tooltip size estimate.
    if (typeof window !== "undefined") {
      const maxW = 320;
      const maxH = 220;
      x = Math.min(x, Math.max(0, window.innerWidth - maxW));
      y = Math.min(y, Math.max(0, window.innerHeight - maxH));
    }

    const title = String(d.data?.name ?? "");

    if (d.data?.type === "folder") {
      const subFolders = d
        .descendants()
        .filter((n) => n.data?.type === "folder" && n !== d).length;
      const subFiles = d.descendants().filter((n) => n.data?.type === "file").length;

      setTooltip({
        visible: true,
        x,
        y,
        title,
        lines: [
          { label: "Total LOC", value: String(d.value ?? 0) },
          { label: "Sub-folders", value: String(subFolders) },
          { label: "Sub-files", value: String(subFiles) },
        ],
      });
      return;
    }

    const metrics = d.data?.metrics ?? {};
    const lines: TooltipLine[] = [
      { label: "LOC", value: String(d.value ?? 0) },
      { label: "Complexity", value: Number(metrics?.complexity ?? 0).toFixed(1) },
      {
        label: "Density",
        value: `${Math.round(Number(metrics?.comment_density ?? 0) * 100)}%`,
      },
      { label: "Depth", value: String(metrics?.max_nesting_depth ?? 0) },
      { label: "TODOs", value: String(metrics?.todo_count ?? 0) },
    ];

    const metricId = opts.primaryMetricId();
    const standardMetrics = new Set([
      "loc",
      "complexity",
      "comment_density",
      "max_nesting_depth",
      "todo_count",
    ]);

    if (!standardMetrics.has(metricId)) {
      const val = (metrics as any)?.[metricId];
      if (val !== undefined) {
        const label = HOTSPOT_METRICS.find((m) => m.id === metricId)?.label || metricId;
        lines.push({ label, value: formatNumberMaybe(val) });
      }
    }

    setTooltip({ visible: true, x, y, title, lines });
  }

  return { tooltip, show, hide };
}


