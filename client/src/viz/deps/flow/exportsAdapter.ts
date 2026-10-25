// File and folder anchors (T19): the engine's `fileExports` → the dependency
// view's ViewModel. The file or folder is the focus; each export is a box in
// its file's frame; an opened export (the URL's `open` list) shows its own
// anchor graph in a frame of its own, its boxes prefixed with the export id
// so several expansions never collide. A folder over the budget shows one
// box per file with counts, and a file opens into its exports.
import type { AnchorGraphResult, FileExportsResult } from "../../../dataflow/contract.generated";
import type { ViewEdge, ViewNode } from "../viewModel";
import type { FlowViewModel } from "./adapter";
import { anchorGraphToViewModel } from "./anchorAdapter";
import { FLOW_MARKS } from "./marks";

export type FileExport = FileExportsResult["files"][number]["exports"][number];

/** A folder with more exports than this shows its files folded, each with counts, until a file is opened. */
export const EXPORTS_BUDGET = 50;

const EXPORT_MARK: Record<FileExport["kind"], keyof typeof FLOW_MARKS> = {
  function: "value",
  class: "value",
  variable: "value",
  component: "component",
  enum: "value",
  type: "boundary",
  interface: "boundary",
  namespace: "boundary",
  other: "value",
};

export interface ExportsViewOptions {
  /** Export ids and file paths opened in place (the URL's `open` list). */
  expanded: Iterable<string>;
  /** Anchor graphs already fetched for opened exports, by export id. */
  graphs: ReadonlyMap<string, AnchorGraphResult | null>;
  /** Which way the exports are traced: backward puts them (and their traces) on the left. */
  dir?: "forward" | "backward" | "both";
}

export function exportsToViewModel(result: FileExportsResult, options: ExportsViewOptions): FlowViewModel {
  const expanded = new Set(options.expanded);
  // Every export, and everything an opened one traces to, sits on one side of the target, so a frame never spans the center.
  const side: ViewNode["region"] = options.dir === "backward" ? "in" : "out";
  const folded = result.target.kind === "folder" && result.counts.exports > EXPORTS_BUDGET;
  const nodes: ViewNode[] = [];
  const edges: ViewEdge[] = [];
  const byId: FlowViewModel["byId"] = new Map();
  const shownAs = new Map<string, string>();
  const focusId = `exports:${result.target.path}`;
  nodes.push({
    id: focusId,
    graphId: focusId,
    region: "center",
    kind: result.target.kind,
    label: baseName(result.target.path),
    title: result.target.path,
    subtitle: `${result.counts.exports} export${result.counts.exports === 1 ? "" : "s"} in ${result.counts.files} file${result.counts.files === 1 ? "" : "s"}${folded ? " · over the budget: open a file to see its exports" : ""}`,
    memberCount: result.counts.exports,
    isFocus: true,
    tint: FLOW_MARKS.anchor.color,
  });
  for (const file of result.files) {
    const fileOpen = !folded || expanded.has(file.file);
    if (!fileOpen) {
      const traceable = file.exports.filter((e) => e.traceable).length;
      nodes.push({
        id: file.file,
        graphId: file.file,
        region: side,
        kind: "file",
        label: baseName(file.file),
        title: file.file,
        subtitle: `${file.exports.length} export${file.exports.length === 1 ? "" : "s"} · ${traceable} traceable`,
        memberCount: file.exports.length,
        isFocus: false,
        expandable: file.exports.length > 0,
        outline: "dotted",
      });
      edges.push({ id: `owns:${file.file}`, source: focusId, target: file.file, weight: 1, faint: true, symbols: [], style: "structural", status: "structural" });
      continue;
    }
    for (const item of file.exports) {
      const graph = expanded.has(item.id) ? options.graphs.get(item.id) : undefined;
      if (graph) {
        merge(item, graph, side, nodes, edges, byId, shownAs);
        edges.push({ id: `owns:${item.id}`, source: focusId, target: item.id, weight: 1, faint: true, symbols: [], style: "structural", status: "structural" });
        continue;
      }
      const mark = EXPORT_MARK[item.kind];
      nodes.push({
        id: item.id,
        graphId: item.id,
        region: side,
        kind: "symbol",
        symbolKind: mark,
        label: item.name,
        title: `${item.name} · ${item.file}:${item.line}`,
        subtitle: [item.kind, `${baseName(item.file)}:${item.line}`, item.reexported ? "re-exported" : ""].filter(Boolean).join(" · "),
        note: !item.traceable ? "type only: nothing to trace" : expanded.has(item.id) ? "tracing…" : undefined,
        memberCount: 1,
        isFocus: false,
        group: folded ? { id: file.file, label: file.file, opened: true } : { id: `file:${file.file}`, label: file.file, opened: true },
        expandable: item.traceable && !expanded.has(item.id),
        tint: FLOW_MARKS[mark].color,
        ...(item.traceable ? {} : { outline: "dotted" as const }),
      });
      edges.push({ id: `owns:${item.id}`, source: focusId, target: item.id, weight: 1, faint: true, symbols: [], style: "structural", status: "structural" });
    }
  }
  return {
    vm: { focusId, focusKind: result.target.kind, focusLabel: result.target.path, breadcrumbs: [], nodes, edges, rolledUp: 0 },
    hidden: new Set(edges.filter((e) => e.id.startsWith("owns:")).map((e) => e.id)),
    notFlow: new Set(),
    byId,
    shownAs,
    lit: null,
  };
}

/** An opened export's anchor graph, in a frame named after the export; its anchor box takes the export's id so it can close again. */
function merge(item: FileExport, graph: AnchorGraphResult, side: ViewNode["region"], nodes: ViewNode[], edges: ViewEdge[], byId: FlowViewModel["byId"], shownAs: Map<string, string>) {
  const model = anchorGraphToViewModel(graph);
  const anchorId = model.vm.focusId;
  const prefixed = (id: string) => (id === anchorId ? item.id : `${item.id}|${id}`);
  for (const node of model.vm.nodes) {
    nodes.push({
      ...node,
      id: prefixed(node.id),
      graphId: prefixed(node.id),
      region: side,
      isFocus: false,
      group: { id: item.id, label: `${item.name} · ${baseName(item.file)}`, opened: true },
      ...(node.id === anchorId ? { label: item.name, expandable: false } : {}),
    });
    const engine = model.byId.get(node.id);
    if (engine) byId.set(prefixed(node.id), engine);
    shownAs.set(prefixed(node.id), prefixed(node.id));
  }
  for (const edge of model.vm.edges) edges.push({ ...edge, id: `${item.id}|${edge.id}`, source: prefixed(edge.source), target: prefixed(edge.target) });
}

function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1) || file;
}
