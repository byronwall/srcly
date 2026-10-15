import {
  HOTSPOT_METRICS,
  type HotSpotMetricDef,
  type HotSpotMetricGroup,
  type MetricLanguage,
} from "./metricsStore";

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

const GROUP_LANGUAGES: Record<HotSpotMetricGroup, MetricLanguage[] | "all"> = {
  General: "all",
  "TypeScript / TSX": ["ts", "tsx"],
  Python: ["python"],
  Markdown: ["markdown"],
};

function appliesToLanguage(def: HotSpotMetricDef, language: MetricLanguage): boolean {
  const langs = def.languages ?? GROUP_LANGUAGES[def.group];
  return langs === "all" || langs.includes(language);
}

/**
 * Metrics that mean something for this file's language and, for a scope
 * node, are actually measured per scope. A 0 from an applicable metric is
 * information; a 0 from one that doesn't apply is noise.
 */
export function applicableMetrics(path: string, isScope: boolean): HotSpotMetricDef[] {
  const language = languageForPath(path);
  return HOTSPOT_METRICS.filter(
    (def) => appliesToLanguage(def, language) && (!isScope || (def.scope ?? "any") === "any")
  );
}

export type MetricSectionTitle = "Size" | "Complexity" | Exclude<HotSpotMetricGroup, "General">;

export interface MetricRow {
  id: string;
  label: string;
  /** Undefined when the metric isn't measured per scope (or there is no scope). */
  scope?: number;
  file?: number;
}

export interface MetricSection {
  title: MetricSectionTitle;
  rows: MetricRow[];
}

const SIZE_METRICS = new Set(["loc", "file_size"]);

function sectionOf(def: HotSpotMetricDef): MetricSectionTitle {
  if (def.group !== "General") return def.group;
  return SIZE_METRICS.has(def.id) ? "Size" : "Complexity";
}

const numberOrUndefined = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

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
      label: def.viewerLabel ?? def.label,
      scope: scopeIds.has(def.id) ? numberOrUndefined(scopeNode?.metrics?.[def.id]) : undefined,
      file: numberOrUndefined(fileNode?.metrics?.[def.id]),
    });
  }
  const order: MetricSectionTitle[] = ["Size", "Complexity", "TypeScript / TSX", "Python", "Markdown"];
  return sections.sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title));
}
