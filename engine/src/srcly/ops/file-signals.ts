import path from "node:path";
import type * as TypeScript from "typescript";
import { renderMarkdownView } from "../../reports/markdown-views";
import type { AnalysisReport, DefenseRecord, Sink } from "../../types";
import { fileSignalsResultSchema, type DataflowFinding, type FileMetrics, type FileSignalsResult } from "../contracts/file-signals";
import { checkGeneration, requireTypescript, type EngineSession, type TsTier1 } from "../session";

/** Items per view: what the checked-in example reports use, so the two stay comparable. */
export const DATAFLOW_MAX_ITEMS = 8;

/** The views `dataflow.md` holds, in reading order. */
export const DATAFLOW_VIEWS = ["work-packets", "defensive-ledger", "repeated-forks", "prop-relay", "context-relay", "fan-out"] as const;

/**
 * Tier 2 (M7): build the legacy report once and project it for srcly's
 * pipelines. Metrics and findings are per file; the Markdown is the old
 * CLI's views, unchanged except for who made them and how to rerun them.
 */
export function fileSignalsOp(session: EngineSession, params: { expectedGeneration?: unknown }): FileSignalsResult {
  const tier1 = requireTypescript(session.tier1(), "Data-flow signals");
  checkGeneration(tier1, params.expectedGeneration);
  const report = tier1.fullReport();
  const rel = (file: string) => path.relative(tier1.root, file).split(path.sep).join("/");
  const files = new Map<string, FileMetrics>(
    tier1.inputs.files.map((file) => [rel(file), { impossibleDefenses: 0, relayHops: 0, fanOut: 0, representationChanges: 0, pathDepth: 0 }]),
  );
  const { findings: defenses, unplaced } = impossibleDefenses(tier1, report);
  const findings: DataflowFinding[] = [...defenses, ...repeatedForks(report)];
  for (const finding of defenses) {
    const metrics = files.get(finding.file);
    if (metrics) metrics.impossibleDefenses += 1;
  }
  for (const sink of report.rankings.all as Sink[]) {
    const metrics = files.get(sink.file);
    if (!metrics) continue;
    metrics.relayHops = Math.max(metrics.relayHops, sink.metrics.mergeWidth - 1);
    metrics.fanOut = Math.max(metrics.fanOut, sink.metrics.reachableSinks);
    metrics.representationChanges = Math.max(metrics.representationChanges, sink.metrics.representationChurn);
    metrics.pathDepth = Math.max(metrics.pathDepth, sink.metrics.maximumPathDepth);
  }
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.column - b.column));
  return fileSignalsResultSchema.parse({
    outcome: "ok",
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    nullProof: tier1.generation.nullProof,
    reason: null,
    files: [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([file, metrics]) => ({ file, metrics })),
    findings,
    unplacedDefenses: unplaced,
    markdown: dataflowMarkdown(tier1, report),
  });
}

/**
 * One finding per type-impossible `??` or `?.`, however many sinks it feeds.
 * The legacy report records a defense's line and column but not its file, so
 * it is placed in the first file on the sink's path whose text at that spot is
 * the defense (a helper's guard lives in the helper's file, not the sink's).
 */
function impossibleDefenses(tier1: TsTier1, report: AnalysisReport) {
  const seen = new Set<string>();
  const findings: DataflowFinding[] = [];
  let unplaced = 0;
  for (const sink of report.sinks as Sink[]) {
    for (const defense of sink.defenses) {
      if (defense.verdict !== "impossible") continue;
      const candidates = [sink.file, ...sink.representativeSteps.map((step) => step.file).filter((file): file is string => Boolean(file))];
      const placed = candidates.map((file) => placeDefense(tier1, file, defense)).find((span) => span !== null) ?? null;
      const key = placed ? `${placed.file}:${placed.line}:${placed.column}` : `?${sink.file}:${defense.location.line}:${defense.location.column}|${defense.expression}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!placed) {
        unplaced += 1;
        continue;
      }
      const type = defense.type ? ` \`${defense.type}\`` : "";
      findings.push({
        rule: "impossible-defense",
        ...placed,
        message: `\`${oneLine(defense.expression)}\` guards a value whose type${type} is never null or undefined, so the fallback never runs. Remove it after checking the contract.`,
      });
    }
  }
  return { findings, unplaced };
}

/** The defense's span in `file` when the source there reads as its expression (whitespace aside). */
function placeDefense(tier1: TsTier1, file: string, defense: DefenseRecord) {
  const source = tier1.program.getSourceFile(path.resolve(tier1.root, file));
  if (!source) return null;
  const { line, column } = defense.location;
  const starts = source.getLineStarts();
  if (line < 1 || line > starts.length || column < 1) return null;
  const start = starts[line - 1] + column - 1;
  if (start >= (starts[line] ?? source.text.length + 1)) return null;
  const wanted = defense.expression.replace(/\s+/g, "");
  let end = start;
  let matched = 0;
  const text = source.text;
  while (end < text.length && matched < wanted.length) {
    const char = text[end];
    end += 1;
    if (/\s/.test(char)) continue;
    if (char !== wanted[matched]) return null;
    matched += 1;
  }
  if (matched < wanted.length) return null;
  return { file, line, column, endLine: lineOf(tier1.ts, source, end) };
}

function lineOf(ts: typeof TypeScript, source: TypeScript.SourceFile, position: number) {
  return ts.getLineAndCharacterOfPosition(source, position).line + 1;
}

/** One finding per component that tests the same discriminant at several sibling branch sites. */
function repeatedForks(report: AnalysisReport): DataflowFinding[] {
  return (report.repeatedForks ?? []).map((fork) => {
    const lines = fork.sites.map((site) => site.line);
    const component = fork.component ? `\`${fork.component}\`` : "This render scope";
    const branches = fork.branchValues.length ? ` (${fork.branchValues.map((value) => `\`${value}\``).join(", ")})` : "";
    return {
      rule: "repeated-fork",
      file: fork.file,
      line: fork.line,
      column: fork.column,
      endLine: Math.max(fork.line, ...lines),
      message: `${component} tests \`${oneLine(fork.discriminant)}\` at ${fork.siteCount} sibling branch sites (lines ${lines.join(", ")}). Split it into one sub-component per branch${branches}.`,
    };
  });
}

function oneLine(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

/**
 * The old CLI's views, one after another under one title. Each view keeps its
 * text; its headings drop one level, its provenance names srcly, and the
 * `tsx-dataflow` rerun footer goes (srcly's footer says how to rerun).
 */
export function dataflowMarkdown(tier1: TsTier1, report: AnalysisReport) {
  const sections = DATAFLOW_VIEWS.map((view) =>
    srclyView(renderMarkdownView(report, { ...tier1.args, view, format: "markdown", maxItems: DATAFLOW_MAX_ITEMS, maxItemsExplicit: true, out: null })),
  );
  return [
    "# Data flow",
    "",
    "Render-path evidence from srcly's data-flow engine (the TypeScript checker), for agents and reviewers. Read the work packets first, then the ledgers below them.",
    "",
    ...sections,
    "---",
    "",
    "_Regenerate:_ `srcly report --dataflow`",
    "",
  ].join("\n");
}

/** One view as a section of `dataflow.md`. Exported for the test that compares it with the old CLI's output. */
export function srclyView(markdown: string) {
  const footer = markdown.indexOf("\n---\n\n_Regenerate this report:_");
  const body = (footer >= 0 ? markdown.slice(0, footer) : markdown).trimEnd();
  let fenced = false;
  const lines = body.split("\n").map((line) => {
    if (line.startsWith("```")) fenced = !fenced;
    if (fenced || !line.startsWith("#")) return line;
    return `#${line}`;
  });
  return `${lines.join("\n").replace("Generated by **tsx-dataflow**,", "Generated by **srcly**'s data-flow engine,")}\n`;
}
