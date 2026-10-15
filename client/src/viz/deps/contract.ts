// Language-neutral dependency graph contract.
//
// The server emits the *finest* graph it can resolve: a folder → file → symbol
// hierarchy plus importer → imported edges between files or symbols. The client
// does all aggregation, budgeting and layout.

export type GraphNodeKind = "folder" | "file" | "symbol" | "external";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Short display name (file name, folder name, symbol name, package name). */
  name: string;
  /** Parent node id (folder for files/folders, file for symbols). null = root. */
  parent: string | null;
  /** Repo-relative path for folders/files. */
  path?: string;
  /** Absolute path, used to open the code viewer. */
  absPath?: string;
  language?: "ts" | "py" | "other";
  isTest?: boolean;
  /** For symbols: function, class, variable, type, ... */
  symbolKind?: string;
  line?: number;
}

export interface GraphEdge {
  /** Importer (file or symbol that uses the dependency). */
  source: string;
  /** Imported (file, symbol, or external package). */
  target: string;
  typeOnly?: boolean;
  /** True when resolved through a barrel / __init__ re-export. */
  viaBarrel?: boolean;
  /** Imported names carried on a file → file edge. */
  symbols?: string[];
}

export interface DependencyGraphContract {
  /** Id of the root folder node. */
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const EXTERNAL_ROOT_ID = "ext:";
