import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { routeGraphOp } from "../src/srcly/ops/route-graph";
import { createEngineSession } from "../src/srcly/session";
import { chooseTypescript } from "../src/srcly/typescript-choice";

// T12 spike: a Program built from one route file's import closure against the
// full Program. Times tier 1, the provider's facts and the route graph for
// each, and says whether the route graph and a few anchor graphs are the
// same (generation and hashes aside). Measures and decides; changes nothing.
//
// Usage: node --import tsx scripts/time-scoped-program.ts --root <dir> [--source <dir>] [--route <pathPattern>]... [--anchor <file>:<text>[:<direction>]]...
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const option = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const options = (name: string) => argv.flatMap((item, index) => (item === name && argv[index + 1] ? [argv[index + 1]] : []));
const root = path.resolve(option("--root") ?? path.join(engineRoot, "examples/solid-route"));
const source = path.resolve(root, option("--source") ?? "src");
const wantedRoutes = options("--route");
const anchors = options("--anchor");
const typescriptFrom = chooseTypescript(root, source).from;
const ms = (n: number) => Math.round(n);
const strip = (value: unknown) => JSON.stringify(value, (k, v) => (k === "generation" || k === "programHash" || k === "tsconfig" ? undefined : v));

const t0 = performance.now();
const full = createEngineSession({ root, source, tsconfig: null, typescriptFrom });
const fullTier1 = full.tier1();
const fullTier1Ms = performance.now() - t0;
const routes = wantedRoutes.length ? fullTier1.routes.filter((r) => wantedRoutes.includes(r.pathPattern) || wantedRoutes.includes(r.key)) : fullTier1.routes.slice(0, 2);

type Row = { route: string; fullFiles: number; scopedFiles: number; fullTier1: number; scopedTier1: number; fullGraph: number; scopedGraph: number; same: boolean; differences: string[] };
const rows: Row[] = [];
for (const route of routes) {
  const g0 = performance.now();
  const fullGraph = routeGraphOp(full, { route: route.key });
  const fullGraphMs = performance.now() - g0;
  const s0 = performance.now();
  const scoped = createEngineSession({ root, source, tsconfig: null, typescriptFrom, rootFiles: [path.resolve(root, route.file)] });
  const scopedTier1 = scoped.tier1();
  const scopedTier1Ms = performance.now() - s0;
  const s1 = performance.now();
  let scopedGraph: ReturnType<typeof routeGraphOp> | null = null;
  const differences: string[] = [];
  try {
    scopedGraph = routeGraphOp(scoped, { route: route.key });
  } catch (error) {
    differences.push(`scoped routeGraph failed: ${(error as Error).message}`);
  }
  const scopedGraphMs = performance.now() - s1;
  if (scopedGraph) {
    if (strip(fullGraph.nodes) !== strip(scopedGraph.nodes)) {
      const fullIds = new Set(fullGraph.nodes.map((n) => `${n.id}|${n.status}|${n.reason ?? ""}`));
      const scopedIds = new Set(scopedGraph.nodes.map((n) => `${n.id}|${n.status}|${n.reason ?? ""}`));
      const onlyFull = [...fullIds].filter((id) => !scopedIds.has(id));
      const onlyScoped = [...scopedIds].filter((id) => !fullIds.has(id));
      differences.push(`nodes: ${onlyFull.length} only in full, ${onlyScoped.length} only in scoped (${onlyFull.slice(0, 3).join("; ")} | ${onlyScoped.slice(0, 3).join("; ")})`);
    }
    if (strip(fullGraph.edges) !== strip(scopedGraph.edges)) differences.push(`edges differ (${fullGraph.edges.length} vs ${scopedGraph.edges.length})`);
    if (strip(fullGraph.gaps) !== strip(scopedGraph.gaps)) differences.push(`gaps differ (${fullGraph.gaps.length} vs ${scopedGraph.gaps.length})`);
    if (fullGraph.status !== scopedGraph.status || fullGraph.outcome !== scopedGraph.outcome) differences.push(`status ${fullGraph.status}/${fullGraph.outcome} vs ${scopedGraph.status}/${scopedGraph.outcome}`);
  }
  for (const spec of anchors) {
    const [file, text, direction = "both"] = spec.split(":");
    const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
    const index = lines.findIndex((line) => line.includes(text));
    if (index < 0) continue;
    const column = lines[index].indexOf(text) + 1;
    const span = { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length };
    const params = { file, text, span, direction };
    const a = anchorGraphOp(full, params);
    let b: ReturnType<typeof anchorGraphOp> | null = null;
    try {
      b = anchorGraphOp(scoped, params);
    } catch (error) {
      differences.push(`anchor ${file}:${index + 1} failed in scoped: ${(error as Error).message}`);
      continue;
    }
    if (strip({ nodes: a.nodes, edges: a.edges, outcome: a.outcome }) !== strip({ nodes: b.nodes, edges: b.edges, outcome: b.outcome })) {
      differences.push(`anchor ${file}:${index + 1} ${direction}: full ${a.outcome} ${a.nodes.length} boxes · scoped ${b.outcome} ${b.nodes.length} boxes`);
    }
  }
  rows.push({
    route: route.pathPattern,
    fullFiles: fullTier1.inputs.files.length,
    scopedFiles: scopedTier1.inputs.files.length,
    fullTier1: ms(fullTier1Ms),
    scopedTier1: ms(scopedTier1Ms),
    fullGraph: ms(fullGraphMs),
    scopedGraph: ms(scopedGraphMs),
    same: differences.length === 0,
    differences,
  });
}
process.stdout.write(`${JSON.stringify({ root: path.basename(root), rows })}\n\n`);
process.stdout.write("| Route | files full → scoped | tier 1 full → scoped | first routeGraph full → scoped | same result |\n| --- | ---: | ---: | ---: | --- |\n");
for (const r of rows) process.stdout.write(`| \`${r.route}\` | ${r.fullFiles} → ${r.scopedFiles} | ${r.fullTier1} → ${r.scopedTier1} ms | ${r.fullGraph} → ${r.scopedGraph} ms | ${r.same ? "yes" : `no: ${r.differences.join(" · ")}`} |\n`);
