import { metricDefs, metricGroups, type MetricDef, type MetricLanguage } from "./metricsStore";

// Extensions lizard has a reader for (functions, CCN, params). Anything not
// listed and not handled by a dedicated analyzer only gets a line count.
const LIZARD_CODE_EXTENSIONS = new Set([
  "js", "jsx", "mjs", "cjs", "go", "java", "kt", "kts", "scala", "c", "h", "cc", "cpp", "cxx",
  "hpp", "hh", "m", "mm", "cs", "rb", "php", "rs", "swift", "lua", "erl", "f90", "f", "gd", "pl", "r", "sol", "zig",
]);

/** The analyzer that handled a path, mirroring the server's dispatch by extension. */
export function languageForPath(path: string): MetricLanguage {
  const file = path.split("::")[0].split("/").pop() ?? "";
  const dot = file.lastIndexOf(".");
  const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
  if (ext === "tsx") return "tsx";
  if (ext === "ts") return "ts";
  if (ext === "py") return "python";
  if (ext === "ipynb") return "notebook";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "css" || ext === "scss") return "css";
  if (LIZARD_CODE_EXTENSIONS.has(ext)) return "code";
  return "text";
}

function appliesToLanguage(def: MetricDef, language: MetricLanguage): boolean {
  return def.languages === null || def.languages.includes(language);
}

/**
 * Metrics that mean something for this file's language and, for a scope
 * node, are actually measured per scope. A 0 from an applicable metric is
 * information; a 0 from one that doesn't apply is noise.
 */
export function applicableMetrics(path: string, isScope: boolean): MetricDef[] {
  const language = languageForPath(path);
  return metricDefs().filter((def) => appliesToLanguage(def, language) && (!isScope || def.scope === "any"));
}

/** Whether one metric means something for this path (see `applicableMetrics`). */
export function metricApplies(def: MetricDef, path: string, isScope: boolean): boolean {
  return appliesToLanguage(def, languageForPath(path)) && (!isScope || def.scope === "any");
}

/** "Size", "Complexity" and "Comments" split the General group; other sections are catalog groups. */
export type MetricSectionTitle = string;

export interface MetricRow {
  id: string;
  label: string;
  /** Undefined when the metric isn't measured per scope (or there is no scope); null when N/A. */
  scope?: number | null;
  /** Null when N/A for this file (skipped, failed, or nothing to average). */
  file?: number | null;
}

export interface MetricSection {
  title: MetricSectionTitle;
  rows: MetricRow[];
}

const SIZE_METRICS = new Set(["loc", "file_size"]);

function sectionOf(def: MetricDef): MetricSectionTitle {
  if (def.id.startsWith("comment_noise")) return "Comments";
  if (def.group !== "General") return def.group;
  return SIZE_METRICS.has(def.id) ? "Size" : "Complexity";
}

/** A number, or null for N/A (the server sends null; anything non-numeric is treated the same). */
const numberOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The code viewer's metrics table: rows for every metric that applies to the
 * file, grouped Size · Complexity · language, with the scope's value (when a
 * scope is open and the metric is measured per scope) beside the file's.
 */
export function metricSections(path: string, fileNode: any, scopeNode: any): MetricSection[] {
  const scopeIds = new Set(scopeNode ? applicableMetrics(path, true).map((d) => d.id) : []);
  const sections: MetricSection[] = [];
  for (const def of applicableMetrics(path, false)) {
    const title = sectionOf(def);
    let section = sections.find((s) => s.title === title);
    if (!section) {
      section = { title, rows: [] };
      sections.push(section);
    }
    section.rows.push({
      id: def.id,
      label: def.viewer_label ?? def.label,
      scope: scopeIds.has(def.id) ? numberOrNull(scopeNode?.metrics?.[def.id]) : undefined,
      file: fileNode ? numberOrNull(fileNode.metrics?.[def.id]) : undefined,
    });
  }
  const order = ["Size", "Complexity", "Comments", ...metricGroups().map((g) => g.id).filter((g) => g !== "General")];
  return sections.sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title));
}
