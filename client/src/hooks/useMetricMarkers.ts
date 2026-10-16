import { createEffect, createSignal, onCleanup } from "solid-js";
import { fetchFileMarkers } from "../services/fileContent";
import type { MetricMarkers } from "../utils/metricMarkers";

/** The lines behind each metric of the open file; null until loaded or on failure. */
export function useMetricMarkers(args: {
  filePath: () => string | null;
  gitRef?: () => string | null | undefined;
}) {
  const [markers, setMarkers] = createSignal<MetricMarkers | null>(null);

  createEffect(() => {
    const path = args.filePath();
    const ref = args.gitRef?.() ?? null;
    setMarkers(null);
    if (!path) return;
    const controller = new AbortController();
    fetchFileMarkers({ path, ref, signal: controller.signal })
      .then((m) => !controller.signal.aborted && setMarkers(m))
      // Without markers the metrics still read; they just can't be overlaid.
      .catch(() => {});
    onCleanup(() => controller.abort());
  });

  return markers;
}
