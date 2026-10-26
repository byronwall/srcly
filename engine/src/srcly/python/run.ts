// Run `engine/python/srcly_pyfacts.py` and name why it could not run.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IS_BUNDLE } from "../bundle";
import { builtinLibraryModels, builtinModelFiles } from "../library-models";
import { EngineError } from "../protocol";
import type { PythonFactsOutput } from "./facts";

/** Where the helper lives: beside the engine source, or `SRCLY_PYFACTS` (a bundle ships it next to itself). */
export function helperPath(): string {
  const explicit = process.env.SRCLY_PYFACTS;
  if (explicit) return explicit;
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), IS_BUNDLE ? "." : "../../../python", "srcly_pyfacts.py");
}

/** The interpreter that runs the helper: `--python`, then `SRCLY_PYTHON`, then `python3`. */
export function pythonCommand(explicit?: string | null): string {
  return explicit || process.env.SRCLY_PYTHON || "python3";
}

export type PythonRunOptions = {
  python: string;
  root: string;
  source: string;
  /** The interpreter whose installed packages mypy reads; null lets the helper find the project's `.venv`. */
  typesPython?: string | null;
  timeoutMs?: number;
};

/** What the interpreter can do, without reading a program: its version and whether mypy imports. */
export function probePython(python: string): { python: string; executable: string; mypy: string | null } {
  const result = spawnSync(python, ["-I", helperPath(), "--probe"], { encoding: "utf8", timeout: 30_000 });
  if (result.error) throw notFound(python, result.error);
  try {
    return JSON.parse(result.stdout) as { python: string; executable: string; mypy: string | null };
  } catch {
    throw new EngineError("python-not-found", `${python} did not run the Python helper: ${tail(result.stderr)}`, { python });
  }
}

/** Read the program. Throws `python-not-found`, `python-checker-not-found` or `no-python-files` by name. */
export function runPythonFacts(options: PythonRunOptions): PythonFactsOutput {
  const helper = helperPath();
  if (!fs.existsSync(helper)) throw new EngineError("internal", `The Python helper is missing: ${helper}`);
  // The helper reads the same built-in library model rows the engine loads (checked against their schema here first).
  builtinLibraryModels();
  const args = ["-I", helper, "--root", options.root, "--source", options.source, ...(options.typesPython ? ["--types-python", options.typesPython] : []), "--models", ...builtinModelFiles()];
  const result = spawnSync(options.python, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    timeout: options.timeoutMs ?? 10 * 60_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (result.error) throw notFound(options.python, result.error);
  if (result.status === 3) {
    throw new EngineError("python-checker-not-found", `mypy is not importable by ${options.python}; the Python provider needs it for checked types`, { python: options.python });
  }
  if (result.status !== 0) {
    throw new EngineError("internal", `The Python helper failed (exit ${result.status ?? result.signal}): ${tail(result.stderr)}`, { python: options.python });
  }
  let output: PythonFactsOutput;
  try {
    output = JSON.parse(result.stdout) as PythonFactsOutput;
  } catch {
    throw new EngineError("internal", `The Python helper printed something that is not JSON: ${tail(result.stderr || result.stdout)}`);
  }
  if (output.files.length === 0) throw new EngineError("no-python-files", `No Python source files under ${options.source}`, { source: options.source });
  return output;
}

function notFound(python: string, error: Error & { code?: string }) {
  if (error.code === "ENOENT") return new EngineError("python-not-found", `No Python interpreter at ${python} (set SRCLY_PYTHON to choose one)`, { python });
  if (error.code === "ETIMEDOUT") return new EngineError("internal", `The Python helper timed out under ${python}`, { python });
  return new EngineError("internal", `${python} failed to start: ${error.message}`, { python });
}

function tail(text: string | null | undefined) {
  const lines = (text ?? "").trim().split("\n");
  return lines.slice(-6).join("\n").slice(-800);
}
