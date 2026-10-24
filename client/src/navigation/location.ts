// One "where I am" for the treemap and the dependency graph.
//
// `at` is repo-relative (relative to the scanned root):
//   ""                     the root
//   "client/src"           a folder
//   "client/src/App.tsx"   a file
//   "src/a.ts#Foo"         a scope in a file. The treemap writes its whole scope
//                          chain ("a.py#Foo (class)::run"); the graph writes bare
//                          top-level symbol names ("a.py#Foo").
//   "ext:react"            an external package (graph only)
//
// The file part ends at the first "#". Scope names may contain "#" (TS private
// members); file names with "#" are not supported.

export type View = "treemap" | "graph" | "scatter";

export interface Location {
  /** Absolute path of the analyzed codebase; "" before one is chosen. */
  repo: string;
  at: string;
  view: View;
  /**
   * Graph only: folders and files opened in place (graph ids, which are `at`
   * values). Kept across focus changes, so a mixed-scale cut survives a drill.
   */
  open?: string[];
  /**
   * Graph only: Data flow mode for this route key instead of the import
   * graph. "" is Data flow mode with no route picked yet; absent is Imports.
   */
  flow?: string;
  /** Data flow mode: the selected origin (its node id); its proven destinations light up. */
  field?: string;
  /** Data flow mode: the selected destination (a node id). */
  dest?: string;
  /**
   * Graph only: Data flow mode anchored at an expression instead of a route
   * (`encodeAnchor`): `file:line:col-line:col`, or `file@name:line` for a
   * symbol. Replaces `flow`.
   */
  anchor?: string;
  /** Anchor mode: which way the value is traced; absent is both. */
  dir?: Direction;
}

export type Direction = "forward" | "backward" | "both";

/** An anchor as the engine takes it: an exact span, or a symbol by name on a line. */
export type Anchor =
  | { file: string; span: { startLine: number; startColumn: number; endLine: number; endColumn: number } }
  | { file: string; name: string; line: number }
  /** A file or folder anchor (T19): one box per export, each traced on demand. */
  | { file: string; exports: true };

export function encodeAnchor(anchor: Anchor): string {
  if ("exports" in anchor) return `${anchor.file}@*`;
  if ("name" in anchor) return `${anchor.file}@${anchor.name}:${anchor.line}`;
  const s = anchor.span;
  return `${anchor.file}:${s.startLine}:${s.startColumn}-${s.endLine}:${s.endColumn}`;
}

export function parseAnchor(raw: string | undefined): Anchor | null {
  if (!raw) return null;
  const exports = /^(.*)@\*$/.exec(raw);
  if (exports) return { file: exports[1], exports: true };
  const named = /^(.+)@([^@:]+):(\d+)$/.exec(raw);
  if (named) return { file: named[1], name: named[2], line: Number(named[3]) };
  const span = /^(.+):(\d+):(\d+)-(\d+):(\d+)$/.exec(raw);
  if (!span) return null;
  const [, file, a, b, c, d] = span;
  return { file, span: { startLine: Number(a), startColumn: Number(b), endLine: Number(c), endColumn: Number(d) } };
}

export const ROOT_LOCATION: Location = { repo: "", at: "", view: "treemap" };

const REPO_PARAM = "repo";
const AT_PARAM = "at";
const VIEW_PARAM = "view";
const OPEN_PARAM = "open";
const FLOW_PARAM = "flow";
const FIELD_PARAM = "field";
const DEST_PARAM = "dest";
const ANCHOR_PARAM = "anchor";
const DIR_PARAM = "dir";
/** Pre-location graph focus parameter. Read as an alias of `at` + graph view. */
const LEGACY_FOCUS_PARAM = "depFocus";

const EXTERNAL_PREFIX = "ext:";

export function parseLocation(search: string): Location {
  const params = new URLSearchParams(search);
  const legacy = params.get(LEGACY_FOCUS_PARAM);
  const rawAt = params.get(AT_PARAM) ?? (legacy !== null ? legacy : "");
  const rawView = params.get(VIEW_PARAM);
  const view: View =
    rawView === "graph" || rawView === "treemap" || rawView === "scatter"
      ? rawView
      : legacy !== null
        ? "graph"
        : "treemap";
  const open = (params.get(OPEN_PARAM) ?? "").split(",").map(normalizeAt).filter(Boolean);
  // An anchor replaces the route: the graph is in Data flow mode either way, never both.
  const anchor = view === "graph" && parseAnchor(params.get(ANCHOR_PARAM) ?? undefined) ? params.get(ANCHOR_PARAM) : null;
  const rawDir = anchor !== null ? params.get(DIR_PARAM) : null;
  const dir = rawDir === "forward" || rawDir === "backward" ? rawDir : null;
  const flow = view === "graph" && anchor === null ? params.get(FLOW_PARAM) : null;
  const field = flow !== null ? params.get(FIELD_PARAM) : null;
  const dest = field !== null ? params.get(DEST_PARAM) : null;
  return {
    repo: params.get(REPO_PARAM) ?? "",
    at: normalizeAt(rawAt),
    view,
    ...(open.length ? { open } : {}),
    ...(flow !== null ? { flow } : {}),
    ...(field ? { field } : {}),
    ...(dest ? { dest } : {}),
    ...(anchor !== null ? { anchor } : {}),
    ...(dir ? { dir } : {}),
  };
}

/**
 * The query string for `loc`, keeping every parameter the location doesn't own
 * (e.g. `compare`) and dropping the legacy alias. Defaults are omitted, so the
 * root treemap is a bare URL.
 */
export function toSearch(loc: Location, currentSearch = ""): string {
  const params = new URLSearchParams(currentSearch);
  params.delete(LEGACY_FOCUS_PARAM);
  params.delete(REPO_PARAM);
  params.delete(AT_PARAM);
  params.delete(VIEW_PARAM);
  params.delete(OPEN_PARAM);
  params.delete(FLOW_PARAM);
  params.delete(FIELD_PARAM);
  params.delete(DEST_PARAM);
  params.delete(ANCHOR_PARAM);
  params.delete(DIR_PARAM);
  if (loc.repo) params.set(REPO_PARAM, loc.repo);
  if (loc.at) params.set(AT_PARAM, loc.at);
  if (loc.view !== "treemap") params.set(VIEW_PARAM, loc.view);
  if (loc.open?.length) params.set(OPEN_PARAM, loc.open.join(","));
  if (loc.view === "graph" && loc.anchor) {
    params.set(ANCHOR_PARAM, loc.anchor);
    if (loc.dir && loc.dir !== "both") params.set(DIR_PARAM, loc.dir);
  } else if (loc.view === "graph" && loc.flow !== undefined) {
    params.set(FLOW_PARAM, loc.flow);
    if (loc.field) {
      params.set(FIELD_PARAM, loc.field);
      if (loc.dest) params.set(DEST_PARAM, loc.dest);
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function sameLocation(a: Location, b: Location): boolean {
  return (
    samePlace(a, b) && (a.open ?? []).join(",") === (b.open ?? []).join(",") && a.field === b.field && a.dest === b.dest && (a.dir ?? "both") === (b.dir ?? "both")
  );
}

/** Same repo, focus, view and graph mode, whatever is opened in place or selected in Data flow mode (one history entry per place). */
export function samePlace(a: Location, b: Location): boolean {
  return a.repo === b.repo && a.at === b.at && a.view === b.view && a.flow === b.flow && a.anchor === b.anchor;
}

/** Data flow mode: a route, or an anchor. */
export function isDataFlow(loc: Pick<Location, "flow" | "anchor">): boolean {
  return loc.flow !== undefined || loc.anchor !== undefined;
}

/** Trims slashes; the legacy graph param used "/" for the root. */
function normalizeAt(at: string): string {
  const hash = at.indexOf("#");
  const file = (hash < 0 ? at : at.slice(0, hash)).replace(/^\/+|\/+$/g, "");
  return hash < 0 ? file : `${file}${at.slice(hash)}`;
}

export function isExternal(at: string): boolean {
  return at.startsWith(EXTERNAL_PREFIX);
}

/** `"a/b.ts#Foo::bar"` → `{ file: "a/b.ts", scopes: ["Foo", "bar"] }`. */
export function splitAt(at: string): { file: string; scopes: string[] } {
  const hash = at.indexOf("#");
  if (hash < 0) return { file: at, scopes: [] };
  const rest = at.slice(hash + 1);
  return { file: at.slice(0, hash), scopes: rest ? rest.split("::") : [] };
}

/** One step up: scope → outer scope → file → folder → root. null at the root. */
export function parentAt(at: string): string | null {
  if (at === "") return null;
  if (isExternal(at)) return "";
  const { file, scopes } = splitAt(at);
  if (scopes.length > 1) return `${file}#${scopes.slice(0, -1).join("::")}`;
  if (scopes.length === 1) return file;
  const slash = file.lastIndexOf("/");
  return slash < 0 ? "" : file.slice(0, slash);
}

/** `at` and each of its ancestors, nearest first, ending with the root. */
export function ancestorsOf(at: string): string[] {
  const out: string[] = [];
  for (let cur: string | null = at; cur !== null; cur = parentAt(cur)) out.push(cur);
  return out;
}

function joinRoot(root: string, rel: string): string {
  if (!rel) return root;
  return root.endsWith("/") ? `${root}${rel}` : `${root}/${rel}`;
}

/**
 * The location of a scan-tree node path (absolute; scopes joined with "::").
 * null when the path is outside the root.
 */
export function atFromTreePath(path: string, root: string): string | null {
  if (path === root) return "";
  const prefix = root.endsWith("/") ? root : `${root}/`;
  if (!path.startsWith(prefix)) return null;
  const rel = path.slice(prefix.length);
  const sep = rel.indexOf("::");
  return sep < 0 ? rel : `${rel.slice(0, sep)}#${rel.slice(sep + 2)}`;
}

/** Inverse of `atFromTreePath`. */
export function treePathFromAt(at: string, root: string): string {
  const { file, scopes } = splitAt(at);
  const abs = joinRoot(root, file);
  return scopes.length ? `${abs}::${scopes.join("::")}` : abs;
}

/**
 * Scope names in the scan tree carry decorations ("Foo (class)",
 * "(class) Foo", "run (async)"); graph symbols are bare. Compare them bare.
 */
export function normalizeScopeName(name: string): string {
  return name.replace(/\([^)]*\)/g, "").trim();
}

/** Last path segment ("/a/b/" → "b"). */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export interface Crumb {
  label: string;
  at: string;
}

/** Breadcrumbs from the root to `at`, shared by both views. */
export function crumbsFor(at: string, rootLabel: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: rootLabel || "root", at: "" }];
  if (!at) return crumbs;
  if (isExternal(at)) {
    crumbs.push({ label: at.slice(EXTERNAL_PREFIX.length) || "external", at });
    return crumbs;
  }
  const { file, scopes } = splitAt(at);
  const parts = file.split("/");
  parts.forEach((label, i) => crumbs.push({ label, at: parts.slice(0, i + 1).join("/") }));
  scopes.forEach((label, i) =>
    crumbs.push({ label, at: `${file}#${scopes.slice(0, i + 1).join("::")}` })
  );
  return crumbs;
}

/**
 * The graph node that shows `at`: itself, or for a treemap scope chain the
 * file's top-level symbol by bare name, else the nearest ancestor the graph
 * has (graphs hold only source files, so a README falls back to its folder).
 */
export function graphIdFor(at: string, has: (id: string) => boolean): string {
  if (has(at)) return at;
  const { file, scopes } = splitAt(at);
  if (scopes.length) {
    const symbol = `${file}#${normalizeScopeName(scopes[0])}`;
    if (has(symbol)) return symbol;
  }
  for (const id of ancestorsOf(at)) if (has(id)) return id;
  return "";
}

/**
 * The folder that holds `at`: a scope's or file's folder, a folder's parent.
 * The root (and external packages) show the root.
 */
export function folderOf(at: string): string {
  if (!at || isExternal(at)) return "";
  const { file } = splitAt(at);
  const slash = file.lastIndexOf("/");
  return slash < 0 ? "" : file.slice(0, slash);
}
