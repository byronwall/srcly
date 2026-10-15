/**
 * The server sends the analysis tree compactly (`serialize_tree` in
 * server/app/services/scan_jobs.py):
 *
 * - fields at their default are left out (most nodes are functions whose
 *   metrics are nearly all zero);
 * - a child's `path` is left out when it is the parent's path + separator +
 *   name, where the separator is `/` inside folders and `::` inside code.
 *
 * This puts both back, so the rest of the client can keep reading
 * `node.metrics.loc`, `node.path` and `node.children` without guards.
 *
 * Keep in step with `Metrics` and `Node` in server/app/models.py.
 */

export const DEFAULT_METRICS = {
  loc: 0,
  complexity: 0,
  function_count: 0,
  last_modified: 0,
  gitignored_count: 0,
  file_size: 0,
  file_count: 0,
  comment_lines: 0,
  comment_density: 0,
  max_nesting_depth: 0,
  average_function_length: 0,
  parameter_count: 0,
  todo_count: 0,
  classes_count: 0,
  tsx_nesting_depth: 0,
  tsx_render_branching_count: 0,
  tsx_react_use_effect_count: 0,
  tsx_anonymous_handler_count: 0,
  tsx_prop_count: 0,
  ts_any_usage_count: 0,
  ts_ignore_count: 0,
  ts_import_coupling_count: 0,
  tsx_hardcoded_string_volume: 0,
  tsx_duplicated_string_count: 0,
  ts_type_interface_count: 0,
  ts_export_count: 0,
  python_import_count: 0,
  md_data_url_count: 0,
} as const;

type RawNode = {
  name: string;
  type: string;
  path?: string;
  metrics?: Record<string, unknown>;
  children?: RawNode[];
  start_line?: number;
  end_line?: number;
};

/** Fill in omitted defaults and paths in place, iteratively (trees can be deep). Returns the root. */
export function normalizeTree<T>(root: T): T {
  if (!root || typeof root !== "object") return root;
  const stack: RawNode[] = [root as unknown as RawNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    // A fresh object from the full defaults is ~8x faster than adding the
    // missing keys one by one (V8 keeps one shape for every node).
    node.metrics = Object.assign({ ...DEFAULT_METRICS }, node.metrics);
    node.start_line ??= 0;
    node.end_line ??= 0;
    const children = (node.children ??= []);
    const prefix = node.path + (node.type === "folder" ? "/" : "::");
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      child.path ??= prefix + child.name;
      stack.push(child);
    }
  }
  return root;
}
