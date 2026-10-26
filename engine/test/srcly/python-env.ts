import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { engineRoot } from "./engine-process";

/**
 * An interpreter with mypy for the Python provider's tests: `SRCLY_PYTHON`,
 * else srcly's own server venv (`cd server && uv sync` creates it). The reason
 * names which one, or why the tests skip. In CI there is no skipping: CI installs
 * the venv, so a missing interpreter there is a broken setup, not an optional one.
 */
export function pythonForTests(): { python: string | null; reason: string } {
  const candidates = [process.env.SRCLY_PYTHON, path.resolve(engineRoot, "../server/.venv/bin/python")].filter((item): item is string => !!item);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-c", "import mypy.version; print(mypy.version.__version__)"], { encoding: "utf8" });
    if (probe.status === 0) return { python: candidate, reason: `${candidate}, mypy ${probe.stdout.trim()}` };
  }
  const reason = "no interpreter with mypy: set SRCLY_PYTHON or run `cd server && uv sync`";
  if (process.env.CI) throw new Error(`Python provider tests can't run in CI: ${reason}`);
  return { python: null, reason };
}
