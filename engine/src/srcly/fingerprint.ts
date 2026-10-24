import { createHash } from "node:crypto";
import fs from "node:fs";

/** Bump when a result's meaning changes, so old hashes never match new results. */
export const ENGINE_VERSION = "0.1.0";

/**
 * What a Program was built from: its own source files, the tsconfigs that
 * governed it and the TypeScript that compiled it. Small enough to send from
 * the worker to the protocol thread, so `status` can rehash without waiting
 * on a running query.
 */
export type ProgramInputs = {
  files: string[];
  tsconfigs: string[];
  typescript: string;
};

/**
 * A stable hash over the sorted `(fileName, size, mtimeMs)` of every source
 * file, the text of every governing tsconfig, the TypeScript version and the
 * engine version. One `stat` per file: cheap enough to run on every `status`.
 */
export function hashProgramInputs(inputs: ProgramInputs): string {
  const hash = createHash("sha256");
  hash.update(`engine:${ENGINE_VERSION}\0typescript:${inputs.typescript}\0`);
  for (const file of [...inputs.files].sort()) {
    hash.update(`${file}\0${statKey(file)}\0`);
  }
  for (const config of [...inputs.tsconfigs].sort()) {
    let text = "missing";
    try {
      text = fs.readFileSync(config, "utf8");
    } catch {
      // A deleted tsconfig changes the hash through the marker.
    }
    hash.update(`${config}\0${text}\0`);
  }
  return hash.digest("hex").slice(0, 16);
}

function statKey(file: string): string {
  try {
    const stat = fs.statSync(file);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return "missing";
  }
}
