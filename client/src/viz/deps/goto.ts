// The `/` go-to palette's search over the whole graph: folders, files and
// top-level symbols, ranked by where the query matches.

import type { GraphNode } from "./contract";
import type { GraphIndex } from "./hierarchy";

export interface GoToHit {
  node: GraphNode;
  /** What the row shows under the name: the repo path, or `file › symbol`'s file. */
  where: string;
}

const KIND_RANK: Record<string, number> = { folder: 0, file: 1, symbol: 2, external: 3 };

const tokensOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** Where a node lives, for matching and for the row's second line. */
function whereOf(n: GraphNode): string {
  if (n.kind === "symbol") return n.id.split("#")[0];
  return n.path ?? n.id;
}

/**
 * Nodes whose path contains every space-separated token, best first: the
 * name equals the query, then more tokens in the name (a name starting with
 * one breaks a tie), then only the path matching. Ties go to folders, then
 * files, then symbols, then shorter paths. An empty query lists the children
 * of `near`.
 */
export function searchGraph(index: GraphIndex, query: string, near: string, limit = 50): GoToHit[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) {
    return (index.children.get(near) ?? [])
      .map((id) => index.byId.get(id)!)
      .filter((n) => n && n.kind !== "external")
      .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((node) => ({ node, where: whereOf(node) }));
  }
  const whole = tokens.join(" ");
  const scored: { hit: GoToHit; score: number }[] = [];
  for (const node of index.graph.nodes) {
    if (node.id === index.graph.root) continue;
    const where = whereOf(node);
    const hay = `${where} ${node.kind === "symbol" ? node.name : ""}`.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) continue;
    const name = node.name.toLowerCase();
    const missing = tokens.filter((t) => !name.includes(t)).length;
    const score = name === whole ? 0 : 1 + 2 * missing + (tokens.some((t) => name.startsWith(t)) ? 0 : 1);
    scored.push({ hit: { node, where }, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      KIND_RANK[a.hit.node.kind] - KIND_RANK[b.hit.node.kind] ||
      a.hit.where.length - b.hit.where.length ||
      a.hit.where.localeCompare(b.hit.where),
  );
  return scored.slice(0, limit).map((s) => s.hit);
}

/** `text` split into runs, `hit` where a query token matches (case-insensitive). */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = tokensOf(query);
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const t of tokens) {
    for (let i = lower.indexOf(t); i >= 0; i = lower.indexOf(t, i + t.length)) marks.fill(true, i, i + t.length);
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else out.push({ text: text[i], hit: marks[i] });
  }
  return out;
}
