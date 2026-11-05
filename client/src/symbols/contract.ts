// The symbol reference graph contract (`/api/symbols/*`), mirrored by hand
// from `server/app/models.py` like the dependency graph's. Ids are
// `<file>#<Qualified.name>`; a file's module-level code is `<file>`.

export type SymbolKind = "function" | "class" | "method" | "field" | "variable" | "type" | "enum" | "module";
export type RefKind = "call" | "instantiate" | "read" | "write" | "type" | "extends" | "implements" | "http";
/** How the extractor resolved a reference: through a binding or declaration, through a declared type, or by member name alone. */
export type Resolution = "exact" | "typed" | "name";

export interface SymbolNode {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  endLine: number;
  container?: string;
  exported?: boolean;
  isTest?: boolean;
  language: "ts" | "py";
  /** Distinct symbols referencing it, and it references, over the whole index. */
  inCount: number;
  outCount: number;
  /** Hops from the focus in a neighbourhood; 0 for the focus and its members. */
  hop?: number;
  /** `none`: nothing in the index references it; `tests`: only test files do. Absent otherwise. */
  refs?: "none" | "tests";
}

export interface SymbolEdge {
  source: string;
  target: string;
  kind: RefKind;
  /** Lines in the source's file, ascending (at most a dozen). */
  lines: number[];
  count: number;
  resolution: Resolution;
  /** An `http` reference: the request as matched, `GET /api/items/{id}`. */
  via?: string;
}

export interface SymbolIndexInfo {
  symbols: number;
  references: number;
  files: number;
  unresolvedMembers: number;
  builtMs: number;
  /** Client requests joined to a handler of the index, and ones nothing answers. */
  httpLinks?: number;
  httpUnmatched?: number;
}

export interface SymbolGraph {
  root: string;
  focus: string;
  nodes: SymbolNode[];
  edges: SymbolEdge[];
  truncated?: boolean;
  index: SymbolIndexInfo;
}

/** The shortest chain of references between two symbols, or that there is none. */
export interface SymbolPath {
  root: string;
  start: string;
  end: string;
  found: boolean;
  /** `forward`: start references … references end; `backward`: the chain runs the other way; absent: no chain. */
  direction?: "forward" | "backward";
  steps: number;
  /** On a chain, in order (`hop` is the position); otherwise the two ends. */
  nodes: SymbolNode[];
  edges: SymbolEdge[];
  index: SymbolIndexInfo;
}

export interface SymbolSearchHit {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  container?: string;
  inCount: number;
  outCount: number;
  exported?: boolean;
  /** Declared lines. */
  lines?: number;
}

/** What stands out in the whole index. */
export interface SymbolStats {
  root: string;
  /** Nothing references them (modules and test files aside): private ones first, then by size. */
  unreferenced: SymbolSearchHit[];
  unreferencedCount: number;
  unreferencedPrivate: number;
  testOnly: SymbolSearchHit[];
  testOnlyCount: number;
  /** Most distinct referencing symbols first. */
  hubs: SymbolSearchHit[];
  index: SymbolIndexInfo;
}

export interface SymbolSearch {
  hits: SymbolSearchHit[];
  index: SymbolIndexInfo;
}

export const REF_KINDS: RefKind[] = ["call", "instantiate", "read", "write", "type", "extends", "implements", "http"];

/** Each reference kind's word on chips, edges and cards, and what it means. */
export const REF_KIND_SPEC: Record<RefKind, { label: string; verb: string; hint: string }> = {
  call: { label: "Calls", verb: "calls", hint: "a call of a function or method" },
  instantiate: { label: "New", verb: "instantiates", hint: "a class instantiated: `new C()` or `C()`" },
  read: { label: "Reads", verb: "reads", hint: "a value read: a variable, field, enum or a function passed along" },
  write: { label: "Writes", verb: "writes", hint: "an assignment to a variable or field" },
  type: { label: "Types", verb: "names the type", hint: "a type named in an annotation or a type alias" },
  extends: { label: "Extends", verb: "extends", hint: "a class or interface extended" },
  implements: { label: "Implements", verb: "implements", hint: "an interface implemented" },
  http: { label: "HTTP", verb: "requests", hint: "a client request (fetch, new URL, api.post) matched to the server handler by method and path" },
};

export const RESOLUTION_SPEC: Record<Resolution, { label: string; hint: string }> = {
  exact: { label: "exact", hint: "resolved through an import, a declaration in scope, this or the class name" },
  typed: { label: "typed", hint: "resolved through the receiver's declared type or its `new`" },
  name: { label: "by name", hint: "a guess: the one member of the index with this name; nothing says the receiver is that class" },
};

/** The qualified name after the file: `Store.bump` of `src/store.ts#Store.bump`; "" for a module. */
export function qualifiedOf(id: string): string {
  const hash = id.indexOf("#");
  return hash < 0 ? "" : id.slice(hash + 1);
}

export function fileOf(id: string): string {
  const hash = id.indexOf("#");
  return hash < 0 ? id : id.slice(0, hash);
}

export function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}

/**
 * The code-viewer location for a symbol: its file, and its top-level
 * declaration's name (a member opens through its class; the line lands it).
 */
export function atOf(id: string): string {
  const qualified = qualifiedOf(id);
  if (!qualified) return fileOf(id);
  return `${fileOf(id)}#${qualified.split(".")[0]}`;
}
