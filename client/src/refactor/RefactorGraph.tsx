import { createMemo, For, Show } from "solid-js";
import type { Graph } from "./api";

/** An import neighbourhood at one exact plan step; every arrow comes from the compiler. */
export default function RefactorGraph(props: { graph: Graph; selected: string; changed: string[]; onSelect: (file: string) => void }) {
  const nodes = createMemo(() => {
    const neighbours = new Set([props.selected, ...props.changed]);
    for (const edge of props.graph.edges) {
      if (edge.from === props.selected || edge.to === props.selected) { neighbours.add(edge.from); neighbours.add(edge.to); }
    }
    const names = props.graph.files.filter((file) => neighbours.has(file));
    return (names.length ? names : props.graph.files).slice(0, 15).map((file, i) => ({ file, x: 18 + (i % 3) * 240, y: 24 + Math.floor(i / 3) * 92 }));
  });
  const edges = createMemo(() => props.graph.edges.flatMap((edge) => {
    const from = nodes().find((n) => n.file === edge.from);
    const to = nodes().find((n) => n.file === edge.to);
    return from && to ? [{ from, to }] : [];
  }));
  return <div class="rf-graph" data-refactor-graph>
      <Show when={nodes().length} fallback={<p class="rf-muted p-4">Load a project to explore its files and imports.</p>}>
      <svg viewBox={`0 0 738 ${Math.max(190, Math.ceil(nodes().length / 3) * 92 + 20)}`} role="img" aria-label="File import relationships">
        <defs><marker id="refactor-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="var(--plc-on-subtle)" /></marker></defs>
        <For each={edges()}>{(edge) => <path d={`M${edge.from.x + 110},${edge.from.y + 52} C${edge.from.x + 110},${edge.from.y + 85} ${edge.to.x + 110},${edge.to.y - 20} ${edge.to.x + 110},${edge.to.y}`} fill="none" stroke="var(--plc-border-strong)" stroke-width="1.5" marker-end="url(#refactor-arrow)" data-refactor-edge={`${edge.from.file}->${edge.to.file}`} />}</For>
        <For each={nodes()}>{(node) => <g transform={`translate(${node.x},${node.y})`} role="button" tabindex="0" aria-label={`Select ${node.file}`} data-refactor-node={node.file}
          onClick={() => props.onSelect(node.file)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect(node.file); } }} class="rf-node">
          <title>{node.file}</title>
          <rect width="220" height="52" rx="5" fill={node.file === props.selected ? "var(--plc-surface-selected)" : "var(--plc-surface)"} stroke={props.changed.includes(node.file) ? "var(--plc-accent)" : "var(--plc-border-strong)"} stroke-width={props.changed.includes(node.file) ? 2 : 1} />
          <text x="10" y="21" fill="var(--plc-on-surface)" font-size="12" font-weight="600">{node.file.split("/").at(-1)}</text>
          <text x="10" y="39" fill="var(--plc-on-subtle)" font-size="10">{node.file.length > 32 ? `…${node.file.slice(-31)}` : node.file}</text>
        </g>}</For>
      </svg>
      <p class="rf-muted px-3 pb-2">Arrows follow imports · blue borders mark edited files · showing {nodes().length} of {props.graph.files.length} files</p>
    </Show>
  </div>;
}
