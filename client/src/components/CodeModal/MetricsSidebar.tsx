import { Show } from "solid-js";
import { EmptyState } from "../feedback/States";
import { MetricsTable } from "./MetricsTable";
import { StructurePanel } from "./StructurePanel";

export function MetricsSidebar(props: {
  fileNode: any;
  scopeNode: any;

  baseName: () => string;
  breadcrumbPath: () => any[];
  activeStructureNode: () => any;
  getChildren: (node: any) => any[];
  isHidden: (node: any) => boolean;

  onSelectBreadcrumbIndex: (index: number, node: any) => void;
  onSelectNode: (node: any) => void;
}) {
  return (
    <div class="w-64 shrink-0 border-r border-[var(--plc-border)] bg-[var(--plc-surface)] flex flex-col overflow-hidden">
      <div class="flex-1 overflow-y-auto p-4">
        <Show when={props.scopeNode || props.fileNode}>
          <StructurePanel
            baseName={props.baseName}
            path={props.breadcrumbPath}
            activeNode={props.activeStructureNode}
            getChildren={props.getChildren}
            isHidden={props.isHidden}
            onSelectBreadcrumbIndex={props.onSelectBreadcrumbIndex}
            onSelectNode={props.onSelectNode}
          />
        </Show>

        <Show when={props.fileNode || props.scopeNode}>
          <div class="mt-4">
            <MetricsTable
              path={String(props.fileNode?.path ?? props.scopeNode?.path ?? "")}
              fileNode={props.fileNode}
              scopeNode={props.scopeNode && props.scopeNode !== props.fileNode && props.scopeNode.type !== "file" ? props.scopeNode : null}
              onSelectNode={props.onSelectNode}
            />
          </div>
        </Show>
        <Show when={!props.fileNode && !props.scopeNode}>
          <EmptyState
            title="No metrics available"
            description="This file does not have metrics to inspect."
            class="h-auto py-6 text-xs"
          />
        </Show>
      </div>
    </div>
  );
}
