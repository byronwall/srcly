import fs from "node:fs";
import path from "node:path";

export function findDefaultSource(root: string) {
  const source = path.join(root, "src");
  if (fs.existsSync(source)) return source;
  const appSource = path.join(root, "app", "src");
  if (fs.existsSync(appSource)) return appSource;
  return root;
}

// Best-effort, dependency-free guess at the governing tsconfig: the nearest
// tsconfig.json or jsconfig.json found walking up from the source root (then the project root).
// This is only a hint for meta/back-compat; the authoritative, type-aware
// resolution (solution-file expansion, multi-project monorepos, validation)
// happens in resolveProjectConfigs once TypeScript is loaded.
export function findDefaultTsconfig(root: string, sourceRoot: string) {
  return (
    walkUpForTsconfig(sourceRoot, root) ?? walkUpForTsconfig(root, root) ?? null
  );
}

// Ascend from startDir up to and including stopDir, returning the first
// tsconfig.json or jsconfig.json encountered (nearest wins).
function walkUpForTsconfig(startDir: string, stopDir: string) {
  let dir = startDir;
  while (true) {
    const candidate = ["tsconfig.json", "jsconfig.json"].map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
    if (candidate) return candidate;
    if (dir === stopDir) return null;
    const parent = path.dirname(dir);
    if (dir === parent) return null;
    dir = parent;
  }
}
