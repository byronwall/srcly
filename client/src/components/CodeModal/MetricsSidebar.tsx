import { Show, type JSX } from "solid-js";
import { EmptyState } from "../feedback/States";
import { FileFindings } from "./FileFindings";
import { MetricsTable } from "./MetricsTable";
import { RecentCommits } from "./RecentCommits";

/** The left rail: the file's metrics, always in view. Pick one to mark its lines. */
export function MetricsSidebar(props: {
  fileNode: any;
  scopeNode: any;
  scopeName: () => string | null;
  canLocate: (metricId: string) => boolean;
  activeMetric: () => string | null;
  onToggleMetric: (metricId: string) => void;
  /** Open a scope of this file (the max-complexity witness). */
  onSelectNode: (node: any) => void;
  /** Absolute path on disk; with no `gitRef`, findings and recent commits show below the table. */
  filePath?: string | null;
  gitRef?: string | null;
  /** Go to a finding's line (marks the Findings lines). */
  onJumpToFinding: (line: number) => void;
  /** The value-flow ledger, when one is open: first in the rail, above the metrics. */
  ledger?: JSX.Element;
  /** What the selected scope touches (M6): under the metrics, keyed on the scope. */
  effects?: JSX.Element;
}) {
  const commitsPath = () => (!props.gitRef && /^([A-Za-z]:)?[\\/]/.test(props.filePath ?? "") ? props.filePath : null);
  return (
    <aside class="flex w-72 shrink-0 flex-col overflow-hidden border-r border-[var(--plc-border)] bg-[var(--plc-surface)]">
      <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2.5">
        {props.ledger}
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
            onSelectNode={props.onSelectNode}
          />
        </Show>
        <Show when={commitsPath()} keyed>
          {(path) => (
            <>
              <FileFindings path={path} onJump={props.onJumpToFinding} />
              {props.effects}
              <RecentCommits path={path} />
            </>
          )}
        </Show>
      </div>
    </aside>
  );
}
