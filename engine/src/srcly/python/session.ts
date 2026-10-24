// Tier 1 for a Python root: one run of the helper (ast + mypy) gives the
// facts, the routes and everything the language host answers from.
import fs from "node:fs";
import path from "node:path";
import type { AnalyzerProgressReporter } from "../../analysis/progress";
import { hashProgramInputs, type ProgramInputs } from "../fingerprint";
import type { BaseTier1, EngineConfig, Generation } from "../session";
import { createPythonProvider, type PythonFactsOutput, type PythonRoute, type PythonRelationProvider } from "./facts";
import { createPythonHost } from "./host";
import { pythonCommand, runPythonFacts } from "./run";

export type PythonTier1 = BaseTier1 & {
  language: "python";
  facts: PythonFactsOutput;
  routes: PythonRoute[];
  provider: () => PythonRelationProvider;
};

export function createPythonTier1(config: EngineConfig, generationId: number, progress?: AnalyzerProgressReporter): PythonTier1 {
  const root = path.resolve(config.root);
  const source = path.resolve(root, config.source);
  progress?.({ step: "program", message: "Reading the Python program and checking it with mypy" });
  const facts = runPythonFacts({ python: pythonCommand(config.python), root, source });
  const project = ["pyproject.toml", "setup.cfg", "setup.py"].map((name) => path.join(root, name)).find((file) => fs.existsSync(file));
  const checker = `mypy ${facts.checker.version ?? "?"} · Python ${facts.python}`;
  const inputs: ProgramInputs = {
    files: facts.files.map((file) => path.join(root, file)),
    tsconfigs: project ? [project] : [],
    typescript: checker,
  };
  const generation: Generation = {
    id: generationId,
    programHash: hashProgramInputs(inputs),
    tsconfig: project ? path.relative(root, project) : "",
    typescript: checker,
  };
  progress?.({ step: "identity", message: `Indexing ${facts.elements.length} Python facts from ${facts.files.length} files` });
  let provider: PythonRelationProvider | null = null;
  const providerFor = () => (provider ??= createPythonProvider(facts));
  const tier1: PythonTier1 = {
    language: "python",
    root,
    inputs,
    generation,
    facts,
    routes: facts.routes,
    provider: providerFor,
    host: null as unknown as PythonTier1["host"],
  };
  tier1.host = createPythonHost(tier1);
  return tier1;
}
