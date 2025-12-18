import { Show } from "solid-js";
import { MetricsSection } from "./MetricsSection";
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
    <div class="w-64 shrink-0 border-r border-gray-700 bg-[#1e1e1e] flex flex-col overflow-hidden">
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

        <Show when={props.scopeNode}>
          <MetricsSection title="Scope Metrics" node={props.scopeNode} />
        </Show>
        <Show when={props.fileNode}>
          <MetricsSection title="File Metrics" node={props.fileNode} />
        </Show>
        <Show when={!props.fileNode && !props.scopeNode}>
          <div class="text-xs text-gray-500 italic">
            No metrics available for this file.
          </div>
        </Show>
      </div>
    </div>
  );
}
