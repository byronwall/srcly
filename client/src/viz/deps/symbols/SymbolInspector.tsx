import { Crosshair, ExternalLink, Maximize2, X } from "lucide-solid";
import { createMemo, For, Show } from "solid-js";
import { Button } from "../../../components/ui/Button";
import { IconButton } from "../../../components/ui/IconButton";
import { baseName, REF_KIND_SPEC, RESOLUTION_SPEC, qualifiedOf, type RefKind, type SymbolEdge, type SymbolGraph, type SymbolNode } from "../../../symbols/contract";
import { labelOf, type SymbolViewModel } from "./adapter";

const SECTION = "border-b border-[var(--plc-divider)] px-3 py-2";
const HEAD = "text-[11px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]";

/** One side of the selected symbol's references: the other symbol and each kind of reference, with its lines. */
interface Row {
  other: SymbolNode;
  /** The symbol whose file the lines are in: the source of the reference. */
  at: SymbolNode;
  refs: SymbolEdge[];
  hidden: boolean;
}

function rows(graph: SymbolGraph, model: SymbolViewModel, id: string, side: "in" | "out", kinds: Set<RefKind>): Row[] {
  const byId = model.byId;
  const grouped = new Map<string, Row>();
  for (const e of graph.edges) {
    const mine = side === "in" ? e.target === id : e.source === id;
    if (!mine) continue;
    const otherId = side === "in" ? e.source : e.target;
    const other = byId.get(otherId);
    const at = byId.get(e.source);
    if (!other || !at) continue;
    const row = grouped.get(otherId) ?? { other, at, refs: [], hidden: !kinds.has(e.kind) };
    row.refs.push(e);
    row.hidden = row.hidden && !kinds.has(e.kind);
    grouped.set(otherId, row);
  }
  return [...grouped.values()].sort((a, b) => Number(a.hidden) - Number(b.hidden) || b.refs.reduce((n, r) => n + r.count, 0) - a.refs.reduce((n, r) => n + r.count, 0) || a.other.name.localeCompare(b.other.name));
}

/**
 * Symbols mode's rail: the selected (else the focus) symbol, where it is
 * declared, and every reference to it and from it, grouped by the other
 * symbol, each line opening the code viewer there.
 */
export function SymbolInspector(props: {
  graph: SymbolGraph;
  model: SymbolViewModel;
  selected: string | null;
  kinds: Set<RefKind>;
  onOpen: (file: string, line: number, id?: string) => void;
  onSelect: (id: string | null) => void;
  onFocus: (id: string) => void;
  onExpand: (id: string) => void;
  onClose: () => void;
}) {
  const id = () => props.selected ?? props.graph.focus;
  const node = createMemo(() => props.model.byId.get(id()) ?? null);
  const incoming = createMemo(() => rows(props.graph, props.model, id(), "in", props.kinds));
  const outgoing = createMemo(() => rows(props.graph, props.model, id(), "out", props.kinds));
  const drawn = () => props.model.vm.nodes.some((n) => n.id === id());
  const count = (list: Row[]) => list.reduce((n, r) => n + r.refs.reduce((m, e) => m + e.count, 0), 0);
  const container = () => {
    const n = node();
    return n?.container ? props.model.byId.get(n.container) ?? null : null;
  };

  const RefRows = (p: { list: Row[]; side: "in" | "out" }) => (
    <Show when={p.list.length} fallback={<div class="px-3 py-1.5 text-[11.5px] text-[var(--plc-on-subtle)]">{p.side === "in" ? "Nothing in the index references it." : "It references nothing the index knows."}</div>}>
      <ul class="py-1">
        <For each={p.list}>
          {(row) => (
            <li class="px-3 py-1" classList={{ "opacity-50": row.hidden }} data-ref-row={row.other.id}>
              <div class="flex items-baseline gap-1.5 text-[12px]">
                <button type="button" class="min-w-0 truncate text-left font-medium text-[var(--plc-on-surface)] hover:underline" title={`Select ${qualifiedOf(row.other.id) || row.other.file}`} onClick={() => props.onSelect(row.other.id)}>
                  {labelOf(row.other)}
                </button>
                <span class="min-w-0 truncate text-[11px] text-[var(--plc-on-subtle)]">{row.other.kind}{row.other.container ? ` of ${qualifiedOf(row.other.container)}` : ""} · {baseName(row.other.file)}</span>
                <IconButton label={`Show references of ${row.other.name}`} title="Centre the graph here" size="xs" class="ml-auto" onClick={() => props.onFocus(row.other.id)}>
                  <Crosshair size={11} aria-hidden="true" />
                </IconButton>
              </div>
              <div class="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                <For each={row.refs}>
                  {(e) => (
                    <span class="flex items-baseline gap-1" title={`${REF_KIND_SPEC[e.kind].hint} · ${RESOLUTION_SPEC[e.resolution].label}: ${RESOLUTION_SPEC[e.resolution].hint}`}>
                      <span classList={{ "text-[var(--plc-warning)]": e.resolution === "name", "text-[var(--plc-on-muted)]": e.resolution !== "name" }}>
                        {REF_KIND_SPEC[e.kind].verb}
                        {e.resolution === "name" ? "?" : ""}
                      </span>
                      <For each={e.lines}>
                        {(line) => (
                          <button type="button" class="font-mono tabular-nums text-[var(--plc-accent)] hover:underline" title={`Open ${row.at.file}:${line}`} onClick={() => props.onOpen(row.at.file, line, row.at.id)}>
                            {line}
                          </button>
                        )}
                      </For>
                      <Show when={e.count > e.lines.length}>
                        <span class="text-[var(--plc-on-subtle)]">+{e.count - e.lines.length}</span>
                      </Show>
                    </span>
                  )}
                </For>
              </div>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );

  return (
    <aside class="flex w-[22rem] shrink-0 flex-col overflow-hidden border-l border-[var(--plc-border)] bg-[var(--plc-surface)] text-[var(--plc-on-surface)]" data-symbol-inspector>
      <div class="flex items-center gap-2 border-b border-[var(--plc-border)] px-3 py-1.5">
        <span class="text-[12px] font-semibold">{props.selected ? "Selected symbol" : "Focus"}</span>
        <IconButton label="Close the inspector" size="xs" class="ml-auto" onClick={props.onClose}>
          <X size={12} aria-hidden="true" />
        </IconButton>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <Show when={node()} fallback={<div class="px-3 py-3 text-[12px] text-[var(--plc-on-subtle)]">Nothing selected.</div>}>
          {(n) => (
            <>
              <div class={SECTION}>
                <div class="flex items-baseline gap-2">
                  <span class="min-w-0 truncate font-mono text-[13px] font-semibold" title={n().id}>
                    {qualifiedOf(n().id) || baseName(n().file)}
                  </span>
                  <span class="text-[11px] text-[var(--plc-on-subtle)]">{n().kind}{n().isTest ? " · test" : ""}{n().exported === false ? " · private" : ""}</span>
                </div>
                <div class="mt-0.5 text-[11.5px] text-[var(--plc-on-muted)]">
                  <Show when={container()}>{(c) => <span>in {labelOf(c())} · </span>}</Show>
                  <button type="button" class="font-mono text-[var(--plc-accent)] hover:underline" onClick={() => props.onOpen(n().file, n().line, n().id)} title="Open in the code viewer">
                    {n().file}:{n().line}
                  </button>
                  <span> · lines {n().line}–{n().endLine}</span>
                </div>
                <div class="mt-1 text-[11.5px] text-[var(--plc-on-muted)]">
                  {n().inCount} symbol{n().inCount === 1 ? "" : "s"} reference it · it references {n().outCount}
                </div>
                <div class="mt-1.5 flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" class="gap-1 px-2" onClick={() => props.onOpen(n().file, n().line, n().id)} title="Open in the code viewer (O)">
                    <ExternalLink size={12} aria-hidden="true" />
                    Open code
                  </Button>
                  <Show when={n().id !== props.graph.focus}>
                    <Button variant="ghost" size="sm" class="gap-1 px-2" onClick={() => props.onFocus(n().id)} title="Centre the graph on it (F)">
                      <Crosshair size={12} aria-hidden="true" />
                      Focus
                    </Button>
                    <Show when={drawn() && props.model.vm.nodes.find((v) => v.id === n().id)?.expandable}>
                      <Button variant="ghost" size="sm" class="gap-1 px-2" onClick={() => props.onExpand(n().id)} title="Open its own hop in place (E)">
                        <Maximize2 size={12} aria-hidden="true" />
                        Open hop
                      </Button>
                    </Show>
                  </Show>
                </div>
              </div>
              <div class={SECTION}>
                <div class={HEAD}>Referenced by · {count(incoming())}</div>
              </div>
              <RefRows list={incoming()} side="in" />
              <div class={SECTION}>
                <div class={HEAD}>References · {count(outgoing())}</div>
              </div>
              <RefRows list={outgoing()} side="out" />
              <Show when={incoming().some((r) => r.hidden) || outgoing().some((r) => r.hidden)}>
                <div class="px-3 py-2 text-[11px] text-[var(--plc-on-subtle)]">Dimmed rows are of kinds the filters hide; they are listed, not drawn.</div>
              </Show>
            </>
          )}
        </Show>
      </div>
    </aside>
  );
}
