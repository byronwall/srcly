// Where the built-in library model rows live: `engine/models/*.json` in a
// checkout, `models/` beside the entry in the bundle (`scripts/bundle.mjs`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLibraryModels, type LibraryModels } from "../analysis/library-models";
import { IS_BUNDLE } from "./bundle";

export const BUILTIN_MODELS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), IS_BUNDLE ? "models" : "../../models");

/** The built-in row files, in name order (the schema file is not one). */
export function builtinModelFiles(): string[] {
  return fs.readdirSync(BUILTIN_MODELS_DIR)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json"))
    .sort()
    .map((file) => path.join(BUILTIN_MODELS_DIR, file));
}

let builtin: LibraryModels | null = null;

/** The built-in rows, read once per process. */
export function builtinLibraryModels(): LibraryModels {
  builtin ??= loadLibraryModels(builtinModelFiles());
  return builtin;
}
