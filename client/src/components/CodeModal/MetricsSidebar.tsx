import { Show } from "solid-js";
import { EmptyState } from "../feedback/States";
import { MetricsTable } from "./MetricsTable";

/** The left rail: the file's metrics, always in view. Pick one to mark its lines. */
export function MetricsSidebar(props: {
  fileNode: any;
  scopeNode: any;
  scopeName: () => string | null;
  canLocate: (metricId: string) => boolean;
  activeMetric: () => string | null;
  onToggleMetric: (metricId: string) => void;
}) {
  return (
    <aside class="flex w-72 shrink-0 flex-col overflow-hidden border-r border-[var(--plc-border)] bg-[var(--plc-surface)]">
      <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2.5">
        <Show
          when={props.fileNode || props.scopeNode}
          fallback={
            <EmptyState
              title="No metrics available"
              description="This file does not have metrics to inspect."
              class="h-auto py-6 text-xs"
            />
          }
        >
          <MetricsTable
            path={String(props.fileNode?.path ?? props.scopeNode?.path ?? "")}
            fileNode={props.fileNode}
            scopeNode={props.scopeNode && props.scopeNode !== props.fileNode && props.scopeNode.type !== "file" ? props.scopeNode : null}
            scopeName={props.scopeName}
            canLocate={props.canLocate}
            activeMetric={props.activeMetric}
            onToggleMetric={props.onToggleMetric}
          />
        </Show>
      </div>
    </aside>
  );
}
