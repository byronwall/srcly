import {
  EXTERNAL_ROOT_ID,
  type DependencyGraphContract,
  type GraphEdge,
  type GraphNode,
} from "./contract";

// Shape returned by the legacy GET /api/analysis/dependencies endpoint.
export interface LegacyGraph {
  nodes: { id: string; label: string; type: string; parent?: string | null }[];
  edges: { id: string; source: string; target: string; label?: string | null }[];
}

const TEST_RE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[jt]sx?$/;

export function isTestPath(path: string): boolean {
  return TEST_RE.test(path);
}

function commonDir(paths: string[]): string {
  if (paths.length === 0) return "";
  const split = paths.map((p) => p.split("/").slice(0, -1));
  const first = split[0];
  let n = first.length;
  for (const parts of split) {
    let i = 0;
    while (i < n && i < parts.length && parts[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join("/");
}

export function externalPackageName(spec: string): string {
  const parts = spec.split("/");
  if (spec.startsWith("@") && parts.length > 1) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

/**
 * Convert the legacy flat file graph (absolute-path ids, file → file edges plus
 * export → importer edges) into the hierarchical contract.
 */
export function legacyToContract(legacy: LegacyGraph, rootPath?: string): DependencyGraphContract {
  const files = legacy.nodes.filter((n) => n.type === "file");
  const base = (rootPath ?? commonDir(files.map((f) => f.id))).replace(/\/+$/, "");
  const rootName = base.split("/").pop() || "/";
  const rootId = "";

  const nodes = new Map<string, GraphNode>();
  nodes.set(rootId, { id: rootId, kind: "folder", name: rootName, parent: null, path: "" });

  const ensureFolder = (relDir: string): string => {
    if (relDir === "" || nodes.has(relDir)) return relDir;
    const idx = relDir.lastIndexOf("/");
    const parent = idx === -1 ? "" : relDir.slice(0, idx);
    ensureFolder(parent);
    nodes.set(relDir, {
      id: relDir,
      kind: "folder",
      name: relDir.slice(idx + 1),
      parent,
      path: relDir,
    });
    return relDir;
  };

  const idMap = new Map<string, string>();
  for (const f of files) {
    if (!f.id.startsWith(base + "/")) continue;
    const rel = f.id.slice(base.length + 1);
    const idx = rel.lastIndexOf("/");
    const parent = ensureFolder(idx === -1 ? "" : rel.slice(0, idx));
    nodes.set(rel, {
      id: rel,
      kind: "file",
      name: rel.slice(idx + 1),
      parent,
      path: rel,
      absPath: f.id,
      language: "ts",
      isTest: isTestPath(rel),
    });
    idMap.set(f.id, rel);
  }

  let hasExternal = false;
  for (const n of legacy.nodes) {
    if (n.type !== "external") continue;
    const pkg = externalPackageName(n.label);
    const id = `${EXTERNAL_ROOT_ID}${pkg}`;
    idMap.set(n.id, id);
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind: "external", name: pkg, parent: EXTERNAL_ROOT_ID });
      hasExternal = true;
    }
  }
  if (hasExternal) {
    nodes.set(EXTERNAL_ROOT_ID, {
      id: EXTERNAL_ROOT_ID,
      kind: "folder",
      name: "external packages",
      parent: rootId,
    });
  }

  // Collect imported symbol names per file pair from export → importer edges.
  const exportOwner = new Map<string, { file: string; name: string }>();
  for (const n of legacy.nodes) {
    if (n.type === "export" && n.parent) exportOwner.set(n.id, { file: n.parent, name: n.label });
  }
  const symbolsByPair = new Map<string, Set<string>>();
  for (const e of legacy.edges) {
    const owner = exportOwner.get(e.source);
    if (!owner) continue;
    const key = `${e.target}\u0000${owner.file}`;
    const set = symbolsByPair.get(key) ?? new Set<string>();
    set.add(owner.name);
    symbolsByPair.set(key, set);
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const e of legacy.edges) {
    if (exportOwner.has(e.source)) continue;
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (s === undefined || t === undefined || s === t) continue;
    const key = `${s}\u0000${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const syms = symbolsByPair.get(`${e.source}\u0000${e.target}`);
    edges.push({ source: s, target: t, symbols: syms ? [...syms].sort() : undefined });
  }

  return { root: rootId, nodes: [...nodes.values()], edges };
}
