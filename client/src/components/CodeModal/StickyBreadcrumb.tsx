import { ChevronRight } from "lucide-solid";
import { For, Show, createMemo, type JSX } from "solid-js";
import {
  computeBreadcrumbPath,
  getEffectiveChildren,
  isSyntheticBodyNode,
} from "../../utils/structureTree";

function baseNameFromPath(path: string | null) {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function nodeKey(n: any): string {
  if (!n) return "";
  return `${n?.type ?? ""}|${n?.name ?? ""}|${n?.start_line ?? ""}|${
    n?.end_line ?? ""
  }`;
}

function sameNode(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return nodeKey(a) !== "" && nodeKey(a) === nodeKey(b);
}

function findPathToNodeLocal(root: any, target: any): any[] | null {
  if (!root || !target) return null;
  const path: any[] = [];
  const visited = new Set<any>();

  const dfs = (node: any): boolean => {
    if (!node || visited.has(node)) return false;
    visited.add(node);
    if (sameNode(node, target)) {
      path.push(node);
      return true;
    }
    const children = getEffectiveChildren(node);
    for (const child of children) {
      if (dfs(child)) {
        path.push(node);
        return true;
      }
    }
    return false;
  };

  const found = dfs(root);
  if (!found) return null;
  return path.reverse();
}

export function StickyBreadcrumb(props: {
  root: () => any | null;
  selectedNode?: () => any | null;
  currentLine: () => number;
  selection?: () => { start: number; end: number } | null;
  filePath: () => string | null;
  onSelectScope: (node: any | null) => void;
  /** Before the crumbs (the outline button). */
  leading?: JSX.Element;
  /** Right end of the row (range and metric overlay controls). */
  trailing?: JSX.Element;
}) {
  const explicitPath = createMemo(() => {
    const root = props.root();
    const selected = props.selectedNode?.() ?? null;
    if (!root || !selected) return null;
    return findPathToNodeLocal(root, selected);
  });

  const path = createMemo(() => {
    const explicit = explicitPath();
    if (explicit && explicit.length) {
      return explicit.filter((n: any) => !isSyntheticBodyNode(n));
    }

    const root = props.root();
    const sel = props.selection?.() ?? null;
    const line = props.currentLine();
    if (!root || typeof line !== "number" || line <= 0) return [];
    const range =
      sel && typeof sel.start === "number" && typeof sel.end === "number"
        ? sel
        : { start: line, end: line };

    return computeBreadcrumbPath(root, range).filter(
      (n: any) => !isSyntheticBodyNode(n)
    );
  });

  const displayFileName = () => baseNameFromPath(props.filePath());
  // A file the scan skipped has no tree; it still gets its name.
  const crumbs = () => (path().length ? path() : [null]);

  return (
    <div class="flex h-9 items-center gap-1 border-b border-[var(--plc-border)] bg-[var(--plc-surface)]/95 pl-1.5 pr-2 backdrop-blur">
      {props.leading}
      <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        <For each={crumbs()}>
          {(node, i) => {
            const isLast = () => i() === crumbs().length - 1;
            const label = () =>
              i() === 0 ? displayFileName() || node?.name || "file" : node.name;

            return (
              <>
                <button
                  type="button"
                  title={label()}
                  // The open scope keeps its name; its ancestors give way first.
                  class={`truncate rounded px-1 py-0.5 text-[12px] transition-colors duration-150 ${
                    isLast()
                      ? "max-w-[18rem] shrink-0 cursor-default font-semibold text-[var(--plc-on-surface)]"
                      : "min-w-[2rem] shrink text-[var(--plc-accent)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-accent-hover)]"
                  }`}
                  onClick={() => {
                    if (isLast()) return;
                    props.onSelectScope(i() === 0 ? null : node);
                  }}
                >
                  {label()}
                </button>
                <Show when={!isLast()}>
                  <ChevronRight size={12} class="shrink-0 text-[var(--plc-on-disabled)]" aria-hidden="true" />
                </Show>
              </>
            );
          }}
        </For>
      </div>
      {props.trailing}
    </div>
  );
}
