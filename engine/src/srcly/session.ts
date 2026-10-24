import path from "node:path";
import type * as TypeScript from "typescript";
import { parseArgs } from "../cli/args";
import { createAnalyzer } from "../core";
import { createLazyProgramEvidenceProvider, type EvidenceRelationProvider } from "../analysis/evidence-relation-provider";
import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { ProgramEvidenceCollector } from "../analysis/program-evidence-collector";
import { ProgramFactIndex } from "../analysis/program-fact-index";
import { buildRouteSurfaceRecord, type RouteSurfaceRecord } from "../analysis/route-data-totality";
import type { AnalyzerProgressReporter } from "../analysis/progress";
import type { RouteRecord } from "../analysis/route-data";
import { discoverRoute } from "../analysis/route-discovery";
import { createRouteDataTotalitySession, type RouteDataTotalitySession } from "../analysis/route-data-session";
import { discoverSolidRouteCandidates } from "../analysis/scope-adapters/solid-route";
import { loadTypescript } from "../project/typescript";
import { resolveProjectConfigs } from "../project/tsconfig";
import type { AnalysisReport, AnalyzerArgs } from "../types";
import { hashProgramInputs, type ProgramInputs } from "./fingerprint";
import type { LanguageHost } from "./host";
import { createPythonTier1, type PythonTier1 } from "./python/session";
import { alignDefaultExportEvidence } from "./route-identity";
import { EngineError } from "./protocol";
import { createTypescriptHost } from "./typescript-host";

export type EngineConfig = {
  root: string;
  /** Source folder, relative to root or absolute. */
  source: string;
  /** Explicit tsconfig, relative to root or absolute; null discovers one. */
  tsconfig: string | null;
  /** A directory the chosen `typescript` resolves from (decision D4). */
  typescriptFrom: string;
  /** Which program to build; a Python root needs an interpreter with mypy. */
  language?: "typescript" | "python";
  /** The interpreter that runs the Python helper (`python3` when unset). */
  python?: string | null;
  /** Build the Program from these files and their imports only (T12); absent means every file the tsconfigs name. */
  rootFiles?: string[];
};

export function engineArgs(config: EngineConfig): AnalyzerArgs {
  const args = parseArgs([
    "--root", config.root,
    "--source", config.source,
    ...(config.tsconfig ? ["--tsconfig", config.tsconfig] : []),
    "--typescript-from", config.typescriptFrom,
    "--format", "json",
  ]);
  if (config.rootFiles?.length) args.rootFiles = config.rootFiles;
  return args;
}

/**
 * The program a tier-1 result was computed from. For Python, `tsconfig` names
 * the project file (`pyproject.toml`) and `typescript` the checker (`mypy 2.4.0 · Python 3.13.2`).
 */
export type Generation = { id: number; programHash: string; tsconfig: string; typescript: string };

/** What every tier-1 build has, whatever the language: the ops that work on both read only this. */
export type BaseTier1 = {
  root: string;
  inputs: ProgramInputs;
  generation: Generation;
  /** The evidence provider behind the fact index; built on first use by a query that needs facts. */
  provider: () => EvidenceRelationProvider;
  /** Files, selections, text, types, scopes and call sites in the language's own terms. */
  host: LanguageHost;
};

export type TsTier1 = BaseTier1 & {
  language: "typescript";
  ts: typeof TypeScript;
  program: TypeScript.Program;
  args: AnalyzerArgs;
  routes: RouteRecord[];
  /**
   * Route totality, one record per (route, selected source), cached. Findings
   * attachments are empty here: findings are tier-2 data.
   */
  totality: () => RouteDataTotalitySession;
  /**
   * One route's render backbone from the route file's own facts and the
   * Program, before the program-wide provider exists (T9). Cached per route.
   */
  surface: (routeKey: string, cancellation?: AnalysisCancellationToken) => RouteSurfaceRecord | null;
  /** Tier 2: the full legacy report. Slow; only batch signals call it. */
  fullReport: () => AnalysisReport;
};

export type Tier1 = TsTier1 | PythonTier1;

/** The TypeScript build, for the ops that only TypeScript has (the route graph, the legacy report). */
export function requireTypescript(tier1: Tier1, what: string): TsTier1 {
  if (tier1.language === "typescript") return tier1;
  throw new EngineError("not-found", `${what} is TypeScript-only; this root is analyzed as Python`, { language: tier1.language });
}

/**
 * Two tiers over one Program (plan section 3.3). Tier 1 builds the Program,
 * the identity index and route discovery, and answers interactive queries.
 * It never calls `analyzer.report()`: that full legacy report is tier 2 and is
 * built only by `fullReport()`.
 */
export function createEngineSession(config: EngineConfig, progress?: AnalyzerProgressReporter) {
  let tier1: Tier1 | null = null;
  let generationId = 0;

  const build = (): Tier1 => {
    if (config.language === "python") {
      generationId += 1;
      return createPythonTier1(config, generationId, progress);
    }
    const args = engineArgs(config);
    refuseUnanalyzable(args);
    const analyzer = createAnalyzer(args, progress);
    // `loadTypescript` returns the resolved module untyped; name its shape here.
    const ts: typeof TypeScript = analyzer.ts;
    const program: TypeScript.Program = analyzer.program;
    const root = path.resolve(args.root);
    const sourceFiles = program.getSourceFiles().filter((file) => !file.isDeclarationFile && isWithin(file.fileName, root));
    if (sourceFiles.length === 0) {
      throw new EngineError("no-ts-files", `No TypeScript source files under ${root}`, { tsconfigs: args.tsconfigs ?? [] });
    }
    progress?.({ step: "summarize", message: `Discovering routes in ${sourceFiles.length} files`, completed: 0, total: sourceFiles.length });
    const checker = program.getTypeChecker();
    const routes = sourceFiles
      .map((file) => {
        const route = discoverRoute(ts, checker, root, file);
        return route ? alignDefaultExportEvidence(ts, checker, file, route) : null;
      })
      .filter((route): route is RouteRecord => route !== null);
    const inputs: ProgramInputs = {
      files: sourceFiles.map((file) => path.normalize(file.fileName)),
      tsconfigs: args.tsconfigs ?? (args.tsconfig ? [args.tsconfig] : []),
      typescript: ts.version,
    };
    generationId += 1;
    const generation: Generation = {
      id: generationId,
      programHash: hashProgramInputs(inputs),
      tsconfig: args.tsconfig ?? "",
      typescript: ts.version,
    };
    let provider: ReturnType<typeof createLazyProgramEvidenceProvider> | null = null;
    let totality: RouteDataTotalitySession | null = null;
    let report: AnalysisReport | null = null;
    const surfaces = new Map<string, RouteSurfaceRecord | null>();
    const providerFor = () => (provider ??= createLazyProgramEvidenceProvider(ts, program, root));
    const surfaceFor = (routeKey: string, cancellation?: AnalysisCancellationToken): RouteSurfaceRecord | null => {
      const known = surfaces.get(routeKey);
      if (known !== undefined) return known;
      const route = routes.find((item) => item.key === routeKey);
      const file = route ? program.getSourceFile(path.resolve(root, route.file)) : undefined;
      if (!route || !file) return null;
      // Facts for the route file alone: enough to find the route's candidate and entry element.
      const collector = new ProgramEvidenceCollector(ts, program, root, { sourceFiles: [file], cancellation });
      const collected = collector.collectFactsOnly();
      const facts = new ProgramFactIndex(collected.facts, collected.sourceFiles, (fact) => collector.hydrateFact(fact));
      const candidates = discoverSolidRouteCandidates(root, { elements: facts.elements, relations: [] });
      const record = buildRouteSurfaceRecord(ts, program, root, route, { facts }, candidates, cancellation);
      collector.releaseTransientState();
      surfaces.set(routeKey, record);
      return record;
    };
    const built: TsTier1 = {
      language: "typescript",
      root,
      host: null as unknown as LanguageHost,
      ts,
      program,
      args,
      routes,
      inputs,
      generation,
      provider: providerFor,
      surface: surfaceFor,
      totality: () => {
        if (!totality) {
          const facts = providerFor();
          const candidates = discoverSolidRouteCandidates(root, { elements: facts.facts.elements, relations: [] });
          totality = createRouteDataTotalitySession(ts, program, root, routes, facts, candidates, []);
        }
        return totality;
      },
      fullReport: () => (report ??= analyzer.report()),
    };
    built.host = createTypescriptHost(built);
    return built;
  };

  return {
    config,
    built: () => tier1 !== null,
    tier1: () => (tier1 ??= build()),
    /** Rehash the built Program's inputs now; null before tier 1 exists. */
    currentHash: () => (tier1 ? hashProgramInputs(tier1.inputs) : null),
    /** Drop both tiers. The next query rebuilds and bumps the generation. */
    refresh: () => {
      tier1 = null;
    },
  };
}

export type EngineSession = ReturnType<typeof createEngineSession>;

/** Refuse a query on a tier-1 session whose generation the caller did not see. */
export function checkGeneration(tier1: BaseTier1, expected: unknown) {
  if (expected === undefined || expected === null) return;
  if (expected !== tier1.generation.id) {
    throw new EngineError("stale-generation", `Generation ${String(expected)} is stale; the session is at ${tier1.generation.id}`, {
      generation: tier1.generation.id,
      programHash: tier1.generation.programHash,
    });
  }
}

/**
 * No tsconfig, or only loose ones: name the refusal before building anything.
 * Strict configs beside a loose one keep working (the analysis warns for the
 * loose files), but a project with no strict config at all is refused, since
 * every nullish verdict would be unsound.
 */
function refuseUnanalyzable(args: AnalyzerArgs) {
  let ts: typeof TypeScript;
  try {
    ts = loadTypescript(args).ts;
  } catch (error) {
    throw new EngineError("typescript-not-found", error instanceof Error ? error.message : String(error));
  }
  let resolution: ReturnType<typeof resolveProjectConfigs>;
  try {
    resolution = resolveProjectConfigs(ts, { ...args });
  } catch (error) {
    throw new EngineError("no-tsconfig", error instanceof Error ? error.message : String(error));
  }
  const strict = resolution.configs.filter((config) => config.strictNullChecks);
  if (!resolution.primary.strictNullChecks && strict.length === 0) {
    throw new EngineError(
      "non-strict-tsconfig",
      `${path.relative(args.root, resolution.primary.file) || resolution.primary.file} has strictNullChecks off, and no governing tsconfig is strict`,
      { tried: resolution.configs.map((config) => config.file) },
    );
  }
}

function isWithin(file: string, root: string) {
  const relative = path.relative(root, path.resolve(file));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative) && !relative.split(path.sep).includes("node_modules");
}
