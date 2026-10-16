import { Box, ChevronRight, Dot, FileCode, SquareFunction } from "lucide-solid";
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import Popover from "../Popover";
import { PopoverPanel } from "../ui/PopoverPanel";
import { TextInput } from "../ui/TextInput";
import { cx } from "../ui/classes";
import { formatMetricValue } from "../../utils/metricsStore";
import { findPathToNode, getEffectiveChildren } from "../../utils/structureTree";

type Row = {
  node: any;
  depth: number;
  hasChildren: boolean;
  /** Filter mode: the names of the enclosing scopes. */
  context?: string;
};

function icon(node: any) {
  if (node?.type === "file") return <FileCode size={13} aria-hidden="true" />;
  if (node?.type === "function") return <SquareFunction size={13} aria-hidden="true" />;
  if (node?.type === "class") return <Box size={13} aria-hidden="true" />;
  return <Dot size={13} aria-hidden="true" />;
}

function highlight(text: string, query: string): JSX.Element {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark class="rounded-[2px] bg-[var(--plc-warning-border)] text-inherit">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

/**
 * The file's symbols in a popover off the breadcrumb: collapsed to the top
 * level except along the open scope, with the open scope marked. Typing
 * filters every symbol; arrows and Enter pick one.
 */
export function OutlinePopover(props: {
  root: () => any | null;
  activeNode: () => any | null;
  baseName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (node: any | null) => void;
  trigger: (t: { onClick: (e: MouseEvent) => void; isOpen: boolean; ref: (el: HTMLElement) => void }) => JSX.Element;
}) {
  const [query, setQuery] = createSignal("");
  const [expanded, setExpanded] = createSignal(new Set<any>());
  const [cursor, setCursor] = createSignal(0);
  let listRef: HTMLDivElement | undefined;

  // Each time it opens: clear the filter and expand down to the open scope.
  createEffect(
    on(
      () => props.isOpen,
      (open) => {
        if (!open) return;
        setQuery("");
        const root = props.root();
        const path = root && props.activeNode() ? findPathToNode(root, props.activeNode()) ?? [] : [];
        setExpanded(new Set(path.slice(0, -1)));
        const idx = rows().findIndex((r) => r.node === props.activeNode());
        setCursor(Math.max(0, idx));
        queueMicrotask(() => listRef?.querySelector("[data-active=true]")?.scrollIntoView({ block: "center" }));
      }
    )
  );

  const rows = createMemo<Row[]>(() => {
    const root = props.root();
    if (!root) return [];
    const q = query().trim().toLowerCase();
    const out: Row[] = [{ node: root, depth: 0, hasChildren: false }];

    if (q) {
      const walk = (node: any, trail: string[]) => {
        for (const child of getEffectiveChildren(node)) {
          const name = String(child.name ?? "");
          if (name.toLowerCase().includes(q)) {
            out.push({ node: child, depth: 0, hasChildren: false, context: trail.join(" › ") });
          }
          walk(child, [...trail, name]);
        }
      };
      walk(root, []);
      return out;
    }

    const open = expanded();
    const walk = (node: any, depth: number) => {
      for (const child of getEffectiveChildren(node)) {
        const hasChildren = getEffectiveChildren(child).length > 0;
        out.push({ node: child, depth, hasChildren });
        if (hasChildren && open.has(child)) walk(child, depth + 1);
      }
    };
    walk(root, 0);
    return out;
  });

  createEffect(on(query, () => setCursor(query().trim() ? Math.min(1, rows().length - 1) : 0)));

  const toggle = (node: any, force?: boolean) => {
    const next = new Set(expanded());
    const open = force ?? !next.has(node);
    if (open) next.add(node);
    else next.delete(node);
    setExpanded(next);
  };

  const pick = (row: Row | undefined) => {
    if (!row) return;
    props.onSelect(row.node === props.root() ? null : row.node);
    props.onOpenChange(false);
  };

  const moveCursor = (to: number) => {
    const n = rows().length;
    if (!n) return;
    setCursor(Math.max(0, Math.min(n - 1, to)));
    queueMicrotask(() =>
      listRef?.querySelector(`[data-row="${cursor()}"]`)?.scrollIntoView({ block: "nearest" })
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const row = rows()[cursor()];
    if (e.key === "ArrowDown") moveCursor(cursor() + 1);
    else if (e.key === "ArrowUp") moveCursor(cursor() - 1);
    else if (e.key === "Enter") pick(row);
    else if (e.key === "ArrowRight" && row?.hasChildren && !query()) toggle(row.node, true);
    else if (e.key === "ArrowLeft" && row?.hasChildren && !query()) toggle(row.node, false);
    else return;
    e.preventDefault();
  };

  const isActive = (node: any) =>
    node === props.activeNode() || (!props.activeNode() && node === props.root());

  return (
    <Popover
      placement="bottom-start"
      isOpen={props.isOpen}
      onOpenChange={props.onOpenChange}
      trigger={props.trigger}
    >
      <PopoverPanel width="xl" class="flex max-h-[min(560px,70vh)] flex-col p-0">
        <div class="border-b border-[var(--plc-divider)] p-2">
          <TextInput
            size="sm"
            placeholder="Go to symbol…"
            value={query()}
            ref={(el) => queueMicrotask(() => el.focus())}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div class="flex items-center justify-between px-3 pb-1 pt-2 text-[11px] text-[var(--plc-on-subtle)]">
          <span>{query().trim() ? `${rows().length - 1} matches` : "Outline"}</span>
          <span title="Cyclomatic complexity">CCN</span>
        </div>
        <div ref={listRef} class="min-h-0 flex-1 overflow-y-auto px-1 pb-1" role="listbox">
          <For each={rows()}>
            {(row, i) => {
              const ccn = () => row.node?.metrics?.complexity;
              return (
                <div
                  role="option"
                  aria-selected={isActive(row.node)}
                  data-row={i()}
                  data-active={isActive(row.node)}
                  onMouseMove={() => setCursor(i())}
                  onClick={() => pick(row)}
                  class={cx(
                    "flex h-7 cursor-pointer items-center gap-1 rounded-md pr-2 text-[12px] transition-colors duration-100",
                    isActive(row.node)
                      ? "bg-[var(--plc-surface-selected)] font-semibold text-[var(--plc-accent)]"
                      : cursor() === i()
                        ? "bg-[var(--plc-surface-muted)] text-[var(--plc-on-surface)]"
                        : "text-[var(--plc-on-muted)]"
                  )}
                  style={{ "padding-left": `${row.depth * 14 + 4}px` }}
                >
                  <span
                    class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--plc-on-subtle)] hover:bg-[var(--plc-border)] hover:text-[var(--plc-on-surface)]"
                    onClick={(e) => {
                      if (!row.hasChildren) return;
                      e.stopPropagation();
                      toggle(row.node);
                    }}
                  >
                    <Show when={row.hasChildren}>
                      <ChevronRight
                        size={13}
                        aria-hidden="true"
                        class={cx("transition-transform duration-150", expanded().has(row.node) && "rotate-90")}
                      />
                    </Show>
                  </span>
                  <span class="flex shrink-0 opacity-70">{icon(row.node)}</span>
                  <span class="min-w-0 truncate">
                    {row.node === props.root() ? props.baseName : highlight(String(row.node?.name ?? ""), query().trim())}
                  </span>
                  <Show when={row.context}>
                    <span class="min-w-0 shrink truncate text-[11px] font-normal text-[var(--plc-on-subtle)]">
                      in {row.context}
                    </span>
                  </Show>
                  <span class="ml-auto shrink-0 pl-3 text-[11px] font-normal tabular-nums text-[var(--plc-on-subtle)]">
                    <Show when={row.node !== props.root() && typeof ccn() === "number" && ccn() > 0}>
                      {formatMetricValue("complexity", ccn())}
                    </Show>
                  </span>
                </div>
              );
            }}
          </For>
        </div>
        <div class="border-t border-[var(--plc-divider)] px-3 py-1.5 text-[11px] text-[var(--plc-on-subtle)]">
          ↑↓ move · ←→ fold · Enter open · Esc close
        </div>
      </PopoverPanel>
    </Popover>
  );
}
