import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IS_BUNDLE } from "./bundle";
import { EngineError } from "./protocol";

const require = createRequire(import.meta.url);

/** The engine package root: where its own `typescript` dependency resolves from. */
export const ENGINE_PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), IS_BUNDLE ? "." : "../..");

export type TypescriptChoice = {
  /** A directory `require.resolve("typescript")` finds the chosen copy from. */
  from: string;
  origin: "project" | "bundled";
  version: string;
};

/**
 * Decision D4: build the Program with the engine's own TypeScript unless the
 * project ships one with the same major.minor. The analysis imports
 * `typescript` statically in places, and two instances of different versions
 * disagree on `SyntaxKind` numbers.
 */
export function chooseTypescript(root: string, source: string): TypescriptChoice {
  const bundled = resolveFrom(ENGINE_PACKAGE_DIR);
  if (!bundled) {
    throw new EngineError("typescript-not-found", `The engine's own typescript is missing under ${ENGINE_PACKAGE_DIR}`);
  }
  for (const base of [source, path.join(root, "app"), root]) {
    const project = resolveFrom(base);
    if (!project) continue;
    // A project without its own copy resolves up to the engine's: that is bundled.
    if (project.file === bundled.file) break;
    if (majorMinor(project.version) === majorMinor(bundled.version)) return { from: base, origin: "project", version: project.version };
    break;
  }
  return { from: ENGINE_PACKAGE_DIR, origin: "bundled", version: bundled.version };
}

function resolveFrom(base: string): { file: string; version: string } | null {
  try {
    const file = require.resolve("typescript", { paths: [base] });
    const version = (require(file) as { version?: unknown }).version;
    return typeof version === "string" ? { file, version } : null;
  } catch {
    return null;
  }
}

function majorMinor(version: string) {
  return version.split(".").slice(0, 2).join(".");
}
