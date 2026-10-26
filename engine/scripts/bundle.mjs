// Bundle the engine into the wheel (docs/intent/tsx-dataflow-integration/detailed-plan.md, M8):
// `srcly-engine.mjs` and the worker it starts, the Python helper, and a trimmed
// copy of the engine's TypeScript, which stays a real directory so the
// Program finds its `lib.*.d.ts` files (decision D4).
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(process.argv[2] ?? path.join(engineDir, "../server/app/engine"));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  external: ["typescript"],
  define: { __SRCLY_ENGINE_BUNDLE__: "true" },
  minifySyntax: true,
  logLevel: "warning",
};
await build({ ...shared, entryPoints: [path.join(engineDir, "bin/srcly-engine.ts")], outfile: path.join(outDir, "srcly-engine.mjs") });
// analysis-service.ts starts `./analysis-worker.js` beside the entry.
await build({ ...shared, entryPoints: [path.join(engineDir, "bin/engine-worker.ts")], outfile: path.join(outDir, "analysis-worker.js") });
fs.writeFileSync(path.join(outDir, "package.json"), `${JSON.stringify({ type: "module", private: true }, null, 2)}\n`);
fs.copyFileSync(path.join(engineDir, "python/srcly_pyfacts.py"), path.join(outDir, "srcly_pyfacts.py"));
// The built-in library model rows (`src/srcly/library-models.ts` reads `models/` beside the entry).
fs.cpSync(path.join(engineDir, "models"), path.join(outDir, "models"), { recursive: true });

const tsSource = path.join(engineDir, "node_modules/typescript");
const tsTarget = path.join(outDir, "node_modules/typescript");
fs.mkdirSync(path.join(tsTarget, "lib"), { recursive: true });
for (const file of ["package.json", "LICENSE.txt", "ThirdPartyNoticeText.txt"]) {
  fs.copyFileSync(path.join(tsSource, file), path.join(tsTarget, file));
}
for (const file of fs.readdirSync(path.join(tsSource, "lib"))) {
  if (file === "typescript.js" || (file.startsWith("lib.") && file.endsWith(".d.ts"))) {
    fs.copyFileSync(path.join(tsSource, "lib", file), path.join(tsTarget, "lib", file));
  }
}

const engineVersion = fs.readFileSync(path.join(engineDir, "src/srcly/fingerprint.ts"), "utf8").match(/ENGINE_VERSION = "([^"]+)"/)?.[1];
const typescriptVersion = JSON.parse(fs.readFileSync(path.join(tsSource, "package.json"), "utf8")).version;
fs.writeFileSync(
  path.join(outDir, "VERSION.json"),
  `${JSON.stringify({ engine: engineVersion, typescript: typescriptVersion, builtAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`Bundled the engine ${engineVersion} (TypeScript ${typescriptVersion}) into ${outDir}`);
