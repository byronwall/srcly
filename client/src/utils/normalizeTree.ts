/**
 * The server sends the analysis tree compactly (`compact_tree` in
 * server/app/services/scan_jobs.py):
 *
 * - node and metric fields at their model default are left out (most nodes
 *   are scopes whose metrics are nearly all N/A or 0);
 * - a child's `path` is left out when it is the parent's path + separator +
 *   name, where the separator is `/` inside folders and `::` inside code.
 *
 * This puts both back exactly as the server would have sent them (N/A stays
 * `null`, a measured 0 stays 0), so the rest of the client keeps reading
 * `node.metrics.loc`, `node.path` and `node.children` without guards.
 *
 * The defaults are the `Metrics` and `Node` model defaults in
 * server/app/models.py; server/tests/test_payload_defaults.py fails when
 * these drift from them.
 */

export const DEFAULT_METRICS = {
  loc: 0,
  last_modified: 0,
  gitignored_count: 0,
  file_size: 0,
  file_count: 0,
  complexity: null,
  complexity_witness: null,
  complexity_avg: null,
  function_count: null,
  comment_lines: null,
  comment_noise: null,
  comment_noise_ratio: null,
  comment_noise_docblock: null,
  comment_noise_commented_code: null,
  max_nesting_depth: null,
  average_function_length: null,
  parameter_count: null,
  todo_count: null,
  classes_count: null,
  component_loc: null,
  component_hook_count: null,
  component_effect_count: null,
  component_jsx_depth: null,
  component_prop_count: null,
  component_inline_handler_count: null,
  component_jsx_conditional_count: null,
  witnesses: null,
  ts_any_usage_count: null,
  ts_ignore_count: null,
  ts_import_coupling_count: null,
  ts_type_interface_count: null,
  ts_export_count: null,
  python_import_count: null,
  md_data_url_count: null,
  commit_count: null,
  churn_lines: null,
  finding_count: null,
  error_count: null,
  na_reason: "",
  na_reasons: null,
  analysis_status: "ok",
  analysis_error: "",
  analysis_failed_count: 0,
} as const;

/** `Node` fields with a default, other than `children` (always a fresh `[]`). */
export const DEFAULT_NODE = {
  kind: null,
  start_line: 0,
  end_line: 0,
  activity: null,
  findings: null,
} as const;

type RawNode = {
  name: string;
  type: string;
  path?: string;
  metrics?: Record<string, unknown>;
  children?: RawNode[];
  [key: string]: unknown;
};

/** Fill in omitted defaults and paths in place, iteratively (trees can be deep). Returns the root. */
export function normalizeTree<T>(root: T): T {
  if (!root || typeof root !== "object") return root;
  const stack: RawNode[] = [root as unknown as RawNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    // A fresh object from the full defaults is much faster than adding the
    // missing keys one by one (V8 keeps one shape for every node).
    node.metrics = Object.assign({ ...DEFAULT_METRICS }, node.metrics);
    for (const key in DEFAULT_NODE) {
      if (!(key in node)) node[key] = DEFAULT_NODE[key as keyof typeof DEFAULT_NODE];
    }
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
