import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { analyzeFunctionEffects, ASSUMPTIONS, callableAt } from "../../analysis/effects/function-effects";
import { functionEffectsResultSchema, type FunctionEffectsResult } from "../contracts/function-effects";
import { EngineError } from "../protocol";
import { sourceFileFor } from "../selection";
import { checkGeneration, requireTypescript, type EngineSession } from "../session";

/**
 * What the function at `{file, line[, column]}` touches (M6): its effects as
 * facts with witnesses, the places the analysis could not follow as
 * frontiers, how each promise-yielding call is handled, and what is assumed.
 * Known and partial sit together; nothing here is a score.
 */
export function functionEffectsOp(session: EngineSession, params: Record<string, unknown>, cancellation?: AnalysisCancellationToken): FunctionEffectsResult {
  const tier1 = requireTypescript(session.tier1(), "Function effects");
  checkGeneration(tier1, params.expectedGeneration);
  const { sourceFile, relative } = sourceFileFor(tier1, params.file);
  if (!Number.isInteger(params.line) || (params.line as number) < 1) throw new EngineError("invalid-request", "functionEffects needs params.line");
  const column = Number.isInteger(params.column) && (params.column as number) >= 1 ? (params.column as number) : null;
  const root = tier1.args.root;
  const callable = callableAt(tier1.ts, sourceFile, params.line as number, column, root);
  const base = {
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    assumptions: ASSUMPTIONS,
  };
  if (!callable) {
    return functionEffectsResultSchema.parse({
      outcome: "unsupported",
      ...base,
      reason: "no-callable",
      callable: { name: "", kind: "function", async: false, file: relative, absPath: sourceFile.fileName, line: params.line, span: { startLine: params.line, startColumn: 1, endLine: params.line, endColumn: 1 } },
      facts: [],
      frontiers: [],
      resultHandling: [],
      coverage: "not-analyzed",
      counts: { facts: 0, frontiers: 0, callables: 0 },
    });
  }
  const report = analyzeFunctionEffects(tier1.ts, tier1.program, root, callable, cancellation);
  const coverage = report.frontiers.length ? "partial" : "complete-for-supported-scope";
  return functionEffectsResultSchema.parse({
    outcome: coverage === "partial" ? "partial" : "ok",
    ...base,
    reason: null,
    callable: { name: callable.name, kind: callable.kind, async: callable.async, file: callable.file, absPath: callable.absPath, line: callable.line, span: callable.span },
    facts: report.facts.map(({ param: _param, ...fact }) => fact),
    frontiers: report.frontiers,
    resultHandling: report.resultHandling,
    coverage,
    counts: { facts: report.facts.length, frontiers: report.frontiers.length, callables: report.callables },
  });
}
