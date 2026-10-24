import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { observeRouteTotalityPhases, type RouteTotalityPhase } from "../src/analysis/route-data-totality";
import { projectRouteTotality } from "../src/api/projections/route-totality";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { projectRouteGraph } from "../src/srcly/ops/route-graph";
import { createEngineSession, requireTypescript } from "../src/srcly/session";
import { chooseTypescript } from "../src/srcly/typescript-choice";

// Where the time goes, in process: tier 1, the provider's fact index, then
// each phase of a route's totality (candidate, surface, context, slice,
// bridges, lineage) and the srcly projection, plus anchorGraph timings.
// Measures and changes nothing. Prints one JSON object, then a Markdown
// table for measurements.md.
//
// Usage: node --import tsx scripts/time-phases.ts --root <dir> [--source <dir>] [--tsconfig <file>]
//          [--route <pathPattern>]... [--anchor <file>:<text>[:<direction>]]... [--all-routes]
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const option = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const options = (name: string) => argv.flatMap((item, index) => (item === name && argv[index + 1] ? [argv[index + 1]] : []));
const root = path.resolve(option("--root") ?? path.join(engineRoot, "examples/solid-route"));
const source = path.resolve(root, option("--source") ?? "src");
const tsconfig = option("--tsconfig") ?? null;
const wantedRoutes = options("--route");
const anchors = options("--anchor");
const allRoutes = argv.includes("--all-routes");

const ms = (n: number) => Math.round(n);
const t0 = performance.now();
const session = createEngineSession({ root, source, tsconfig, typescriptFrom: chooseTypescript(root, source).from });
const tier1 = requireTypescript(session.tier1(), "The phase profiler");
const tier1Ms = performance.now() - t0;

// The backbone first (T9): each wanted route's surface from its own file's facts, before the provider.
const surfaceTimings: { route: string; ms: number; nodes: number }[] = [];
for (const route of (allRoutes ? tier1.routes : wantedRoutes.length ? tier1.routes.filter((r) => wantedRoutes.includes(r.pathPattern) || wantedRoutes.includes(r.key)) : tier1.routes.slice(0, 2))) {
  const started = performance.now();
  const record = tier1.surface(route.key);
  const nodes = record && !("reason" in record.occurrenceSurface) ? record.occurrenceSurface.occurrences.length + record.occurrenceSurface.terminals.length + record.occurrenceSurface.frameworkBoundaries.length : 0;
  surfaceTimings.push({ route: route.pathPattern, ms: Math.round(performance.now() - started), nodes });
}

const t1 = performance.now();
const provider = tier1.provider();
const providerMs = performance.now() - t1;
const instrumentation = () => provider.getInstrumentation() as unknown as { collectionTimeMs?: number; expansionTimeMs?: number; factCount?: number };
const facts = instrumentation();

const routes = allRoutes ? tier1.routes : wantedRoutes.length ? tier1.routes.filter((r) => wantedRoutes.includes(r.pathPattern) || wantedRoutes.includes(r.key)) : tier1.routes.slice(0, 2);
type RouteTiming = { route: string; phases: Partial<Record<RouteTotalityPhase, number>>; other: number; total: number; project: number; nodes: number; edges: number; status: string; expansion: number };
const routeTimings: RouteTiming[] = [];
for (const route of routes) {
  const phases: Partial<Record<RouteTotalityPhase, number>> = {};
  observeRouteTotalityPhases((key, phase, took) => {
    if (key === route.key) phases[phase] = (phases[phase] ?? 0) + took;
  });
  const expansionBefore = instrumentation().expansionTimeMs ?? 0;
  const started = performance.now();
  const record = tier1.totality().get(route.key, null);
  const totalityMs = performance.now() - started;
  observeRouteTotalityPhases(null);
  const totality = record ? projectRouteTotality(record) : null;
  const projectStart = performance.now();
  const graph = totality ? projectRouteGraph(tier1, totality, null) : null;
  const projectMs = performance.now() - projectStart;
  const phased = Object.values(phases).reduce((sum, value) => sum + (value ?? 0), 0);
  routeTimings.push({
    route: route.pathPattern,
    phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, ms(v ?? 0)])) as RouteTiming["phases"],
    other: ms(totalityMs - phased),
    total: ms(totalityMs),
    project: ms(projectMs),
    nodes: graph?.nodes.length ?? 0,
    edges: graph?.edges.length ?? 0,
    status: graph?.status ?? "unavailable",
    expansion: ms((instrumentation().expansionTimeMs ?? 0) - expansionBefore),
  });
}

type AnchorTiming = { anchor: string; direction: string; total: number; outcome: string; nodes: number; up: number; down: number; expansion: number };
const anchorTimings: AnchorTiming[] = [];
for (const spec of anchors) {
  const [file, text, direction = "both"] = spec.split(":");
  const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes(text));
  if (index < 0) {
    anchorTimings.push({ anchor: spec, direction, total: 0, outcome: `not found: ${text}`, nodes: 0, up: 0, down: 0, expansion: 0 });
    continue;
  }
  const column = lines[index].indexOf(text) + 1;
  const span = { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length };
  const expansionBefore = instrumentation().expansionTimeMs ?? 0;
  const started = performance.now();
  let outcome = "error";
  let nodes = 0;
  let up = 0;
  let down = 0;
  try {
    const graph = anchorGraphOp(session, { file, text, span, direction });
    outcome = graph.outcome;
    nodes = graph.nodes.length;
    up = graph.counts.up;
    down = graph.counts.down;
  } catch (error) {
    outcome = `error: ${(error as Error).message}`;
  }
  anchorTimings.push({ anchor: `${file}:${index + 1} ${text}`, direction, total: ms(performance.now() - started), outcome, nodes, up, down, expansion: ms((instrumentation().expansionTimeMs ?? 0) - expansionBefore) });
}

const summary = {
  root: path.basename(root),
  typescript: tier1.generation.typescript,
  tier1Ms: ms(tier1Ms),
  providerMs: ms(providerMs),
  factCollectionMs: ms(facts.collectionTimeMs ?? 0),
  factCount: facts.factCount ?? null,
  rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  surfaces: surfaceTimings,
  routes: routeTimings,
  anchors: anchorTimings,
};
process.stdout.write(`${JSON.stringify(summary)}\n\n`);
const PHASES: RouteTotalityPhase[] = ["candidate", "surface", "context", "slice", "bridges", "lineage"];
process.stdout.write(`Tier 1 ${summary.tier1Ms} ms · provider facts ${summary.providerMs} ms (collection ${summary.factCollectionMs} ms, ${summary.factCount ?? "?"} facts) · RSS ${summary.rssMb} MB\n\n`);
process.stdout.write(`Surface first (route file facts + occurrence surface, before the provider): ${surfaceTimings.map((s) => `\`${s.route}\` ${s.ms} ms (${s.nodes} boxes)`).join(" · ")}\n\n`);
process.stdout.write(`| Route | ${PHASES.join(" | ")} | other | totality | project | nodes | status |\n| --- | ${PHASES.map(() => "---:").join(" | ")} | ---: | ---: | ---: | ---: | --- |\n`);
for (const r of routeTimings) process.stdout.write(`| \`${r.route}\` | ${PHASES.map((p) => r.phases[p] ?? 0).join(" | ")} | ${r.other} | ${r.total} | ${r.project} | ${r.nodes} | ${r.status} |\n`);
if (anchorTimings.length) {
  process.stdout.write(`\n| Anchor | direction | anchorGraph | outcome | boxes (up / down) | provider expansion |\n| --- | --- | ---: | --- | ---: | ---: |\n`);
  for (const a of anchorTimings) process.stdout.write(`| \`${a.anchor}\` | ${a.direction} | ${a.total} ms | ${a.outcome} | ${a.nodes} (${a.up} / ${a.down}) | ${a.expansion} ms |\n`);
}
