import { For, Show, createMemo } from "solid-js";
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

    if (
      !root ||
      typeof range.start !== "number" ||
      typeof range.end !== "number"
    )
      return [];

    return computeBreadcrumbPath(root, range).filter(
      (n: any) => !isSyntheticBodyNode(n)
    );
  });

  const displayFileName = () => baseNameFromPath(props.filePath());

  return (
    <Show when={path().length > 0}>
      <div class="sticky top-0 z-20 border-b border-[var(--plc-border)] bg-[var(--plc-surface)]/95 backdrop-blur px-3 py-2">
        <div class="flex items-center gap-1 min-w-0">
          <For each={path()}>
            {(node, i) => {
              const n = () => node;
              const isLast = () => i() === path().length - 1;
              const label = () =>
                i() === 0 ? displayFileName() || n().name || "file" : n().name;

              return (
                <>
                  <button
                    class={`text-[11px] truncate max-w-[260px] ${
                      isLast()
                        ? "text-[var(--plc-on-surface)] font-semibold cursor-default"
                        : "text-[var(--plc-accent)] hover:text-[var(--plc-accent-hover)] hover:underline"
                    }`}
                    title={label()}
                    onClick={() => {
                      if (isLast()) return;
                      const clicked = i() === 0 ? null : n();
                      props.onSelectScope(clicked);
                    }}
                  >
                    {label()}
                  </button>
                  <Show when={!isLast()}>
                    <span class="text-[var(--plc-on-disabled)] text-[11px] select-none px-1">
                      ›
                    </span>
                  </Show>
                </>
              );
            }}
          </For>
          <div class="flex-1" />
          <span class="text-[10px] text-[var(--plc-on-subtle)] font-mono tabular-nums">
            L{props.currentLine()}
          </span>
        </div>
      </div>
    </Show>
  );
}
