import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The interpreter that reads the catalog's `python` root: `SRCLY_PYTHON`, else
 * srcly's own server venv (`cd server && uv sync`). It needs mypy, not the
 * libraries the patterns import: a call resolves by its import's name when mypy
 * cannot find the package. Null when neither has mypy, so the root is skipped, named.
 */
export function pythonForCatalog(): string | null {
  const venv = fileURLToPath(new URL("../../server/.venv/bin/python", import.meta.url));
  for (const candidate of [process.env.SRCLY_PYTHON, venv]) {
    if (!candidate || (candidate.includes("/") && !fs.existsSync(candidate))) continue;
    if (spawnSync(candidate, ["-c", "import mypy"], { encoding: "utf8" }).status === 0) return candidate;
  }
  return null;
}
